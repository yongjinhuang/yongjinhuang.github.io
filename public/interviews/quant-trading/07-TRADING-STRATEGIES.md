# Chapter 7: Trading Strategies

## Overview

This chapter is the strategic core of the guide. Everything before this -- markets,
math, programming, microstructure, time series -- was preparation. Now we assemble
those tools into complete trading strategies.

```
+------------------------------------------------------------------------+
|                    STRATEGY FAMILY TAXONOMY                             |
+------------------------------------------------------------------------+
|                                                                        |
|  DIRECTIONAL                      RELATIVE VALUE                       |
|  +-------------------------+      +-----------------------------+      |
|  | Momentum / Trend         |      | Mean Reversion               |      |
|  | Event-Driven             |      | Statistical Arbitrage        |      |
|  | Factor Investing         |      | Pairs Trading                |      |
|  | ML-Based Signals         |      | Convertible Bond Arb         |      |
|  +-------------------------+      +-----------------------------+      |
|                                                                        |
|  MARKET-NEUTRAL                   STRUCTURAL                           |
|  +-------------------------+      +-----------------------------+      |
|  | Market Making            |      | ETF Arbitrage                |      |
|  | Long-Short Equity        |      | Index Arbitrage              |      |
|  | Beta-Hedged Factors      |      | Cross-Exchange Arbitrage     |      |
|  | Dispersion Trading       |      | Triangular FX Arbitrage      |      |
|  +-------------------------+      +-----------------------------+      |
|                                                                        |
+------------------------------------------------------------------------+
```

Every strategy rests on a single belief about price behavior. Momentum bets that
trends persist. Mean reversion bets they reverse. Arbitrage bets that identical
things should have identical prices. Market making bets that the bid-ask spread
compensates you for providing liquidity. Understanding the _why_ behind each
strategy matters more than memorizing the mechanics.

```
Strategy Selection Decision Tree:

                     What do you believe about this asset?
                                    |
                 +------------------+------------------+
                 |                                     |
          Prices trend                          Prices revert
                 |                                     |
        +--------+--------+                  +---------+---------+
        |                 |                  |                   |
   Single asset      Cross-section     Single asset        Asset pairs
        |                 |                  |                   |
  Time-Series       Cross-Sectional    Mean Reversion      Stat Arb /
  Momentum          Momentum           (Bollinger, RSI)    Pairs Trading
        |                 |                  |                   |
   Trend Following   Factor Investing   OU Process         Cointegration
   (CTA / Managed    (Fama-French,      Z-score signals    Spread trading
    Futures)          AQR-style)
```

---

## 1. Momentum / Trend Following

### 1.1 The Core Idea

Momentum is the empirical observation that assets which have performed well in
the recent past tend to continue performing well, and assets that have performed
poorly tend to continue performing poorly. This is one of the oldest and most
robust anomalies in finance.

```
Momentum Effect (Stylized):

Price
  |                                          ****
  |                                      ****
  |                                   ***
  |                               ****
  |                           ****        <-- Winners keep winning
  |                       ****
  |                   ****
  |               ****
  |           ****
  |       ****
  |   ****
  |***
  +---------------------------------------------------> Time
       |<-- Formation Period -->|<-- Holding Period -->|
       (Rank assets by          (Buy winners,
        past returns)            sell losers)
```

**Why does momentum exist?**

1. **Behavioral**: Investors underreact to new information initially, then
   overreact as herding takes over. The initial underreaction creates a drift
   that momentum strategies exploit.
2. **Risk-based**: Momentum stocks carry hidden risk (they tend to crash
   spectacularly in reversals). The premium compensates for this tail risk.
3. **Structural**: Index funds rebalance slowly. Pension funds have mandates
   that prevent quick reaction. These institutional frictions sustain trends.

### 1.2 Time-Series Momentum

Time-series momentum (TSMOM) uses an asset's own past returns to predict its
future direction. If the asset has gone up over the past N months, go long.
If it has gone down, go short.

```
Time-Series Momentum Signal:

  Signal(t) = sign( r(t-12, t-1) )

  where r(t-12, t-1) is the cumulative return from 12 months ago
  to 1 month ago (skipping the most recent month to avoid
  short-term reversal / microstructure noise).

  If Signal > 0  -->  Go LONG
  If Signal < 0  -->  Go SHORT
```

**Key research**: Moskowitz, Ooi, and Pedersen (2012) -- "Time Series Momentum"
showed TSMOM is profitable across 58 futures markets (commodities, equity indices,
bonds, currencies) over multiple decades.

```python
import numpy as np
import pandas as pd

def time_series_momentum(prices: pd.Series,
                         lookback: int = 252,
                         skip: int = 21) -> pd.Series:
    """
    Compute time-series momentum signal.

    Parameters
    ----------
    prices : pd.Series
        Daily price series.
    lookback : int
        Lookback window in trading days (252 ~ 12 months).
    skip : int
        Days to skip at the end (21 ~ 1 month) to avoid
        short-term reversal effects.

    Returns
    -------
    pd.Series
        Signal: +1 (long), -1 (short), 0 (no position).
    """
    returns = prices.pct_change()
    # Cumulative return from (t - lookback) to (t - skip)
    cum_return = returns.rolling(window=lookback).sum().shift(skip)
    signal = np.sign(cum_return)
    return signal.fillna(0).astype(int)


# Example usage
# prices = pd.read_csv('sp500.csv', index_col='date', parse_dates=True)['close']
# signal = time_series_momentum(prices)
# strategy_returns = signal.shift(1) * prices.pct_change()
```

### 1.3 Cross-Sectional Momentum

Cross-sectional momentum ranks a universe of assets by recent performance and
goes long the top decile (winners) and short the bottom decile (losers).

```
Cross-Sectional Momentum Portfolio Construction:

Step 1: Universe of N stocks at time t
+-------+--------+--------+--------+--------+--------+
| Stock | AAPL   | MSFT   | TSLA   | XOM    | JPM    |  ...
+-------+--------+--------+--------+--------+--------+
| 12m   | +45%   | +30%   | +80%   | -15%   | +5%    |  ...
| Ret   |        |        |        |        |        |
+-------+--------+--------+--------+--------+--------+

Step 2: Rank by 12-month return (skip most recent month)
  Rank 1:  TSLA  (+80%)   --> TOP DECILE (LONG)
  Rank 2:  AAPL  (+45%)   --> TOP DECILE (LONG)
  Rank 3:  MSFT  (+30%)
  ...
  Rank N-1: JPM  (+5%)
  Rank N:   XOM  (-15%)   --> BOTTOM DECILE (SHORT)

Step 3: Form long-short portfolio
  Long:  Equal-weight top decile
  Short: Equal-weight bottom decile
  Net exposure: ~zero (market neutral)
```

```python
def cross_sectional_momentum(returns_df: pd.DataFrame,
                              lookback: int = 252,
                              skip: int = 21,
                              n_quantiles: int = 10) -> pd.DataFrame:
    """
    Cross-sectional momentum: rank assets, long winners, short losers.

    Parameters
    ----------
    returns_df : pd.DataFrame
        Daily returns, columns = tickers, index = dates.
    lookback : int
        Formation period in trading days.
    skip : int
        Skip period to avoid reversal.
    n_quantiles : int
        Number of quantiles for ranking.

    Returns
    -------
    pd.DataFrame
        Weights for each asset each day.
    """
    cum_ret = returns_df.rolling(window=lookback).sum().shift(skip)

    def rank_to_weights(row):
        valid = row.dropna()
        if len(valid) < n_quantiles:
            return pd.Series(0.0, index=row.index)
        ranks = valid.rank(pct=True)
        weights = pd.Series(0.0, index=row.index)
        # Long top decile
        long_mask = ranks >= (1 - 1.0 / n_quantiles)
        n_long = long_mask.sum()
        if n_long > 0:
            weights[long_mask.index[long_mask]] = 1.0 / n_long
        # Short bottom decile
        short_mask = ranks <= (1.0 / n_quantiles)
        n_short = short_mask.sum()
        if n_short > 0:
            weights[short_mask.index[short_mask]] = -1.0 / n_short
        return weights

    weights = cum_ret.apply(rank_to_weights, axis=1)
    return weights
```

### 1.4 Moving Average Crossover

The moving average crossover is the most popular trend-following signal. When a
fast moving average crosses above a slow moving average, it signals upward
momentum (buy). When it crosses below, it signals downward momentum (sell).

```
Moving Average Crossover Diagram:

Price / MA
  |
  |          Fast MA (50-day)
  |         /                                    ****
  |        /        GOLDEN CROSS               **
  |       /        (Buy Signal)              **
  |      *     ****    |                   **
  |     * ****    *    v                 **
  |    ***         *  X               ***
  |   *   Slow MA  *X   ****       ***
  |  *   (200-day)  X*      ****  **
  | *              *  **        X*    <-- DEATH CROSS
  |*             **     ***   *X         (Sell Signal)
  |            **          ***
  |          **
  +-----------------------------------------------------> Time
```

**Types of Moving Averages**:

| Type | Formula                          | Characteristics               |
| ---- | -------------------------------- | ----------------------------- |
| SMA  | (1/N) \* sum(P_i)                | Equal weight, laggy           |
| EMA  | alpha _ P + (1-alpha) _ EMA_prev | Exponential decay, responsive |
| DEMA | 2\*EMA - EMA(EMA)                | Double smoothing, less lag    |
| WMA  | Linearly weighted                | Recent prices weighted more   |

```python
import pandas as pd
import numpy as np


def dual_ma_crossover(prices: pd.Series,
                      fast_window: int = 50,
                      slow_window: int = 200,
                      ma_type: str = 'ema') -> pd.DataFrame:
    """
    Dual moving average crossover strategy.

    Parameters
    ----------
    prices : pd.Series
        Daily closing prices.
    fast_window : int
        Fast moving average period.
    slow_window : int
        Slow moving average period.
    ma_type : str
        Type of moving average: 'sma', 'ema', or 'dema'.

    Returns
    -------
    pd.DataFrame
        DataFrame with columns: fast_ma, slow_ma, signal, position.
    """
    if ma_type == 'sma':
        fast_ma = prices.rolling(window=fast_window).mean()
        slow_ma = prices.rolling(window=slow_window).mean()
    elif ma_type == 'ema':
        fast_ma = prices.ewm(span=fast_window, adjust=False).mean()
        slow_ma = prices.ewm(span=slow_window, adjust=False).mean()
    elif ma_type == 'dema':
        ema_fast = prices.ewm(span=fast_window, adjust=False).mean()
        ema_ema_fast = ema_fast.ewm(span=fast_window, adjust=False).mean()
        fast_ma = 2 * ema_fast - ema_ema_fast

        ema_slow = prices.ewm(span=slow_window, adjust=False).mean()
        ema_ema_slow = ema_slow.ewm(span=slow_window, adjust=False).mean()
        slow_ma = 2 * ema_slow - ema_ema_slow
    else:
        raise ValueError(f"Unknown ma_type: {ma_type}")

    # Signal: +1 when fast > slow, -1 when fast < slow
    signal = pd.Series(
        np.where(fast_ma > slow_ma, 1, -1),
        index=prices.index
    )

    # Position: shift signal by 1 day to avoid look-ahead bias
    position = signal.shift(1).fillna(0).astype(int)

    return pd.DataFrame({
        'price': prices,
        'fast_ma': fast_ma,
        'slow_ma': slow_ma,
        'signal': signal,
        'position': position
    })


def backtest_ma_crossover(prices: pd.Series,
                          fast_window: int = 50,
                          slow_window: int = 200) -> dict:
    """
    Backtest dual MA crossover and return performance metrics.
    """
    result = dual_ma_crossover(prices, fast_window, slow_window)
    daily_returns = prices.pct_change()
    strategy_returns = result['position'] * daily_returns

    total_return = (1 + strategy_returns).prod() - 1
    annual_return = (1 + total_return) ** (252 / len(strategy_returns)) - 1
    annual_vol = strategy_returns.std() * np.sqrt(252)
    sharpe = annual_return / annual_vol if annual_vol > 0 else 0

    cumulative = (1 + strategy_returns).cumprod()
    rolling_max = cumulative.cummax()
    drawdown = (cumulative - rolling_max) / rolling_max
    max_drawdown = drawdown.min()

    n_trades = (result['position'].diff().abs() > 0).sum()

    return {
        'total_return': total_return,
        'annual_return': annual_return,
        'annual_volatility': annual_vol,
        'sharpe_ratio': sharpe,
        'max_drawdown': max_drawdown,
        'num_trades': n_trades
    }
```

### 1.5 Breakout Strategies

Breakout strategies enter positions when price exceeds a recent high or low,
betting that the breakout signals the start of a new trend.

