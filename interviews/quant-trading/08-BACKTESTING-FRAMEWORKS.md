# Chapter 8: Backtesting Frameworks

## From Hypothesis to Evidence

Every trading strategy begins as a hypothesis: "stocks that dropped 10% in a week tend to bounce back." Backtesting is how we test that hypothesis against historical data before risking real capital. It is the scientific method applied to financial markets. But like any experiment, the quality of your conclusions depends entirely on the rigor of your methodology.

This chapter covers the entire backtesting pipeline: architectures, pitfalls, cost modeling, validation techniques, overfitting prevention, framework selection, performance reporting, and the transition from backtest to live trading.

```
+------------------------------------------------------------------+
|                  THE BACKTESTING PIPELINE                         |
+------------------------------------------------------------------+
|                                                                  |
|  HYPOTHESIS  -->  DATA  -->  BACKTEST  -->  VALIDATE  -->  LIVE  |
|                                                                  |
|  "Momentum     Clean,       Simulate      Walk-forward   Paper   |
|   works in     adjusted,    trades on     analysis,      trade,  |
|   large caps"  survivorship historical    out-of-sample  then    |
|                free data    data          testing        deploy  |
|                                                                  |
+------------------------------------------------------------------+
```

---

## 8.1 What Is Backtesting

### Definition and Purpose

Backtesting is the process of applying a trading strategy to historical market data to evaluate how it would have performed. You feed your algorithm past prices, volumes, and other data, simulate the trades it would have made, and measure the resulting profit-and-loss (PnL).

```
+-------------------------------------------------------------+
|                    BACKTESTING OVERVIEW                      |
+-------------------------------------------------------------+
|                                                             |
|   INPUTS                  ENGINE              OUTPUTS       |
|   +----------------+     +-------------+     +-----------+  |
|   | Historical     |     | Strategy    |     | PnL Curve |  |
|   | Price Data     |---->| Logic       |---->| Sharpe    |  |
|   | Volume Data    |     | + Execution |     | Drawdown  |  |
|   | Corporate      |     |   Simulator |     | Win Rate  |  |
|   |   Actions      |     +-------------+     | Turnover  |  |
|   | Alt Data       |                         +-----------+  |
|   +----------------+                                        |
|                                                             |
+-------------------------------------------------------------+
```

**The purpose of backtesting:**

1. **Filter bad ideas quickly** -- Most strategies do not work. Backtesting kills bad ideas before they kill your capital.
2. **Estimate expected performance** -- Approximate returns, risk, and capacity.
3. **Optimize parameters** -- Find reasonable parameter ranges (carefully, to avoid overfitting).
4. **Build confidence** -- Understand a strategy's behavior across different market regimes.
5. **Stress test** -- See how a strategy performs during crashes, low volatility, or liquidity droughts.

### The Fundamental Assumption

Backtesting rests on one critical assumption: **past patterns contain information about future behavior**. This does not mean history repeats exactly. It means that the statistical relationships you discover have some persistence.

This assumption holds when:
- The market microstructure has not fundamentally changed
- The strategy exploits a persistent behavioral or structural edge
- The strategy capacity has not been exhausted by crowding

This assumption breaks when:
- Regulatory changes alter market structure (e.g., decimalization in 2001)
- A crowded trade unwinds (e.g., the quant meltdown of August 2007)
- A regime shift occurs (e.g., zero interest rate policy post-2008)

### Why Backtesting Is Necessary but Not Sufficient

```
+------------------------------------------------------------------+
|              BACKTEST vs REALITY GAP                              |
+------------------------------------------------------------------+
|                                                                  |
|  Things backtests get RIGHT:     Things backtests get WRONG:     |
|  +-------------------------+     +----------------------------+  |
|  | General strategy logic  |     | Exact fill prices          |  |
|  | Directional edge        |     | Liquidity availability     |  |
|  | Gross return patterns   |     | Market impact of YOUR      |  |
|  | Correlation structure   |     |   orders                   |  |
|  | Regime sensitivity      |     | Execution latency          |  |
|  +-------------------------+     | Counterparty risk          |  |
|                                  | Operational failures       |  |
|                                  | Behavioral risk (you panic)|  |
|                                  +----------------------------+  |
+------------------------------------------------------------------+
```

A backtest is a **necessary first filter**, not a guarantee. Think of it as a medical screening test:
- A strategy that fails in backtest will almost certainly fail live (high negative predictive value)
- A strategy that passes backtest may still fail live (moderate positive predictive value)

### Paper Trading vs Live Trading Gap

Even after a successful backtest, there is a gap between paper trading (simulated live) and actual live trading:

| Aspect | Backtest | Paper Trading | Live Trading |
|--------|----------|---------------|--------------|
| Data | Historical | Real-time | Real-time |
| Fills | Assumed | Simulated | Actual |
| Market impact | None | None | Real |
| Latency | Zero | Simulated | Real |
| Emotions | None | Low | High |
| Costs | Modeled | Modeled | Actual |
| Slippage | Estimated | Estimated | Real |

**Rule of thumb**: Expect live performance to be 30-50% worse than backtest performance for a well-constructed backtest. If your backtest Sharpe is 1.0, plan for a live Sharpe of 0.5-0.7.

---

## 8.2 Backtesting Architectures

There are two fundamental approaches to backtesting: vectorized and event-driven.

### Vectorized Backtesting

Vectorized backtesting computes signals and returns using array operations (NumPy/Pandas). The entire time series is processed at once.

```
+------------------------------------------------------------------+
|                 VECTORIZED BACKTESTING                            |
+------------------------------------------------------------------+
|                                                                  |
|  prices = [100, 102, 101, 105, 103, 108, 107, 112]              |
|                    |                                             |
|                    v                                             |
|  signals = compute_signals(prices)   <-- All at once!            |
|  signals = [ 0,   1,   0,   1,   0,   1,   0,   1]             |
|                    |                                             |
|                    v                                             |
|  returns = signals * price_returns   <-- Vectorized multiply     |
|                    |                                             |
|                    v                                             |
|  equity_curve = cumulative_product(1 + returns)                  |
|                                                                  |
+------------------------------------------------------------------+
|  PROS: Fast (100x), simple, good for research                    |
|  CONS: No position tracking, hard to model costs, look-ahead     |
|        bias risk, cannot handle complex order logic               |
+------------------------------------------------------------------+
```

**Implementation: Vectorized Backtest Engine**

```python
import numpy as np
import pandas as pd

class VectorizedBacktester:
    """
    A fast, vectorized backtesting engine.
    Good for initial research; not for production.
    """

    def __init__(self, prices: pd.Series, transaction_cost_bps: float = 5.0):
        self.prices = prices
        self.returns = prices.pct_change().fillna(0)
        self.tc_bps = transaction_cost_bps / 10_000

    def run_strategy(self, signals: pd.Series) -> dict:
        """
        Run a backtest given a signal series.

        Parameters
        ----------
        signals : pd.Series
            Position signal: +1 (long), -1 (short), 0 (flat).
            Must be indexed identically to self.prices.
            IMPORTANT: signals should be lagged by 1 to avoid look-ahead bias.

        Returns
        -------
        dict with equity curve and performance metrics.
        """
        # Ensure signals are shifted to avoid look-ahead bias
        # Signal on day t uses data up to day t, trade executes on day t+1
        positions = signals.shift(1).fillna(0)

        # Strategy returns = position * market return
        strategy_returns = positions * self.returns

        # Transaction costs: pay cost whenever position changes
        trades = positions.diff().abs().fillna(0)
        costs = trades * self.tc_bps
        net_returns = strategy_returns - costs

        # Build equity curve
        equity = (1 + net_returns).cumprod()

        return {
            "equity": equity,
            "returns": net_returns,
            "positions": positions,
            "trades": trades,
            "metrics": self._compute_metrics(net_returns, equity),
        }

    def _compute_metrics(self, returns: pd.Series, equity: pd.Series) -> dict:
        """Compute standard performance metrics."""
        total_return = equity.iloc[-1] / equity.iloc[0] - 1
        n_years = len(returns) / 252
        ann_return = (1 + total_return) ** (1 / n_years) - 1 if n_years > 0 else 0
        ann_vol = returns.std() * np.sqrt(252)
        sharpe = ann_return / ann_vol if ann_vol > 0 else 0

        # Maximum drawdown
        rolling_max = equity.cummax()
        drawdown = (equity - rolling_max) / rolling_max
        max_dd = drawdown.min()

        # Calmar ratio
        calmar = ann_return / abs(max_dd) if max_dd != 0 else 0

        return {
            "total_return": total_return,
            "ann_return": ann_return,
            "ann_volatility": ann_vol,
            "sharpe_ratio": sharpe,
            "max_drawdown": max_dd,
            "calmar_ratio": calmar,
            "n_trades": int((returns != 0).sum()),
        }


# --- Example usage ---
# Generate dummy price data
np.random.seed(42)
dates = pd.bdate_range("2020-01-01", periods=504)
prices = pd.Series(
    100 * np.exp(np.cumsum(np.random.normal(0.0002, 0.015, len(dates)))),
    index=dates,
)

# Simple moving average crossover signal
sma_fast = prices.rolling(20).mean()
sma_slow = prices.rolling(60).mean()
signals = pd.Series(np.where(sma_fast > sma_slow, 1.0, -1.0), index=dates)

bt = VectorizedBacktester(prices, transaction_cost_bps=5.0)
result = bt.run_strategy(signals)
print(f"Sharpe Ratio:  {result['metrics']['sharpe_ratio']:.2f}")
print(f"Max Drawdown:  {result['metrics']['max_drawdown']:.2%}")
print(f"Ann. Return:   {result['metrics']['ann_return']:.2%}")
```

### Event-Driven Backtesting

Event-driven backtesting processes data bar-by-bar (or tick-by-tick), simulating the exact sequence of events that would occur in live trading.

```
+------------------------------------------------------------------+
|               EVENT-DRIVEN BACKTESTING                           |
+------------------------------------------------------------------+
|                                                                  |
|  Event Queue:                                                    |
|  +--------+    +--------+    +--------+    +--------+            |
|  | Market |    | Signal |    | Order  |    | Fill   |            |
|  | Event  |--->| Event  |--->| Event  |--->| Event  |            |
|  +--------+    +--------+    +--------+    +--------+            |
|      ^                                         |                 |
|      |              EVENT LOOP                  |                 |
|      +------------------------------------------+                |
|                                                                  |
|  Components:                                                     |
|  +-------------+  +-------------+  +-------------+               |
|  | DataHandler |  |  Strategy   |  | Portfolio   |               |
|  | - loads bars|  | - generates |  | - tracks    |               |
|  | - emits     |  |   signals   |  |   positions |               |
|  |   market    |  | - risk      |  | - PnL       |               |
|  |   events    |  |   checks    |  | - generates |               |
|  +-------------+  +-------------+  |   orders    |               |
|                                    +-------------+               |
|  +-------------+  +-------------+                                |
|  | Execution   |  | Performance |                                |
|  | Handler     |  | Tracker     |                                |
|  | - simulates |  | - equity    |                                |
|  |   fills     |  |   curve     |                                |
|  | - slippage  |  | - metrics   |                                |
|  | - costs     |  | - reports   |                                |
|  +-------------+  +-------------+                                |
|                                                                  |
+------------------------------------------------------------------+
|  PROS: Realistic, handles complex logic, same code for live      |
|  CONS: Slow (100x), more complex to implement                    |
+------------------------------------------------------------------+
```

**The Event Loop in Detail:**

```
+------------------------------------------------------------------+
|                     EVENT LOOP FLOW                               |
+------------------------------------------------------------------+
|                                                                  |
|  1. MARKET EVENT                                                 |
|     DataHandler reads next bar/tick                              |
|     Pushes MarketEvent(timestamp, OHLCV) to queue                |
|          |                                                       |
|          v                                                       |
|  2. SIGNAL EVENT                                                 |
|     Strategy receives MarketEvent                                |
|     Computes indicators, checks rules                            |
|     Pushes SignalEvent(symbol, direction, strength)               |
|          |                                                       |
|          v                                                       |
|  3. ORDER EVENT                                                  |
|     Portfolio receives SignalEvent                                |
|     Checks risk limits, position sizing                          |
|     Pushes OrderEvent(symbol, qty, order_type, limit_price)      |
|          |                                                       |
|          v                                                       |
|  4. FILL EVENT                                                   |
|     ExecutionHandler receives OrderEvent                         |
|     Simulates fill with slippage and costs                       |
|     Pushes FillEvent(symbol, qty, fill_price, commission)        |
|          |                                                       |
|          v                                                       |
|  5. PORTFOLIO UPDATE                                             |
|     Portfolio receives FillEvent                                 |
|     Updates positions, cash, equity                              |
|     Logs trade                                                   |
|          |                                                       |
|          v                                                       |
|     Return to step 1 (next bar/tick)                             |
|                                                                  |
+------------------------------------------------------------------+
```