```
Donchian Channel Breakout:

Price
  |
  |  Upper Channel (20-day high) = 105
  |  ================================================
  |                                          *
  |                           *    *       *   *
  |               *    *    *   **   *   *       BREAKOUT! --> BUY
  |       *    **   **   **           * *
  |    **   **                         *
  |  *
  |  ================================================
  |  Lower Channel (20-day low) = 92
  |
  +---------------------------------------------------> Time

Entry: Price closes above 20-day high --> Long
       Price closes below 20-day low  --> Short
Exit:  Price crosses 10-day low (for longs)
       Price crosses 10-day high (for shorts)
```

**Bollinger Band Breakout** (volatility-adjusted):

```
Bollinger Bands:

Price
  |
  |   Upper Band = SMA(20) + 2 * StdDev(20)
  |   .-''''''-.                  .-'''''-.
  |  /          \                /         \      Squeeze then
  | |    SMA     |              |   SMA     |     breakout = signal
  |  \          /    SQUEEZE    \          /
  |   '-......-'    |<----->|    '-.....--'
  |                 narrow bands = low vol
  |                 preceding breakout
  +---------------------------------------------------> Time
```

```python
def donchian_breakout(prices: pd.Series,
                      entry_window: int = 20,
                      exit_window: int = 10) -> pd.Series:
    """
    Donchian channel breakout strategy (Turtle Trading style).

    Returns position series: +1 (long), -1 (short), 0 (flat).
    """
    upper_entry = prices.rolling(window=entry_window).max()
    lower_entry = prices.rolling(window=entry_window).min()
    upper_exit = prices.rolling(window=exit_window).max()
    lower_exit = prices.rolling(window=exit_window).min()

    position = pd.Series(0, index=prices.index, dtype=float)

    current_pos = 0
    for i in range(entry_window, len(prices)):
        if current_pos == 0:
            if prices.iloc[i] > upper_entry.iloc[i - 1]:
                current_pos = 1
            elif prices.iloc[i] < lower_entry.iloc[i - 1]:
                current_pos = -1
        elif current_pos == 1:
            if prices.iloc[i] < lower_exit.iloc[i - 1]:
                current_pos = 0
        elif current_pos == -1:
            if prices.iloc[i] > upper_exit.iloc[i - 1]:
                current_pos = 0

        position.iloc[i] = current_pos

    return position
```

### 1.6 Momentum Crash Risk

Momentum strategies suffer from spectacular crashes during market reversals.
The most famous example is March 2009.

```
Momentum Crash of March 2009:

Momentum           Market
Return (%)          |
  +40 |             |
  +30 |             |        Market rallies sharply
  +20 |             |        from the bottom
  +10 |             |            ***
    0 |-------------|--------***----|---> Time
  -10 |             |     ***
  -20 |             |  ***
  -30 |     ****    |**
  -40 | ****    ****|           Momentum portfolio:
  -50 |*            |           - Long: beaten-down losers (now rallying)
  -60 |             |           - Short: previous winners (now crashing)
       2008    Mar 2009         = DEVASTATING LOSS

What happened:
1. During 2008 crash, momentum was SHORT financials (losers)
   and LONG defensive stocks (winners).
2. In March 2009, the market violently reversed.
3. Financials (shorts) surged +70%, defensives (longs) lagged.
4. Momentum suffered a -60% drawdown in weeks.
```

**Risk management for momentum**:

1. **Dynamic hedging**: Scale momentum exposure by market volatility.
   When VIX spikes, reduce position sizes.
2. **Crash indicator**: Monitor "momentum spread" (return gap between
   winners and losers). When spread is extreme, reversal risk is high.
3. **Time-varying lookback**: Use shorter lookback in high-vol regimes,
   longer lookback in low-vol regimes.

### 1.7 ATR-Based Position Sizing for Trend Following

The Average True Range (ATR) measures volatility and is used to normalize
position sizes so each position contributes equal risk.

```
ATR Position Sizing:

  Position Size = (Account Risk per Trade) / (N * ATR)

  where:
    Account Risk per Trade = Account Value * Risk Fraction
    N = ATR multiplier for stop distance
    ATR = Average True Range over lookback period

Example:
  Account = $1,000,000
  Risk per trade = 1% = $10,000
  ATR(20) of crude oil = $2.50 per barrel
  Stop distance = 2 * ATR = $5.00
  Contract size = 1000 barrels

  Dollar risk per contract = $5.00 * 1000 = $5,000
  Number of contracts = $10,000 / $5,000 = 2 contracts
```

```python
def atr_position_size(account_value: float,
                      risk_fraction: float,
                      atr: float,
                      atr_multiplier: float,
                      contract_multiplier: float = 1.0) -> int:
    """
    ATR-based position sizing (Turtle Trading method).

    Parameters
    ----------
    account_value : float
        Total account equity.
    risk_fraction : float
        Fraction of account to risk per trade (e.g., 0.01 = 1%).
    atr : float
        Current ATR value.
    atr_multiplier : float
        Multiple of ATR for stop distance.
    contract_multiplier : float
        Point value per contract (e.g., 1000 for crude oil futures).

    Returns
    -------
    int
        Number of contracts/shares to trade.
    """
    dollar_risk = account_value * risk_fraction
    risk_per_unit = atr * atr_multiplier * contract_multiplier
    if risk_per_unit <= 0:
        return 0
    return int(dollar_risk / risk_per_unit)


def compute_atr(high: pd.Series,
                low: pd.Series,
                close: pd.Series,
                window: int = 20) -> pd.Series:
    """Compute Average True Range."""
    prev_close = close.shift(1)
    tr1 = high - low
    tr2 = (high - prev_close).abs()
    tr3 = (low - prev_close).abs()
    true_range = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
    return true_range.rolling(window=window).mean()
```

### 1.8 CTA / Managed Futures Industry

The CTA (Commodity Trading Advisor) industry manages roughly $350 billion using
systematic trend-following strategies across global futures markets.

```
Typical CTA Portfolio Allocation:

+------------------+--------+-----------------------------------+
| Asset Class      | Weight | Instruments                       |
+------------------+--------+-----------------------------------+
| Equity Indices   |   25%  | S&P 500, Euro Stoxx, Nikkei,     |
|                  |        | FTSE, Hang Seng futures           |
+------------------+--------+-----------------------------------+
| Fixed Income     |   25%  | US Treasury, Bund, Gilt,         |
|                  |        | JGB futures (2y, 5y, 10y, 30y)   |
+------------------+--------+-----------------------------------+
| Commodities      |   25%  | Crude oil, gold, copper, wheat,  |
|                  |        | natural gas, soybeans             |
+------------------+--------+-----------------------------------+
| Currencies       |   25%  | EUR/USD, GBP/USD, JPY/USD,      |
|                  |        | AUD/USD, CAD/USD, CHF/USD        |
+------------------+--------+-----------------------------------+

Key CTA Firms:
  Man AHL, Winton, Aspect Capital, Millburn Ridgefield,
  Graham Capital, Systematica, Cantab Capital
```

**Why CTAs diversify**: Trend-following works in every asset class because
the behavioral and structural drivers (herding, slow information diffusion,
institutional frictions) are universal. Diversification across uncorrelated
markets smooths returns dramatically.

---

## 2. Mean Reversion

### 2.1 The Core Idea

Mean reversion is the tendency for prices (or returns) to revert to a long-run
average. Where momentum bets on continuation, mean reversion bets on reversal.

```
Mean Reversion vs. Momentum:

Price
  |
  |                        *
  |                       * *
  |                      *   *
  |                     *     *      <-- Momentum trader: BUY
  |        *   *   *  *       *      <-- Mean reversion: SELL
  |       * * * * * **         *
  |------*---*---*-*------------*----------  Long-run mean
  |     *                       *
  |    *                         *   <-- Momentum trader: SELL
  |   *                          *   <-- Mean reversion: BUY
  |  *                            *
  | *                              *
  +---------------------------------------------------> Time
```

**Why does mean reversion exist?**

1. **Overreaction**: Behavioral biases cause investors to overreact to news.
   Prices overshoot the fundamental value and then correct.
2. **Liquidity provision**: When a large seller pushes prices down temporarily,
   a mean-reversion trader provides liquidity and profits from the bounce.
3. **Market microstructure**: Bid-ask bounce -- prices oscillate between
   bid and ask even without information, creating short-term mean reversion.
4. **Fundamental anchoring**: Stocks have an intrinsic value. Deviations
   from that value attract value investors who push prices back.

### 2.2 Bollinger Band Strategy

Bollinger Bands create dynamic trading ranges based on recent volatility.

```
Bollinger Band Mean Reversion:

Price
  |   Upper Band = SMA(20) + 2*sigma
  |   ..........................................
  |          *                        *
  |         * *       SMA(20)        * *
  |        *   *    ----------      *   *
  |   ----*-----*--/----------\----*-----*-----
  |      *       **            **        *
  |     *                                 *     SELL when
  |   ..........................................  price touches
  |   Lower Band = SMA(20) - 2*sigma           upper band
  |                                             BUY when
  |                                             price touches
  |                                             lower band
  +---------------------------------------------------> Time

Rules:
  BUY:  Price crosses below lower band AND RSI < 30
  SELL: Price crosses above upper band AND RSI > 70
  EXIT: Price returns to SMA (the mean)
```

```python
def bollinger_band_strategy(prices: pd.Series,
                            window: int = 20,
                            num_std: float = 2.0) -> pd.DataFrame:
    """
    Bollinger Band mean reversion strategy.

    BUY when price drops below lower band.
    SELL when price rises above upper band.
    EXIT when price returns to the middle band.
    """
    sma = prices.rolling(window=window).mean()
    std = prices.rolling(window=window).std()
    upper = sma + num_std * std
    lower = sma - num_std * std

    position = pd.Series(0, index=prices.index, dtype=float)
    current_pos = 0

    for i in range(window, len(prices)):
        price = prices.iloc[i]

        if current_pos == 0:
            if price < lower.iloc[i]:
                current_pos = 1   # Buy: price below lower band
            elif price > upper.iloc[i]:
                current_pos = -1  # Sell: price above upper band
        elif current_pos == 1:
            # Exit long when price returns to mean
            if price >= sma.iloc[i]:
                current_pos = 0
        elif current_pos == -1:
            # Exit short when price returns to mean
            if price <= sma.iloc[i]:
                current_pos = 0

        position.iloc[i] = current_pos

    return pd.DataFrame({
        'price': prices,
        'sma': sma,
        'upper': upper,
        'lower': lower,
        'position': position
    })
```

### 2.3 RSI-Based Mean Reversion

The Relative Strength Index (RSI) oscillates between 0 and 100. Extreme
readings suggest overbought or oversold conditions that tend to revert.

```
RSI Calculation:

  RS = Average Gain (14 periods) / Average Loss (14 periods)
  RSI = 100 - (100 / (1 + RS))

RSI Scale:
  100 |  OVERBOUGHT ZONE (>70)
   70 |  ========================  SELL SIGNAL
      |
   50 |  ---- Neutral ----
      |
   30 |  ========================  BUY SIGNAL
    0 |  OVERSOLD ZONE (<30)
```

```python
def compute_rsi(prices: pd.Series, window: int = 14) -> pd.Series:
    """Compute RSI indicator."""
    delta = prices.diff()
    gain = delta.where(delta > 0, 0.0)
    loss = (-delta).where(delta < 0, 0.0)

    avg_gain = gain.rolling(window=window, min_periods=window).mean()
    avg_loss = loss.rolling(window=window, min_periods=window).mean()

    # Use Wilder's smoothing after initial SMA
    for i in range(window, len(avg_gain)):
        avg_gain.iloc[i] = (avg_gain.iloc[i - 1] * (window - 1)
                            + gain.iloc[i]) / window
        avg_loss.iloc[i] = (avg_loss.iloc[i - 1] * (window - 1)
                            + loss.iloc[i]) / window

    rs = avg_gain / avg_loss
    rsi = 100 - (100 / (1 + rs))
    return rsi


def rsi_mean_reversion(prices: pd.Series,
                       rsi_window: int = 14,
                       oversold: float = 30.0,
                       overbought: float = 70.0) -> pd.Series:
    """
    RSI-based mean reversion: buy oversold, sell overbought.
    """
    rsi = compute_rsi(prices, rsi_window)
    position = pd.Series(0, index=prices.index, dtype=float)
    current_pos = 0

    for i in range(rsi_window + 1, len(prices)):
        if current_pos == 0:
            if rsi.iloc[i] < oversold:
                current_pos = 1
            elif rsi.iloc[i] > overbought:
                current_pos = -1
        elif current_pos == 1:
            if rsi.iloc[i] > 50:
                current_pos = 0
        elif current_pos == -1:
            if rsi.iloc[i] < 50:
                current_pos = 0

        position.iloc[i] = current_pos

    return position
```

### 2.4 Ornstein-Uhlenbeck Process

The Ornstein-Uhlenbeck (OU) process is the mathematical model for mean reversion.
It describes a stochastic process that is pulled toward a long-run mean with a
certain speed.

```
Ornstein-Uhlenbeck Process:

  dX(t) = theta * (mu - X(t)) * dt + sigma * dW(t)

  where:
    X(t)   = current value of the process
    theta  = speed of mean reversion (higher = faster reversion)
    mu     = long-run mean level
    sigma  = volatility of the process
    dW(t)  = Wiener process increment (random noise)

Visualization:

X(t)
  |
  |    *
  |   * *             *
  |  *   *           * *
  | *     *    *    *   *          pulled back
  |--------*--*-*--*-----*-------- mu (long-run mean)
  |         **   *        *   *
  |                        * *
  |                         *     pulled back
  |
  +---------------------------------------------------> Time
       <-- theta controls how strongly X is pulled to mu -->

  Large theta = fast reversion (tight oscillation around mu)
  Small theta = slow reversion (wide wandering before reverting)
```

### 2.5 Half-Life of Mean Reversion

The half-life tells you how long it takes for a deviation from the mean to
decay by half. This is critical for setting trade holding periods.

```
Half-Life Estimation:

  From the OU process discretization:
    X(t) - X(t-1) = theta * (mu - X(t-1)) + epsilon

  Rearranging (regression form):
    dX(t) = alpha + beta * X(t-1) + epsilon

  where beta = -theta (the mean-reversion speed)

  Half-life = -ln(2) / beta = -ln(2) / ln(1 + beta_discrete)

  If half-life = 15 days:
    - A $10 deviation from mean will shrink to $5 in ~15 days
    - Good for a strategy with ~30 day holding period

  If half-life = 200 days:
    - Too slow for practical mean-reversion trading
    - Capital is tied up too long
```

```python
from scipy.stats import linregress


def half_life_mean_reversion(spread: pd.Series) -> float:
    """
    Estimate the half-life of mean reversion using OLS regression.

    spread(t) - spread(t-1) = alpha + beta * spread(t-1) + eps

    Half-life = -ln(2) / beta

    Returns
    -------
    float
        Half-life in number of periods.
    """
    spread_lag = spread.shift(1)
    spread_diff = spread - spread_lag

    # Drop NaN rows
    valid = pd.concat([spread_diff, spread_lag], axis=1).dropna()
    valid.columns = ['diff', 'lag']

    slope, intercept, r_value, p_value, std_err = linregress(
        valid['lag'], valid['diff']
    )

    if slope >= 0:
        # Not mean-reverting
        return float('inf')

    half_life = -np.log(2) / slope
    return half_life


# Example:
# spread = log(price_A) - beta * log(price_B)
# hl = half_life_mean_reversion(spread)
# print(f"Half-life: {hl:.1f} days")
# Practical range: 5 to 60 days is tradeable
```

### 2.6 Z-Score Trading Signals

The z-score standardizes the current spread or price relative to its recent
distribution, giving a universal signal regardless of units.

```
Z-Score Signal Construction:

  Z(t) = (X(t) - mean(X, window)) / std(X, window)

  Z-Score Scale:
   +3.0 |  Extreme overbought -- strong SELL
   +2.0 |  ============================  SELL entry
   +1.0 |  Mild overbought
    0.0 |  ---- Fair value ----
   -1.0 |  Mild oversold
   -2.0 |  ============================  BUY entry
   -3.0 |  Extreme oversold  -- strong BUY

Trading Rules:
  ENTER LONG:   Z < -2.0
  ENTER SHORT:  Z > +2.0
  EXIT LONG:    Z > -0.5 (or Z > 0)
  EXIT SHORT:   Z < +0.5 (or Z < 0)
  STOP LOSS:    Z < -4.0 (long) or Z > +4.0 (short)
                (spread may have broken -- abandon trade)
```

```python
def zscore_strategy(spread: pd.Series,
                    window: int = 60,
                    entry_z: float = 2.0,
                    exit_z: float = 0.0,
                    stop_z: float = 4.0) -> pd.DataFrame:
    """
    Z-score based mean reversion strategy.

    Parameters
    ----------
    spread : pd.Series
        The spread or price series to trade.
    window : int
        Lookback window for computing z-score.
    entry_z : float
        Z-score threshold for entry (absolute value).
    exit_z : float
        Z-score threshold for exit (absolute value).
    stop_z : float
        Z-score threshold for stop loss.

    Returns
    -------
    pd.DataFrame
        DataFrame with zscore, position columns.
    """
    spread_mean = spread.rolling(window=window).mean()
    spread_std = spread.rolling(window=window).std()
    zscore = (spread - spread_mean) / spread_std

    position = pd.Series(0.0, index=spread.index)
    current_pos = 0.0

    for i in range(window, len(spread)):
        z = zscore.iloc[i]

        if current_pos == 0:
            if z < -entry_z:
                current_pos = 1.0    # Buy: spread is too low
            elif z > entry_z:
                current_pos = -1.0   # Sell: spread is too high
        elif current_pos == 1.0:
            if z >= -exit_z or z < -stop_z:
                current_pos = 0.0    # Exit or stop
        elif current_pos == -1.0:
            if z <= exit_z or z > stop_z:
                current_pos = 0.0    # Exit or stop

        position.iloc[i] = current_pos

    return pd.DataFrame({
        'spread': spread,
        'zscore': zscore,
        'position': position
    })
```

---

## 3. Statistical Arbitrage

### 3.1 What Statistical Arbitrage Really Means

Statistical arbitrage (stat arb) exploits temporary mispricings between
related securities. Unlike pure arbitrage (risk-free profit), stat arb
profits are _statistical_ -- they hold on average but not on every trade.

```
Pure Arbitrage vs. Statistical Arbitrage:

+-------------------+---------------------------+---------------------------+
|                   | Pure Arbitrage             | Statistical Arbitrage      |
+-------------------+---------------------------+---------------------------+
| Risk              | Zero (identical payoffs)   | Non-zero (model risk)     |
| Profit certainty  | Guaranteed                 | Probabilistic             |
| Example           | Same stock on 2 exchanges  | Correlated stock pair     |
|                   | at different prices        | spread deviation          |
| Duration          | Seconds to minutes         | Days to weeks             |
| Capital needed    | Low (self-financing)       | Significant (margin)      |
| Competition       | Extreme (HFT firms)        | High but accessible       |
| Scalability       | Very limited               | Moderate                  |
+-------------------+---------------------------+---------------------------+
```

### 3.2 Pairs Trading: The Classic Approach

Pairs trading identifies two stocks that historically move together. When their
prices diverge, you bet they will converge again.

```
Pairs Trading Concept:

Price (normalized)
  |
  |    Stock A ----          ****          ----
  |               \        **    **      /
  |                \      *        *    /
  |                 \   **          ***/
  |                  \ *            *       <-- SPREAD WIDENS
  |                   X            / \          (Enter trade)
  |                  / \          /   \
  |                 /   \        /     *
  |                /     *      /     * *
  |               /       **  **     *   *
  |    Stock B ----         **     ----
  |                                         <-- SPREAD NARROWS
  |                                             (Exit trade)
  +---------------------------------------------------> Time

  When spread widens beyond 2 std devs:
    LONG the underperformer (Stock B)
    SHORT the outperformer (Stock A)

  When spread returns to normal:
    Close both positions --> Profit
```

### 3.3 Finding Pairs: Three Methods

**Method 1: Correlation**

```
Correlation-Based Pair Selection:

  1. Compute pairwise return correlations for all stocks
  2. Select pairs with correlation > 0.80
  3. Problem: correlation does NOT imply mean reversion

  High correlation: Prices move in same direction
  Cointegration:    The SPREAD between prices is stationary

  Two stocks can be highly correlated but NOT cointegrated.
  Cointegration is what you actually need for pairs trading.
```

**Method 2: Cointegration (Preferred)**

```
Cointegration Test (Engle-Granger):

  Step 1: Regress log(P_A) on log(P_B):
          log(P_A) = alpha + beta * log(P_B) + epsilon

  Step 2: Test residuals (epsilon) for stationarity:
          ADF test on epsilon
          H0: epsilon has a unit root (NOT cointegrated)
          H1: epsilon is stationary (cointegrated)

  Step 3: If ADF p-value < 0.05, the pair is cointegrated.
          The spread = log(P_A) - beta * log(P_B) is stationary
          and mean-reverting.

  This spread is what we trade!
```

**Method 3: Distance Method**

```
Distance Method:

  1. Normalize all price series to start at $1
  2. For each pair (i, j), compute SSD:
     SSD(i,j) = sum( (P_i(t) - P_j(t))^2 ) over formation period
  3. Select pairs with smallest SSD
  4. Trade during holding period when spread > threshold
```

### 3.4 Full Pairs Trading Implementation

```python
import numpy as np
import pandas as pd
from statsmodels.tsa.stattools import adfuller, coint
from scipy.stats import linregress


class PairsTradingSystem:
    """
    Complete pairs trading system with pair selection,
    spread modeling, signal generation, and position management.
    """

    def __init__(self,
                 entry_z: float = 2.0,
                 exit_z: float = 0.5,
                 stop_z: float = 4.0,
                 lookback: int = 60,
                 max_half_life: int = 60,
                 min_half_life: int = 5):
        self.entry_z = entry_z
        self.exit_z = exit_z
        self.stop_z = stop_z
        self.lookback = lookback
        self.max_half_life = max_half_life
        self.min_half_life = min_half_life

    def find_cointegrated_pairs(self,
                                prices_df: pd.DataFrame,
                                p_threshold: float = 0.05
                                ) -> list:
        """
        Find all cointegrated pairs in a universe of stocks.

        Parameters
        ----------
        prices_df : pd.DataFrame
            Columns = tickers, rows = dates, values = prices.
        p_threshold : float
            P-value threshold for cointegration test.

        Returns
        -------
        list of tuples
            Each tuple: (ticker_a, ticker_b, p_value, hedge_ratio).
        """
        tickers = prices_df.columns.tolist()
        n = len(tickers)
        pairs = []

        for i in range(n):
            for j in range(i + 1, n):
                series_a = prices_df[tickers[i]].dropna()
                series_b = prices_df[tickers[j]].dropna()

                # Align series
                common_idx = series_a.index.intersection(series_b.index)
                if len(common_idx) < 252:
                    continue

                s_a = series_a.loc[common_idx]
                s_b = series_b.loc[common_idx]

                # Engle-Granger cointegration test
                score, p_value, _ = coint(s_a, s_b)

                if p_value < p_threshold:
                    # Compute hedge ratio via OLS
                    slope, intercept, _, _, _ = linregress(
                        np.log(s_b), np.log(s_a)
                    )
                    pairs.append((
                        tickers[i], tickers[j],
                        round(p_value, 4), round(slope, 4)
                    ))

        # Sort by p-value (most significant first)
        pairs.sort(key=lambda x: x[2])
        return pairs

    def compute_spread(self,
                       prices_a: pd.Series,
                       prices_b: pd.Series,
                       hedge_ratio: float) -> pd.Series:
        """Compute log spread between two price series."""
        return np.log(prices_a) - hedge_ratio * np.log(prices_b)

    def compute_zscore(self, spread: pd.Series) -> pd.Series:
        """Rolling z-score of spread."""
        spread_mean = spread.rolling(window=self.lookback).mean()
        spread_std = spread.rolling(window=self.lookback).std()
        return (spread - spread_mean) / spread_std

    def check_half_life(self, spread: pd.Series) -> float:
        """Verify spread has tradeable half-life."""
        spread_lag = spread.shift(1)
        spread_diff = spread - spread_lag
        valid = pd.concat(
            [spread_diff, spread_lag], axis=1
        ).dropna()
        valid.columns = ['diff', 'lag']

        slope, _, _, _, _ = linregress(valid['lag'], valid['diff'])
        if slope >= 0:
            return float('inf')
        return -np.log(2) / slope

    def generate_signals(self,
                         prices_a: pd.Series,
                         prices_b: pd.Series,
                         hedge_ratio: float) -> pd.DataFrame:
        """
        Generate trading signals for a pair.

        Returns
        -------
        pd.DataFrame
            Columns: spread, zscore, position_a, position_b
            position_a: shares of stock A (+1 long, -1 short)
            position_b: shares of stock B (hedge_ratio scaled)
        """
        spread = self.compute_spread(prices_a, prices_b, hedge_ratio)

        # Validate half-life
        hl = self.check_half_life(spread)
        if not (self.min_half_life <= hl <= self.max_half_life):
            return pd.DataFrame({
                'spread': spread,
                'zscore': pd.Series(dtype=float),
                'position_a': 0,
                'position_b': 0
            })

        zscore = self.compute_zscore(spread)

        position_a = pd.Series(0.0, index=spread.index)
        position_b = pd.Series(0.0, index=spread.index)
        current_pos = 0.0

        for i in range(self.lookback, len(spread)):
            z = zscore.iloc[i]

            if current_pos == 0:
                if z > self.entry_z:
                    # Spread too wide: short A, long B
                    current_pos = -1.0
                elif z < -self.entry_z:
                    # Spread too narrow: long A, short B
                    current_pos = 1.0
            elif current_pos == 1.0:
                if z >= -self.exit_z or z < -self.stop_z:
                    current_pos = 0.0
            elif current_pos == -1.0:
                if z <= self.exit_z or z > self.stop_z:
                    current_pos = 0.0

            position_a.iloc[i] = current_pos
            position_b.iloc[i] = -current_pos * hedge_ratio

        return pd.DataFrame({
            'spread': spread,
            'zscore': zscore,
            'position_a': position_a,
            'position_b': position_b
        })

    def backtest_pair(self,
                      prices_a: pd.Series,
                      prices_b: pd.Series,
                      hedge_ratio: float) -> dict:
        """
        Backtest a single pair and return performance metrics.
        """
        signals = self.generate_signals(prices_a, prices_b, hedge_ratio)
        if signals['position_a'].abs().sum() == 0:
            return {'sharpe': 0, 'total_return': 0, 'num_trades': 0}

        returns_a = prices_a.pct_change()
        returns_b = prices_b.pct_change()

        portfolio_returns = (
            signals['position_a'].shift(1) * returns_a
            + signals['position_b'].shift(1) * returns_b
        ).fillna(0)

        total_return = (1 + portfolio_returns).prod() - 1
        annual_vol = portfolio_returns.std() * np.sqrt(252)
        annual_return = (
            (1 + total_return) ** (252 / len(portfolio_returns)) - 1
        )
        sharpe = annual_return / annual_vol if annual_vol > 0 else 0
        n_trades = (signals['position_a'].diff().abs() > 0).sum()

        cumulative = (1 + portfolio_returns).cumprod()
        rolling_max = cumulative.cummax()
        drawdown = (cumulative - rolling_max) / rolling_max
        max_dd = drawdown.min()

        return {
            'total_return': round(total_return, 4),
            'annual_return': round(annual_return, 4),
            'annual_vol': round(annual_vol, 4),
            'sharpe': round(sharpe, 2),
            'max_drawdown': round(max_dd, 4),
            'num_trades': int(n_trades),
            'half_life': round(
                self.check_half_life(signals['spread']), 1
            )
        }
```