**Implementation: Event-Driven Backtest Engine**

```python
from dataclasses import dataclass, field
from enum import Enum
from collections import deque
from typing import Optional
import numpy as np
import pandas as pd


class EventType(Enum):
    MARKET = "MARKET"
    SIGNAL = "SIGNAL"
    ORDER = "ORDER"
    FILL = "FILL"


class Direction(Enum):
    LONG = "LONG"
    SHORT = "SHORT"
    EXIT = "EXIT"


class OrderType(Enum):
    MARKET = "MARKET"
    LIMIT = "LIMIT"


@dataclass(frozen=True)
class MarketEvent:
    event_type: EventType = field(default=EventType.MARKET, init=False)
    timestamp: pd.Timestamp
    symbol: str
    open_price: float
    high: float
    low: float
    close: float
    volume: int


@dataclass(frozen=True)
class SignalEvent:
    event_type: EventType = field(default=EventType.SIGNAL, init=False)
    timestamp: pd.Timestamp
    symbol: str
    direction: Direction
    strength: float = 1.0


@dataclass(frozen=True)
class OrderEvent:
    event_type: EventType = field(default=EventType.ORDER, init=False)
    timestamp: pd.Timestamp
    symbol: str
    quantity: int
    order_type: OrderType = OrderType.MARKET
    limit_price: Optional[float] = None


@dataclass(frozen=True)
class FillEvent:
    event_type: EventType = field(default=EventType.FILL, init=False)
    timestamp: pd.Timestamp
    symbol: str
    quantity: int
    fill_price: float
    commission: float


class DataHandler:
    """Loads historical data and emits MarketEvents bar-by-bar."""

    def __init__(self, symbol: str, data: pd.DataFrame):
        self.symbol = symbol
        self.data = data
        self.index = 0
        self.current_bar = None

    def has_next(self) -> bool:
        return self.index < len(self.data)

    def next_event(self) -> MarketEvent:
        row = self.data.iloc[self.index]
        self.current_bar = row
        self.index += 1
        return MarketEvent(
            timestamp=row.name,
            symbol=self.symbol,
            open_price=row["Open"],
            high=row["High"],
            low=row["Low"],
            close=row["Close"],
            volume=int(row["Volume"]),
        )


class Strategy:
    """
    Base strategy class. Override generate_signal().
    Example: simple moving average crossover.
    """

    def __init__(self, fast_period: int = 20, slow_period: int = 60):
        self.fast_period = fast_period
        self.slow_period = slow_period
        self.price_history: list[float] = []

    def on_market(self, event: MarketEvent) -> Optional[SignalEvent]:
        self.price_history.append(event.close)
        if len(self.price_history) < self.slow_period:
            return None

        fast_ma = np.mean(self.price_history[-self.fast_period :])
        slow_ma = np.mean(self.price_history[-self.slow_period :])

        if fast_ma > slow_ma:
            return SignalEvent(
                timestamp=event.timestamp,
                symbol=event.symbol,
                direction=Direction.LONG,
            )
        else:
            return SignalEvent(
                timestamp=event.timestamp,
                symbol=event.symbol,
                direction=Direction.SHORT,
            )


class Portfolio:
    """Tracks positions, cash, and generates orders from signals."""

    def __init__(self, initial_capital: float = 100_000.0):
        self.initial_capital = initial_capital
        self.cash = initial_capital
        self.positions: dict[str, int] = {}
        self.equity_curve: list[dict] = []

    def on_signal(self, signal: SignalEvent, current_price: float) -> Optional[OrderEvent]:
        current_pos = self.positions.get(signal.symbol, 0)
        target_qty = int(self.cash * 0.95 / current_price)  # Use 95% of cash

        if signal.direction == Direction.LONG and current_pos <= 0:
            qty = target_qty - current_pos
            return OrderEvent(
                timestamp=signal.timestamp,
                symbol=signal.symbol,
                quantity=qty,
            )
        elif signal.direction == Direction.SHORT and current_pos >= 0:
            qty = -(target_qty + current_pos)
            return OrderEvent(
                timestamp=signal.timestamp,
                symbol=signal.symbol,
                quantity=qty,
            )
        return None

    def on_fill(self, fill: FillEvent):
        self.positions[fill.symbol] = (
            self.positions.get(fill.symbol, 0) + fill.quantity
        )
        self.cash -= fill.quantity * fill.fill_price + fill.commission

    def record_equity(self, timestamp: pd.Timestamp, prices: dict[str, float]):
        position_value = sum(
            qty * prices.get(sym, 0) for sym, qty in self.positions.items()
        )
        total_equity = self.cash + position_value
        self.equity_curve.append({
            "timestamp": timestamp,
            "equity": total_equity,
            "cash": self.cash,
            "position_value": position_value,
        })


class ExecutionHandler:
    """Simulates order execution with slippage and commission."""

    def __init__(self, slippage_bps: float = 2.0, commission_per_share: float = 0.005):
        self.slippage_bps = slippage_bps / 10_000
        self.commission_per_share = commission_per_share

    def execute(self, order: OrderEvent, current_price: float) -> FillEvent:
        # Apply slippage: adverse direction
        if order.quantity > 0:
            fill_price = current_price * (1 + self.slippage_bps)
        else:
            fill_price = current_price * (1 - self.slippage_bps)

        commission = abs(order.quantity) * self.commission_per_share

        return FillEvent(
            timestamp=order.timestamp,
            symbol=order.symbol,
            quantity=order.quantity,
            fill_price=fill_price,
            commission=commission,
        )


class BacktestEngine:
    """Main event-driven backtest engine that ties all components together."""

    def __init__(
        self,
        data_handler: DataHandler,
        strategy: Strategy,
        portfolio: Portfolio,
        execution_handler: ExecutionHandler,
    ):
        self.data_handler = data_handler
        self.strategy = strategy
        self.portfolio = portfolio
        self.execution = execution_handler
        self.event_queue: deque = deque()

    def run(self) -> pd.DataFrame:
        while self.data_handler.has_next():
            # Step 1: Get next market event
            market_event = self.data_handler.next_event()

            # Step 2: Strategy processes market event
            signal = self.strategy.on_market(market_event)

            if signal is not None:
                # Step 3: Portfolio generates order from signal
                order = self.portfolio.on_signal(signal, market_event.close)

                if order is not None:
                    # Step 4: Execute order, get fill
                    fill = self.execution.execute(order, market_event.close)

                    # Step 5: Update portfolio with fill
                    self.portfolio.on_fill(fill)

            # Record equity at end of bar
            self.portfolio.record_equity(
                market_event.timestamp,
                {market_event.symbol: market_event.close},
            )

        return pd.DataFrame(self.portfolio.equity_curve).set_index("timestamp")


# --- Example usage ---
np.random.seed(42)
dates = pd.bdate_range("2020-01-01", periods=504)
close_prices = 100 * np.exp(np.cumsum(np.random.normal(0.0003, 0.015, len(dates))))
data = pd.DataFrame({
    "Open": close_prices * (1 + np.random.normal(0, 0.002, len(dates))),
    "High": close_prices * (1 + abs(np.random.normal(0, 0.005, len(dates)))),
    "Low": close_prices * (1 - abs(np.random.normal(0, 0.005, len(dates)))),
    "Close": close_prices,
    "Volume": np.random.randint(1_000_000, 10_000_000, len(dates)),
}, index=dates)

engine = BacktestEngine(
    data_handler=DataHandler("AAPL", data),
    strategy=Strategy(fast_period=20, slow_period=60),
    portfolio=Portfolio(initial_capital=100_000),
    execution_handler=ExecutionHandler(slippage_bps=2.0, commission_per_share=0.005),
)

equity_df = engine.run()
final_equity = equity_df["equity"].iloc[-1]
total_return = final_equity / 100_000 - 1
print(f"Final Equity:  ${final_equity:,.2f}")
print(f"Total Return:  {total_return:.2%}")
```

### Architecture Comparison

```
+------------------------------------------------------------------+
|           VECTORIZED  vs  EVENT-DRIVEN  COMPARISON               |
+------------------------------------------------------------------+
|                                                                  |
|  Dimension        Vectorized          Event-Driven               |
|  ----------------------------------------------------------------|
|  Speed            100x faster         Baseline                   |
|  Complexity       Simple              Complex                    |
|  Realism          Low                 High                       |
|  Look-ahead risk  HIGH                Low (if careful)           |
|  Position mgmt    Manual              Built-in                   |
|  Order types      Market only         All types                  |
|  Multi-asset      Easy                Moderate                   |
|  Live transition  Rewrite needed      Same code works            |
|  Best for         Research/screening  Final validation/prod      |
|                                                                  |
+------------------------------------------------------------------+
|                                                                  |
|  RECOMMENDED WORKFLOW:                                           |
|                                                                  |
|  Vectorized (screen 1000s)  -->  Event-driven (validate top 10) |
|  "Is this idea worth         "Does this strategy work with      |
|   investigating?"             realistic execution?"              |
|                                                                  |
+------------------------------------------------------------------+
```

---

## 8.3 Common Backtesting Pitfalls (CRITICAL)

These pitfalls are the reason most backtest results cannot be trusted. Understanding them is arguably more important than understanding the backtesting code itself.

### Pitfall 1: Look-Ahead Bias

**Definition**: Using information that would not have been available at the time of the trading decision.

```
+------------------------------------------------------------------+
|                    LOOK-AHEAD BIAS                                |
+------------------------------------------------------------------+
|                                                                  |
|  Timeline:  Day 1    Day 2    Day 3    Day 4    Day 5            |
|             $100     $102     $98      $105     $103             |
|                                                                  |
|  WRONG: On Day 2, your strategy "knows" price drops to $98      |
|         on Day 3 and goes short. Magic!                          |
|                                                                  |
|  RIGHT: On Day 2, your strategy can only see Days 1-2.          |
|         It must decide using ONLY $100, $102.                    |
|                                                                  |
|  COMMON CAUSES:                                                  |
|  - Using close price to generate signal and trade at close       |
|  - Using today's data for today's signal (no lag)                |
|  - Point-in-time data issues (restated earnings)                 |
|  - Pandas alignment bugs (off-by-one in .shift())               |
|                                                                  |
+------------------------------------------------------------------+
```

**Numerical example:**

```
Strategy: Buy when today's close > yesterday's close
DATA:     Day 0=$100, Day 1=$105, Day 2=$98, Day 3=$102

WITH look-ahead (WRONG):
  Day 1: Buy at $105, close at $105.  Return = 0%
  Day 2: No buy (close < prev). Skip.
  Day 3: Buy at $102, close at $102.  Return = 0%
  Wait, the bug is subtler...

WITH look-ahead (typical bug):
  Signal generated at Day 1 CLOSE: $105 > $100, BUY
  Trade at Day 1 CLOSE: $105           <-- Cannot do this!
  You see the close price and trade AT that close simultaneously.

WITHOUT look-ahead (CORRECT):
  Signal at Day 1 close: $105 > $100, BUY
  Trade at Day 2 OPEN: ~$104           <-- Realistic
  Day 2 return: ($98 - $104) / $104 = -5.8%
```

The look-ahead version avoids the Day 2 loss. Over thousands of trades, this inflates returns dramatically.

### Pitfall 2: Survivorship Bias

**Definition**: Testing only on assets that still exist, ignoring those that were delisted, went bankrupt, or were acquired.

```
+------------------------------------------------------------------+
|                   SURVIVORSHIP BIAS                               |
+------------------------------------------------------------------+
|                                                                  |
|  Universe in 2010:  A, B, C, D, E, F, G, H, I, J               |
|                                                                  |
|  By 2024:           A, B, C, D, E survived                      |
|                     F (bankrupt), G (acquired), H (delisted)     |
|                     I (penny stock), J (merged)                  |
|                                                                  |
|  If you test in 2024 using only TODAY'S stock universe:          |
|  You only test A-E, which are the WINNERS.                       |
|  Your strategy looks great because it only holds survivors.      |
|                                                                  |
|  IMPACT: +1-3% annual return inflation for stock strategies      |
|                                                                  |
+------------------------------------------------------------------+
```

**Numerical example:**