### 3.5 Multi-Asset Stat Arb and PCA

Beyond pairs, stat arb can exploit mispricings across many assets simultaneously
using Principal Component Analysis (PCA).

```
PCA-Based Statistical Arbitrage:

Step 1: Extract principal components from a return matrix
        (e.g., 50 stocks in the same sector)

        Returns Matrix R (T x N):

        PC1 = "Market factor" (explains ~40% of variance)
        PC2 = "Sector rotation" (explains ~15%)
        PC3 = "Size factor" (explains ~8%)
        ...

Step 2: Residuals = Returns - (PC loadings * PC scores)
        These residuals represent idiosyncratic returns.

Step 3: If a stock's residual is abnormally negative,
        it is "cheap" relative to its factor exposure.
        BUY the stock, HEDGE with factor exposures.

Step 4: Wait for residual to revert to zero --> Profit.

    Residual
      |
      |   *
      |  * *              *
    0 |-------*---*------*-*------  <-- Equilibrium
      |        * *      *   *
      |         *      *
      |               *
      |  BUY here     EXIT here
      +---------------------------------------------------> Time
```

```python
from sklearn.decomposition import PCA


def pca_stat_arb_signals(returns_df: pd.DataFrame,
                          n_components: int = 5,
                          window: int = 60,
                          entry_z: float = 1.5,
                          exit_z: float = 0.5) -> pd.DataFrame:
    """
    PCA-based statistical arbitrage signals.

    Parameters
    ----------
    returns_df : pd.DataFrame
        Daily returns (T x N).
    n_components : int
        Number of principal components to extract.
    window : int
        Rolling window for z-score computation.
    entry_z, exit_z : float
        Z-score thresholds.

    Returns
    -------
    pd.DataFrame
        Position weights for each stock.
    """
    # Fit PCA on training data
    pca = PCA(n_components=n_components)
    pca.fit(returns_df.dropna())

    # Compute residuals (returns not explained by factors)
    factor_returns = pca.transform(returns_df.fillna(0))
    reconstructed = pd.DataFrame(
        pca.inverse_transform(factor_returns),
        index=returns_df.index,
        columns=returns_df.columns
    )
    residuals = returns_df - reconstructed

    # Cumulative residuals (like a "residual price")
    cum_residuals = residuals.cumsum()

    # Z-score of cumulative residuals
    zscore_df = pd.DataFrame(index=returns_df.index,
                             columns=returns_df.columns,
                             dtype=float)
    for col in cum_residuals.columns:
        col_mean = cum_residuals[col].rolling(window).mean()
        col_std = cum_residuals[col].rolling(window).std()
        zscore_df[col] = (cum_residuals[col] - col_mean) / col_std

    # Generate positions: buy undervalued, sell overvalued
    positions = pd.DataFrame(0.0, index=returns_df.index,
                             columns=returns_df.columns)
    positions[zscore_df < -entry_z] = 1.0   # Buy undervalued
    positions[zscore_df > entry_z] = -1.0   # Sell overvalued
    positions[zscore_df.abs() < exit_z] = 0.0  # Exit near zero

    # Normalize to equal weight
    long_count = (positions > 0).sum(axis=1).replace(0, 1)
    short_count = (positions < 0).sum(axis=1).replace(0, 1)

    for col in positions.columns:
        positions.loc[positions[col] > 0, col] = (
            1.0 / long_count[positions[col] > 0]
        )
        positions.loc[positions[col] < 0, col] = (
            -1.0 / short_count[positions[col] < 0]
        )

    return positions
```

### 3.6 Market-Neutral Construction

A market-neutral portfolio has zero (or near-zero) beta to the overall market.
This means profits come from stock selection, not market direction.

```
Market-Neutral Portfolio:

                    Long Portfolio          Short Portfolio
                    +------------------+    +------------------+
                    | AAPL   $100,000  |    | XOM   -$50,000   |
                    | MSFT    $80,000  |    | CVX   -$60,000   |
                    | GOOG    $70,000  |    | BP    -$40,000   |
                    | AMZN    $50,000  |    | INTC  -$50,000   |
                    |                  |    | GE    -$50,000   |
                    | Total: $300,000  |    | Total:-$250,000  |
                    | Beta:   1.15     |    | Beta:  0.92      |
                    +------------------+    +------------------+

Dollar Neutral:   Long $ = Short $ (300K vs 250K: NOT dollar neutral)
Beta Neutral:     Long Beta*$ = Short Beta*$
                  1.15 * 300K = 345K
                  0.92 * 250K = 230K  (NOT beta neutral)

To make beta-neutral:
  Adjust short leg: need Short_$ such that 0.92 * Short_$ = 345K
  Short_$ = 345K / 0.92 = $375,000

  OR reduce long leg and increase short leg accordingly.
```

---

## 4. Factor Investing

### 4.1 Fama-French 3-Factor Model

The Fama-French model explains stock returns as a function of three risk factors.

```
Fama-French 3-Factor Model:

  R_i - R_f = alpha_i + beta_m * (R_m - R_f) + beta_s * SMB + beta_v * HML + epsilon

  where:
    R_i - R_f  = Excess return of stock i
    R_m - R_f  = Market excess return (CAPM factor)
    SMB        = Small Minus Big (size factor)
                 Return of small-cap stocks minus large-cap stocks
    HML        = High Minus Low (value factor)
                 Return of high book-to-market minus low book-to-market

Factor Construction (Double Sort):

                        Size
                 Small          Big
            +------------+------------+
  Value     |            |            |
  (High     |   SV       |   BV       |   HML = avg(SV, BV)
   B/M)     |            |            |         - avg(SG, BG)
            +------------+------------+
  Growth    |            |            |
  (Low      |   SG       |   BG       |   SMB = avg(SV, SG)
   B/M)     |            |            |         - avg(BV, BG)
            +------------+------------+

  Median market cap splits into Small/Big.
  30th/70th percentile B/M splits into Value/Growth.
```

### 4.2 Carhart 4-Factor Model

Carhart (1997) added a momentum factor (UMD = Up Minus Down) to the
Fama-French 3-factor model.

```
Carhart 4-Factor Model:

  R_i - R_f = alpha + beta_m*(R_m-R_f) + beta_s*SMB + beta_v*HML + beta_u*UMD + eps

  UMD = Up Minus Down (Momentum factor)
      = Return of past 12-month winners - return of past 12-month losers
        (skip most recent month)

  If alpha is still significant after controlling for all 4 factors:
  --> The strategy has genuine skill / unexplained alpha
  --> This is the gold standard for evaluating fund performance
```

### 4.3 Modern Factor Zoo

Research has identified hundreds of factors. The most robust ones:

```
+------------------+-------------------+----------------------------------------+
| Factor           | Academic Name     | Intuition                              |
+------------------+-------------------+----------------------------------------+
| Market (MKT)     | Market premium    | Compensation for equity risk           |
| Size (SMB)       | Small minus big   | Small firms are riskier, earn more     |
| Value (HML)      | High minus low    | Cheap stocks outperform expensive      |
| Momentum (UMD)   | Up minus down     | Winners keep winning (behavioral)      |
| Quality (QMJ)    | Quality minus junk| Profitable, growing, safe firms win    |
| Low Volatility   | BAB (Betting      | Low-vol stocks earn higher             |
|                  | Against Beta)     | risk-adjusted returns (leverage        |
|                  |                   | constraints explanation)               |
| Profitability    | RMW (Robust       | High operating profit firms            |
|                  | minus Weak)       | outperform                             |
| Investment       | CMA (Conservative | Firms investing less outperform        |
|                  | minus Aggressive) | aggressive investors                   |
+------------------+-------------------+----------------------------------------+

Factor Performance Summary (Annualized, Long History):

  Factor        Return   Volatility   Sharpe
  ------------------------------------------
  Market         8.0%      15.0%       0.40
  Size (SMB)     2.5%      10.5%       0.24
  Value (HML)    4.0%      11.0%       0.36
  Momentum       7.5%      14.0%       0.54
  Quality        4.5%       8.5%       0.53
  Low-Vol (BAB)  8.0%      10.0%       0.80
  Profitability  3.0%       7.5%       0.40
```

### 4.4 Factor Construction Methodology

```
Factor Construction Pipeline:

+--------+     +----------+     +--------+     +-----------+     +----------+
| Raw    | --> | Compute  | --> | Rank   | --> | Form L/S  | --> | Calculate|
| Data   |     | Factor   |     | Stocks |     | Portfolio |     | Factor   |
| (CRSP, |     | Scores   |     | by     |     |           |     | Return   |
| Compust|     |          |     | Score  |     |           |     |          |
| at)    |     |          |     |        |     |           |     |          |
+--------+     +----------+     +--------+     +-----------+     +----------+

Details:

1. Raw Data:
   - Prices, returns, market cap, book value, earnings, etc.
   - Clean: remove penny stocks, ADRs, REITs

2. Compute Factor Scores:
   - Value: Book-to-Market ratio = Book Equity / Market Cap
   - Momentum: Cumulative return over months t-12 to t-2
   - Quality: ROE, earnings stability, low leverage

3. Rank Stocks:
   - Percentile rank within universe (0 to 100)
   - Handle industry neutrality if desired

4. Form Long-Short Portfolio:
   - Long: top quintile (or decile)
   - Short: bottom quintile (or decile)
   - Weight: equal-weight or value-weight

5. Calculate Returns:
   - Rebalance monthly (or quarterly)
   - Track net-of-transaction-costs returns
```

### 4.5 Implementation: Constructing a Value Factor