```
10 stocks in 2010, each starting at $100:
  A: $100 -> $250  (+150%)     Survived
  B: $100 -> $180  (+80%)      Survived
  C: $100 -> $120  (+20%)      Survived
  D: $100 -> $300  (+200%)     Survived
  E: $100 -> $90   (-10%)      Survived
  F: $100 -> $0    (-100%)     BANKRUPT (removed from database)
  G: $100 -> $60   (-40%)      DELISTED
  H: $100 -> $30   (-70%)      DELISTED
  I: $100 -> $10   (-90%)      DELISTED
  J: $100 -> $200  (+100%)     ACQUIRED at $150

Equal-weight portfolio return:
  WITH survivorship bias (only A-E):  (150+80+20+200-10)/5 = +88%
  WITHOUT bias (all 10 stocks):       (150+80+20+200-10-100-40-70-90+50)/10 = +19%

Survivorship bias inflated returns by 69 percentage points!
```

### Pitfall 3: Data-Snooping Bias / Overfitting

**Definition**: Testing so many strategy variations that you find one that works by pure chance.

```
+------------------------------------------------------------------+
|                 DATA-SNOOPING BIAS                                |
+------------------------------------------------------------------+
|                                                                  |
|  You test 1000 random strategies on the same data.               |
|  At 5% significance level, ~50 will appear "significant"         |
|  by pure chance.                                                 |
|                                                                  |
|  Trial 1:   SMA(10,30) -> Sharpe 0.3    (fail)                  |
|  Trial 2:   SMA(12,35) -> Sharpe 0.5    (fail)                  |
|  ...                                                             |
|  Trial 47:  SMA(17,43) -> Sharpe 1.8    (found it!)             |
|  ...                                                             |
|  Trial 1000: SMA(50,200) -> Sharpe 0.4  (fail)                  |
|                                                                  |
|  You report SMA(17,43) with Sharpe 1.8.                          |
|  But this is the BEST of 1000 tries. It's noise.                |
|                                                                  |
|  The more parameters you tune, the more you overfit.             |
|  5 parameters with 10 values each = 100,000 combinations!       |
|                                                                  |
+------------------------------------------------------------------+
```

**The Deflated Sharpe Ratio** corrects for this. If you tested N strategies, the expected maximum Sharpe under the null (no skill) is approximately:

```
E[max(SR)] ≈ sqrt(2 * ln(N))

N=1:      E[max(SR)] = 0.0     (no snooping)
N=10:     E[max(SR)] = 2.15
N=100:    E[max(SR)] = 3.03
N=1000:   E[max(SR)] = 3.72
N=10000:  E[max(SR)] = 4.29
```

So if you tested 100 strategies and found one with Sharpe = 2.5, it is likely noise (below the 3.03 threshold).

### Pitfall 4: Selection Bias

You choose to backtest strategies on assets or time periods where you already know they work. For example, testing a momentum strategy on Tesla from 2019-2021 because you know it went up 10x.

### Pitfall 5: Fill Assumptions

```
+------------------------------------------------------------------+
|                   FILL ASSUMPTION BIAS                            |
+------------------------------------------------------------------+
|                                                                  |
|  Your backtest assumes: "I buy 10,000 shares at $50.00"          |
|                                                                  |
|  Reality (order book):                                           |
|  +--------------------+--------------------+                     |
|  | BID                | ASK                |                     |
|  +--------------------+--------------------+                     |
|  | $49.98 x 500       | $50.00 x 200       |                     |
|  | $49.97 x 800       | $50.01 x 300       |                     |
|  | $49.95 x 1200      | $50.02 x 1500      |                     |
|  | $49.93 x 2000      | $50.05 x 3000      |                     |
|  | $49.90 x 5000      | $50.10 x 5000      |                     |
|  +--------------------+--------------------+                     |
|                                                                  |
|  To buy 10,000 shares, you'd need to sweep through:             |
|    200 @ $50.00 +  300 @ $50.01 + 1500 @ $50.02                 |
|  + 3000 @ $50.05 + 5000 @ $50.10                                |
|  Average fill = $50.057   (not $50.00!)                          |
|  Extra cost = 0.114% = 11.4 bps                                 |
|                                                                  |
+------------------------------------------------------------------+
```

### Pitfall 6: Ignoring Market Impact

Your order moves the price. If you are trading $10M, you are the market.

```
Market impact ≈ σ * sqrt(Q / V)

Where:
  σ = daily volatility (e.g., 2%)
  Q = your order size (e.g., 100,000 shares)
  V = daily volume (e.g., 1,000,000 shares)

Impact = 0.02 * sqrt(100,000 / 1,000,000)
       = 0.02 * sqrt(0.1)
       = 0.02 * 0.316
       = 0.0063 = 63 bps per trade
```

For a strategy that trades daily with 100% turnover, 63 bps per trade means 63 * 252 * 2 = 31,752 bps = 317% annual cost. This strategy is impossible at that size.

### Pitfall 7: Time-Period Bias

Testing only during bull markets, only during 2009-2024, or only during a specific regime.

```
Strategy backtested 2010-2020 (bull market): Sharpe = 1.5
Same strategy 2000-2002 (dot-com crash):     Sharpe = -0.8
Same strategy 2007-2009 (financial crisis):  Sharpe = -1.2

The strategy only works in bull markets. It's not alpha; it's beta.
```

### Pitfall 8: Backfill Bias in Alternative Data

When alternative data vendors add new data sources, they often backfill historical data. But the data quality, coverage, and methodology may differ for the backfilled period.

### Summary: Impact of Each Bias

```
+------------------------------------------------------------------+
|              BIAS IMPACT ON BACKTEST RETURNS                      |
+------------------------------------------------------------------+
|                                                                  |
|  Bias                        Typical Inflation                   |
|  --------------------------------------------------------        |
|  Look-ahead bias             +50-200% (can be extreme)           |
|  Survivorship bias           +1-3% per year                      |
|  Data-snooping (100 trials)  Sharpe inflated by ~1.5-3.0         |
|  Selection bias              Unpredictable, often large          |
|  Fill assumptions            +0.5-2% per year                    |
|  Market impact (ignored)     +1-10% per year (size dependent)    |
|  Time-period bias            Unpredictable                       |
|  Backfill bias               +0.5-2% per year                    |
|                                                                  |
|  COMBINED EFFECT: A "great" backtest with Sharpe 2.0             |
|  might actually be Sharpe 0.3 in reality.                        |
|                                                                  |
+------------------------------------------------------------------+
```

---

## 8.4 Transaction Cost Modeling

Accurate transaction cost modeling is essential. A strategy that looks profitable before costs may be deeply unprofitable after costs.

### Components of Transaction Costs

```
+------------------------------------------------------------------+
|             TRANSACTION COST COMPONENTS                           |
+------------------------------------------------------------------+
|                                                                  |
|  Total Cost = Commission + Spread + Slippage + Impact            |
|             + Borrowing Cost (shorts) + Funding Cost             |
|                                                                  |
|  +-----------+  +----------+  +----------+  +----------+        |
|  | Commission|  | Spread   |  | Slippage |  | Market   |        |
|  | $0.005/sh |  | Half the |  | Random   |  | Impact   |        |
|  | or $1 min |  | bid-ask  |  | deviation|  | Your     |        |
|  |           |  | spread   |  | from     |  | order    |        |
|  | Fixed per |  | ~1-5 bps |  | expected |  | moves    |        |
|  | trade or  |  | for      |  | fill     |  | the      |        |
|  | per share |  | liquid   |  | price    |  | price    |        |
|  |           |  | stocks   |  |          |  |          |        |
|  +-----------+  +----------+  +----------+  +----------+        |
|                                                                  |
|  For liquid large caps (AAPL, MSFT):                             |
|    Commission: ~0.5 bps                                          |
|    Half-spread: ~1 bps                                           |
|    Slippage: ~1-2 bps                                            |
|    Market impact (small order): ~1-5 bps                         |
|    TOTAL: ~3-9 bps per trade                                     |
|                                                                  |
|  For illiquid small caps:                                        |
|    Commission: ~0.5 bps                                          |
|    Half-spread: ~25-50 bps                                       |
|    Slippage: ~10-30 bps                                          |
|    Market impact: ~20-100 bps                                    |
|    TOTAL: ~55-180 bps per trade                                  |
|                                                                  |
+------------------------------------------------------------------+
```

### Slippage Models

```python
import numpy as np


class SlippageModel:
    """Various slippage models for backtesting."""

    @staticmethod
    def fixed_slippage(price: float, quantity: int, fixed_bps: float = 2.0) -> float:
        """Fixed basis points of slippage regardless of order size."""
        direction = 1 if quantity > 0 else -1
        return price * (1 + direction * fixed_bps / 10_000)

    @staticmethod
    def percentage_slippage(price: float, quantity: int, pct: float = 0.01) -> float:
        """Percentage-based slippage."""
        direction = 1 if quantity > 0 else -1
        return price * (1 + direction * pct / 100)

    @staticmethod
    def volume_based_slippage(
        price: float,
        quantity: int,
        daily_volume: int,
        volatility: float,
        eta: float = 0.1,
    ) -> float:
        """
        Square-root market impact model.

        Impact = eta * sigma * sqrt(Q / V)

        Parameters
        ----------
        price : current price
        quantity : order size (signed)
        daily_volume : average daily volume
        volatility : daily volatility (e.g., 0.02 for 2%)
        eta : impact coefficient (typically 0.05-0.15)
        """
        participation_rate = abs(quantity) / daily_volume
        impact = eta * volatility * np.sqrt(participation_rate)
        direction = 1 if quantity > 0 else -1
        return price * (1 + direction * impact)


# --- Numerical examples ---
price = 100.0
qty_small = 1_000
qty_large = 100_000
daily_vol = 1_000_000
sigma = 0.02

print("=== Slippage Model Comparison ===")
print(f"Price: ${price}, Daily Volume: {daily_vol:,}")
print()

# Small order (1,000 shares = 0.1% of volume)
fill_fixed = SlippageModel.fixed_slippage(price, qty_small, 2.0)
fill_sqrt = SlippageModel.volume_based_slippage(price, qty_small, daily_vol, sigma)
print(f"Small order ({qty_small:,} shares, {qty_small/daily_vol:.1%} of volume):")
print(f"  Fixed 2 bps:    ${fill_fixed:.4f}  (cost: {(fill_fixed/price-1)*10000:.1f} bps)")
print(f"  Sqrt impact:    ${fill_sqrt:.4f}  (cost: {(fill_sqrt/price-1)*10000:.1f} bps)")
print()

# Large order (100,000 shares = 10% of volume)
fill_fixed = SlippageModel.fixed_slippage(price, qty_large, 2.0)
fill_sqrt = SlippageModel.volume_based_slippage(price, qty_large, daily_vol, sigma)
print(f"Large order ({qty_large:,} shares, {qty_large/daily_vol:.0%} of volume):")
print(f"  Fixed 2 bps:    ${fill_fixed:.4f}  (cost: {(fill_fixed/price-1)*10000:.1f} bps)")
print(f"  Sqrt impact:    ${fill_sqrt:.4f}  (cost: {(fill_sqrt/price-1)*10000:.1f} bps)")
```

Output:
```
Small order (1,000 shares, 0.1% of volume):
  Fixed 2 bps:    $100.0200  (cost: 2.0 bps)
  Sqrt impact:    $100.0632  (cost: 6.3 bps)

Large order (100,000 shares, 10% of volume):
  Fixed 2 bps:    $100.0200  (cost: 2.0 bps)
  Sqrt impact:    $100.6325  (cost: 63.2 bps)
```

The fixed model dangerously underestimates costs for large orders. Always use volume-dependent models for strategies that trade significant size.

### Comprehensive Cost Model

```python
from dataclasses import dataclass
import numpy as np


@dataclass(frozen=True)
class CostEstimate:
    commission: float
    spread_cost: float
    slippage: float
    market_impact: float
    borrow_cost: float
    total_cost: float
    cost_bps: float


class RealisticCostModel:
    """
    Comprehensive transaction cost model combining all cost components.
    All costs are computed per trade (one-way).
    """

    def __init__(
        self,
        commission_per_share: float = 0.005,
        min_commission: float = 1.0,
        spread_bps: float = 2.0,
        impact_eta: float = 0.1,
        annual_borrow_rate: float = 0.01,
    ):
        self.commission_per_share = commission_per_share
        self.min_commission = min_commission
        self.spread_bps = spread_bps / 10_000
        self.impact_eta = impact_eta
        self.annual_borrow_rate = annual_borrow_rate

    def estimate(
        self,
        price: float,
        quantity: int,
        daily_volume: int,
        daily_volatility: float,
        is_short: bool = False,
        holding_days: int = 1,
    ) -> CostEstimate:
        """
        Estimate all-in transaction costs for a trade.

        Parameters
        ----------
        price : current price
        quantity : number of shares (unsigned)
        daily_volume : average daily volume
        daily_volatility : annualized vol / sqrt(252), e.g., 0.02
        is_short : whether this is a short sale
        holding_days : expected holding period for borrow cost calc
        """
        abs_qty = abs(quantity)
        notional = abs_qty * price

        # 1. Commission
        commission = max(abs_qty * self.commission_per_share, self.min_commission)

        # 2. Half bid-ask spread
        spread_cost = notional * self.spread_bps

        # 3. Slippage (random component, ~1-2 bps for liquid stocks)
        slippage = notional * 0.0001  # 1 bps baseline

        # 4. Market impact (square root model)
        participation = abs_qty / daily_volume if daily_volume > 0 else 1.0
        impact_pct = self.impact_eta * daily_volatility * np.sqrt(participation)
        market_impact = notional * impact_pct

        # 5. Borrow cost for short selling
        borrow_cost = 0.0
        if is_short:
            borrow_cost = notional * self.annual_borrow_rate * holding_days / 365

        total = commission + spread_cost + slippage + market_impact + borrow_cost
        cost_bps = (total / notional) * 10_000 if notional > 0 else 0

        return CostEstimate(
            commission=commission,
            spread_cost=spread_cost,
            slippage=slippage,
            market_impact=market_impact,
            borrow_cost=borrow_cost,
            total_cost=total,
            cost_bps=cost_bps,
        )


# --- Example: cost breakdown ---
model = RealisticCostModel()

print("=== Transaction Cost Breakdown ===\n")

# Liquid large-cap
est = model.estimate(price=150, quantity=5_000, daily_volume=30_000_000,
                     daily_volatility=0.015)
print(f"AAPL: 5,000 shares @ $150 (${5000*150:,.0f} notional)")
print(f"  Commission:    ${est.commission:.2f}")
print(f"  Spread cost:   ${est.spread_cost:.2f}")
print(f"  Slippage:      ${est.slippage:.2f}")
print(f"  Market impact: ${est.market_impact:.2f}")
print(f"  TOTAL:         ${est.total_cost:.2f}  ({est.cost_bps:.1f} bps)\n")

# Illiquid small-cap short
model_illiquid = RealisticCostModel(spread_bps=30.0, impact_eta=0.15,
                                     annual_borrow_rate=0.08)
est2 = model_illiquid.estimate(price=15, quantity=50_000, daily_volume=200_000,
                                daily_volatility=0.04, is_short=True, holding_days=20)
print(f"Small-cap short: 50,000 shares @ $15 (${50000*15:,.0f} notional)")
print(f"  Commission:    ${est2.commission:.2f}")
print(f"  Spread cost:   ${est2.spread_cost:.2f}")
print(f"  Slippage:      ${est2.slippage:.2f}")
print(f"  Market impact: ${est2.market_impact:.2f}")
print(f"  Borrow cost:   ${est2.borrow_cost:.2f}")
print(f"  TOTAL:         ${est2.total_cost:.2f}  ({est2.cost_bps:.1f} bps)")
```

---

## 8.5 Walk-Forward Analysis

Walk-forward analysis is the gold standard for validating trading strategies. It simulates the process of developing a strategy on past data and then trading it on new, unseen data.

### In-Sample vs Out-of-Sample

```
+------------------------------------------------------------------+
|               IN-SAMPLE vs OUT-OF-SAMPLE                         |
+------------------------------------------------------------------+
|                                                                  |
|  |<---------- Full Dataset (2010-2024) ---------->|              |
|  |                                                |              |
|  |  IN-SAMPLE (IS)       |  OUT-OF-SAMPLE (OOS)   |              |
|  |  2010 -------- 2020   |  2020 -------- 2024    |              |
|  |  Train your model     |  Test your model        |              |
|  |  Optimize parameters  |  NO peeking!            |              |
|  |  Develop signals       |  Measure REAL perf      |              |
|  |                        |                         |              |
|  +------------------------------------------------------------------+
|                                                                  |
|  RULES:                                                          |
|  1. NEVER optimize on OOS data                                   |
|  2. Split BEFORE you start research                              |
|  3. OOS should be at least 20-30% of total data                  |
|  4. Once you look at OOS, it becomes IS                          |
|     (you cannot unsee the results)                               |
|                                                                  |
+------------------------------------------------------------------+
```

### Walk-Forward Optimization

Instead of a single IS/OOS split, walk-forward optimization uses multiple rolling windows:

```
+------------------------------------------------------------------+
|              WALK-FORWARD OPTIMIZATION                            |
+------------------------------------------------------------------+
|                                                                  |
|  Step 1:  [===== TRAIN 1 =====][= TEST 1 =]                    |
|  Step 2:       [===== TRAIN 2 =====][= TEST 2 =]               |
|  Step 3:            [===== TRAIN 3 =====][= TEST 3 =]          |
|  Step 4:                 [===== TRAIN 4 =====][= TEST 4 =]     |
|  Step 5:                      [===== TRAIN 5 =====][= TEST 5 =]|
|                                                                  |
|  |-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|     |
|  2010  2012  2014  2016  2018  2020  2022  2024                 |
|                                                                  |
|  At each step:                                                   |
|  1. Optimize parameters on TRAIN window                          |
|  2. Apply optimized parameters to TEST window                    |
|  3. Record TEST performance                                      |
|  4. Slide window forward                                         |
|                                                                  |
|  Final performance = concatenation of all TEST periods           |
|  This is a REALISTIC simulation of how you'd actually trade     |
|                                                                  |
+------------------------------------------------------------------+
```

### Anchored vs Rolling Windows

```
+------------------------------------------------------------------+
|           ANCHORED  vs  ROLLING WINDOWS                          |
+------------------------------------------------------------------+
|                                                                  |
|  ANCHORED (expanding window):                                    |
|  Step 1:  [=== TRAIN ===][TEST]                                 |
|  Step 2:  [======= TRAIN =======][TEST]                         |
|  Step 3:  [=========== TRAIN ===========][TEST]                 |
|  Step 4:  [=============== TRAIN ===============][TEST]         |
|                                                                  |
|  Training window grows. Uses ALL available history.              |
|  PROS: More data for training. Stable estimates.                 |
|  CONS: Old data may not be relevant.                             |
|                                                                  |
|  ROLLING (fixed window):                                         |
|  Step 1:  [=== TRAIN ===][TEST]                                 |
|  Step 2:       [=== TRAIN ===][TEST]                             |
|  Step 3:            [=== TRAIN ===][TEST]                        |
|  Step 4:                 [=== TRAIN ===][TEST]                   |
|                                                                  |
|  Training window is fixed size. Drops oldest data.               |
|  PROS: Adapts to regime changes. Equal weighting.                |
|  CONS: Less data for training.                                   |
|                                                                  |
+------------------------------------------------------------------+
```

### Cross-Validation for Time Series

Standard k-fold cross-validation is invalid for time series because it ignores temporal ordering. You must use **purged** and **embargoed** cross-validation.

```
+------------------------------------------------------------------+
|         PURGED CROSS-VALIDATION FOR TIME SERIES                  |
+------------------------------------------------------------------+
|                                                                  |
|  Standard k-fold (WRONG for time series):                        |
|  [TEST][TRAIN][TEST][TRAIN][TEST]                                |
|  Future data leaks into past! Autocorrelation destroys validity. |
|                                                                  |
|  Purged k-fold (CORRECT):                                        |
|                                                                  |
|  Fold 1: [TRAIN      ][PURGE][TEST][EMBARGO][  TRAIN  ]         |
|  Fold 2: [TRAIN][PURGE][TEST][EMBARGO][     TRAIN     ]         |
|  Fold 3: [  TRAIN   ][PURGE][TEST][EMBARGO][ TRAIN    ]         |
|                                                                  |
|  PURGE: Remove training samples that overlap with test labels    |
|         (prevents information leakage through label overlap)     |
|                                                                  |
|  EMBARGO: Remove training samples immediately after the test     |
|           set (prevents serial correlation leakage)              |
|                                                                  |
|  Typical values:                                                 |
|    Purge = label horizon (e.g., 5 days for 5-day returns)        |
|    Embargo = 1-2% of total samples                               |
|                                                                  |
+------------------------------------------------------------------+
```

### Combinatorial Purged Cross-Validation (CPCV)

CPCV (from Marcos Lopez de Prado) generates many more train/test splits, producing a distribution of backtest paths rather than a single result.

```
+------------------------------------------------------------------+
|       COMBINATORIAL PURGED CROSS-VALIDATION (CPCV)               |
+------------------------------------------------------------------+
|                                                                  |
|  Split data into N groups. Choose k groups for testing.          |
|  Number of paths = C(N, k) = N! / (k! * (N-k)!)                 |
|                                                                  |
|  Example: N=6 groups, k=2 test groups                            |
|  C(6,2) = 15 different train/test combinations                   |
|                                                                  |
|  Group:    [  1  ][  2  ][  3  ][  4  ][  5  ][  6  ]           |
|                                                                  |
|  Path 1:  [TEST ][TEST ][ train ][ train ][ train ][ train ]    |
|  Path 2:  [TEST ][ train ][TEST ][ train ][ train ][ train ]    |
|  Path 3:  [TEST ][ train ][ train ][TEST ][ train ][ train ]    |
|  ...                                                             |
|  Path 15: [ train ][ train ][ train ][ train ][TEST ][TEST ]    |
|                                                                  |
|  Result: 15 different OOS equity curves                          |
|  If most paths are profitable, strategy is robust.               |
|  If paths vary wildly, strategy is overfit.                      |
|                                                                  |
+------------------------------------------------------------------+
```

### Walk-Forward Implementation

```python
import numpy as np
import pandas as pd
from typing import Callable


class WalkForwardAnalyzer:
    """
    Walk-forward analysis engine.
    Supports both anchored and rolling windows.
    """

    def __init__(
        self,
        prices: pd.Series,
        train_period: int = 252,     # ~1 year
        test_period: int = 63,       # ~3 months
        anchored: bool = False,
    ):
        self.prices = prices
        self.returns = prices.pct_change().fillna(0)
        self.train_period = train_period
        self.test_period = test_period
        self.anchored = anchored

    def run(
        self,
        optimize_fn: Callable,
        signal_fn: Callable,
    ) -> dict:
        """
        Run walk-forward analysis.

        Parameters
        ----------
        optimize_fn : function(train_prices) -> params
            Takes training prices, returns optimized parameters.
        signal_fn : function(prices, params) -> signals
            Takes prices and params, returns position signals.

        Returns
        -------
        dict with combined OOS equity curve and per-fold results.
        """
        total_len = len(self.prices)
        folds = []
        oos_returns_list = []

        fold_idx = 0
        start = 0

        while start + self.train_period + self.test_period <= total_len:
            train_start = 0 if self.anchored else start
            train_end = start + self.train_period
            test_start = train_end
            test_end = min(test_start + self.test_period, total_len)

            train_prices = self.prices.iloc[train_start:train_end]
            test_prices = self.prices.iloc[test_start:test_end]
            test_returns = self.returns.iloc[test_start:test_end]

            # Step 1: Optimize on training data
            params = optimize_fn(train_prices)

            # Step 2: Generate signals on test data using optimized params
            signals = signal_fn(test_prices, params)

            # Step 3: Compute OOS returns
            positions = signals.shift(1).fillna(0)
            oos_rets = positions * test_returns

            oos_returns_list.append(oos_rets)

            folds.append({
                "fold": fold_idx,
                "train_start": train_prices.index[0],
                "train_end": train_prices.index[-1],
                "test_start": test_prices.index[0],
                "test_end": test_prices.index[-1],
                "params": params,
                "oos_sharpe": self._sharpe(oos_rets),
                "oos_return": (1 + oos_rets).prod() - 1,
            })

            start += self.test_period
            fold_idx += 1

        # Combine all OOS returns
        combined_oos = pd.concat(oos_returns_list)
        combined_equity = (1 + combined_oos).cumprod()

        return {
            "equity": combined_equity,
            "returns": combined_oos,
            "folds": pd.DataFrame(folds),
            "overall_sharpe": self._sharpe(combined_oos),
            "overall_return": combined_equity.iloc[-1] - 1,
        }

    @staticmethod
    def _sharpe(returns: pd.Series) -> float:
        if returns.std() == 0:
            return 0.0
        return returns.mean() / returns.std() * np.sqrt(252)


# --- Example usage ---
np.random.seed(42)
dates = pd.bdate_range("2015-01-01", periods=2520)  # ~10 years
prices = pd.Series(
    100 * np.exp(np.cumsum(np.random.normal(0.0002, 0.012, len(dates)))),
    index=dates,
)

def optimize_sma(train_prices: pd.Series) -> dict:
    """Find best SMA crossover parameters on training data."""
    best_sharpe = -np.inf
    best_params = {"fast": 10, "slow": 50}
    train_returns = train_prices.pct_change().fillna(0)

    for fast in [10, 15, 20, 25]:
        for slow in [40, 50, 60, 80]:
            if fast >= slow:
                continue
            sma_f = train_prices.rolling(fast).mean()
            sma_s = train_prices.rolling(slow).mean()
            sig = pd.Series(
                np.where(sma_f > sma_s, 1.0, -1.0), index=train_prices.index
            )
            pos = sig.shift(1).fillna(0)
            strat_ret = pos * train_returns
            sr = strat_ret.mean() / strat_ret.std() * np.sqrt(252) if strat_ret.std() > 0 else 0
            if sr > best_sharpe:
                best_sharpe = sr
                best_params = {"fast": fast, "slow": slow}

    return best_params

def generate_signals(prices: pd.Series, params: dict) -> pd.Series:
    """Generate SMA crossover signals with given parameters."""
    sma_f = prices.rolling(params["fast"]).mean()
    sma_s = prices.rolling(params["slow"]).mean()
    return pd.Series(np.where(sma_f > sma_s, 1.0, -1.0), index=prices.index)

wfa = WalkForwardAnalyzer(prices, train_period=504, test_period=126, anchored=False)
result = wfa.run(optimize_fn=optimize_sma, signal_fn=generate_signals)

print(f"Walk-Forward OOS Sharpe:  {result['overall_sharpe']:.2f}")
print(f"Walk-Forward OOS Return:  {result['overall_return']:.2%}")
print(f"\nPer-fold results:")
print(result["folds"][["fold", "test_start", "test_end", "params",
                         "oos_sharpe", "oos_return"]].to_string(index=False))
```