```python
def construct_value_factor(
    market_caps: pd.DataFrame,
    book_values: pd.DataFrame,
    returns: pd.DataFrame,
    n_quantiles: int = 5
) -> pd.Series:
    """
    Construct a long-short value factor (HML).

    Parameters
    ----------
    market_caps : pd.DataFrame
        Market capitalization (T x N).
    book_values : pd.DataFrame
        Book equity values (T x N).
    returns : pd.DataFrame
        Daily returns (T x N).
    n_quantiles : int
        Number of quantiles for sorting.

    Returns
    -------
    pd.Series
        Daily value factor returns (HML).
    """
    # Book-to-Market ratio
    bm_ratio = book_values / market_caps

    # Monthly rebalancing (use last day of each month)
    monthly_bm = bm_ratio.resample('M').last()

    factor_returns = []

    for date in monthly_bm.index:
        bm_row = monthly_bm.loc[date].dropna()
        if len(bm_row) < n_quantiles * 2:
            continue

        # Rank stocks by B/M ratio
        ranks = bm_row.rank(pct=True)

        # Top quintile = value (high B/M)
        value_stocks = ranks[ranks >= (1 - 1.0 / n_quantiles)].index
        # Bottom quintile = growth (low B/M)
        growth_stocks = ranks[ranks <= (1.0 / n_quantiles)].index

        # Get next month's returns
        next_month_start = date + pd.Timedelta(days=1)
        next_month_end = date + pd.offsets.MonthEnd(1) + pd.Timedelta(days=1)

        mask = (returns.index >= next_month_start) & (
            returns.index < next_month_end
        )
        month_returns = returns.loc[mask]

        if len(month_returns) == 0:
            continue

        # Equal-weight long-short
        valid_value = [s for s in value_stocks if s in month_returns.columns]
        valid_growth = [s for s in growth_stocks if s in month_returns.columns]

        if len(valid_value) == 0 or len(valid_growth) == 0:
            continue

        long_ret = month_returns[valid_value].mean(axis=1)
        short_ret = month_returns[valid_growth].mean(axis=1)
        hml = long_ret - short_ret
        factor_returns.append(hml)

    if len(factor_returns) == 0:
        return pd.Series(dtype=float)
    return pd.concat(factor_returns)
```

### 4.6 Factor Crowding and Decay

```
Factor Crowding Lifecycle:

  Academic           Practitioners    Crowded             Decay/
  Discovery          Adopt Factor     Factor              Crash
     |                    |               |                 |
     v                    v               v                 v
  +--------+        +----------+     +---------+      +---------+
  | Paper  |  -->   | Billions |  -> | Everyone| -->  | Returns |
  |published|       | flow in  |     | is in   |      | vanish  |
  | showing |       | to the   |     | same    |      | or      |
  | factor  |       | factor   |     | trade   |      | reverse |
  | works   |       |          |     |         |      |         |
  +--------+        +----------+     +---------+      +---------+

  Timeline:          2-5 years        5-10 years       Ongoing

Example: Value Factor Decay
  - 1990s: Value (HML) Sharpe ~0.5
  - 2000s: Value Sharpe ~0.3
  - 2010s: Value underperformed for a decade
  - Explanation: crowding, structural changes, low interest rates

Crowding Indicators:
  1. Factor valuation spread (compressed = crowded)
  2. Short interest concentration
  3. AUM in factor ETFs
  4. Pairwise correlation of factor fund returns
```

### 4.7 Smart Beta vs. Pure Alpha

```
Smart Beta vs. Alpha:

  Smart Beta (Factor Investing)          Pure Alpha
  +-------------------------------+      +------------------------------+
  | Systematic, rules-based        |      | Discretionary or complex ML   |
  | Transparent methodology        |      | Proprietary, opaque           |
  | Available via ETFs             |      | Hedge fund structures          |
  | Low fees (0.1% - 0.5%)        |      | High fees (2% + 20%)          |
  | Capacity: very large           |      | Capacity: limited              |
  | Sharpe: 0.3 - 0.6             |      | Sharpe: 1.0 - 3.0+            |
  | Rebalance: monthly/quarterly   |      | Rebalance: daily or intraday   |
  +-------------------------------+      +------------------------------+

  Key insight: Much of what was sold as "alpha" in the 1990s-2000s
  was actually factor exposure (beta in disguise).

  A hedge fund claiming 15% returns might actually be:
    8% market beta + 3% value + 2% momentum + 2% true alpha

  Factor attribution decomposes returns to reveal the truth.
```

---

## 5. Arbitrage Strategies

### 5.1 Pure Arbitrage vs. Statistical Arbitrage

```
Arbitrage Spectrum:

  PURE ARBITRAGE                                    STATISTICAL ARBITRAGE
  (Risk-free)                                       (Probabilistic)
  |                                                              |
  |  Same asset,     Index       ETF          Pairs    Relative
  |  different       rebalance   creation/    trading  value
  |  exchanges       arb         redemption            macro
  |                                                              |
  v                                                              v
  Zero risk                                           Significant risk
  Zero holding period                                 Days to months
  Tiny profit per trade                               Larger profit
  Requires speed                                      Requires models
```

### 5.2 ETF Arbitrage

```
ETF Creation/Redemption Arbitrage:

Scenario: SPY (S&P 500 ETF) trades at $450, but the NAV of
underlying stocks = $450.50

  Step 1: Buy the underlying 500 stocks (basket) at NAV = $450.50
  Step 2: Deliver basket to ETF sponsor (State Street)
  Step 3: Receive newly created SPY shares
  Step 4: Sell SPY shares at $450.50 in the market

  Wait... SPY is at $450, not $450.50.

  Actually, if SPY < NAV:
  Step 1: Buy SPY at $450.00
  Step 2: Redeem SPY shares with sponsor for underlying basket
  Step 3: Sell underlying basket at $450.50
  Profit: $0.50 per share (minus transaction costs)

  Authorized Participant (AP) Flow:

  +--------+     Buy SPY     +----------+    Redeem     +---------+
  | Market | ------------->  |    AP     | ----------->  | ETF     |
  | (SPY   |                 | (Goldman, |              | Sponsor |
  |  cheap)|     Sell        | Citadel)  |    Receive   | (State  |
  |        | <-------------- |           | <----------  | Street) |
  +--------+   Underlying    +----------+   Basket of   +---------+
               stocks at NAV              underlying stocks
```

### 5.3 Index Arbitrage

```
Index Rebalancing Arbitrage:

When S&P 500 announces a stock ADDITION:

  Announcement Day (T)              Effective Day (T+5)
  +----------------------+          +----------------------+
  | Stock XYZ to be      |          | Index funds MUST buy |
  | added to S&P 500     |          | XYZ by close         |
  +----------------------+          +----------------------+
          |                                  |
          v                                  v
  Arb trader BUYS XYZ                Arb trader SELLS XYZ
  before index funds do              to index funds at
  (price is still low)               higher price

  Historical premium: ~5-7% (has shrunk to ~1-2% due to competition)

Similarly, for DELETIONS:
  Arb trader SHORTS the stock being removed.
  Index funds dump it on effective day.
```

### 5.4 Convertible Bond Arbitrage

```
Convertible Bond Arbitrage:

A convertible bond = regular bond + option to convert to stock

Strategy:
  1. BUY the convertible bond (long gamma, long volatility)
  2. SHORT the underlying stock (delta-hedge)

  Why it works:
  - Convertible bonds are often CHEAP relative to their theoretical
    value (because the issuer's credit risk scares some investors).
  - You extract the embedded option cheaply and hedge the stock risk.

  P&L Decomposition:

  +------------------+-----------------------------------------------+
  | Component        | Contribution                                  |
  +------------------+-----------------------------------------------+
  | Carry            | Bond coupon income (positive)                 |
  | Delta-hedging    | Gamma profits when stock moves (positive)     |
  | Credit spread    | Risk of issuer default (negative/risk)        |
  | Volatility       | Long vol: profits if realized > implied       |
  | Borrowing cost   | Short stock borrow fee (negative)             |
  +------------------+-----------------------------------------------+

  Net: Positive expected return IF the convertible is underpriced.
```

### 5.5 Merger / Event Arbitrage

```
Merger Arbitrage:

  Announcement: Company A to acquire Company B at $50/share
  Current price of B: $47 (the "spread" = $3)

  Timeline:
  +----------+                    +----------+
  | Announce |                    | Deal     |
  | (T=0)    |                    | Closes   |
  | B = $47  |                    | B = $50  |
  +----------+                    +----------+
       |                               |
       +---------- Spread = $3 --------+
       |     (6.4% return over         |
       |      ~3-6 months)             |
       |                               |
  BUY Target B     If deal closes:  PROFIT = $3/share
  at $47           If deal fails:   LOSS = $47 - $35 = $12
                   (stock drops to  (pre-deal level)
                    pre-deal price)

  Risk/Reward:
    P(deal closes) = 90%
    Expected profit if closes: $3
    Expected loss if fails: -$12

    E[return] = 0.9 * $3 + 0.1 * (-$12) = $2.70 - $1.20 = $1.50
    Annualized (4 months): ~4.5% * 3 = ~13.5% annualized

  Enhancement: short the acquirer (Company A) as a hedge.
```

### 5.6 Cross-Exchange Crypto Arbitrage

```
Cross-Exchange Crypto Arbitrage:

  Exchange A (Binance):  BTC = $42,000
  Exchange B (Coinbase): BTC = $42,150

  Step 1: Buy BTC on Binance at $42,000
  Step 2: Transfer BTC to Coinbase (10-30 min for Bitcoin)
  Step 3: Sell BTC on Coinbase at $42,150
  Gross profit: $150 per BTC

  BUT: Transfer takes time, price can move.

  Better approach (pre-funded):
  - Hold USD on Binance AND BTC on Coinbase
  - Simultaneously: buy on Binance, sell on Coinbase
  - No transfer needed -- rebalance later
  - Profit is locked in instantly

  Challenges:
  +--------------------------+------------------------------------+
  | Challenge                | Mitigation                         |
  +--------------------------+------------------------------------+
  | Transfer latency         | Pre-fund both exchanges            |
  | Withdrawal limits        | Maintain large balances            |
  | Exchange risk            | Diversify across exchanges         |
  | Fee structures           | Model fees into spread threshold   |
  | API rate limits          | Efficient polling / websockets     |
  | Fiat on/off ramp delays  | Use stablecoins for settlement     |
  +--------------------------+------------------------------------+
```

### 5.7 Triangular FX Arbitrage

```
Triangular FX Arbitrage:

  Three currency pairs form a triangle:
  EUR/USD, GBP/USD, EUR/GBP

  If the cross-rate is inconsistent:
    EUR/USD = 1.1000
    GBP/USD = 1.2500
    EUR/GBP = 0.8850

  Implied EUR/GBP = EUR/USD / GBP/USD = 1.1000 / 1.2500 = 0.8800

  But market EUR/GBP = 0.8850 (too expensive)

  Arbitrage:
    1. Sell EUR, buy USD:  1 EUR --> $1.1000
    2. Sell USD, buy GBP:  $1.1000 --> GBP 0.8800
    3. Sell GBP, buy EUR:  GBP 0.8800 / 0.8850 = EUR 0.9944

  Wait, that is a LOSS. Reverse the direction:

    1. Sell EUR, buy GBP:  1 EUR --> GBP 0.8850
    2. Sell GBP, buy USD:  GBP 0.8850 * 1.2500 = $1.10625
    3. Sell USD, buy EUR:  $1.10625 / 1.1000 = EUR 1.00568

  Profit: 0.568% per round trip (before transaction costs)

  In practice: spreads and fees make this nearly impossible
  for retail. Banks and HFT firms with direct FX feeds can
  capture tiny discrepancies at enormous volume.
```

### 5.8 Why Pure Arbitrage Is Nearly Impossible for Retail

```
Barriers to Pure Arbitrage for Retail Traders:

+-----+----------------------------+----------------------------------+
|  #  | Barrier                    | Why it matters                   |
+-----+----------------------------+----------------------------------+
|  1  | Latency                    | HFT firms co-locate at exchange  |
|     |                            | with <1 microsecond latency.     |
|     |                            | Retail has 10-100ms.             |
+-----+----------------------------+----------------------------------+
|  2  | Transaction costs          | Retail pays wider spreads,       |
|     |                            | commissions eat tiny arb profits.|
+-----+----------------------------+----------------------------------+
|  3  | Capital requirements       | Need large capital on multiple   |
|     |                            | venues simultaneously.           |
+-----+----------------------------+----------------------------------+
|  4  | Market access              | No direct exchange access,       |
|     |                            | no co-location, no FPGA.         |
+-----+----------------------------+----------------------------------+
|  5  | Information asymmetry      | Institutional arbs see order     |
|     |                            | flow data retail cannot access.  |
+-----+----------------------------+----------------------------------+
|  6  | Regulatory barriers        | Authorized Participant status    |
|     |                            | for ETF arb, prime brokerage     |
|     |                            | for short selling.               |
+-----+----------------------------+----------------------------------+

Bottom line: Retail traders should focus on strategies with longer
holding periods (days to months) where speed is less critical and
edge comes from research, not infrastructure.
```

---

## 6. Market Making Strategies

### 6.1 Passive Liquidity Provision

Market makers earn the bid-ask spread by continuously quoting both sides
of the market. They provide liquidity to directional traders and profit
from the spread.

```
Market Making P&L:

  Order Book:                    Market Maker's View:

  ASK  $100.05  (500 shares)    I quote:
  ASK  $100.04  (300 shares)      ASK $100.03 (my offer to sell)
  ASK  $100.03  (MM's order)      BID $100.00 (my offer to buy)
  -------- spread = $0.03 ------
  BID  $100.00  (MM's order)    If both sides fill:
  BID  $99.99   (200 shares)      Bought at $100.00
  BID  $99.98   (400 shares)      Sold at $100.03
                                   Profit = $0.03 per share

  Annualized P&L for active market maker:
    Trades per day: 10,000 round trips
    Avg spread capture: $0.02
    Avg size: 100 shares
    Daily P&L: 10,000 * $0.02 * 100 = $20,000
    Annual P&L: ~$5,000,000

  BUT: This ignores adverse selection losses (informed traders
  who know the stock is about to move against you).
```