---

## 8.6 Overfitting Prevention

Overfitting is the single biggest danger in quantitative finance. A backtest that is overfit to historical data will fail in live trading.

### Multiple Hypothesis Testing Correction

When you test N strategies, you must adjust your significance threshold.

**Bonferroni correction**: Divide your significance level by N.

```
Testing 100 strategies at 5% significance:
  Without correction: 5% threshold   -> ~5 false positives
  With Bonferroni:    0.05% threshold -> ~0.05 false positives

If a strategy has p-value = 0.01:
  Without correction: "Significant!"   (0.01 < 0.05)
  With Bonferroni:    "Not significant" (0.01 > 0.0005)
```

**Benjamini-Hochberg (FDR)**: Less conservative. Controls the false discovery rate rather than family-wise error rate.

```python
import numpy as np


def bonferroni_correction(p_values: list[float], alpha: float = 0.05) -> list[bool]:
    """Apply Bonferroni correction to a list of p-values."""
    n = len(p_values)
    adjusted_alpha = alpha / n
    return [p < adjusted_alpha for p in p_values]


def benjamini_hochberg(p_values: list[float], alpha: float = 0.05) -> list[bool]:
    """Apply Benjamini-Hochberg FDR correction."""
    n = len(p_values)
    sorted_indices = np.argsort(p_values)
    sorted_p = np.array(p_values)[sorted_indices]

    thresholds = [(i + 1) / n * alpha for i in range(n)]
    significant = np.zeros(n, dtype=bool)

    # Find largest k where p_(k) <= k/n * alpha
    max_k = -1
    for k in range(n):
        if sorted_p[k] <= thresholds[k]:
            max_k = k

    if max_k >= 0:
        significant[sorted_indices[: max_k + 1]] = True

    return significant.tolist()


# Example: 20 strategies tested
np.random.seed(42)
# 17 null strategies + 3 real signals
p_values = list(np.random.uniform(0.01, 0.99, 17)) + [0.001, 0.003, 0.01]
np.random.shuffle(p_values)

bonf = bonferroni_correction(p_values)
bh = benjamini_hochberg(p_values)

print(f"{'Strategy':>10} {'p-value':>8} {'Bonferroni':>12} {'BH-FDR':>8}")
print("-" * 45)
for i, (p, b, h) in enumerate(zip(p_values, bonf, bh)):
    print(f"{'S'+str(i+1):>10} {p:>8.4f} {'PASS' if b else 'FAIL':>12} {'PASS' if h else 'FAIL':>8}")
```

### Deflated Sharpe Ratio

The Deflated Sharpe Ratio (DSR) by Bailey and Lopez de Prado adjusts the observed Sharpe ratio for the number of trials.

```python
import numpy as np
from scipy import stats


def deflated_sharpe_ratio(
    observed_sr: float,
    n_trials: int,
    n_observations: int,
    skewness: float = 0.0,
    kurtosis: float = 3.0,
    sr_benchmark: float = 0.0,
) -> float:
    """
    Compute the Deflated Sharpe Ratio.

    Parameters
    ----------
    observed_sr : the observed (annualized) Sharpe ratio
    n_trials : number of strategies tested
    n_observations : number of return observations
    skewness : skewness of returns
    kurtosis : kurtosis of returns (3.0 = normal)
    sr_benchmark : benchmark Sharpe ratio (default 0)

    Returns
    -------
    p-value: probability that the observed SR is due to chance
    """
    # Expected maximum SR under the null (no skill)
    euler_mascheroni = 0.5772156649
    e_max_sr = sr_benchmark + np.sqrt(2 * np.log(n_trials)) * (
        1 - euler_mascheroni / np.sqrt(2 * np.log(n_trials))
        + euler_mascheroni / (2 * np.log(n_trials))
    )

    # Standard error of SR estimate
    sr_std = np.sqrt(
        (1 - skewness * observed_sr + (kurtosis - 1) / 4 * observed_sr ** 2)
        / (n_observations - 1)
    )

    # Test statistic
    if sr_std > 0:
        z = (observed_sr - e_max_sr) / sr_std
    else:
        z = 0.0

    # p-value (one-sided test)
    p_value = stats.norm.cdf(z)

    return p_value


# --- Example ---
print("=== Deflated Sharpe Ratio Analysis ===\n")

scenarios = [
    {"observed_sr": 2.0, "n_trials": 1, "label": "1 trial, SR=2.0"},
    {"observed_sr": 2.0, "n_trials": 10, "label": "10 trials, SR=2.0"},
    {"observed_sr": 2.0, "n_trials": 100, "label": "100 trials, SR=2.0"},
    {"observed_sr": 2.0, "n_trials": 1000, "label": "1000 trials, SR=2.0"},
    {"observed_sr": 3.0, "n_trials": 100, "label": "100 trials, SR=3.0"},
    {"observed_sr": 4.0, "n_trials": 1000, "label": "1000 trials, SR=4.0"},
]

for s in scenarios:
    p = deflated_sharpe_ratio(
        observed_sr=s["observed_sr"],
        n_trials=s["n_trials"],
        n_observations=252 * 5,  # 5 years daily
    )
    verdict = "LIKELY REAL" if p > 0.95 else "POSSIBLY OVERFIT" if p > 0.5 else "LIKELY OVERFIT"
    print(f"  {s['label']:>30s}  ->  DSR p-value: {p:.4f}  [{verdict}]")
```

### Minimum Backtest Length

How long must a backtest be to trust the Sharpe ratio estimate?

```
Minimum Backtest Length (MBL) in years:

MBL ≈ (1 + (SR_hat)^2 * (kurtosis - 1) / 4 - SR_hat * skewness)
      / (SR_hat^2)

For SR_hat = 1.0, normal returns:
  MBL = (1 + 0) / 1.0 = 1 year minimum

For SR_hat = 0.5:
  MBL = (1 + 0) / 0.25 = 4 years minimum

For SR_hat = 2.0:
  MBL = (1 + 0.75) / 4.0 = 0.44 years

RULE OF THUMB:
  For Sharpe ~ 1.0: Need at least 2-3 years of data
  For Sharpe ~ 0.5: Need at least 5-8 years of data
  For Sharpe ~ 2.0: Need at least 1-2 years of data
```

### The Haircut Rule for Backtest Sharpe Ratios

Harvey, Liu, and Zhu (2016) suggest that you should "haircut" backtest Sharpe ratios to account for data snooping:

```
+------------------------------------------------------------------+
|              SHARPE RATIO HAIRCUT TABLE                           |
+------------------------------------------------------------------+
|                                                                  |
|  Number of          Recommended        Required Backtest         |
|  Strategies         Haircut            SR for SR_live = 1.0      |
|  Tested                                                          |
|  ----------------------------------------------------------------|
|  1                  0%                 1.0                        |
|  10                 20-30%             1.3-1.4                    |
|  50                 35-45%             1.5-1.8                    |
|  100                40-50%             1.7-2.0                    |
|  500                50-60%             2.0-2.5                    |
|  1000               55-65%             2.2-2.8                    |
|                                                                  |
|  Example: You tested 100 strategy variants and found             |
|  one with Sharpe = 1.5. After haircut:                           |
|  Adjusted SR = 1.5 * (1 - 0.45) = 0.825                         |
|  This is mediocre, not impressive.                               |
|                                                                  |
+------------------------------------------------------------------+
```

### Practical Rules of Thumb

```
+------------------------------------------------------------------+
|          PRACTICAL OVERFITTING PREVENTION                         |
+------------------------------------------------------------------+
|                                                                  |
|  1. FEWER PARAMETERS = BETTER                                    |
|     2-3 parameters: manageable                                   |
|     5+ parameters: danger zone                                   |
|     10+ parameters: almost certainly overfit                     |
|                                                                  |
|  2. MORE DATA = BETTER                                           |
|     Minimum: 10 * (number of parameters) independent obs.        |
|     Better:  100 * (number of parameters)                        |
|                                                                  |
|  3. SIMPLER = BETTER                                             |
|     If two strategies perform similarly, choose the simpler one  |
|     (Occam's Razor)                                              |
|                                                                  |
|  4. ECONOMIC INTUITION                                           |
|     Can you explain WHY the strategy works?                      |
|     "Momentum works because of behavioral biases"  -> Good       |
|     "Buy when SMA(17) > SMA(43) on Tuesdays"       -> Overfit   |
|                                                                  |
|  5. ROBUSTNESS TO PERTURBATION                                   |
|     Change parameters by 10-20%. Does it still work?             |
|     If SMA(20,50) works but SMA(18,48) fails -> overfit          |
|                                                                  |
|  6. OUT-OF-SAMPLE DEGRADATION                                    |
|     Expect 30-50% Sharpe degradation from IS to OOS.             |
|     If OOS Sharpe < 50% of IS Sharpe -> likely overfit           |
|                                                                  |
|  7. MULTIPLE MARKETS / ASSET CLASSES                             |
|     Does it work on US, Europe, Asia?                            |
|     Does it work on stocks, futures, forex?                      |
|     More generalization = more likely real                        |
|                                                                  |
+------------------------------------------------------------------+
```

### CSCV (Combinatorial Symmetric Cross-Validation)

CSCV splits the data into 2S subsets and tests all combinations where S subsets are used for training and S for testing. The probability of backtest overfitting (PBO) is estimated as the fraction of OOS combinations where the best IS parameter set underperforms the median.

```python
import numpy as np
from itertools import combinations


def cscv_probability_of_overfitting(
    returns_matrix: np.ndarray,
    n_splits: int = 16,
) -> float:
    """
    Estimate the Probability of Backtest Overfitting using CSCV.

    Parameters
    ----------
    returns_matrix : np.ndarray of shape (n_observations, n_strategies)
        Each column is a strategy variant's return series.
    n_splits : int
        Number of sub-samples to split data into. Must be even.

    Returns
    -------
    PBO : probability of backtest overfitting (0 to 1)
          Higher values = more likely overfit.
    """
    n_obs, n_strategies = returns_matrix.shape
    split_size = n_obs // n_splits
    s_half = n_splits // 2

    # Split returns into n_splits blocks
    blocks = []
    for i in range(n_splits):
        start = i * split_size
        end = start + split_size
        blocks.append(returns_matrix[start:end, :])

    # Generate all combinations of s_half blocks for IS
    all_indices = list(range(n_splits))
    combos = list(combinations(all_indices, s_half))

    n_overfit = 0
    n_total = 0

    for is_indices in combos:
        oos_indices = [i for i in all_indices if i not in is_indices]

        # Compute IS performance for each strategy
        is_data = np.concatenate([blocks[i] for i in is_indices], axis=0)
        is_sharpes = np.mean(is_data, axis=0) / (np.std(is_data, axis=0) + 1e-10)

        # Find best IS strategy
        best_is_idx = np.argmax(is_sharpes)

        # Compute OOS performance
        oos_data = np.concatenate([blocks[i] for i in oos_indices], axis=0)
        oos_sharpes = np.mean(oos_data, axis=0) / (np.std(oos_data, axis=0) + 1e-10)

        # Is the best IS strategy below median in OOS?
        oos_median = np.median(oos_sharpes)
        if oos_sharpes[best_is_idx] < oos_median:
            n_overfit += 1
        n_total += 1

    pbo = n_overfit / n_total
    return pbo


# --- Example ---
np.random.seed(42)
n_obs = 1260  # 5 years daily
n_strategies = 50

# Scenario 1: All strategies are noise
noise_returns = np.random.normal(0, 0.01, (n_obs, n_strategies))
pbo_noise = cscv_probability_of_overfitting(noise_returns, n_splits=16)
print(f"PBO (all noise strategies):       {pbo_noise:.2%}")

# Scenario 2: One real signal + noise
signal_returns = noise_returns.copy()
signal_returns[:, 0] += 0.0005  # Add small positive drift to strategy 0
pbo_signal = cscv_probability_of_overfitting(signal_returns, n_splits=16)
print(f"PBO (1 real signal + 49 noise):   {pbo_signal:.2%}")

# Interpretation:
# PBO > 50%: Very likely overfit. Do not trade.
# PBO 25-50%: Suspicious. Proceed with extreme caution.
# PBO < 25%: Some evidence of real signal. Still validate further.
```