### 6.2 Inventory Management: Avellaneda-Stoikov

The Avellaneda-Stoikov model (2008) provides an optimal quoting framework
that balances spread capture against inventory risk.

```
Avellaneda-Stoikov Framework:

  Reservation price (where MM wants the mid):

    r(s, q, t) = s - q * gamma * sigma^2 * (T - t)

  where:
    s     = current mid price
    q     = current inventory (positive = long, negative = short)
    gamma = risk aversion parameter
    sigma = asset volatility
    T - t = time remaining

  Optimal spread:

    delta = gamma * sigma^2 * (T - t) + (2/gamma) * ln(1 + gamma/kappa)

  where:
    kappa = order arrival rate parameter

  Intuition:
    +----------------------------------------------------+
    |  Inventory = 0   -->  Quote symmetrically           |
    |  Inventory > 0   -->  Lower ask (encourage sells)   |
    |                       Raise bid (discourage buys)   |
    |  Inventory < 0   -->  Raise ask (discourage sells)  |
    |                       Lower bid (encourage buys)    |
    +----------------------------------------------------+

  Inventory Skew Visualization:

    Price
    102 |                        Ask (inventory < 0, high)
    101 |            Ask (q=0)   .
    100 |   --- Mid ---          .
     99 |            Bid (q=0)   .
     98 |                        Bid (inventory < 0, low)
        +--------------------------------------------
             q = 0              q = -500
```

### 6.3 Adverse Selection

Adverse selection is the market maker's primary risk: informed traders
trade against you when they know something you do not.

```
Adverse Selection Problem:

  Scenario 1: Uninformed buyer hits your ask
  +--------------------------------------------------+
  | You sell at $100.03                                |
  | Price stays around $100.00                         |
  | You buy back at $100.00                            |
  | Profit: $0.03                                     |
  +--------------------------------------------------+

  Scenario 2: Informed buyer hits your ask (earnings leak)
  +--------------------------------------------------+
  | You sell at $100.03                                |
  | News breaks: positive earnings surprise            |
  | Price jumps to $105.00                             |
  | You must buy back at $105.00                       |
  | Loss: -$4.97                                      |
  +--------------------------------------------------+

  One informed trade wipes out ~165 spread captures!

  Adverse Selection Metrics:
    - Realized spread vs. quoted spread
    - VPIN (Volume-Synchronized Probability of Informed Trading)
    - Order flow toxicity measures

  Protection mechanisms:
    1. Widen spreads during news events
    2. Cancel quotes when large orders detected
    3. Monitor order flow imbalance in real-time
    4. Reduce size near known event times (earnings, FOMC)
```

### 6.4 Queue Position Importance

In modern electronic markets, queue position determines whether your
order gets filled or not.

```
Queue Position and Fill Probability:

  ASK side of order book at $100.05:

  Position in Queue    Fill Probability
  +------------------+------------------+
  | 1st (100 shares) | ~95%             | <-- arrived first
  | 2nd (200 shares) | ~75%             |
  | 3rd (150 shares) | ~50%             |
  | 4th (100 shares) | ~30%             |
  | 5th (MM's order) | ~10%             | <-- last in line
  +------------------+------------------+

  Total depth at $100.05: 650 shares
  Average incoming order: ~200 shares

  If only 200 shares cross, only positions 1 gets fully filled.
  MM at position 5 gets NOTHING.

  Queue advantage strategies:
    1. Submit orders early (predictive quoting)
    2. Use multiple price levels
    3. Cancel and requote quickly (but not too quickly: queue loss)
    4. Maintain persistent presence to build queue position
```

### 6.5 Market Making Simulator

```python
import numpy as np
import pandas as pd
from dataclasses import dataclass


@dataclass(frozen=True)
class MarketMakerConfig:
    """Immutable configuration for market maker."""
    initial_cash: float = 1_000_000.0
    gamma: float = 0.01           # Risk aversion
    sigma: float = 0.02           # Daily volatility
    kappa: float = 1.5            # Order arrival intensity
    max_inventory: int = 1000     # Max position in shares
    tick_size: float = 0.01       # Minimum price increment


@dataclass(frozen=True)
class MarketState:
    """Immutable market state snapshot."""
    mid_price: float
    inventory: int
    cash: float
    pnl_history: tuple


def compute_optimal_quotes(config: MarketMakerConfig,
                           mid_price: float,
                           inventory: int,
                           time_remaining: float) -> tuple:
    """
    Avellaneda-Stoikov optimal bid and ask quotes.

    Returns (bid_price, ask_price).
    """
    gamma = config.gamma
    sigma = config.sigma
    kappa = config.kappa
    T = time_remaining

    # Reservation price: shifted by inventory
    reservation = mid_price - inventory * gamma * (sigma ** 2) * T

    # Optimal half-spread
    half_spread = (
        gamma * (sigma ** 2) * T / 2
        + np.log(1 + gamma / kappa) / gamma
    )

    bid = reservation - half_spread
    ask = reservation + half_spread

    # Round to tick size
    bid = np.floor(bid / config.tick_size) * config.tick_size
    ask = np.ceil(ask / config.tick_size) * config.tick_size

    return bid, ask


def simulate_market_making(config: MarketMakerConfig,
                           n_steps: int = 1000,
                           dt: float = 1.0 / 390,
                           seed: int = 42) -> pd.DataFrame:
    """
    Simulate a market making strategy over one trading day.

    Parameters
    ----------
    config : MarketMakerConfig
        Strategy configuration.
    n_steps : int
        Number of time steps (e.g., 390 for 1-min bars in a day).
    dt : float
        Time step as fraction of day.
    seed : int
        Random seed for reproducibility.

    Returns
    -------
    pd.DataFrame
        Simulation results with columns:
        mid_price, bid, ask, inventory, cash, pnl.
    """
    rng = np.random.default_rng(seed)
    mid_price = 100.0
    inventory = 0
    cash = config.initial_cash

    records = []

    for step in range(n_steps):
        time_remaining = max(1 - step * dt, 0.001)

        bid, ask = compute_optimal_quotes(
            config, mid_price, inventory, time_remaining
        )

        # Simulate order arrivals (Poisson process)
        # Buy orders hit our ask, sell orders hit our bid
        buy_arrival = rng.poisson(config.kappa * dt)
        sell_arrival = rng.poisson(config.kappa * dt)

        fill_size = 100  # shares per fill

        # Process fills (with inventory limits)
        for _ in range(buy_arrival):
            if inventory - fill_size >= -config.max_inventory:
                # Someone buys from us (hits our ask)
                cash = cash + ask * fill_size
                inventory = inventory - fill_size

        for _ in range(sell_arrival):
            if inventory + fill_size <= config.max_inventory:
                # Someone sells to us (hits our bid)
                cash = cash - bid * fill_size
                inventory = inventory + fill_size

        # Mark-to-market PnL
        mark_to_market = cash + inventory * mid_price
        pnl = mark_to_market - config.initial_cash

        records.append({
            'step': step,
            'mid_price': round(mid_price, 2),
            'bid': round(bid, 2),
            'ask': round(ask, 2),
            'spread': round(ask - bid, 4),
            'inventory': inventory,
            'cash': round(cash, 2),
            'pnl': round(pnl, 2)
        })

        # Evolve mid price (geometric Brownian motion)
        mid_price = mid_price * np.exp(
            -0.5 * config.sigma ** 2 * dt
            + config.sigma * np.sqrt(dt) * rng.standard_normal()
        )

    return pd.DataFrame(records)


# Example usage:
# config = MarketMakerConfig(gamma=0.01, sigma=0.02, kappa=1.5)
# results = simulate_market_making(config, n_steps=390)
# print(f"Final PnL: ${results['pnl'].iloc[-1]:,.2f}")
# print(f"Max Inventory: {results['inventory'].abs().max()} shares")
# print(f"Avg Spread: {results['spread'].mean():.4f}")
```

---

## 7. Event-Driven Strategies

### 7.1 Post-Earnings Announcement Drift (PEAD)

PEAD is one of the most robust anomalies in finance. Stocks that report
positive earnings surprises tend to drift upward for 60-90 days after
the announcement, and vice versa for negative surprises.

```
Post-Earnings Announcement Drift:

Cumulative Abnormal Return (CAR)
  |
  |                                    *** Positive surprise
  |                                 ***
  |                              ***
  |                           ***
  |                        ***
  |        Earnings     ***
  |        announcement**
  |            |      **
  |            |    **
  |            v  **
  0%  --------|*|----------------------------  No surprise
  |           *|
  |          * |
  |         *  |
  |        *   |
  |       *    |  *** Negative surprise
  |     **     ***
  |   **    ***
  |  **  ***
  | ** ***
  |****
  +---------------------------------------------------> Time
  -30 days    0     +30 days   +60 days   +90 days

  Key observations:
  1. ~60% of the drift happens in the first 5 days
  2. Remaining 40% drifts over next 60 days
  3. Small stocks drift more (less analyst coverage)
  4. Drift is strongest when surprise contradicts prior trend
```

**Measuring earnings surprise**:

```
Standardized Unexpected Earnings (SUE):

  SUE = (Actual EPS - Expected EPS) / Std(forecast errors)

  Expected EPS sources:
    1. Analyst consensus (I/B/E/S)
    2. Random walk model: E[EPS_q] = EPS_{q-4} (same quarter last year)
    3. Time-series model: seasonal ARIMA

  Trading rule:
    SUE > +2  -->  BUY  (hold for 60 days)
    SUE < -2  -->  SHORT (hold for 60 days)
```

### 7.2 News Sentiment Trading

```
NLP Pipeline for News Sentiment:

+--------+     +----------+     +---------+     +----------+     +--------+
| News   | --> | Tokenize | --> | Model   | --> | Sentiment| --> | Trading|
| Feed   |     | & Clean  |     | (BERT / |     | Score    |     | Signal |
| (Reuters|    |          |     |  GPT /  |     | [-1, +1] |     |        |
| Bloomberg|   |          |     |  FinBERT)|    |          |     |        |
+--------+     +----------+     +---------+     +----------+     +--------+

Sentiment Score Interpretation:

  Score     Interpretation          Action
  -------   --------------------    --------
  [+0.7,+1] Strong positive         Buy aggressive
  [+0.3,+0.7] Moderate positive     Buy moderate
  [-0.3,+0.3] Neutral               No action
  [-0.7,-0.3] Moderate negative     Sell moderate
  [-1,-0.7] Strong negative         Sell aggressive

Key considerations:
  - Latency: news arrives and is priced in within SECONDS
  - Signal decay: sentiment alpha decays very rapidly
  - Context: same words mean different things in different contexts
  - Sarcasm/irony: hard for models to detect
  - Fake news: must verify source credibility
```

### 7.3 Macro Event Trading

```
FOMC Announcement Trading:

  FOMC Schedule: 8 meetings per year
  Announcement: 2:00 PM ET
  Press Conference: 2:30 PM ET

  Pre-FOMC Drift (documented anomaly):
  - S&P 500 tends to drift upward in the 24 hours before FOMC
  - Average pre-FOMC return: ~0.5% (vs ~0.04% normal day)
  - Accounts for large fraction of annual equity returns!

  Post-Announcement Volatility:

  VIX
   30 |      *
      |     * *
   25 |    *   *
      |   *     *
   20 |  *       *
      | *         *
   15 |*           ******
      |                  *****
   10 |                       ********
      +-------------------------------------------> Time
      -5d  -3d  -1d  FOMC  +1d  +3d  +5d  +10d

  Strategy options:
    1. Pre-FOMC drift: go long 24h before, close at announcement
    2. Straddle: buy options before, profit from vol spike
    3. Post-statement momentum: trade direction of rate surprise
```

### 7.4 Seasonality and Calendar Effects

```
Well-Known Calendar Effects:

+-----------------------+---------------------------------------------+
| Effect                | Description                                 |
+-----------------------+---------------------------------------------+
| January Effect        | Small stocks outperform in January           |
|                       | (tax-loss selling reversal)                 |
+-----------------------+---------------------------------------------+
| Monday Effect         | Returns tend to be negative on Mondays       |
|                       | (weekend information processing)            |
+-----------------------+---------------------------------------------+
| Turn-of-Month         | Returns are higher on last day and first     |
|                       | 3 days of month (payroll flows)             |
+-----------------------+---------------------------------------------+
| Holiday Effect        | Returns are higher on day before holidays    |
|                       | (reduced selling pressure)                  |
+-----------------------+---------------------------------------------+
| End-of-Quarter        | Window dressing by fund managers             |
| Window Dressing       | (buy winners, sell losers before reporting)  |
+-----------------------+---------------------------------------------+
| Sell in May           | "Sell in May and go away" -- weaker returns  |
| and Go Away           | from May to October historically             |
+-----------------------+---------------------------------------------+

  Caution: Many calendar effects have weakened significantly since
  their discovery. Publication and widespread awareness cause decay.
```