---

## 8.7 Backtesting Frameworks Comparison

### Framework Overview

| Framework | Language | Architecture | Speed | Complexity | Active |
|-----------|----------|-------------|-------|------------|--------|
| Zipline | Python | Event-driven | Medium | Medium | Forked |
| Backtrader | Python | Event-driven | Slow | High | Stable |
| VectorBT | Python | Vectorized | Fast | Low | Active |
| QuantConnect | C#/Python | Event-driven | Medium | High | Active |
| PyAlgoTrade | Python | Event-driven | Medium | Medium | Dormant |
| bt | Python | Tree-based | Medium | Low | Active |
| Custom | Any | Any | Any | High | N/A |

### Detailed Comparison

```
+------------------------------------------------------------------+
|              BACKTESTING FRAMEWORK COMPARISON                     |
+------------------------------------------------------------------+
|                                                                  |
|  ZIPLINE (Quantopian legacy)                                     |
|  +----------------------------------------------------------+   |
|  | PROS: Well-tested, pipeline API, community data bundles   |   |
|  | CONS: No longer maintained by Quantopian, Python 3 forks  |   |
|  |       vary in quality (zipline-reloaded), US equities     |   |
|  |       focused                                             |   |
|  | BEST FOR: US equity strategies, Quantopian migration      |   |
|  +----------------------------------------------------------+   |
|                                                                  |
|  BACKTRADER                                                      |
|  +----------------------------------------------------------+   |
|  | PROS: Feature-rich, multi-data, broker integration,       |   |
|  |       good documentation, cerebro architecture            |   |
|  | CONS: Slow for large universes, complex API, single-      |   |
|  |       threaded, mutable state everywhere                  |   |
|  | BEST FOR: Futures, forex, single-asset strategies         |   |
|  +----------------------------------------------------------+   |
|                                                                  |
|  VECTORBT                                                        |
|  +----------------------------------------------------------+   |
|  | PROS: Extremely fast (NumPy-based), great visualization,  |   |
|  |       parameter optimization, portfolio simulation        |   |
|  | CONS: Less realistic execution model, limited order       |   |
|  |       types, vectorized limitations                       |   |
|  | BEST FOR: Research, parameter sweeps, initial screening   |   |
|  +----------------------------------------------------------+   |
|                                                                  |
|  QUANTCONNECT / LEAN                                             |
|  +----------------------------------------------------------+   |
|  | PROS: Production-grade, multi-asset, live trading,        |   |
|  |       cloud infrastructure, free data, open-source engine |   |
|  | CONS: C# core (Python wrapper), cloud dependency for      |   |
|  |       full features, learning curve                       |   |
|  | BEST FOR: Production deployment, multi-asset strategies   |   |
|  +----------------------------------------------------------+   |
|                                                                  |
|  PYALGOTRADE                                                     |
|  +----------------------------------------------------------+   |
|  | PROS: Simple API, good for learning, event-driven         |   |
|  | CONS: Not actively maintained, limited features           |   |
|  | BEST FOR: Learning event-driven backtesting               |   |
|  +----------------------------------------------------------+   |
|                                                                  |
|  BT (pmorissette/bt)                                             |
|  +----------------------------------------------------------+   |
|  | PROS: Flexible tree structure, composable strategies,     |   |
|  |       built on ffn, clean API                             |   |
|  | CONS: Less known, smaller community, limited docs         |   |
|  | BEST FOR: Asset allocation, portfolio-level backtests     |   |
|  +----------------------------------------------------------+   |
|                                                                  |
|  CUSTOM-BUILT                                                    |
|  +----------------------------------------------------------+   |
|  | PROS: Full control, exact requirements, no bloat,         |   |
|  |       deep understanding of every component               |   |
|  | CONS: Time-consuming, bugs, reinventing wheels            |   |
|  | BEST FOR: Production systems, HFT, unique requirements   |   |
|  +----------------------------------------------------------+   |
|                                                                  |
+------------------------------------------------------------------+
```

### When to Use Each

```
+------------------------------------------------------------------+
|                  DECISION FLOWCHART                               |
+------------------------------------------------------------------+
|                                                                  |
|  Are you doing initial research / screening?                     |
|    YES --> VectorBT or custom vectorized                         |
|    NO  |                                                         |
|        v                                                         |
|  Do you need realistic execution modeling?                       |
|    YES --> Event-driven framework                                |
|    NO  |                                                         |
|        v                                                         |
|  Do you need to go live?                                         |
|    YES --> QuantConnect (cloud) or Custom (on-prem)              |
|    NO  |                                                         |
|        v                                                         |
|  Is it a portfolio / allocation strategy?                        |
|    YES --> bt                                                    |
|    NO  |                                                         |
|        v                                                         |
|  Learning?                                                       |
|    YES --> Backtrader (most tutorials) or Zipline                |
|                                                                  |
+------------------------------------------------------------------+
```

### Quick Examples

**VectorBT example:**

```python
# pip install vectorbt
import vectorbt as vbt
import numpy as np

# Download data
price = vbt.YFData.download("AAPL", start="2018-01-01", end="2023-12-31").get("Close")

# Fast SMA crossover optimization
fast_ma = vbt.MA.run(price, window=np.arange(10, 50, step=5))
slow_ma = vbt.MA.run(price, window=np.arange(50, 200, step=10))

# Generate entries/exits for all parameter combinations
entries = fast_ma.ma_crossed_above(slow_ma)
exits = fast_ma.ma_crossed_below(slow_ma)

# Run portfolio simulation for ALL combinations at once
portfolio = vbt.Portfolio.from_signals(price, entries, exits, init_cash=100_000)

# Get Sharpe ratios for all combinations
sharpe = portfolio.sharpe_ratio()
print(sharpe.sort_values(ascending=False).head(10))
```

**Backtrader example:**

```python
import backtrader as bt


class SmaCross(bt.Strategy):
    params = (("fast", 20), ("slow", 50))

    def __init__(self):
        sma_fast = bt.indicators.SMA(self.data.close, period=self.params.fast)
        sma_slow = bt.indicators.SMA(self.data.close, period=self.params.slow)
        self.crossover = bt.indicators.CrossOver(sma_fast, sma_slow)

    def next(self):
        if not self.position:
            if self.crossover > 0:
                self.buy()
        elif self.crossover < 0:
            self.close()


cerebro = bt.Cerebro()
cerebro.addstrategy(SmaCross)

data = bt.feeds.YahooFinanceCSVData(dataname="AAPL.csv")
cerebro.adddata(data)
cerebro.broker.setcash(100_000)
cerebro.broker.setcommission(commission=0.001)

results = cerebro.run()
cerebro.plot()
```

---

## 8.8 Performance Reporting

A proper performance report (tearsheet) should tell the complete story of a strategy: not just returns, but risk, drawdowns, consistency, and regime behavior.

### Key Metrics

```
+------------------------------------------------------------------+
|              PERFORMANCE METRICS HIERARCHY                        |
+------------------------------------------------------------------+
|                                                                  |
|  TIER 1: Must-Have                                               |
|  +----------------------------------------------------------+   |
|  | Total Return        | Cumulative PnL                      |   |
|  | Annualized Return   | CAGR                                |   |
|  | Annualized Vol      | Standard deviation * sqrt(252)      |   |
|  | Sharpe Ratio        | (Return - Rf) / Vol                 |   |
|  | Max Drawdown        | Largest peak-to-trough decline      |   |
|  | Calmar Ratio        | Ann. Return / Max Drawdown          |   |
|  +----------------------------------------------------------+   |
|                                                                  |
|  TIER 2: Important                                               |
|  +----------------------------------------------------------+   |
|  | Sortino Ratio       | Return / Downside Vol               |   |
|  | Win Rate            | % of winning trades                 |   |
|  | Profit Factor       | Gross Profit / Gross Loss           |   |
|  | Average Win/Loss    | Avg winning trade / Avg losing      |   |
|  | Max DD Duration     | Longest time underwater             |   |
|  | Skewness            | Asymmetry of returns                |   |
|  | Kurtosis            | Tail risk                           |   |
|  +----------------------------------------------------------+   |
|                                                                  |
|  TIER 3: Advanced                                                |
|  +----------------------------------------------------------+   |
|  | Information Ratio   | Alpha / Tracking Error              |   |
|  | Tail Ratio          | 95th percentile / 5th percentile    |   |
|  | Common Sense Ratio  | Profit Factor * Tail Ratio          |   |
|  | Stability           | R^2 of equity curve                 |   |
|  | Omega Ratio         | Prob(gain) / Prob(loss) weighted    |   |
|  +----------------------------------------------------------+   |
|                                                                  |
+------------------------------------------------------------------+
```

### Drawdown Analysis

```
+------------------------------------------------------------------+
|                  DRAWDOWN ANATOMY                                 |
+------------------------------------------------------------------+
|                                                                  |
|  Equity                                                          |
|  Curve   Peak                                                    |
|   |      /\         Recovery Point                               |
|   |     /  \        /                                            |
|   |    /    \      /                                             |
|   |   /      \    /                                              |
|   |  /        \  /                                               |
|   | /          \/  <-- Trough                                    |
|   |/                                                             |
|   +------|------|------|----->  Time                              |
|          |      |      |                                         |
|          |<---->|      |                                         |
|          Decline       |                                         |
|          Duration      |                                         |
|                 |<---->|                                         |
|                 Recovery                                         |
|                 Duration                                         |
|          |<----------->|                                         |
|          Total DD Duration                                       |
|                                                                  |
|  Key DD Metrics:                                                 |
|    Depth:     -15%  (peak to trough)                             |
|    Decline:   45 trading days                                    |
|    Recovery:  62 trading days                                    |
|    Total:     107 trading days                                   |
|                                                                  |
+------------------------------------------------------------------+
```

### Comprehensive Tearsheet Implementation