### 7.5 NLP for Event Detection

```python
from dataclasses import dataclass


@dataclass(frozen=True)
class NewsEvent:
    """Immutable news event representation."""
    timestamp: str
    ticker: str
    headline: str
    sentiment: float
    event_type: str


def classify_event_type(headline: str) -> str:
    """
    Simple rule-based event classifier.
    In production, use a fine-tuned transformer model.
    """
    headline_lower = headline.lower()

    event_keywords = {
        'earnings': ['earnings', 'eps', 'revenue', 'profit',
                     'quarterly results', 'beat', 'miss'],
        'merger': ['merger', 'acquisition', 'acquire', 'buyout',
                   'takeover', 'deal'],
        'management': ['ceo', 'cfo', 'resign', 'appoint', 'hire',
                       'fired', 'executive'],
        'regulatory': ['sec', 'fda', 'approval', 'investigation',
                       'lawsuit', 'fine', 'compliance'],
        'macro': ['fomc', 'fed', 'interest rate', 'inflation',
                  'gdp', 'unemployment', 'nonfarm'],
        'guidance': ['guidance', 'outlook', 'forecast', 'expect',
                     'raise guidance', 'lower guidance'],
        'dividend': ['dividend', 'buyback', 'repurchase',
                     'special dividend']
    }

    for event_type, keywords in event_keywords.items():
        for keyword in keywords:
            if keyword in headline_lower:
                return event_type

    return 'other'


def compute_event_signal(events: list, decay_days: int = 5) -> dict:
    """
    Aggregate multiple news events into a trading signal.

    Parameters
    ----------
    events : list of NewsEvent
        Recent news events for a ticker.
    decay_days : int
        Number of days for signal decay.

    Returns
    -------
    dict
        Ticker-level signal with magnitude and direction.
    """
    if not events:
        return {'signal': 0.0, 'confidence': 0.0, 'n_events': 0}

    # Weight events by recency and event type importance
    event_weights = {
        'earnings': 3.0,
        'merger': 2.5,
        'regulatory': 2.0,
        'guidance': 1.5,
        'management': 1.0,
        'macro': 1.0,
        'dividend': 0.5,
        'other': 0.3
    }

    weighted_sentiment = 0.0
    total_weight = 0.0

    for event in events:
        type_weight = event_weights.get(event.event_type, 0.3)
        weighted_sentiment += event.sentiment * type_weight
        total_weight += type_weight

    avg_sentiment = (
        weighted_sentiment / total_weight if total_weight > 0 else 0.0
    )

    return {
        'signal': round(avg_sentiment, 4),
        'confidence': round(min(total_weight / 5.0, 1.0), 4),
        'n_events': len(events)
    }
```

---

## 8. Machine Learning Strategies (Preview of Chapter 11)

### 8.1 Feature Engineering for Alpha

```
Feature Engineering Pipeline:

Raw Data                    Engineered Features              Alpha Signal
+------------------+        +------------------------+       +----------+
| Price/Volume     | -----> | Momentum (5d, 20d, 60d)|       |          |
| Fundamentals     |        | Volatility (realized)  |       |  ML      |
| Order Book       | -----> | Microstructure features |-----> |  Model   |
| News/Sentiment   |        | Sentiment scores       |       |  (XGB,   |
| Macro Data       | -----> | Yield curve features   |       |  LSTM,   |
| Alternative Data |        | Satellite/social media |       |  etc.)   |
+------------------+        +------------------------+       +----------+
                                                                  |
                                                                  v
                                                            Trading Signal
                                                            [-1, +1]

Common Feature Categories:

  1. Price-based:   Returns, MA ratios, RSI, MACD, Bollinger %B
  2. Volume-based:  Volume ratios, VWAP deviation, OBV
  3. Volatility:    Realized vol, implied vol, vol-of-vol
  4. Fundamental:   P/E, P/B, EV/EBITDA, earnings surprise
  5. Microstructure: Spread, depth, order imbalance, VPIN
  6. Sentiment:     News sentiment, social media, analyst revisions
  7. Alternative:   Satellite imagery, credit card data, web traffic

CRITICAL: Feature engineering is 80% of ML alpha.
The model architecture matters far less than the features.
```

### 8.2 Ensemble Methods for Signal Combination

```
Ensemble Approach to Alpha Combination:

  Individual Signals:          Ensemble
  +--------+                   +--------------------+
  | Momentum Signal (0.6)   |  |                    |
  | Mean-Reversion (-0.3)   |  | Meta-Model         |
  | Sentiment (0.4)         |->| (Gradient Boosting) |-> Final Signal
  | Fundamental (0.2)       |  | Learns optimal      |    = 0.35
  | Micro-structure (0.1)   |  | combination weights |
  +--------+                   +--------------------+

  Why ensembles work:
    - Individual signals have low Sharpe (~0.3-0.5)
    - Combining uncorrelated signals: Sharpe_combined = Sharpe * sqrt(N)
    - 10 uncorrelated signals with Sharpe 0.3 each:
      Combined Sharpe ~ 0.3 * sqrt(10) ~ 0.95

  Signal Correlation Matrix (the LOWER the better):

              Mom   MR    Sent  Fund  Micro
  Momentum    1.00 -0.30  0.15  0.05  0.10
  Mean-Rev   -0.30  1.00 -0.05  0.20 -0.15
  Sentiment   0.15 -0.05  1.00  0.10  0.05
  Fundamental 0.05  0.20  0.10  1.00 -0.05
  Micro       0.10 -0.15  0.05 -0.05  1.00
```

### 8.3 Reinforcement Learning for Execution

```
RL for Optimal Execution:

  State:   [inventory, time_remaining, spread, volatility, order_imbalance]
  Action:  [aggressive_sell, passive_sell, hold, passive_buy, aggressive_buy]
  Reward:  Implementation shortfall (minimize slippage)

  +----------+     +---------+     +----------+
  | Market   | --> | RL Agent| --> | Action   |
  | State    |     | (DQN /  |     | (order   |
  | Obs.     |     |  PPO)   |     |  decision)|
  +----------+     +---------+     +----------+
       ^                                 |
       |                                 |
       +---------- Environment ----------+
                   (Market Sim)

  RL excels at execution because:
    1. The action space is discrete and manageable
    2. Reward (slippage) is immediate and measurable
    3. Environment can be simulated from historical data
    4. Non-stationary dynamics handled by online learning
```

### 8.4 Alternative Data

```
Alternative Data Ecosystem:

+------------------------+------------------+---------------------------+
| Data Type              | Source           | Alpha Signal              |
+------------------------+------------------+---------------------------+
| Satellite imagery      | Planet Labs,     | Parking lot fullness      |
|                        | Orbital Insight  | (retail sales proxy)      |
+------------------------+------------------+---------------------------+
| Credit card data       | Second Measure,  | Revenue estimates before  |
|                        | Envestnet Yodlee | earnings announcement     |
+------------------------+------------------+---------------------------+
| Social media           | Twitter/X,       | Sentiment shifts,         |
|                        | Reddit, StockTwits| retail flow prediction   |
+------------------------+------------------+---------------------------+
| Web traffic            | SimilarWeb,      | Company growth/decline    |
|                        | Alexa            | before it shows in        |
|                        |                  | financial statements      |
+------------------------+------------------+---------------------------+
| App downloads          | App Annie,       | User growth for tech      |
|                        | Sensor Tower     | companies                 |
+------------------------+------------------+---------------------------+
| Shipping/logistics     | MarineTraffic,   | Commodity supply chain    |
|                        | FlightAware      | disruptions               |
+------------------------+------------------+---------------------------+
| Patent filings         | USPTO            | Innovation pipeline       |
+------------------------+------------------+---------------------------+
| Job postings           | LinkedIn,        | Company expansion/        |
|                        | Indeed, Glassdoor| contraction signals       |
+------------------------+------------------+---------------------------+

  Alpha decay of alternative data:
    Year 1: Strong alpha (few users)
    Year 2: Alpha decays as more funds subscribe
    Year 3-5: Alpha largely arbitraged away
    --> Must constantly find NEW alternative data sources
```

---

## 9. Strategy Evaluation Metrics

### 9.1 Core Performance Metrics

```
+-------------------+--------------------------------------------+------------------+
| Metric            | Formula                                    | Good Value       |
+-------------------+--------------------------------------------+------------------+
| Sharpe Ratio      | (Annualized Return - Rf) / Ann. Volatility | > 1.0 (great >2)|
| Sortino Ratio     | (Ann. Return - Rf) / Downside Deviation    | > 1.5            |
| Calmar Ratio      | Ann. Return / |Max Drawdown|               | > 1.0            |
| Max Drawdown      | Largest peak-to-trough decline             | < 20%            |
| Win Rate          | # Winning Trades / # Total Trades          | > 50%            |
| Profit Factor     | Gross Profit / Gross Loss                  | > 1.5            |
| Information Ratio | Alpha / Tracking Error                     | > 0.5            |
| Omega Ratio       | sum(gains) / sum(losses) above threshold   | > 1.0            |
| Turnover          | Total traded / Average AUM (annualized)    | Strategy dep.    |
+-------------------+--------------------------------------------+------------------+
```

### 9.2 Detailed Metric Calculations

```python
def compute_strategy_metrics(returns: pd.Series,
                              risk_free_rate: float = 0.04,
                              periods_per_year: int = 252) -> dict:
    """
    Compute comprehensive strategy evaluation metrics.

    Parameters
    ----------
    returns : pd.Series
        Daily strategy returns.
    risk_free_rate : float
        Annual risk-free rate.
    periods_per_year : int
        Trading days per year.

    Returns
    -------
    dict
        Dictionary of performance metrics.
    """
    # Annualized return and volatility
    total_days = len(returns)
    total_return = (1 + returns).prod() - 1
    ann_return = (1 + total_return) ** (periods_per_year / total_days) - 1
    ann_vol = returns.std() * np.sqrt(periods_per_year)

    # Sharpe ratio
    daily_rf = (1 + risk_free_rate) ** (1 / periods_per_year) - 1
    excess = returns - daily_rf
    sharpe = (
        excess.mean() / excess.std() * np.sqrt(periods_per_year)
        if excess.std() > 0 else 0
    )

    # Sortino ratio (only downside deviation)
    downside = excess[excess < 0]
    downside_std = np.sqrt((downside ** 2).mean()) * np.sqrt(periods_per_year)
    sortino = (ann_return - risk_free_rate) / downside_std if downside_std > 0 else 0

    # Maximum drawdown
    cumulative = (1 + returns).cumprod()
    rolling_max = cumulative.cummax()
    drawdown = (cumulative - rolling_max) / rolling_max
    max_drawdown = drawdown.min()

    # Calmar ratio
    calmar = ann_return / abs(max_drawdown) if max_drawdown != 0 else 0

    # Win rate
    winning = (returns > 0).sum()
    total_trades = (returns != 0).sum()
    win_rate = winning / total_trades if total_trades > 0 else 0

    # Profit factor
    gross_profit = returns[returns > 0].sum()
    gross_loss = abs(returns[returns < 0].sum())
    profit_factor = gross_profit / gross_loss if gross_loss > 0 else float('inf')

    # Omega ratio (threshold = 0)
    gains = returns[returns > 0].sum()
    losses = abs(returns[returns < 0].sum())
    omega = gains / losses if losses > 0 else float('inf')

    # Maximum drawdown duration (in days)
    dd_end = drawdown.idxmin()
    dd_start_candidates = cumulative.loc[:dd_end]
    dd_start = dd_start_candidates.idxmax()
    recovery_candidates = cumulative.loc[dd_end:]
    recovered = recovery_candidates[
        recovery_candidates >= cumulative.loc[dd_start]
    ]
    if len(recovered) > 0:
        dd_duration = (recovered.index[0] - dd_start).days
    else:
        dd_duration = (cumulative.index[-1] - dd_start).days

    return {
        'total_return': round(total_return * 100, 2),
        'annual_return': round(ann_return * 100, 2),
        'annual_volatility': round(ann_vol * 100, 2),
        'sharpe_ratio': round(sharpe, 3),
        'sortino_ratio': round(sortino, 3),
        'calmar_ratio': round(calmar, 3),
        'max_drawdown': round(max_drawdown * 100, 2),
        'max_dd_duration_days': dd_duration,
        'win_rate': round(win_rate * 100, 2),
        'profit_factor': round(profit_factor, 3),
        'omega_ratio': round(omega, 3),
        'total_trades': int(total_trades),
        'best_day': round(returns.max() * 100, 2),
        'worst_day': round(returns.min() * 100, 2),
        'skewness': round(returns.skew(), 3),
        'kurtosis': round(returns.kurtosis(), 3)
    }
```

### 9.3 Interpreting Metrics Together

```
Metric Interpretation Framework:

  Scenario 1: High Sharpe, High Drawdown
  +--------------------------------------------------+
  | Sharpe: 2.5  |  MaxDD: -35%  |  Calmar: 0.7     |
  | Interpretation: Good risk-adjusted returns BUT    |
  | tail risk is significant. Strategy is leveraged   |
  | or has fat-tailed return distribution.             |
  | Action: Reduce leverage or add tail hedges.       |
  +--------------------------------------------------+

  Scenario 2: Low Sharpe, Low Drawdown
  +--------------------------------------------------+
  | Sharpe: 0.5  |  MaxDD: -5%   |  Calmar: 2.0     |
  | Interpretation: Conservative strategy. Returns    |
  | are modest but very stable. Good for combining    |
  | with higher-returning strategies.                  |
  | Action: Can lever up to improve returns.          |
  +--------------------------------------------------+

  Scenario 3: High Win Rate, Low Profit Factor
  +--------------------------------------------------+
  | Win Rate: 85%  |  Profit Factor: 1.1             |
  | Interpretation: Many small wins, few big losses.  |
  | Classic short-volatility or mean-reversion        |
  | profile. The 15% of losses are LARGE.             |
  | Action: Focus on loss management and stop losses. |
  +--------------------------------------------------+

  Scenario 4: Low Win Rate, High Profit Factor
  +--------------------------------------------------+
  | Win Rate: 30%  |  Profit Factor: 3.0             |
  | Interpretation: Trend-following profile.          |
  | Most trades lose a little, few trades win BIG.    |
  | Psychologically difficult to trade.               |
  | Action: Diversify across many markets.            |
  +--------------------------------------------------+
```

### 9.4 Turnover and Capacity

```
Strategy Capacity Analysis:

  Capacity = Max AUM before returns degrade significantly

  Capacity depends on:
    1. Turnover (how often you trade)
    2. Liquidity of instruments
    3. Market impact of your trades

  Capacity Estimation:

    Daily_Turnover_$ = AUM * Annual_Turnover / 252
    Market_Impact = Daily_Turnover_$ / ADV * Impact_Coefficient

    Rule of thumb: You should trade < 1% of ADV per stock per day.

  +---------------------+----------+-----------+-------------------+
  | Strategy Type       | Turnover | Capacity  | Market Impact     |
  +---------------------+----------+-----------+-------------------+
  | HFT Market Making   | >1000x   | $50M      | High (but short)  |
  | Stat Arb (daily)    | 50-200x  | $500M     | Moderate          |
  | Momentum (monthly)  | 3-12x    | $5B       | Low               |
  | Value (quarterly)   | 0.5-2x   | $50B+     | Very low          |
  +---------------------+----------+-----------+-------------------+

  Alpha vs. AUM Relationship:

  Alpha (%)
    5% |*
    4% | *
    3% |  *
    2% |   **
    1% |     ****
    0% |         ********
       +-----------------------> AUM ($)
       $1M  $10M  $100M  $1B  $10B

  As AUM grows, market impact increases, alpha shrinks.
```

---

## 10. Strategy Lifecycle

### 10.1 From Idea to Live Trading

```
Strategy Development Lifecycle:

+----------+     +----------+     +-----------+     +--------+     +------+
| 1. Idea  | --> | 2. Resear| --> | 3. Back-  | --> | 4. Paper| --> |5.Live|
| Generate |     |    ch    |     |    test   |     |   Trade |     |      |
+----------+     +----------+     +-----------+     +--------+     +------+
     |                |                |                 |              |
     v                v                v                 v              v
  Read papers     Explore data    Walk-forward      Simulate with   Start with
  Observe markets  Test hypothesis  Cross-validate  live data feed  small size
  Talk to traders  Build model    Realistic costs   No real money   Scale up
  Brainstorm      Statistical     Regime analysis   Verify fills    Monitor
                  significance                      Match backtest  Continuously

Kill Gates (decision points):

  Gate 1: Does the idea have economic rationale?
          NO --> Kill (no data mining!)

  Gate 2: Is the effect statistically significant (p < 0.01)?
          NO --> Kill (likely noise)

  Gate 3: Does backtest survive transaction costs?
          NO --> Kill (not implementable)

  Gate 4: Does paper trading match backtest expectations?
          NO --> Kill (model error or market change)

  Gate 5: Is live performance within expected range?
          Watch for 3-6 months. If Sharpe < 50% of backtest Sharpe,
          investigate. If 0% after 1 year, consider shutting down.
```

### 10.2 Alpha Decay: Why Strategies Stop Working

```
Alpha Decay Mechanisms:

  +-------------------------------------------------------------------+
  |                         Alpha Lifecycle                            |
  +-------------------------------------------------------------------+
  |                                                                   |
  | Alpha                                                              |
  | (Sharpe)                                                           |
  |  3.0 |  ***                                                        |
  |      |      ***                                                    |
  |  2.0 |         *** Discovery &                                     |
  |      |            *** Exploitation                                 |
  |  1.0 |               ***                                           |
  |      |                  *** Crowding begins                        |
  |  0.5 |                     ***                                     |
  |      |                        *** Widely known                     |
  |  0.0 |----------------------------***------                        |
  |      |                               ***  Strategy is dead         |
  | -0.5 |                                  ***                        |
  |      +---------------------------------------------------> Time   |
  |       Year 0    Year 2    Year 5    Year 8    Year 10+             |
  +-------------------------------------------------------------------+

Sources of Alpha Decay:

  1. COMPETITION: Other quants discover the same signal
     - Academic publication
     - Employee turnover (quants move between firms)
     - Reverse engineering from public data

  2. STRUCTURAL CHANGE: The market condition that created
     the opportunity disappears
     - Regulation changes (Reg NMS, MiFID II)
     - Technology changes (electronic trading)
     - Market structure evolution

  3. BEHAVIORAL ADAPTATION: Market participants learn
     - Investors correct biases over time
     - Media coverage of anomalies

  4. REGIME CHANGE: The macro environment shifts
     - Interest rate regime change
     - Volatility regime change
     - Correlation regime change
```

### 10.3 Strategy Diversification

```
Portfolio of Strategies:

  Strategy      Sharpe   Correlation Matrix          Weight
  --------      ------   ----------------------      ------
  Momentum       0.6     1.0  -0.2   0.1   0.0       25%
  Mean Rev       0.5    -0.2   1.0  -0.1   0.1       25%
  Stat Arb       0.8     0.1  -0.1   1.0   0.2       30%
  Event          0.4     0.0   0.1   0.2   1.0       20%

  Combined Sharpe (assuming avg correlation = 0):
    Sharpe_combined = sqrt( sum(w_i^2 * SR_i^2) + 2*sum(w_i*w_j*rho*SR_i*SR_j) )

  With low correlations:
    Combined Sharpe ~ 0.9 - 1.2 (much better than any individual)

  Diversification Benefits:

  Combined       Individual strategies
  drawdown       might have drawdowns at
  is much        different times:
  smoother
                 Strat A: ____/\____/\/\__/\____
                 Strat B: __/\/\________/\_/\___
                 Strat C: _/\____/\________/\___
                 Combined: _____________________ (smoother)
```

### 10.4 When to Turn Off a Strategy

```
Strategy Monitoring Dashboard:

  +--------------------------------------------------------------+
  |  STRATEGY: Momentum_US_Equities_v3                           |
  +--------------------------------------------------------------+
  |                                                              |
  |  STATUS:  [YELLOW] -- Under Review                           |
  |                                                              |
  |  Rolling Metrics (6-month):                                  |
  |    Sharpe:        0.35  (Backtest: 1.20)  [RED]              |
  |    Max DD:       -18%   (Backtest: -12%)  [YELLOW]           |
  |    Win Rate:      42%   (Backtest: 55%)   [YELLOW]           |
  |    Turnover:     8.2x   (Backtest: 7.5x)  [GREEN]           |
  |    Correlation:   0.15  (to backtest)      [RED]             |
  |                                                              |
  +--------------------------------------------------------------+

Decision Framework:

  +-------------------------------------------------------------------+
  |  Condition                        | Action                        |
  +-------------------------------------------------------------------+
  |  Sharpe < 50% of backtest         | Investigate. Reduce size      |
  |  for 6 months                     | by 50%.                       |
  +-------------------------------------------------------------------+
  |  Sharpe < 0 for 12 months         | Shut down. Archive code.      |
  |                                   | Reallocate capital.           |
  +-------------------------------------------------------------------+
  |  Max DD exceeds 1.5x backtest     | Emergency: reduce to 25%      |
  |  max DD                           | size. Full review.            |
  +-------------------------------------------------------------------+
  |  Market regime clearly changed    | Pause strategy. Research      |
  |  (e.g., rate hike cycle)          | new parameters.               |
  +-------------------------------------------------------------------+
  |  Regulatory change affects        | Full legal review.            |
  |  strategy mechanics               | May need to shut down.        |
  +-------------------------------------------------------------------+

  The hardest part: distinguishing between
    (a) normal drawdown (stay the course)
    (b) alpha decay (shut down)

  Statistical test: Is current performance within the 95% confidence
  interval of backtest performance? If not, something has changed.
```

---

## Summary: Strategy Selection Guide

```
+-------------------+--------+--------+----------+---------+------------+
| Strategy          | Sharpe | Hold   | Capacity | Skill   | Best For   |
|                   | (typ.) | Period |          | Level   |            |
+-------------------+--------+--------+----------+---------+------------+
| Momentum          | 0.4-0.8| Weeks  | $1B+     | Medium  | CTA funds  |
|                   |        | Months |          |         |            |
+-------------------+--------+--------+----------+---------+------------+
| Mean Reversion    | 0.5-1.0| Days   | $100M    | Medium  | Short-term |
|                   |        | Weeks  |          |         | traders    |
+-------------------+--------+--------+----------+---------+------------+
| Stat Arb          | 0.8-2.0| Days   | $500M    | High    | Quant funds|
|                   |        | Weeks  |          |         |            |
+-------------------+--------+--------+----------+---------+------------+
| Factor Investing  | 0.3-0.6| Months | $10B+    | Medium  | Asset mgrs |
|                   |        | Years  |          |         |            |
+-------------------+--------+--------+----------+---------+------------+
| Pure Arbitrage    | 2.0+   | Sec    | $50M     | Extreme | HFT firms  |
|                   |        | Min    |          |         |            |
+-------------------+--------+--------+----------+---------+------------+
| Market Making     | 1.0-3.0| Sec    | $200M    | Extreme | Prop shops |
|                   |        | Min    |          |         |            |
+-------------------+--------+--------+----------+---------+------------+
| Event-Driven      | 0.5-1.0| Days   | $1B+     | High    | Hedge funds|
|                   |        | Months |          |         |            |
+-------------------+--------+--------+----------+---------+------------+
| ML-Based          | 0.5-2.0| Varies | Varies   | Extreme | Research   |
|                   |        |        |          |         | teams      |
+-------------------+--------+--------+----------+---------+------------+

Starting point for different profiles:

  Retail trader with Python skills:
    --> Mean reversion + Momentum on liquid ETFs

  Junior quant at a fund:
    --> Factor investing + Statistical arbitrage

  PhD researcher:
    --> ML strategies + Alternative data

  C++ developer at prop shop:
    --> Market making + HFT arbitrage
```

---

## Key Takeaways

1. **No single strategy works forever.** Alpha decays as competition increases.
   The solution is diversification across multiple uncorrelated strategies.

2. **Economic rationale first.** Every strategy must have a reason WHY it works.
   Data mining without theory produces strategies that fail out of sample.

3. **Transaction costs matter.** A strategy with a 2.0 backtest Sharpe can
   have a 0.5 live Sharpe after accounting for slippage, commissions, and
   market impact.

4. **Risk management is the strategy.** Position sizing, stop losses, and
   drawdown controls determine survival more than signal quality.

5. **Implementation complexity scales with frequency.** Monthly rebalancing
   factor portfolios require spreadsheets. HFT market making requires
   FPGA hardware and co-location. Know your edge and stay within your
   operational capacity.

6. **Combine uncorrelated strategies.** The Sharpe ratio of a portfolio
   of uncorrelated strategies grows with the square root of the number
   of strategies. This is the single most important insight in
   quantitative portfolio management.

---

## Next Chapter Preview

**Chapter 8: Backtesting Frameworks** will cover how to rigorously test
these strategies before risking real capital. Topics include:

- Event-driven vs. vectorized backtesting
- Walk-forward analysis
- Overfitting detection (combinatorial purged cross-validation)
- Realistic transaction cost modeling
- Framework comparison (Zipline, Backtrader, VectorBT, custom)