```python
import numpy as np
import pandas as pd
from dataclasses import dataclass


@dataclass(frozen=True)
class DrawdownInfo:
    start: pd.Timestamp
    trough: pd.Timestamp
    end: pd.Timestamp
    depth: float
    decline_days: int
    recovery_days: int
    total_days: int


class PerformanceTearsheet:
    """Comprehensive strategy performance analysis."""

    def __init__(self, returns: pd.Series, benchmark_returns: pd.Series = None,
                 risk_free_rate: float = 0.0):
        self.returns = returns
        self.benchmark = benchmark_returns
        self.rf = risk_free_rate / 252  # Daily risk-free rate
        self.equity = (1 + returns).cumprod()

    def summary(self) -> dict:
        """Compute all performance metrics."""
        r = self.returns
        n_days = len(r)
        n_years = n_days / 252

        # Basic returns
        total_return = self.equity.iloc[-1] - 1
        ann_return = (1 + total_return) ** (1 / n_years) - 1 if n_years > 0 else 0

        # Volatility
        ann_vol = r.std() * np.sqrt(252)
        downside_vol = r[r < 0].std() * np.sqrt(252) if (r < 0).any() else 0

        # Risk-adjusted
        excess = r - self.rf
        sharpe = excess.mean() / r.std() * np.sqrt(252) if r.std() > 0 else 0
        sortino = excess.mean() / r[r < 0].std() * np.sqrt(252) if (r < 0).any() and r[r < 0].std() > 0 else 0

        # Drawdown
        dd_series = self._drawdown_series()
        max_dd = dd_series.min()
        calmar = ann_return / abs(max_dd) if max_dd != 0 else 0

        # Trade stats
        winning_days = (r > 0).sum()
        losing_days = (r < 0).sum()
        win_rate = winning_days / (winning_days + losing_days) if (winning_days + losing_days) > 0 else 0

        avg_win = r[r > 0].mean() if (r > 0).any() else 0
        avg_loss = r[r < 0].mean() if (r < 0).any() else 0
        profit_factor = abs(r[r > 0].sum() / r[r < 0].sum()) if r[r < 0].sum() != 0 else float("inf")

        # Higher moments
        skew = float(r.skew())
        kurt = float(r.kurtosis()) + 3  # excess -> regular

        # Tail ratio
        p95 = np.percentile(r, 95)
        p05 = abs(np.percentile(r, 5))
        tail_ratio = p95 / p05 if p05 > 0 else float("inf")

        # Stability (R^2 of log equity curve)
        log_equity = np.log(self.equity)
        x = np.arange(len(log_equity))
        if len(x) > 1:
            correlation = np.corrcoef(x, log_equity)[0, 1]
            stability = correlation ** 2
        else:
            stability = 0

        # Rolling Sharpe (252-day)
        rolling_sharpe = r.rolling(252).apply(
            lambda x: x.mean() / x.std() * np.sqrt(252) if x.std() > 0 else 0,
            raw=True,
        )

        return {
            "total_return": total_return,
            "ann_return": ann_return,
            "ann_volatility": ann_vol,
            "downside_volatility": downside_vol,
            "sharpe_ratio": sharpe,
            "sortino_ratio": sortino,
            "calmar_ratio": calmar,
            "max_drawdown": max_dd,
            "win_rate": win_rate,
            "profit_factor": profit_factor,
            "avg_win": avg_win,
            "avg_loss": avg_loss,
            "skewness": skew,
            "kurtosis": kurt,
            "tail_ratio": tail_ratio,
            "stability": stability,
            "n_days": n_days,
            "n_years": n_years,
            "rolling_sharpe": rolling_sharpe,
        }

    def _drawdown_series(self) -> pd.Series:
        """Compute the drawdown series."""
        rolling_max = self.equity.cummax()
        return (self.equity - rolling_max) / rolling_max

    def top_drawdowns(self, n: int = 5) -> list[DrawdownInfo]:
        """Find the top N drawdowns by depth."""
        dd = self._drawdown_series()
        drawdowns = []
        is_underwater = False
        start = None
        trough = None
        trough_val = 0

        for i in range(len(dd)):
            if dd.iloc[i] < 0:
                if not is_underwater:
                    start = dd.index[i - 1] if i > 0 else dd.index[i]
                    trough = dd.index[i]
                    trough_val = dd.iloc[i]
                    is_underwater = True
                elif dd.iloc[i] < trough_val:
                    trough = dd.index[i]
                    trough_val = dd.iloc[i]
            elif is_underwater:
                drawdowns.append(DrawdownInfo(
                    start=start,
                    trough=trough,
                    end=dd.index[i],
                    depth=trough_val,
                    decline_days=(trough - start).days,
                    recovery_days=(dd.index[i] - trough).days,
                    total_days=(dd.index[i] - start).days,
                ))
                is_underwater = False

        # Handle ongoing drawdown at end of series
        if is_underwater:
            drawdowns.append(DrawdownInfo(
                start=start,
                trough=trough,
                end=dd.index[-1],
                depth=trough_val,
                decline_days=(trough - start).days,
                recovery_days=-1,  # Not recovered
                total_days=(dd.index[-1] - start).days,
            ))

        drawdowns.sort(key=lambda x: x.depth)
        return drawdowns[:n]

    def monthly_returns_table(self) -> pd.DataFrame:
        """Create a monthly returns table (rows=years, cols=months)."""
        monthly = self.returns.resample("ME").apply(lambda x: (1 + x).prod() - 1)
        table = pd.DataFrame(index=sorted(monthly.index.year.unique()))

        month_names = [
            "Jan", "Feb", "Mar", "Apr", "May", "Jun",
            "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
        ]

        for month_num, month_name in enumerate(month_names, 1):
            month_data = monthly[monthly.index.month == month_num]
            for date, ret in month_data.items():
                table.loc[date.year, month_name] = ret

        # Add yearly total
        yearly = self.returns.resample("YE").apply(lambda x: (1 + x).prod() - 1)
        for date, ret in yearly.items():
            table.loc[date.year, "Year"] = ret

        return table

    def print_report(self):
        """Print a formatted performance report."""
        metrics = self.summary()

        print("=" * 60)
        print("           STRATEGY PERFORMANCE TEARSHEET")
        print("=" * 60)
        print(f"  Period:           {self.returns.index[0].date()} to "
              f"{self.returns.index[-1].date()}")
        print(f"  Trading Days:     {metrics['n_days']}")
        print(f"  Years:            {metrics['n_years']:.1f}")
        print("-" * 60)
        print("  RETURNS")
        print(f"    Total Return:     {metrics['total_return']:>10.2%}")
        print(f"    Annual Return:    {metrics['ann_return']:>10.2%}")
        print(f"    Annual Volatility:{metrics['ann_volatility']:>10.2%}")
        print("-" * 60)
        print("  RISK-ADJUSTED")
        print(f"    Sharpe Ratio:     {metrics['sharpe_ratio']:>10.2f}")
        print(f"    Sortino Ratio:    {metrics['sortino_ratio']:>10.2f}")
        print(f"    Calmar Ratio:     {metrics['calmar_ratio']:>10.2f}")
        print("-" * 60)
        print("  DRAWDOWN")
        print(f"    Max Drawdown:     {metrics['max_drawdown']:>10.2%}")

        top_dd = self.top_drawdowns(3)
        for i, dd in enumerate(top_dd):
            recovery_str = f"{dd.recovery_days}d" if dd.recovery_days >= 0 else "ongoing"
            print(f"    DD #{i+1}: {dd.depth:.2%} "
                  f"({dd.start.date()} to {dd.trough.date()}, "
                  f"recovery: {recovery_str})")

        print("-" * 60)
        print("  TRADE STATISTICS")
        print(f"    Win Rate:         {metrics['win_rate']:>10.2%}")
        print(f"    Profit Factor:    {metrics['profit_factor']:>10.2f}")
        print(f"    Avg Win:          {metrics['avg_win']:>10.4%}")
        print(f"    Avg Loss:         {metrics['avg_loss']:>10.4%}")
        print("-" * 60)
        print("  DISTRIBUTION")
        print(f"    Skewness:         {metrics['skewness']:>10.2f}")
        print(f"    Kurtosis:         {metrics['kurtosis']:>10.2f}")
        print(f"    Tail Ratio:       {metrics['tail_ratio']:>10.2f}")
        print(f"    Stability (R^2):  {metrics['stability']:>10.4f}")
        print("=" * 60)

        print("\n  MONTHLY RETURNS TABLE:")
        monthly = self.monthly_returns_table()
        # Format as percentages
        formatted = monthly.map(lambda x: f"{x:.1%}" if pd.notna(x) else "")
        print(formatted.to_string())


# --- Example usage ---
np.random.seed(42)
dates = pd.bdate_range("2018-01-01", periods=1512)  # ~6 years
returns = pd.Series(
    np.random.normal(0.0004, 0.012, len(dates)),
    index=dates,
    name="strategy",
)
# Add a drawdown event
returns.iloc[500:540] -= 0.005

tearsheet = PerformanceTearsheet(returns)
tearsheet.print_report()
```

### Rolling Sharpe and Underwater Chart

```python
import numpy as np
import pandas as pd


def rolling_sharpe_analysis(returns: pd.Series, window: int = 252) -> pd.Series:
    """Compute rolling Sharpe ratio."""
    return returns.rolling(window).apply(
        lambda x: x.mean() / x.std() * np.sqrt(252) if x.std() > 0 else 0,
        raw=True,
    )


def underwater_chart_data(returns: pd.Series) -> pd.Series:
    """Compute underwater (drawdown) series for plotting."""
    equity = (1 + returns).cumprod()
    running_max = equity.cummax()
    underwater = (equity / running_max) - 1
    return underwater


# These functions produce data suitable for matplotlib:
#
#   import matplotlib.pyplot as plt
#
#   fig, axes = plt.subplots(3, 1, figsize=(12, 10))
#
#   # Panel 1: Equity curve
#   equity = (1 + returns).cumprod()
#   axes[0].plot(equity, label="Strategy")
#   axes[0].set_title("Equity Curve")
#
#   # Panel 2: Rolling Sharpe
#   rolling_sr = rolling_sharpe_analysis(returns)
#   axes[1].plot(rolling_sr, color="orange")
#   axes[1].axhline(y=0, color="black", linestyle="--")
#   axes[1].set_title("Rolling 1-Year Sharpe Ratio")
#
#   # Panel 3: Underwater chart
#   underwater = underwater_chart_data(returns)
#   axes[2].fill_between(underwater.index, underwater, 0, color="red", alpha=0.3)
#   axes[2].set_title("Underwater (Drawdown) Chart")
#
#   plt.tight_layout()
#   plt.savefig("tearsheet.png", dpi=150)
```

---

## 8.9 From Backtest to Live

The transition from backtesting to live trading is where most strategies fail. This section covers the steps to bridge that gap.

### The Deployment Pipeline

```
+------------------------------------------------------------------+
|              FROM BACKTEST TO LIVE PIPELINE                       |
+------------------------------------------------------------------+
|                                                                  |
|  Phase 1         Phase 2         Phase 3         Phase 4         |
|  BACKTEST        PAPER TRADE     SMALL LIVE      FULL LIVE       |
|  +---------+    +-----------+   +-----------+   +-----------+    |
|  | Historical|   | Real-time  |   | Real money|   | Target     |    |
|  | data      |   | simulated  |   | small size|   | allocation |    |
|  | No risk   |   | No risk    |   | Limited   |   | Full risk  |    |
|  | Fast      |   | Real speed |   | risk      |   | monitoring |    |
|  +---------+    +-----------+   +-----------+   +-----------+    |
|       |               |               |               |          |
|  Duration:       Duration:       Duration:       Duration:       |
|  As needed       1-3 months      1-3 months      Ongoing        |
|                                                                  |
|  GATE CRITERIA:                                                  |
|  Backtest -> Paper:  Sharpe > 1.0, max DD < 15%, passes WFA     |
|  Paper -> Small:     Paper results within 20% of backtest        |
|  Small -> Full:      Live results within 30% of paper            |
|                                                                  |
+------------------------------------------------------------------+
```

### Paper Trading Phase

Paper trading runs your strategy in real-time with simulated execution. This tests:

1. **Data pipeline reliability** -- Does your data feed work 24/7?
2. **Signal generation timing** -- Are signals generated on time?
3. **Execution logic** -- Does order routing work correctly?
4. **System stability** -- Does it crash? Memory leaks?
5. **Performance reality** -- Does real-time performance match backtest?

```python
class PaperTradingMonitor:
    """Monitor paper trading performance vs backtest expectations."""

    def __init__(
        self,
        expected_daily_sharpe: float,
        expected_daily_return: float,
        expected_daily_vol: float,
        alert_threshold_z: float = 2.0,
    ):
        self.expected_sharpe = expected_daily_sharpe
        self.expected_return = expected_daily_return
        self.expected_vol = expected_daily_vol
        self.alert_z = alert_threshold_z
        self.daily_returns: list[float] = []

    def record_day(self, daily_return: float) -> dict:
        """Record a day's return and check for degradation."""
        self.daily_returns.append(daily_return)

        n = len(self.daily_returns)
        if n < 20:
            return {"status": "COLLECTING", "days": n, "min_days": 20}

        returns = np.array(self.daily_returns)
        realized_mean = returns.mean()
        realized_vol = returns.std()
        realized_sharpe = realized_mean / realized_vol * np.sqrt(252) if realized_vol > 0 else 0

        # Test if realized mean is significantly below expected
        se = realized_vol / np.sqrt(n)
        z_score = (realized_mean - self.expected_return) / se if se > 0 else 0

        alerts = []
        if z_score < -self.alert_z:
            alerts.append(f"RETURN DEGRADATION: z={z_score:.2f}")
        if realized_vol > self.expected_vol * 1.5:
            alerts.append(f"VOL SPIKE: {realized_vol:.4f} vs expected {self.expected_vol:.4f}")
        if n >= 60 and realized_sharpe < self.expected_sharpe * 0.5:
            alerts.append(f"SHARPE DEGRADATION: {realized_sharpe:.2f} vs expected {self.expected_sharpe:.2f}")

        status = "ALERT" if alerts else "OK"

        return {
            "status": status,
            "days": n,
            "realized_sharpe": realized_sharpe,
            "realized_return_ann": realized_mean * 252,
            "realized_vol_ann": realized_vol * np.sqrt(252),
            "z_score": z_score,
            "alerts": alerts,
        }


# --- Example ---
monitor = PaperTradingMonitor(
    expected_daily_sharpe=1.5,
    expected_daily_return=0.0004,
    expected_daily_vol=0.008,
)

np.random.seed(42)
# Simulate 60 days where strategy underperforms
for day in range(60):
    if day < 40:
        ret = np.random.normal(0.0003, 0.008)  # Close to expected
    else:
        ret = np.random.normal(-0.0002, 0.012)  # Degradation

    result = monitor.record_day(ret)
    if result["status"] == "ALERT":
        print(f"Day {day + 1}: {result['status']}")
        for alert in result["alerts"]:
            print(f"  >> {alert}")
```

### Strategy Degradation Detection

```
+------------------------------------------------------------------+
|            STRATEGY DEGRADATION SIGNALS                           |
+------------------------------------------------------------------+
|                                                                  |
|  IMMEDIATE RED FLAGS (halt trading):                             |
|  - Daily loss > 3 * expected daily vol                           |
|  - Drawdown > 1.5 * max historical drawdown                     |
|  - Correlation with benchmark flips sign                         |
|  - Fill rate drops below 80%                                     |
|  - Execution costs > 2 * modeled costs                          |
|                                                                  |
|  GRADUAL DEGRADATION (investigate):                              |
|  - Rolling 60-day Sharpe < 50% of backtest Sharpe                |
|  - Win rate declines by > 10 percentage points                   |
|  - Average holding period changes significantly                  |
|  - Turnover increases without return increase                    |
|  - Signal autocorrelation changes                                |
|                                                                  |
|  STRUCTURAL CHANGES (re-evaluate strategy):                      |
|  - Market regime change (vol regime, correlation regime)         |
|  - Regulatory changes affecting execution                        |
|  - Competitor crowding (alpha decay)                             |
|  - Data source changes or outages                                |
|                                                                  |
+------------------------------------------------------------------+
```

### Circuit Breakers

```python
from dataclasses import dataclass


@dataclass(frozen=True)
class CircuitBreakerConfig:
    max_daily_loss_pct: float = 0.02        # -2% daily loss limit
    max_drawdown_pct: float = 0.10           # -10% max drawdown
    max_consecutive_losses: int = 10         # 10 losing days in a row
    max_position_concentration: float = 0.25 # 25% in any single name
    max_daily_turnover: float = 5.0          # 500% daily turnover
    cooldown_hours: int = 24                 # Hours to pause after trigger


class CircuitBreaker:
    """
    Risk circuit breakers that halt trading when limits are breached.
    These are hard limits, not suggestions.
    """

    def __init__(self, config: CircuitBreakerConfig):
        self.config = config
        self.peak_equity = 0.0
        self.consecutive_losses = 0
        self.is_halted = False
        self.halt_reason = ""

    def check(
        self,
        current_equity: float,
        daily_pnl: float,
        starting_equity: float,
        positions: dict[str, float],
    ) -> dict:
        """
        Check all circuit breakers. Returns halt status.

        Parameters
        ----------
        current_equity : current portfolio value
        daily_pnl : today's PnL as fraction of equity
        starting_equity : initial capital
        positions : dict of {symbol: position_value}
        """
        self.peak_equity = max(self.peak_equity, current_equity)
        triggers = []

        # 1. Daily loss limit
        if daily_pnl < -self.config.max_daily_loss_pct:
            triggers.append(
                f"DAILY LOSS: {daily_pnl:.2%} < -{self.config.max_daily_loss_pct:.2%}"
            )

        # 2. Max drawdown
        drawdown = (current_equity - self.peak_equity) / self.peak_equity
        if drawdown < -self.config.max_drawdown_pct:
            triggers.append(
                f"MAX DRAWDOWN: {drawdown:.2%} < -{self.config.max_drawdown_pct:.2%}"
            )

        # 3. Consecutive losses
        if daily_pnl < 0:
            self.consecutive_losses += 1
        else:
            self.consecutive_losses = 0

        if self.consecutive_losses >= self.config.max_consecutive_losses:
            triggers.append(
                f"CONSECUTIVE LOSSES: {self.consecutive_losses} >= "
                f"{self.config.max_consecutive_losses}"
            )

        # 4. Position concentration
        if current_equity > 0 and positions:
            for symbol, value in positions.items():
                concentration = abs(value) / current_equity
                if concentration > self.config.max_position_concentration:
                    triggers.append(
                        f"CONCENTRATION: {symbol} = {concentration:.2%} > "
                        f"{self.config.max_position_concentration:.2%}"
                    )

        if triggers:
            self.is_halted = True
            self.halt_reason = "; ".join(triggers)

        return {
            "halted": self.is_halted,
            "triggers": triggers,
            "drawdown": drawdown,
            "consecutive_losses": self.consecutive_losses,
        }


# --- Example ---
cb = CircuitBreaker(CircuitBreakerConfig())

# Simulate a bad day
result = cb.check(
    current_equity=97_000,
    daily_pnl=-0.025,  # -2.5% loss
    starting_equity=100_000,
    positions={"AAPL": 30_000, "TSLA": 27_000},
)

print(f"Halted: {result['halted']}")
for trigger in result["triggers"]:
    print(f"  TRIGGER: {trigger}")
```

### Scaling Up Gradually

```
+------------------------------------------------------------------+
|              CAPITAL SCALING SCHEDULE                             |
+------------------------------------------------------------------+
|                                                                  |
|  Phase     Duration    Capital         Gate to Next Phase         |
|  -------   ---------   ------------    ----------------------    |
|  Paper     1-3 mo      $0              Sharpe > 0.7 * backtest   |
|  Tiny      1 mo        $10K-$50K       No circuit breaker trips  |
|  Small     1-2 mo      $50K-$250K      Sharpe within 40% of BT   |
|  Medium    2-3 mo      $250K-$1M       Stable performance        |
|  Full      Ongoing     Target size     Continuous monitoring     |
|                                                                  |
|  SCALING FORMULA (Kelly-inspired):                               |
|                                                                  |
|  Allocation = min(                                               |
|      target_allocation,                                          |
|      confidence_score * target_allocation                        |
|  )                                                               |
|                                                                  |
|  confidence_score = min(1.0,                                     |
|      live_sharpe / backtest_sharpe                                |
|      * sqrt(live_days / 252)                                     |
|  )                                                               |
|                                                                  |
|  Example:                                                        |
|    Target: $1M, Backtest SR: 1.5, Live SR (60 days): 1.2         |
|    confidence = min(1.0, 1.2/1.5 * sqrt(60/252))                 |
|              = min(1.0, 0.8 * 0.488) = 0.39                     |
|    Allocation = $1M * 0.39 = $390K                               |
|                                                                  |
+------------------------------------------------------------------+
```

---

## 8.10 Putting It All Together: Complete Backtest Workflow

```
+------------------------------------------------------------------+
|              COMPLETE BACKTEST WORKFLOW                           |
+------------------------------------------------------------------+
|                                                                  |
|  Step 1: HYPOTHESIS                                              |
|  "I believe X because Y, and I can exploit it by Z"             |
|  Must have economic rationale. No data mining!                   |
|       |                                                          |
|       v                                                          |
|  Step 2: DATA PREPARATION                                        |
|  - Survivorship-free data                                        |
|  - Point-in-time data (no backfill)                              |
|  - Proper corporate action adjustments                           |
|  - Split into IS/OOS BEFORE looking at data                      |
|       |                                                          |
|       v                                                          |
|  Step 3: VECTORIZED SCREENING                                    |
|  - Quick test of the idea                                        |
|  - Does the signal have predictive power?                        |
|  - Kill bad ideas fast                                           |
|       |                                                          |
|       v                                                          |
|  Step 4: EVENT-DRIVEN BACKTEST                                   |
|  - Realistic execution model                                     |
|  - Full transaction cost model                                   |
|  - Position sizing and risk management                           |
|       |                                                          |
|       v                                                          |
|  Step 5: WALK-FORWARD VALIDATION                                 |
|  - Multiple IS/OOS windows                                      |
|  - Check consistency across folds                                |
|  - Compute OOS Sharpe ratio                                      |
|       |                                                          |
|       v                                                          |
|  Step 6: OVERFITTING CHECKS                                      |
|  - Deflated Sharpe Ratio                                         |
|  - CSCV / PBO analysis                                           |
|  - Haircut the Sharpe ratio                                      |
|  - Parameter sensitivity analysis                                |
|       |                                                          |
|       v                                                          |
|  Step 7: PERFORMANCE REVIEW                                      |
|  - Full tearsheet                                                |
|  - Regime analysis                                               |
|  - Stress testing                                                |
|  - Peer review by colleagues                                     |
|       |                                                          |
|       v                                                          |
|  Step 8: PAPER TRADING                                           |
|  - 1-3 months minimum                                            |
|  - Monitor for degradation                                       |
|  - Compare to backtest expectations                              |
|       |                                                          |
|       v                                                          |
|  Step 9: LIVE DEPLOYMENT                                         |
|  - Start small, scale gradually                                  |
|  - Circuit breakers active                                       |
|  - Continuous monitoring                                         |
|  - Plan for strategy sunset                                      |
|                                                                  |
+------------------------------------------------------------------+
```

### Final Checklist

```
+------------------------------------------------------------------+
|            PRE-DEPLOYMENT CHECKLIST                               |
+------------------------------------------------------------------+
|                                                                  |
|  DATA QUALITY                                                    |
|  [ ] Survivorship-free universe                                  |
|  [ ] Point-in-time data (no look-ahead)                          |
|  [ ] Corporate actions handled (splits, dividends)               |
|  [ ] Data starts before strategy development                     |
|                                                                  |
|  BACKTEST INTEGRITY                                              |
|  [ ] No look-ahead bias (signals lagged)                         |
|  [ ] Realistic transaction costs                                 |
|  [ ] Market impact modeled for strategy AUM                      |
|  [ ] Borrowing costs for shorts                                  |
|  [ ] Slippage model appropriate for asset class                  |
|                                                                  |
|  VALIDATION                                                      |
|  [ ] Walk-forward analysis performed                             |
|  [ ] OOS Sharpe within 50% of IS Sharpe                          |
|  [ ] Deflated Sharpe Ratio p-value > 0.95                        |
|  [ ] PBO < 25%                                                   |
|  [ ] Parameter sensitivity check passed                          |
|  [ ] Strategy works across multiple time periods                 |
|  [ ] Economic rationale documented                               |
|                                                                  |
|  RISK MANAGEMENT                                                 |
|  [ ] Position sizing rules defined                               |
|  [ ] Max drawdown limit set                                      |
|  [ ] Circuit breakers programmed                                 |
|  [ ] Correlation to existing strategies checked                  |
|  [ ] Capacity analysis performed                                 |
|                                                                  |
|  OPERATIONS                                                      |
|  [ ] Paper trading completed (1-3 months)                        |
|  [ ] Data pipeline tested for reliability                        |
|  [ ] Execution infrastructure tested                             |
|  [ ] Monitoring and alerting set up                              |
|  [ ] Kill switch accessible                                      |
|  [ ] Disaster recovery plan in place                             |
|                                                                  |
+------------------------------------------------------------------+
```

---

## Summary

```
+------------------------------------------------------------------+
|                   KEY TAKEAWAYS                                   |
+------------------------------------------------------------------+
|                                                                  |
|  1. Backtesting is necessary but not sufficient.                 |
|     Expect 30-50% degradation from backtest to live.             |
|                                                                  |
|  2. Use vectorized backtests for screening, event-driven         |
|     for validation. Same code for backtest and live.             |
|                                                                  |
|  3. Biases will destroy your results if ignored.                 |
|     Look-ahead, survivorship, and data-snooping are the          |
|     most dangerous. Assume you are overfit until proven          |
|     otherwise.                                                   |
|                                                                  |
|  4. Transaction costs matter enormously.                         |
|     Use volume-dependent impact models, not fixed bps.           |
|     A strategy profitable before costs may be deeply             |
|     unprofitable after costs.                                    |
|                                                                  |
|  5. Walk-forward analysis is the gold standard.                  |
|     Never report in-sample results as expected performance.      |
|     Use purged cross-validation for time series.                 |
|                                                                  |
|  6. Adjust for multiple testing.                                 |
|     Deflated Sharpe Ratio, CSCV, and haircut rules.              |
|     If you tested 100 strategies, your best one is probably      |
|     noise unless its Sharpe exceeds ~2.0.                        |
|                                                                  |
|  7. Paper trade before risking real money.                       |
|     1-3 months minimum. Monitor for degradation.                 |
|     Scale capital gradually based on live performance.           |
|                                                                  |
|  8. Always have circuit breakers.                                |
|     Automated hard stops on daily loss, drawdown, and            |
|     concentration. These are not optional.                       |
|                                                                  |
+------------------------------------------------------------------+
```

---

*Next chapter: [Chapter 9: Risk Management](09-RISK-MANAGEMENT.md) -- Position sizing, VaR, drawdown control, and portfolio risk.*
