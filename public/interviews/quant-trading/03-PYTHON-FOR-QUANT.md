# Chapter 3: Python for Quantitative Trading

## Why This Chapter Exists

You can understand every theorem in stochastic calculus and still be unemployable as a quant if you cannot translate ideas into working code. Python is the lingua franca of quantitative finance. It is where research happens, where strategies are prototyped, where data is cleaned, and increasingly where production trading systems run.

This chapter takes you from "I know some Python" to "I can build a complete quantitative research pipeline." We cover NumPy, Pandas, data acquisition, statistical modeling, visualization, and performance optimization -- each taught through the lens of real trading problems.

```
+------------------------------------------------------------------------+
|              PYTHON FOR QUANT FINANCE - CHAPTER MAP                     |
+------------------------------------------------------------------------+
|                                                                        |
|  1. WHY PYTHON           2. NUMPY MASTERY                              |
|  +------------------+    +---------------------------+                 |
|  | Ecosystem        |    | ndarray & vectorization   |                 |
|  | Python vs C++    |--->| Broadcasting & linalg     |                 |
|  | Workflow role     |    | Random generation         |                 |
|  +------------------+    | Performance & memory      |                 |
|                          +---------------------------+                 |
|                                    |                                   |
|                                    v                                   |
|  3. PANDAS FOR FINANCE   4. DATA ACQUISITION                           |
|  +------------------+    +---------------------------+                 |
|  | Series/DataFrame |    | yfinance, datareader      |                 |
|  | DatetimeIndex    |--->| REST APIs (Polygon, AV)   |                 |
|  | Rolling windows  |    | Corporate actions         |                 |
|  | GroupBy & merge  |    | Local data stores         |                 |
|  +------------------+    | WebSocket streaming       |                 |
|                          +---------------------------+                 |
|           |                        |                                   |
|           v                        v                                   |
|  5. STATISTICAL ANALYSIS  6. VISUALIZATION                             |
|  +------------------+    +---------------------------+                 |
|  | SciPy & stats    |    | Matplotlib & Plotly       |                 |
|  | OLS regression   |--->| Candlesticks & heatmaps   |                 |
|  | ARIMA            |    | Equity curves             |                 |
|  | Cointegration    |    | Drawdown charts           |                 |
|  +------------------+    +---------------------------+                 |
|                                    |                                   |
|                                    v                                   |
|  7. PERFORMANCE               8. PROJECTS                              |
|  +------------------+    +---------------------------+                 |
|  | Profiling        |    | S&P 500 analysis          |                 |
|  | Numba & Cython   |--->| MA crossover signals      |                 |
|  | Multiprocessing  |    | Pairs trading scanner     |                 |
|  | When to use C++  |    | Factor model              |                 |
|  +------------------+    +---------------------------+                 |
|                                                                        |
+------------------------------------------------------------------------+
```

---

## 1. Why Python for Quant Finance

### 1.1 The Ecosystem

Python dominates quantitative finance for one reason: the ecosystem. No other language comes close to the breadth and depth of libraries available for numerical computing, data analysis, machine learning, and financial modeling.

```
+------------------------------------------------------------------------+
|              THE PYTHON QUANT ECOSYSTEM                                  |
+------------------------------------------------------------------------+
|                                                                        |
|  LAYER 4: DOMAIN-SPECIFIC                                              |
|  +------------------------------------------------------------+       |
|  | zipline | backtrader | QuantLib | pyfolio | alphalens       |       |
|  +------------------------------------------------------------+       |
|                          |                                             |
|  LAYER 3: MACHINE LEARNING & STATS                                     |
|  +------------------------------------------------------------+       |
|  | scikit-learn | statsmodels | tensorflow | pytorch | xgboost |       |
|  +------------------------------------------------------------+       |
|                          |                                             |
|  LAYER 2: DATA ANALYSIS                                                |
|  +------------------------------------------------------------+       |
|  | pandas | scipy | matplotlib | plotly | seaborn              |       |
|  +------------------------------------------------------------+       |
|                          |                                             |
|  LAYER 1: NUMERICAL FOUNDATION                                         |
|  +------------------------------------------------------------+       |
|  | numpy (C/Fortran core) | numba (JIT) | cython              |       |
|  +------------------------------------------------------------+       |
|                          |                                             |
|  LAYER 0: PYTHON RUNTIME                                               |
|  +------------------------------------------------------------+       |
|  | CPython interpreter | C extensions API                      |       |
|  +------------------------------------------------------------+       |
|                                                                        |
+------------------------------------------------------------------------+
```

The key insight: **Python is slow, but Python code that calls C is fast.** NumPy, Pandas, and scikit-learn are all thin Python wrappers around highly optimized C and Fortran routines. When you multiply two NumPy arrays, you are not running Python -- you are running compiled BLAS (Basic Linear Algebra Subprograms) routines that have been optimized for decades.

### 1.2 Python vs C++: When to Use Which

This is one of the most common questions in quant interviews.

```
+----------------------------+----------------------------+
|         PYTHON             |           C++              |
+----------------------------+----------------------------+
| Research & prototyping     | Production execution       |
| Strategy backtesting       | Ultra-low latency (<10us)  |
| Data analysis & cleaning   | HFT order management       |
| Risk reporting             | Exchange connectivity      |
| Machine learning models    | FPGA/kernel-bypass systems |
| Rapid iteration            | Deterministic latency      |
| Small to mid-frequency     | Tick-by-tick processing    |
|   trading (>100ms)         |   (<1ms)                   |
+----------------------------+----------------------------+
|                                                         |
|  DECISION RULE:                                         |
|  - Latency < 1ms required?        --> C++               |
|  - Research / prototyping phase?   --> Python            |
|  - ML model training?             --> Python             |
|  - Signal generation (>100ms)?    --> Python is fine     |
|  - Order execution in HFT?        --> C++                |
|  - One-off analysis?              --> Always Python      |
|                                                         |
+----------------------------+----------------------------+
```

**The hybrid approach** is what most firms actually use:

```
  Research (Python)          Production (C++ or Python)
  +------------------+      +------------------+
  | Jupyter notebook |      | C++ execution    |
  | Explore data     |      | engine           |
  | Test hypotheses  | ---> |                  |
  | Backtest         |      | OR               |
  | Validate         |      |                  |
  +------------------+      | Python + Numba   |
                             | for mid-freq     |
                             +------------------+
                                     |
                             +------------------+
                             | Exchange         |
                             | connectivity     |
                             +------------------+
```

### 1.3 Python's Role in the Quant Workflow

```
  DATA           RESEARCH        BACKTEST        PRODUCTION
  PIPELINE       PHASE           PHASE           PHASE

  +--------+    +----------+    +----------+    +-----------+
  | Ingest |    | Explore  |    | Simulate |    | Execute   |
  | Clean  |--->| Hypothe- |--->| Validate |--->| Monitor   |
  | Store  |    | size     |    | Stress   |    | Report    |
  +--------+    +----------+    | test     |    +-----------+
                                +----------+

  Tools:         Tools:          Tools:          Tools:
  - pandas       - numpy         - zipline       - asyncio
  - sqlalchemy   - scipy         - backtrader    - websockets
  - yfinance     - statsmodels   - custom        - REST APIs
  - websockets   - sklearn       - pyfolio       - logging
  - arctic       - jupyter       - matplotlib    - monitoring
```

Every phase except the innermost execution loop of high-frequency trading is Python-dominated at most quant firms.

---

## 2. NumPy Mastery

NumPy is the foundation of everything in scientific Python. If Pandas is the car, NumPy is the engine. Understanding NumPy deeply is non-negotiable for quant work.

### 2.1 The ndarray: Memory and Structure

```python
import numpy as np

# Creating arrays
prices = np.array([100.0, 101.5, 99.8, 102.3, 101.0])
returns = np.diff(prices) / prices[:-1]

print(f"Prices:  {prices}")
print(f"Returns: {returns}")
print(f"Shape:   {prices.shape}")
print(f"Dtype:   {prices.dtype}")
print(f"Strides: {prices.strides}")  # bytes between elements
```

The `strides` attribute reveals how NumPy stores data in memory:

```
  MEMORY LAYOUT OF A 1D ARRAY (float64 = 8 bytes each)

  Address:  0x00   0x08   0x10   0x18   0x20
            +------+------+------+------+------+
  Values:   |100.0 |101.5 | 99.8 |102.3 |101.0 |
            +------+------+------+------+------+
  Index:      [0]    [1]    [2]    [3]    [4]

  Stride = 8 bytes (one float64)
  Contiguous in memory --> CPU cache friendly --> FAST


  2D ARRAY MEMORY LAYOUT (Row-major / C-order)

  Array:  [[1, 2, 3],        Memory: [1][2][3][4][5][6]
           [4, 5, 6]]
                              Row 0         Row 1
  Strides: (24, 8)           <-----------> <---------->
  - 24 bytes to next row (3 elements * 8 bytes)
  - 8 bytes to next column (1 element * 8 bytes)


  Column-major (Fortran-order)

  Array:  [[1, 2, 3],        Memory: [1][4][2][5][3][6]
           [4, 5, 6]]
                              Col 0   Col 1   Col 2
  Strides: (8, 16)           <-----> <-----> <----->
```

**Why this matters for quant work:** When iterating over time series (rows), C-order is optimal. When iterating over assets (columns), Fortran-order is faster. Most financial data is time x assets, so C-order (the default) is usually correct.

```python
# C-order vs Fortran-order
data_c = np.array([[1, 2, 3], [4, 5, 6]], order='C')
data_f = np.array([[1, 2, 3], [4, 5, 6]], order='F')

print(f"C-order strides: {data_c.strides}")   # (24, 8)
print(f"F-order strides: {data_f.strides}")   # (8, 16)
```

### 2.2 Vectorized Operations

The single most important concept in NumPy is vectorization: replacing Python loops with array operations that execute in compiled C.

```python
import numpy as np
import time

# Generate synthetic price data: 1000 assets, 252 trading days
np.random.seed(42)
n_assets = 1000
n_days = 252
prices = 100 * np.cumprod(1 + np.random.normal(0.0003, 0.02, (n_days, n_assets)), axis=0)

# ---- METHOD 1: Python loops (SLOW) ----
def compute_returns_loop(prices):
    n_days, n_assets = prices.shape
    returns = np.empty((n_days - 1, n_assets))
    for t in range(n_days - 1):
        for a in range(n_assets):
            returns[t, a] = (prices[t + 1, a] - prices[t, a]) / prices[t, a]
    return returns

# ---- METHOD 2: Vectorized (FAST) ----
def compute_returns_vectorized(prices):
    return (prices[1:] - prices[:-1]) / prices[:-1]

# Timing comparison
start = time.perf_counter()
ret_loop = compute_returns_loop(prices)
time_loop = time.perf_counter() - start

start = time.perf_counter()
ret_vec = compute_returns_vectorized(prices)
time_vec = time.perf_counter() - start

print(f"Loop:       {time_loop:.4f}s")
print(f"Vectorized: {time_vec:.6f}s")
print(f"Speedup:    {time_loop / time_vec:.0f}x")
print(f"Results match: {np.allclose(ret_loop, ret_vec)}")

# Typical output:
# Loop:       0.3500s
# Vectorized: 0.000800s
# Speedup:    437x
# Results match: True
```

### 2.3 Broadcasting

Broadcasting allows NumPy to operate on arrays of different shapes without copying data.

```
  BROADCASTING RULES:

  1. If arrays have different ndim, prepend 1s to the smaller shape
  2. Dimensions of size 1 are stretched to match the other array
  3. If dimensions differ and neither is 1, raise an error

  Example: subtract mean return from each asset

  returns shape:     (251, 1000)    <-- 251 days, 1000 assets
  mean_returns shape:       (1000,) <-- mean for each asset

  Step 1: Pad mean_returns --> (1, 1000)
  Step 2: Stretch dim 0    --> (251, 1000)  (virtual, no copy)
  Step 3: Element-wise subtraction

  +-------------------+       +-------------------+
  | returns           |       | mean_returns      |
  | (251, 1000)       |  -    | (1, 1000)         |
  |                   |       | broadcast to      |
  |                   |       | (251, 1000)       |
  +-------------------+       +-------------------+
```

```python
# Demean returns (subtract each asset's mean)
returns = compute_returns_vectorized(prices)
mean_returns = returns.mean(axis=0)             # shape: (1000,)
demeaned = returns - mean_returns               # broadcasting!

# Standardize returns (z-score each asset)
std_returns = returns.std(axis=0)
z_scores = (returns - mean_returns) / std_returns  # double broadcast

print(f"Demeaned mean (should be ~0): {demeaned.mean(axis=0)[:5]}")
print(f"Z-score std (should be ~1):   {z_scores.std(axis=0)[:5]}")
```

### 2.4 Linear Algebra with np.linalg

Portfolio optimization, factor models, and PCA all require linear algebra.

```python
# --- Portfolio Returns Example: 1000 Assets ---

# Simulated daily returns for 5 assets (for clarity)
np.random.seed(42)
n_assets_demo = 5
n_days_demo = 252

# Expected annual returns and covariance
expected_returns = np.array([0.10, 0.12, 0.08, 0.15, 0.09])
cov_annual = np.array([
    [0.04, 0.006, 0.002, 0.008, 0.003],
    [0.006, 0.09, 0.004, 0.012, 0.005],
    [0.002, 0.004, 0.01, 0.003, 0.002],
    [0.008, 0.012, 0.003, 0.16, 0.007],
    [0.003, 0.005, 0.002, 0.007, 0.025],
])

# Equal-weight portfolio
weights = np.ones(n_assets_demo) / n_assets_demo

# Portfolio expected return: w^T * mu
port_return = weights @ expected_returns
print(f"Portfolio expected return: {port_return:.4f}")  # 10.8%

# Portfolio variance: w^T * Sigma * w
port_variance = weights @ cov_annual @ weights
port_vol = np.sqrt(port_variance)
print(f"Portfolio volatility: {port_vol:.4f}")          # ~12.5%
print(f"Sharpe ratio (rf=2%): {(port_return - 0.02) / port_vol:.4f}")

# --- Eigendecomposition for PCA ---
eigenvalues, eigenvectors = np.linalg.eigh(cov_annual)

# Sort by descending eigenvalue
idx = np.argsort(eigenvalues)[::-1]
eigenvalues = eigenvalues[idx]
eigenvectors = eigenvectors[:, idx]

# Variance explained
variance_explained = eigenvalues / eigenvalues.sum()
cumulative = np.cumsum(variance_explained)
print(f"\nPCA Variance Explained:")
for i, (ve, cum) in enumerate(zip(variance_explained, cumulative)):
    bar = "#" * int(ve * 50)
    print(f"  PC{i+1}: {ve:.3f} (cum: {cum:.3f}) {bar}")

# --- Cholesky decomposition (for simulation) ---
L = np.linalg.cholesky(cov_annual)
# Generate correlated random returns
z = np.random.standard_normal((n_days_demo, n_assets_demo))
correlated_returns = z @ L.T  # each row is one day of correlated returns

# --- Solve linear system (for minimum variance portfolio) ---
# min w^T Sigma w  s.t.  1^T w = 1
# Solution: w = Sigma^{-1} 1 / (1^T Sigma^{-1} 1)
ones = np.ones(n_assets_demo)
inv_cov = np.linalg.inv(cov_annual)
min_var_weights = inv_cov @ ones / (ones @ inv_cov @ ones)
print(f"\nMinimum variance weights: {min_var_weights.round(4)}")
print(f"Min var portfolio vol: {np.sqrt(min_var_weights @ cov_annual @ min_var_weights):.4f}")
```

### 2.5 Random Number Generation

Monte Carlo simulation is central to quant finance. NumPy's random module is your primary tool.

```python
# Modern NumPy random: use Generator (not legacy np.random)
rng = np.random.default_rng(seed=42)

# Geometric Brownian Motion simulation
S0 = 100.0          # initial price
mu = 0.08            # drift (annual)
sigma = 0.20         # volatility (annual)
T = 1.0              # time horizon (years)
n_steps = 252        # trading days
n_paths = 10000      # simulation paths
dt = T / n_steps

# Generate all random increments at once
z = rng.standard_normal((n_steps, n_paths))

# Vectorized GBM: S(t+dt) = S(t) * exp((mu - 0.5*sigma^2)*dt + sigma*sqrt(dt)*Z)
drift = (mu - 0.5 * sigma**2) * dt
diffusion = sigma * np.sqrt(dt) * z
log_returns = drift + diffusion
log_prices = np.concatenate([np.zeros((1, n_paths)), np.cumsum(log_returns, axis=0)])
price_paths = S0 * np.exp(log_prices)

print(f"Final price statistics across {n_paths} paths:")
final_prices = price_paths[-1, :]
print(f"  Mean:   ${final_prices.mean():.2f}")
print(f"  Median: ${final_prices.median() if hasattr(final_prices, 'median') else np.median(final_prices):.2f}")
print(f"  Std:    ${final_prices.std():.2f}")
print(f"  5th %%:  ${np.percentile(final_prices, 5):.2f}")
print(f"  95th %%: ${np.percentile(final_prices, 95):.2f}")
```

---

## 3. Pandas for Financial Data

Pandas is built on NumPy but adds labeled axes, time series functionality, and data alignment. It is the tool you will use most in day-to-day quant research.

### 3.1 Series and DataFrame Basics

```python
import pandas as pd
import numpy as np

# A Series is a labeled 1D array
prices = pd.Series(
    [100.0, 101.5, 99.8, 102.3, 101.0],
    index=pd.date_range("2024-01-02", periods=5, freq="B"),
    name="AAPL"
)
print(prices)

# A DataFrame is a dictionary of Series sharing an index
data = {
    "AAPL": [100.0, 101.5, 99.8, 102.3, 101.0],
    "GOOGL": [140.0, 141.2, 139.5, 142.0, 141.8],
    "MSFT": [370.0, 372.5, 368.0, 375.0, 373.0],
}
df = pd.DataFrame(
    data,
    index=pd.date_range("2024-01-02", periods=5, freq="B")
)
print(df)
```

### 3.2 DatetimeIndex and Time Series Operations

```python
# Create a proper DatetimeIndex
dates = pd.date_range("2020-01-01", "2024-12-31", freq="B")  # Business days
print(f"Trading days: {len(dates)}")

# Slicing with dates (inclusive on both ends)
subset = df.loc["2024-01-03":"2024-01-04"]

# Shifting (for return calculations)
returns = df.pct_change()           # (P_t - P_{t-1}) / P_{t-1}
log_returns = np.log(df / df.shift(1))  # ln(P_t / P_{t-1})
```

### 3.3 Resampling: Tick to 1min to Daily

Real market data arrives at irregular intervals. Resampling converts between frequencies.

```
  RESAMPLING PIPELINE

  Tick Data (irregular)          1-Minute Bars              Daily Bars
  +-------------------+         +----------------+         +-------------+
  | 09:30:00.123 100.1|         | 09:30  O:100.1 |         | 2024-01-02  |
  | 09:30:00.456 100.2|  --->   |        H:100.3 |  --->   |   O: 100.1  |
  | 09:30:00.789 100.0|  agg    |        L:100.0 |  agg    |   H: 103.5  |
  | 09:30:01.012 100.3|         |        C:100.3 |         |   L:  99.8  |
  | ...                |         |        V:1523  |         |   C: 102.3  |
  | 16:00:00.000 102.3|         | ...            |         |   V: 5.2M   |
  +-------------------+         +----------------+         +-------------+
```

```python
# Simulate tick data
np.random.seed(42)
n_ticks = 50000
tick_times = pd.date_range(
    "2024-01-02 09:30:00", periods=n_ticks, freq="200ms"
)
tick_prices = 100 + np.cumsum(np.random.normal(0, 0.01, n_ticks))
tick_volumes = np.random.randint(1, 100, n_ticks)

ticks = pd.DataFrame({
    "price": tick_prices,
    "volume": tick_volumes
}, index=tick_times)

# Resample to 1-minute OHLCV bars
bars_1min = ticks["price"].resample("1min").ohlc()
bars_1min["volume"] = ticks["volume"].resample("1min").sum()
print(bars_1min.head())

# Resample 1-minute to daily bars
bars_daily = pd.DataFrame({
    "open": bars_1min["open"].resample("D").first(),
    "high": bars_1min["high"].resample("D").max(),
    "low": bars_1min["low"].resample("D").min(),
    "close": bars_1min["close"].resample("D").last(),
    "volume": bars_1min["volume"].resample("D").sum(),
}).dropna()
print(bars_daily)
```

### 3.4 Rolling Windows: Moving Averages and Rolling Volatility

```python
# Simulated 2 years of daily close prices
np.random.seed(42)
dates = pd.date_range("2023-01-02", periods=504, freq="B")
close = pd.Series(
    100 * np.cumprod(1 + np.random.normal(0.0003, 0.015, 504)),
    index=dates, name="close"
)

# Simple Moving Averages
sma_20 = close.rolling(window=20).mean()
sma_50 = close.rolling(window=50).mean()

# Exponential Moving Average (more weight on recent data)
ema_20 = close.ewm(span=20, adjust=False).mean()

# Rolling volatility (annualized)
daily_returns = close.pct_change()
rolling_vol = daily_returns.rolling(window=20).std() * np.sqrt(252)

# --- Rolling Sharpe Ratio (20-day) ---
risk_free_daily = 0.05 / 252  # 5% annual risk-free rate
excess_returns = daily_returns - risk_free_daily
rolling_sharpe = (
    excess_returns.rolling(window=20).mean()
    / excess_returns.rolling(window=20).std()
) * np.sqrt(252)

result = pd.DataFrame({
    "close": close,
    "sma_20": sma_20,
    "sma_50": sma_50,
    "rolling_vol": rolling_vol,
    "rolling_sharpe": rolling_sharpe,
})
print(result.dropna().tail(10))
```

```
  ROLLING WINDOW VISUALIZATION

  Price series:  [p1, p2, p3, p4, p5, p6, p7, p8, p9, p10, ...]

  Window=3, step 1:  [p1, p2, p3] --> mean = SMA(3) at t=3
  Window=3, step 2:      [p2, p3, p4] --> mean = SMA(3) at t=4
  Window=3, step 3:          [p3, p4, p5] --> mean = SMA(3) at t=5
                                  ...

  Rolling Sharpe:
  For each window of N days:
    sharpe_t = mean(excess_returns[t-N:t]) / std(excess_returns[t-N:t]) * sqrt(252)
```

### 3.5 GroupBy for Sector Analysis

```python
# Create a multi-stock dataset with sector labels
np.random.seed(42)
stocks = {
    "AAPL": "Tech", "MSFT": "Tech", "GOOGL": "Tech",
    "JPM": "Finance", "GS": "Finance", "BAC": "Finance",
    "JNJ": "Health", "PFE": "Health", "UNH": "Health",
}

dates = pd.date_range("2024-01-02", periods=252, freq="B")
all_returns = {}
for ticker in stocks:
    all_returns[ticker] = np.random.normal(0.0004, 0.018, 252)

returns_df = pd.DataFrame(all_returns, index=dates)

# Sector mapping
sector_map = pd.Series(stocks, name="sector")

# --- Sector-level analysis using GroupBy ---

# Annual return by sector
annual_returns = returns_df.mean() * 252
sector_annual = annual_returns.groupby(sector_map).mean()
print("Annual return by sector:")
print(sector_annual)

# Sector volatility
annual_vol = returns_df.std() * np.sqrt(252)
sector_vol = annual_vol.groupby(sector_map).mean()
print("\nAnnual volatility by sector:")
print(sector_vol)

# Sector correlations
sector_returns = returns_df.T.groupby(sector_map).mean().T
print("\nSector correlation matrix:")
print(sector_returns.corr().round(3))
```

### 3.6 Merging Datasets

```python
# Price data
prices = pd.DataFrame({
    "AAPL": np.random.uniform(170, 190, 5),
    "MSFT": np.random.uniform(370, 400, 5),
}, index=pd.date_range("2024-01-02", periods=5, freq="B"))

# Fundamental data (quarterly, different frequency)
fundamentals = pd.DataFrame({
    "ticker": ["AAPL", "AAPL", "MSFT", "MSFT"],
    "date": pd.to_datetime(["2024-01-01", "2024-04-01", "2024-01-01", "2024-04-01"]),
    "pe_ratio": [28.5, 29.1, 35.2, 34.8],
    "market_cap_B": [2800, 2850, 2900, 2950],
})

# merge_asof: join on nearest date (crucial for point-in-time accuracy)
prices_long = prices.stack().reset_index()
prices_long.columns = ["date", "ticker", "price"]
prices_long = prices_long.sort_values("date")
fundamentals = fundamentals.sort_values("date")

merged = pd.merge_asof(
    prices_long,
    fundamentals,
    on="date",
    by="ticker",
    direction="backward"  # use most recent fundamental data available
)
print(merged)
```

### 3.7 Handling Missing Data

```python
# Common patterns in financial data
prices_with_gaps = pd.Series(
    [100, np.nan, np.nan, 103, 104, np.nan, 106],
    index=pd.date_range("2024-01-02", periods=7, freq="B")
)

# Forward fill (use last known price) -- most common in finance
ffill = prices_with_gaps.ffill()

# Interpolate (linear between known points)
interp = prices_with_gaps.interpolate(method="linear")

# For returns: drop NaN rather than fill (filling distorts returns)
returns_clean = prices_with_gaps.pct_change().dropna()

# Detect and count missing data
print(f"Missing values: {prices_with_gaps.isna().sum()}")
print(f"Missing %: {prices_with_gaps.isna().mean():.1%}")
```

### 3.8 MultiIndex for Panel Data

Panel data (multiple assets over time) is the bread and butter of quant research.

```python
# Create panel data with MultiIndex
tickers = ["AAPL", "GOOGL", "MSFT"]
dates = pd.date_range("2024-01-02", periods=5, freq="B")

arrays = [
    np.repeat(dates, len(tickers)),
    np.tile(tickers, len(dates)),
]
index = pd.MultiIndex.from_arrays(arrays, names=["date", "ticker"])

panel = pd.DataFrame({
    "close": np.random.uniform(100, 200, len(index)),
    "volume": np.random.randint(1_000_000, 10_000_000, len(index)),
    "sector": np.tile(["Tech", "Tech", "Tech"], len(dates)),
}, index=index)

# Access patterns
print(panel.loc["2024-01-02"])            # all tickers on one date
print(panel.loc[("2024-01-02", "AAPL")])  # one ticker, one date
print(panel.xs("AAPL", level="ticker"))   # one ticker, all dates

# Unstack to wide format (useful for cross-sectional operations)
wide_close = panel["close"].unstack("ticker")
print(wide_close)
```

### 3.9 Pandas Performance Tips

```python
# 1. Use categorical dtypes for repeated strings
panel["sector"] = panel["sector"].astype("category")

# 2. Avoid iterrows() -- use vectorized operations
# BAD:
# for idx, row in df.iterrows():
#     df.loc[idx, "signal"] = row["close"] > row["sma"]

# GOOD:
# df["signal"] = df["close"] > df["sma"]

# 3. Use .values or .to_numpy() for hot loops
arr = panel["close"].to_numpy()  # drops index overhead

# 4. Read CSVs efficiently
# pd.read_csv("large_file.csv",
#     usecols=["date", "close", "volume"],  # only needed columns
#     dtype={"volume": "int32"},              # minimize memory
#     parse_dates=["date"],
#     index_col="date",
# )

# 5. Use pyarrow backend for faster I/O (Pandas 2.0+)
# pd.read_parquet("data.parquet", engine="pyarrow")
```

---

## 4. Data Acquisition

No data, no quant. This section covers how to get financial data into Python.

### 4.1 yfinance: Quick and Free

```python
import yfinance as yf

# Download single stock
aapl = yf.download("AAPL", start="2020-01-01", end="2024-12-31")
print(aapl.head())
print(f"Shape: {aapl.shape}")
print(f"Columns: {aapl.columns.tolist()}")

# Download multiple stocks
tickers = ["AAPL", "GOOGL", "MSFT", "AMZN", "META"]
data = yf.download(tickers, start="2020-01-01", end="2024-12-31")

# Access adjusted close for all tickers
adj_close = data["Adj Close"]
print(adj_close.tail())

# Get fundamental data
ticker = yf.Ticker("AAPL")
print(ticker.info["marketCap"])
print(ticker.quarterly_financials)
```

**Caveats with yfinance:**

- Rate-limited, not suitable for production
- Data quality is "good enough" for research, not trading
- Adjusted prices handle splits and dividends retroactively
- No intraday data beyond recent 60 days at 1-min resolution

### 4.2 pandas-datareader

```python
import pandas_datareader as pdr
from datetime import datetime

# Federal Reserve Economic Data (FRED)
# 10-year treasury yield
treasury_10y = pdr.get_data_fred("DGS10", start="2020-01-01")
print(treasury_10y.tail())

# VIX (CBOE Volatility Index)
vix = pdr.get_data_fred("VIXCLS", start="2020-01-01")

# S&P 500 from FRED
sp500 = pdr.get_data_fred("SP500", start="2020-01-01")
```

### 4.3 REST APIs: Polygon.io and Alpha Vantage

```python
import requests
import pandas as pd

# --- Polygon.io Example ---
def fetch_polygon_bars(ticker, start, end, api_key):
    """Fetch daily bars from Polygon.io REST API."""
    url = (
        f"https://api.polygon.io/v2/aggs/ticker/{ticker}"
        f"/range/1/day/{start}/{end}"
        f"?adjusted=true&sort=asc&apiKey={api_key}"
    )
    response = requests.get(url)
    response.raise_for_status()
    data = response.json()

    if data.get("resultsCount", 0) == 0:
        return pd.DataFrame()

    df = pd.DataFrame(data["results"])
    df["date"] = pd.to_datetime(df["t"], unit="ms")
    df = df.rename(columns={
        "o": "open", "h": "high", "l": "low",
        "c": "close", "v": "volume"
    })
    return df.set_index("date")[["open", "high", "low", "close", "volume"]]

# Usage (replace with your actual API key):
# bars = fetch_polygon_bars("AAPL", "2024-01-01", "2024-12-31", "YOUR_KEY")


# --- Alpha Vantage Example ---
def fetch_alpha_vantage(ticker, api_key):
    """Fetch daily adjusted data from Alpha Vantage."""
    url = "https://www.alphavantage.co/query"
    params = {
        "function": "TIME_SERIES_DAILY_ADJUSTED",
        "symbol": ticker,
        "outputsize": "full",
        "apikey": api_key,
    }
    response = requests.get(url, params=params)
    response.raise_for_status()
    data = response.json()["Time Series (Daily)"]

    df = pd.DataFrame.from_dict(data, orient="index", dtype=float)
    df.index = pd.to_datetime(df.index)
    df = df.sort_index()
    df.columns = [c.split(". ")[1] for c in df.columns]
    return df

# Usage:
# bars = fetch_alpha_vantage("AAPL", "YOUR_KEY")
```

### 4.4 Handling Corporate Actions

```
  CORPORATE ACTIONS AND THEIR EFFECTS

  +------------------+--------------------------------------------+
  | Action           | Effect on Data                             |
  +------------------+--------------------------------------------+
  | Stock Split      | Price divided, shares multiplied           |
  | Reverse Split    | Price multiplied, shares divided           |
  | Dividend         | Price drops by dividend amount on ex-date  |
  | Spin-off         | Price adjusted, new ticker created         |
  | Merger           | Ticker may change or disappear             |
  +------------------+--------------------------------------------+

  Example: 4:1 stock split on 2024-06-15

  RAW PRICES:                   ADJUSTED PRICES:
  Date        Close             Date        Adj Close
  2024-06-14  $600              2024-06-14  $150    <-- retroactively
  2024-06-15  $150  (split!)    2024-06-15  $150       adjusted
  2024-06-16  $152              2024-06-16  $152

  ALWAYS USE ADJUSTED PRICES FOR RETURN CALCULATIONS.
  Use raw prices only for order execution.
```

```python
# yfinance provides both raw and adjusted closes
# df = yf.download("AAPL", start="2020-01-01")
# raw_close = df["Close"]
# adj_close = df["Adj Close"]

# Computing an adjustment factor
# adj_factor = adj_close / raw_close
# This factor accounts for all splits and dividends
```

### 4.5 Building a Local Data Store

For serious research, you need a local database. Downloading data on every run is slow and unreliable.

```python
import sqlite3
import pandas as pd

# --- SQLite: Simple and Zero-Config ---
def create_price_db(db_path="prices.db"):
    """Create SQLite database for price storage."""
    conn = sqlite3.connect(db_path)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS daily_prices (
            date TEXT NOT NULL,
            ticker TEXT NOT NULL,
            open REAL, high REAL, low REAL, close REAL,
            adj_close REAL, volume INTEGER,
            PRIMARY KEY (date, ticker)
        )
    """)
    conn.execute("""
        CREATE INDEX IF NOT EXISTS idx_ticker_date
        ON daily_prices (ticker, date)
    """)
    conn.commit()
    return conn

def store_prices(conn, df, ticker):
    """Store a DataFrame of prices into SQLite."""
    df_copy = df.copy()
    df_copy["ticker"] = ticker
    df_copy["date"] = df_copy.index.strftime("%Y-%m-%d")
    df_copy.to_sql("daily_prices", conn, if_exists="append", index=False)

def load_prices(conn, ticker, start=None, end=None):
    """Load prices from SQLite into a DataFrame."""
    query = "SELECT * FROM daily_prices WHERE ticker = ?"
    params = [ticker]
    if start:
        query += " AND date >= ?"
        params.append(start)
    if end:
        query += " AND date <= ?"
        params.append(end)
    query += " ORDER BY date"
    df = pd.read_sql_query(query, conn, params=params, parse_dates=["date"])
    return df.set_index("date")

# Usage:
# conn = create_price_db()
# aapl = yf.download("AAPL", start="2020-01-01")
# store_prices(conn, aapl, "AAPL")
# loaded = load_prices(conn, "AAPL", start="2024-01-01")
```

```
  LOCAL DATA ARCHITECTURE

  +-------------------+       +------------------+
  | Data Sources      |       | Local Database   |
  |                   |       |                  |
  | yfinance     -----+----->| SQLite (simple)  |
  | Polygon.io   -----+      | or               |
  | Alpha Vantage ----+      | PostgreSQL       |
  | CSV files    -----+      | (production)     |
  |                   |       |                  |
  +-------------------+       +------------------+
                                     |
                              +------+------+
                              |             |
                              v             v
                        +-----------+  +-----------+
                        | Research  |  | Backtest  |
                        | Notebook  |  | Engine    |
                        +-----------+  +-----------+
```

### 4.6 Real-Time Data with WebSockets

```python
import asyncio
import json

# --- Conceptual WebSocket Client for Real-Time Data ---
# This pattern works with Polygon.io, Alpaca, Binance, etc.

async def stream_prices(uri, tickers, on_message):
    """
    Generic WebSocket streaming client.

    Args:
        uri: WebSocket endpoint
        tickers: list of symbols to subscribe
        on_message: callback function for each message
    """
    try:
        import websockets
    except ImportError:
        print("pip install websockets")
        return

    async with websockets.connect(uri) as ws:
        # Subscribe to tickers
        subscribe_msg = json.dumps({
            "action": "subscribe",
            "trades": tickers,
            "quotes": tickers,
        })
        await ws.send(subscribe_msg)

        # Process incoming messages
        async for raw_msg in ws:
            msg = json.loads(raw_msg)
            await on_message(msg)

async def handle_trade(msg):
    """Process incoming trade messages."""
    for trade in msg:
        if trade.get("ev") == "T":  # trade event
            print(f"{trade['S']} @ ${trade['p']:.2f} x {trade['s']} shares")

# Usage (uncomment to run with real credentials):
# asyncio.run(stream_prices(
#     "wss://stream.data.alpaca.markets/v2/iex",
#     ["AAPL", "MSFT"],
#     handle_trade
# ))
```

---

## 5. Statistical Analysis with SciPy and Statsmodels

### 5.1 Distribution Fitting

```python
import numpy as np
from scipy import stats

# Generate synthetic daily returns
np.random.seed(42)
returns = np.random.standard_t(df=5, size=2520) * 0.015 + 0.0003

# Fit normal distribution
mu_norm, sigma_norm = stats.norm.fit(returns)
print(f"Normal fit: mu={mu_norm:.6f}, sigma={sigma_norm:.6f}")

# Fit Student's t distribution (better for fat tails)
df_t, loc_t, scale_t = stats.t.fit(returns)
print(f"Student-t fit: df={df_t:.2f}, loc={loc_t:.6f}, scale={scale_t:.6f}")

# Compare fits using log-likelihood
ll_norm = stats.norm.logpdf(returns, mu_norm, sigma_norm).sum()
ll_t = stats.t.logpdf(returns, df_t, loc_t, scale_t).sum()
print(f"\nLog-likelihood (Normal):    {ll_norm:.1f}")
print(f"Log-likelihood (Student-t): {ll_t:.1f}")
print(f"Student-t is better: {ll_t > ll_norm}")

# Kolmogorov-Smirnov test for normality
ks_stat, ks_pval = stats.kstest(returns, "norm", args=(mu_norm, sigma_norm))
print(f"\nKS test for normality: stat={ks_stat:.4f}, p-value={ks_pval:.6f}")

# Jarque-Bera test (tests skewness and kurtosis)
jb_stat, jb_pval = stats.jarque_bera(returns)
print(f"Jarque-Bera test: stat={jb_stat:.1f}, p-value={jb_pval:.6f}")
```

```
  WHY FINANCIAL RETURNS ARE NOT NORMAL

  Normal distribution:
  - Tails decay as exp(-x^2/2)        --> "thin tails"
  - Predicts extreme events are nearly impossible

  Actual returns:
  - Tails decay as x^(-alpha)         --> "fat tails"
  - Extreme events happen much more often than Normal predicts

              Normal               Actual Returns
              (thin tails)         (fat tails)

         |    *                    |    *
         |   * *                   |   * *
         |  *   *                  |  *   *
         | *     *                 | *     *
         |*       *                |*       *
  -------*---------*-------  ------*---------*------
         |          *              |           **
         |           *             |             ***
         |            .            |                ****
         |                         |                    *****

  The fat tails mean that "impossible" events (3-sigma, 5-sigma)
  happen regularly. This is why risk management matters.
```

### 5.2 Hypothesis Testing

```python
from scipy import stats

# Test 1: Is the mean return significantly different from zero?
np.random.seed(42)
returns = np.random.normal(0.0003, 0.015, 252)  # one year of daily returns

t_stat, p_value = stats.ttest_1samp(returns, 0)
print(f"t-statistic: {t_stat:.4f}")
print(f"p-value: {p_value:.4f}")
print(f"Significant at 5%: {p_value < 0.05}")

# Test 2: Do two stocks have different mean returns?
returns_a = np.random.normal(0.0005, 0.015, 252)
returns_b = np.random.normal(0.0002, 0.018, 252)

t_stat, p_value = stats.ttest_ind(returns_a, returns_b)
print(f"\nTwo-sample t-test: t={t_stat:.4f}, p={p_value:.4f}")

# Test 3: Is correlation significantly different from zero?
n = 252
r = np.corrcoef(returns_a, returns_b)[0, 1]
t_corr = r * np.sqrt((n - 2) / (1 - r**2))
p_corr = 2 * stats.t.sf(abs(t_corr), df=n - 2)
print(f"\nCorrelation: {r:.4f}, t-stat: {t_corr:.4f}, p-value: {p_corr:.4f}")
```

### 5.3 OLS Regression

```python
import statsmodels.api as sm
import numpy as np

# CAPM regression: R_stock = alpha + beta * R_market + epsilon
np.random.seed(42)
n = 252
market_returns = np.random.normal(0.0004, 0.012, n)
stock_returns = 0.0002 + 1.3 * market_returns + np.random.normal(0, 0.008, n)

# Statsmodels OLS
X = sm.add_constant(market_returns)  # adds intercept column
model = sm.OLS(stock_returns, X).fit()
print(model.summary())

# Extract key results
alpha = model.params[0]
beta = model.params[1]
r_squared = model.rsquared
alpha_pval = model.pvalues[0]
beta_pval = model.pvalues[1]

print(f"\nCAPM Results:")
print(f"  Alpha (annualized): {alpha * 252:.4f} ({alpha_pval:.4f})")
print(f"  Beta:               {beta:.4f} ({beta_pval:.6f})")
print(f"  R-squared:          {r_squared:.4f}")

# Fama-French 3-Factor regression
# R_stock - R_f = alpha + b1*(R_mkt - R_f) + b2*SMB + b3*HML + eps
# SMB = Small Minus Big (size factor)
# HML = High Minus Low (value factor)
smb = np.random.normal(0.0001, 0.005, n)
hml = np.random.normal(0.0001, 0.006, n)

X_ff3 = np.column_stack([market_returns, smb, hml])
X_ff3 = sm.add_constant(X_ff3)
model_ff3 = sm.OLS(stock_returns, X_ff3).fit()
print(f"\nFama-French 3-Factor Alpha (ann.): {model_ff3.params[0] * 252:.4f}")
```

### 5.4 ARIMA Time Series Models

```python
from statsmodels.tsa.arima.model import ARIMA
from statsmodels.tsa.stattools import adfuller
import numpy as np
import pandas as pd

# Test for stationarity (ADF test)
np.random.seed(42)
prices = 100 * np.cumprod(1 + np.random.normal(0.0003, 0.015, 500))
returns = np.diff(prices) / prices[:-1]

adf_price = adfuller(prices)
adf_return = adfuller(returns)

print(f"ADF test on PRICES:  stat={adf_price[0]:.4f}, p-value={adf_price[1]:.4f}")
print(f"ADF test on RETURNS: stat={adf_return[0]:.4f}, p-value={adf_return[1]:.4f}")
print("Prices are non-stationary (as expected), returns are stationary.")

# Fit ARIMA(1,0,1) to returns
returns_series = pd.Series(returns)
model = ARIMA(returns_series, order=(1, 0, 1)).fit()
print(f"\nARIMA(1,0,1) Summary:")
print(f"  AR(1) coeff:  {model.params['ar.L1']:.6f}")
print(f"  MA(1) coeff:  {model.params['ma.L1']:.6f}")
print(f"  AIC:          {model.aic:.2f}")

# Forecast next 5 days
forecast = model.forecast(steps=5)
print(f"\n5-day return forecast: {forecast.values}")
```

### 5.5 Cointegration Tests

```python
from statsmodels.tsa.stattools import coint
import numpy as np

# Simulate a cointegrated pair
np.random.seed(42)
n = 500

# Common stochastic trend
random_walk = np.cumsum(np.random.normal(0, 1, n))

# Two "prices" that share the trend
stock_a = 50 + random_walk + np.random.normal(0, 0.5, n)
stock_b = 30 + 0.6 * random_walk + np.random.normal(0, 0.5, n)

# Engle-Granger cointegration test
coint_stat, p_value, crit_values = coint(stock_a, stock_b)
print(f"Cointegration test:")
print(f"  Test statistic: {coint_stat:.4f}")
print(f"  p-value:        {p_value:.4f}")
print(f"  Critical values (1%, 5%, 10%): {crit_values.round(4)}")
print(f"  Cointegrated at 5%: {p_value < 0.05}")

# Compute the spread (hedge ratio from OLS)
import statsmodels.api as sm
X = sm.add_constant(stock_b)
hedge_model = sm.OLS(stock_a, X).fit()
hedge_ratio = hedge_model.params[1]
spread = stock_a - hedge_ratio * stock_b

print(f"\n  Hedge ratio: {hedge_ratio:.4f}")
print(f"  Spread mean: {spread.mean():.4f}")
print(f"  Spread std:  {spread.std():.4f}")
```

---

## 6. Visualization

Good visualizations are essential for understanding data, debugging strategies, and presenting results.

### 6.1 Matplotlib Fundamentals

```python
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

# Professional-style equity curve
np.random.seed(42)
dates = pd.date_range("2020-01-02", periods=1000, freq="B")
daily_returns = np.random.normal(0.0005, 0.012, 1000)
equity = 1_000_000 * np.cumprod(1 + daily_returns)
benchmark = 1_000_000 * np.cumprod(1 + np.random.normal(0.0003, 0.011, 1000))

fig, axes = plt.subplots(3, 1, figsize=(12, 10), sharex=True,
                          gridspec_kw={"height_ratios": [3, 1, 1]})

# Panel 1: Equity curve
axes[0].plot(dates, equity, label="Strategy", linewidth=1.5)
axes[0].plot(dates, benchmark, label="Benchmark", linewidth=1.0, alpha=0.7)
axes[0].set_ylabel("Portfolio Value ($)")
axes[0].set_title("Strategy Performance")
axes[0].legend()
axes[0].grid(True, alpha=0.3)

# Panel 2: Drawdown
peak = pd.Series(equity).cummax()
drawdown = (equity - peak) / peak
axes[1].fill_between(dates, drawdown, 0, alpha=0.4, color="red")
axes[1].set_ylabel("Drawdown")
axes[1].grid(True, alpha=0.3)

# Panel 3: Rolling Sharpe
rolling_sharpe = (
    pd.Series(daily_returns).rolling(60).mean()
    / pd.Series(daily_returns).rolling(60).std()
) * np.sqrt(252)
axes[2].plot(dates, rolling_sharpe, color="green", linewidth=1.0)
axes[2].axhline(y=0, color="black", linestyle="--", linewidth=0.5)
axes[2].set_ylabel("Rolling Sharpe (60d)")
axes[2].grid(True, alpha=0.3)

plt.tight_layout()
plt.savefig("equity_curve.png", dpi=150, bbox_inches="tight")
plt.close()
```

### 6.2 Candlestick Charts

```python
# Using mplfinance for candlestick charts
# pip install mplfinance

import pandas as pd
import numpy as np

# Simulate OHLCV data
np.random.seed(42)
dates = pd.date_range("2024-01-02", periods=60, freq="B")
close = 100 * np.cumprod(1 + np.random.normal(0.001, 0.015, 60))
high = close * (1 + np.abs(np.random.normal(0, 0.005, 60)))
low = close * (1 - np.abs(np.random.normal(0, 0.005, 60)))
opens = np.roll(close, 1)
opens[0] = 100
volume = np.random.randint(1_000_000, 5_000_000, 60)

ohlcv = pd.DataFrame({
    "Open": opens, "High": high, "Low": low,
    "Close": close, "Volume": volume
}, index=dates)

# Method 1: mplfinance (recommended)
# import mplfinance as mpf
# mpf.plot(ohlcv, type="candle", volume=True, style="charles",
#          title="AAPL Daily", mav=(20, 50))

# Method 2: Plotly (interactive)
# import plotly.graph_objects as go
# fig = go.Figure(data=[go.Candlestick(
#     x=ohlcv.index, open=ohlcv["Open"], high=ohlcv["High"],
#     low=ohlcv["Low"], close=ohlcv["Close"]
# )])
# fig.update_layout(title="AAPL Daily", xaxis_rangeslider_visible=False)
# fig.show()
```

### 6.3 Correlation Heatmap

```python
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

# Simulated returns for multiple assets
np.random.seed(42)
tickers = ["AAPL", "MSFT", "GOOGL", "AMZN", "META", "JPM", "GS", "BAC"]
n_days = 252
returns = pd.DataFrame(
    np.random.multivariate_normal(
        np.zeros(len(tickers)),
        np.eye(len(tickers)) * 0.0002 + 0.00005,
        n_days
    ),
    columns=tickers,
    index=pd.date_range("2024-01-02", periods=n_days, freq="B")
)

corr = returns.corr()

fig, ax = plt.subplots(figsize=(10, 8))
im = ax.imshow(corr.values, cmap="RdBu_r", vmin=-1, vmax=1)

# Add labels and values
ax.set_xticks(range(len(tickers)))
ax.set_yticks(range(len(tickers)))
ax.set_xticklabels(tickers, rotation=45, ha="right")
ax.set_yticklabels(tickers)

for i in range(len(tickers)):
    for j in range(len(tickers)):
        ax.text(j, i, f"{corr.values[i, j]:.2f}",
                ha="center", va="center", fontsize=9)

plt.colorbar(im, label="Correlation")
plt.title("Asset Correlation Matrix")
plt.tight_layout()
plt.savefig("correlation_heatmap.png", dpi=150)
plt.close()
```

### 6.4 Drawdown Visualization

```python
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt

def compute_drawdown(equity_curve):
    """Compute drawdown series from equity curve."""
    peak = equity_curve.cummax()
    drawdown = (equity_curve - peak) / peak
    return drawdown

def plot_drawdown_analysis(equity, title="Drawdown Analysis"):
    """Create a comprehensive drawdown visualization."""
    dd = compute_drawdown(equity)

    fig, axes = plt.subplots(2, 1, figsize=(12, 8), sharex=True,
                              gridspec_kw={"height_ratios": [2, 1]})

    # Equity curve with peak line
    axes[0].plot(equity.index, equity.values, label="Equity", linewidth=1.2)
    axes[0].plot(equity.index, equity.cummax().values,
                 label="Peak", linestyle="--", alpha=0.5, color="gray")
    axes[0].set_ylabel("Portfolio Value")
    axes[0].set_title(title)
    axes[0].legend()
    axes[0].grid(True, alpha=0.3)

    # Drawdown underwater plot
    axes[1].fill_between(dd.index, dd.values, 0, alpha=0.5, color="red")
    axes[1].set_ylabel("Drawdown")
    axes[1].set_xlabel("Date")
    axes[1].grid(True, alpha=0.3)

    # Annotate max drawdown
    max_dd_idx = dd.idxmin()
    max_dd_val = dd.min()
    axes[1].annotate(
        f"Max DD: {max_dd_val:.1%}",
        xy=(max_dd_idx, max_dd_val),
        xytext=(max_dd_idx, max_dd_val - 0.05),
        arrowprops={"arrowstyle": "->"},
        fontsize=10, fontweight="bold"
    )

    plt.tight_layout()
    plt.savefig("drawdown_analysis.png", dpi=150)
    plt.close()

# Example usage
np.random.seed(42)
dates = pd.date_range("2020-01-02", periods=1000, freq="B")
daily_ret = np.random.normal(0.0003, 0.015, 1000)
equity = pd.Series(
    1_000_000 * np.cumprod(1 + daily_ret), index=dates
)
plot_drawdown_analysis(equity)
```

---

## 7. Performance Optimization

Python is slow. When your backtest takes 4 hours, you need to know how to make it take 4 minutes.

### 7.1 Profiling: Find the Bottleneck First

```
  OPTIMIZATION GOLDEN RULE:

  "Premature optimization is the root of all evil." -- Donald Knuth

  ALWAYS profile first. NEVER guess where the bottleneck is.

  PROFILING WORKFLOW:

  1. Write correct code first
  2. Profile to find hot spots       <-- Most time spent here
  3. Optimize only the hot spots
  4. Verify correctness after optimization
  5. Repeat if needed
```

```python
# --- cProfile: Function-level profiling ---
import cProfile
import pstats

def slow_backtest():
    """Example function to profile."""
    import numpy as np
    prices = np.random.random((10000, 100))
    returns = np.diff(prices, axis=0) / prices[:-1]
    for i in range(returns.shape[0]):
        portfolio_return = np.mean(returns[i])
    return portfolio_return

# Profile it
profiler = cProfile.Profile()
profiler.enable()
slow_backtest()
profiler.disable()

stats_obj = pstats.Stats(profiler)
stats_obj.sort_stats("cumulative")
stats_obj.print_stats(10)  # top 10 functions by cumulative time


# --- line_profiler: Line-by-line profiling ---
# pip install line_profiler
#
# Add @profile decorator to target function, then run:
# kernprof -l -v your_script.py
#
# Output shows time per line:
# Line #   Hits   Time  Per Hit  % Time  Line Contents
# =======================================================
#     10    1000   50.2    0.05    82.3    result = np.dot(A, B)
#     11    1000    5.1    0.01     8.4    signal = result > threshold
#     12    1000    5.7    0.01     9.3    positions = np.where(signal, 1, 0)
```

### 7.2 Numba JIT Compilation

Numba compiles Python functions to machine code at runtime. For numerical loops that cannot be vectorized with NumPy, Numba is the first tool to reach for.

```python
from numba import njit
import numpy as np
import time

# Example: Exponential moving average (hard to vectorize efficiently)

def ema_python(prices, alpha):
    """Pure Python EMA -- SLOW."""
    n = len(prices)
    result = np.empty(n)
    result[0] = prices[0]
    for i in range(1, n):
        result[i] = alpha * prices[i] + (1 - alpha) * result[i - 1]
    return result

@njit
def ema_numba(prices, alpha):
    """Numba-compiled EMA -- FAST."""
    n = len(prices)
    result = np.empty(n)
    result[0] = prices[0]
    for i in range(1, n):
        result[i] = alpha * prices[i] + (1 - alpha) * result[i - 1]
    return result

# Benchmark
prices = np.random.random(1_000_000)
alpha = 0.05

# Warm up Numba (first call triggers compilation)
_ = ema_numba(prices[:10], alpha)

start = time.perf_counter()
res_py = ema_python(prices, alpha)
time_py = time.perf_counter() - start

start = time.perf_counter()
res_nb = ema_numba(prices, alpha)
time_nb = time.perf_counter() - start

print(f"Python: {time_py:.4f}s")
print(f"Numba:  {time_nb:.4f}s")
print(f"Speedup: {time_py / time_nb:.0f}x")
print(f"Results match: {np.allclose(res_py, res_nb)}")

# Typical output:
# Python: 0.8500s
# Numba:  0.0012s
# Speedup: 708x
```

```
  WHEN TO USE NUMBA:

  +------------------------------------------+--------+
  | Situation                                | Numba? |
  +------------------------------------------+--------+
  | Loop over array with sequential deps     | YES    |
  | Custom rolling window calculation        | YES    |
  | Signal generation with state             | YES    |
  | Matrix multiplication                    | NO*    |
  | Pandas operations                        | NO     |
  | String processing                        | NO     |
  | Network I/O                              | NO     |
  +------------------------------------------+--------+
  * NumPy's BLAS is already optimized for this
```

### 7.3 Cython Basics

```python
# Cython provides C-level performance with Python-like syntax.
# Save as ema_cython.pyx:

# ---- ema_cython.pyx ----
# import numpy as np
# cimport numpy as cnp
# from libc.math cimport NAN
#
# def ema_cython(double[:] prices, double alpha):
#     cdef int n = prices.shape[0]
#     cdef double[:] result = np.empty(n)
#     cdef int i
#
#     result[0] = prices[0]
#     for i in range(1, n):
#         result[i] = alpha * prices[i] + (1.0 - alpha) * result[i - 1]
#
#     return np.asarray(result)

# Compile: cythonize -i ema_cython.pyx
# Usage:  from ema_cython import ema_cython

# For most quant work, Numba is easier than Cython.
# Use Cython when:
# - You need to wrap existing C/C++ libraries
# - You need maximum control over memory layout
# - You are building a distributable package
```

### 7.4 Multiprocessing for Parameter Sweeps

```python
from multiprocessing import Pool
import numpy as np
import time

def backtest_strategy(params):
    """Simulate a backtest with given parameters."""
    fast_window, slow_window, threshold = params
    np.random.seed(42)
    prices = 100 * np.cumprod(1 + np.random.normal(0.0003, 0.015, 1000))

    fast_ma = np.convolve(prices, np.ones(fast_window) / fast_window, mode="valid")
    slow_ma = np.convolve(prices, np.ones(slow_window) / slow_window, mode="valid")

    min_len = min(len(fast_ma), len(slow_ma))
    fast_ma = fast_ma[-min_len:]
    slow_ma = slow_ma[-min_len:]
    prices_aligned = prices[-min_len:]

    signal = np.where(fast_ma > slow_ma * (1 + threshold), 1, -1)
    returns_aligned = np.diff(prices_aligned) / prices_aligned[:-1]
    strategy_returns = signal[:-1] * returns_aligned

    sharpe = np.mean(strategy_returns) / np.std(strategy_returns) * np.sqrt(252)
    return {
        "params": params,
        "sharpe": sharpe,
        "total_return": np.prod(1 + strategy_returns) - 1,
    }

# Generate parameter grid
param_grid = [
    (fast, slow, thresh)
    for fast in [5, 10, 20, 30]
    for slow in [50, 100, 150, 200]
    for thresh in [0.0, 0.005, 0.01, 0.02]
]
print(f"Total parameter combinations: {len(param_grid)}")

# Sequential (baseline)
start = time.perf_counter()
results_seq = [backtest_strategy(p) for p in param_grid]
time_seq = time.perf_counter() - start

# Parallel
start = time.perf_counter()
with Pool(processes=4) as pool:
    results_par = pool.map(backtest_strategy, param_grid)
time_par = time.perf_counter() - start

print(f"Sequential: {time_seq:.2f}s")
print(f"Parallel:   {time_par:.2f}s")
print(f"Speedup:    {time_seq / time_par:.1f}x")

# Find best parameters
best = max(results_par, key=lambda x: x["sharpe"])
print(f"\nBest params: fast={best['params'][0]}, slow={best['params'][1]}, "
      f"thresh={best['params'][2]:.3f}")
print(f"Best Sharpe: {best['sharpe']:.4f}")
```

### 7.5 Dask for Out-of-Core Computing

```python
# When data does not fit in memory, Dask parallelizes Pandas operations
# pip install dask[complete]

import dask.dataframe as dd

# Read a large CSV file lazily (does not load entire file)
# ddf = dd.read_csv("huge_trades_*.csv",
#     dtype={"price": "float64", "volume": "int32"},
#     parse_dates=["timestamp"],
# )

# Same Pandas API, but distributed
# daily_volume = ddf.groupby(ddf["timestamp"].dt.date)["volume"].sum().compute()

# For quant work, Dask is useful for:
# 1. Processing multi-year tick data that exceeds RAM
# 2. Parallel parameter sweep backtests
# 3. Distributed feature engineering across a cluster
```

### 7.6 When to Switch to C++

```
  DECISION FRAMEWORK: PYTHON vs C++

  Latency Requirement:

  > 1 second        --> Python (always)
  100ms - 1s        --> Python (with NumPy/Numba)
  10ms - 100ms      --> Python (with Numba/Cython) or C++
  1ms - 10ms        --> C++ (likely)
  < 1ms             --> C++ (definitely)
  < 10 microseconds --> C++ with kernel bypass, FPGA

  Other Reasons to Use C++:
  - Deterministic latency (no GC pauses)
  - Direct memory management
  - Exchange protocol parsing (FIX, ITCH)
  - Co-location server optimization
  - FPGA integration

  Typical Hybrid Architecture:

  +----------------+    Signal    +-------------------+
  | Python         | ----------> | C++ Execution     |
  | - Research     |    (via     | - Order mgmt      |
  | - ML models    |    socket/  | - Risk checks     |
  | - Signals      |    shared   | - Exchange conn   |
  | - Risk reports |    memory)  | - Matching engine |
  +----------------+             +-------------------+
```

---

## 8. Practical Projects

### 8.1 Project 1: Download and Analyze S&P 500 Returns

```python
import numpy as np
import pandas as pd

# --- Step 1: Download S&P 500 data ---
# import yfinance as yf
# sp500 = yf.download("^GSPC", start="2000-01-01", end="2024-12-31")
# sp500.to_csv("sp500_daily.csv")

# For this example, simulate realistic S&P 500 data
np.random.seed(42)
dates = pd.date_range("2000-01-02", periods=6300, freq="B")
daily_returns = np.random.normal(0.0003, 0.012, len(dates))

# Add regime changes (dot-com crash, GFC, COVID)
daily_returns[500:750] -= 0.002   # dot-com crash
daily_returns[2000:2200] -= 0.003  # GFC
daily_returns[5050:5100] -= 0.005  # COVID crash

sp500_close = pd.Series(
    1400 * np.cumprod(1 + daily_returns), index=dates, name="SP500"
)

# --- Step 2: Compute Statistics ---
returns = sp500_close.pct_change().dropna()

annual_return = returns.mean() * 252
annual_vol = returns.std() * np.sqrt(252)
sharpe = annual_return / annual_vol
skew = returns.skew()
kurt = returns.kurtosis()

# Drawdown analysis
peak = sp500_close.cummax()
drawdown = (sp500_close - peak) / peak
max_drawdown = drawdown.min()
max_dd_date = drawdown.idxmin()

print("=" * 50)
print("S&P 500 ANALYSIS (2000-2024)")
print("=" * 50)
print(f"Annual Return:      {annual_return:.2%}")
print(f"Annual Volatility:  {annual_vol:.2%}")
print(f"Sharpe Ratio:       {sharpe:.4f}")
print(f"Skewness:           {skew:.4f}")
print(f"Excess Kurtosis:    {kurt:.4f}")
print(f"Max Drawdown:       {max_drawdown:.2%}")
print(f"Max DD Date:        {max_dd_date.strftime('%Y-%m-%d')}")

# --- Step 3: Rolling Analysis ---
rolling_annual_return = returns.rolling(252).mean() * 252
rolling_annual_vol = returns.rolling(252).std() * np.sqrt(252)
rolling_sharpe = rolling_annual_return / rolling_annual_vol

# --- Step 4: Distribution Analysis ---
# Tail analysis
left_tail = returns.quantile(0.01)
right_tail = returns.quantile(0.99)
var_95 = returns.quantile(0.05)
cvar_95 = returns[returns <= var_95].mean()

print(f"\n{'RISK METRICS':=^50}")
print(f"1% VaR (daily):     {var_95:.4%}")
print(f"1% CVaR (daily):    {cvar_95:.4%}")
print(f"1st percentile:     {left_tail:.4%}")
print(f"99th percentile:    {right_tail:.4%}")
print(f"Days below -3%:     {(returns < -0.03).sum()}")
print(f"Days above +3%:     {(returns > 0.03).sum()}")

# --- Step 5: Monthly and Yearly Returns Table ---
monthly_returns = returns.resample("ME").apply(lambda x: (1 + x).prod() - 1)
yearly_returns = returns.resample("YE").apply(lambda x: (1 + x).prod() - 1)

print(f"\n{'YEARLY RETURNS':=^50}")
for date, ret in yearly_returns.items():
    bar = "+" * int(abs(ret) * 100) if ret > 0 else "-" * int(abs(ret) * 100)
    print(f"  {date.year}: {ret:+.2%}  {bar}")
```

### 8.2 Project 2: Moving Average Crossover Signal Generator

```python
import numpy as np
import pandas as pd

def moving_average_crossover(prices, fast_window=20, slow_window=50):
    """
    Generate trading signals from moving average crossover.

    Returns DataFrame with signals and performance metrics.
    Signal: +1 = long (fast > slow), -1 = short (fast < slow), 0 = flat
    """
    df = pd.DataFrame({"close": prices})
    df["fast_ma"] = df["close"].rolling(window=fast_window).mean()
    df["slow_ma"] = df["close"].rolling(window=slow_window).mean()

    # Signal: +1 when fast > slow, -1 when fast < slow
    df["raw_signal"] = np.where(df["fast_ma"] > df["slow_ma"], 1, -1)

    # Only trade on crossover (signal change)
    df["signal_change"] = df["raw_signal"].diff().abs() > 0
    df["position"] = df["raw_signal"]

    # Returns
    df["market_return"] = df["close"].pct_change()
    df["strategy_return"] = df["position"].shift(1) * df["market_return"]

    # Cumulative returns
    df["market_equity"] = (1 + df["market_return"]).cumprod()
    df["strategy_equity"] = (1 + df["strategy_return"]).cumprod()

    return df.dropna()


# Simulate price data
np.random.seed(42)
dates = pd.date_range("2020-01-02", periods=1000, freq="B")
prices = pd.Series(
    100 * np.cumprod(1 + np.random.normal(0.0002, 0.015, 1000)),
    index=dates
)

result = moving_average_crossover(prices, fast_window=20, slow_window=50)

# Performance summary
strategy_returns = result["strategy_return"]
market_returns = result["market_return"]

def performance_summary(returns, name="Strategy"):
    """Compute key performance metrics."""
    total_return = (1 + returns).prod() - 1
    annual_return = (1 + total_return) ** (252 / len(returns)) - 1
    annual_vol = returns.std() * np.sqrt(252)
    sharpe = annual_return / annual_vol if annual_vol > 0 else 0
    max_dd = ((1 + returns).cumprod().cummax() - (1 + returns).cumprod()).max()
    win_rate = (returns > 0).mean()
    return {
        "name": name,
        "total_return": total_return,
        "annual_return": annual_return,
        "annual_vol": annual_vol,
        "sharpe": sharpe,
        "max_drawdown": max_dd,
        "win_rate": win_rate,
        "n_trades": result["signal_change"].sum(),
    }

strat_perf = performance_summary(strategy_returns, "MA Crossover")
market_perf = performance_summary(market_returns, "Buy & Hold")

print(f"\n{'PERFORMANCE COMPARISON':=^55}")
print(f"{'Metric':<25} {'MA Crossover':>14} {'Buy & Hold':>14}")
print("-" * 55)
for key in ["total_return", "annual_return", "annual_vol", "sharpe", "max_drawdown", "win_rate"]:
    s_val = strat_perf[key]
    m_val = market_perf[key]
    if key in ["total_return", "annual_return", "annual_vol", "max_drawdown", "win_rate"]:
        print(f"  {key:<23} {s_val:>13.2%} {m_val:>13.2%}")
    else:
        print(f"  {key:<23} {s_val:>13.4f} {m_val:>13.4f}")
print(f"  {'n_trades':<23} {strat_perf['n_trades']:>13.0f} {'N/A':>14}")
```

### 8.3 Project 3: Pairs Trading Scanner

```python
import numpy as np
import pandas as pd
from itertools import combinations

def find_cointegrated_pairs(prices_df, significance=0.05):
    """
    Scan all pairs in a price DataFrame for cointegration.

    Args:
        prices_df: DataFrame with columns = tickers, rows = dates
        significance: p-value threshold for cointegration

    Returns:
        List of (ticker_a, ticker_b, p_value, hedge_ratio) tuples
    """
    from statsmodels.tsa.stattools import coint
    import statsmodels.api as sm

    tickers = prices_df.columns.tolist()
    pairs = []

    for ticker_a, ticker_b in combinations(tickers, 2):
        series_a = prices_df[ticker_a].dropna()
        series_b = prices_df[ticker_b].dropna()

        # Align dates
        common_idx = series_a.index.intersection(series_b.index)
        if len(common_idx) < 100:
            continue

        a = series_a.loc[common_idx].values
        b = series_b.loc[common_idx].values

        try:
            _, p_value, _ = coint(a, b)
        except Exception:
            continue

        if p_value < significance:
            # Compute hedge ratio
            X = sm.add_constant(b)
            model = sm.OLS(a, X).fit()
            hedge_ratio = model.params[1]

            pairs.append({
                "ticker_a": ticker_a,
                "ticker_b": ticker_b,
                "p_value": p_value,
                "hedge_ratio": hedge_ratio,
            })

    return pd.DataFrame(pairs).sort_values("p_value")


def compute_spread_signals(prices_a, prices_b, hedge_ratio,
                            lookback=60, entry_z=2.0, exit_z=0.5):
    """
    Compute z-score of spread and generate trading signals.

    Signal:  +1 = long spread (buy A, sell B)
             -1 = short spread (sell A, buy B)
              0 = flat
    """
    spread = prices_a - hedge_ratio * prices_b
    spread_mean = spread.rolling(lookback).mean()
    spread_std = spread.rolling(lookback).std()
    z_score = (spread - spread_mean) / spread_std

    signal = pd.Series(0, index=z_score.index)
    signal[z_score < -entry_z] = 1    # spread too low, buy it
    signal[z_score > entry_z] = -1    # spread too high, sell it

    # Exit when z-score reverts to near zero
    signal[(z_score > -exit_z) & (z_score < exit_z)] = 0

    # Forward-fill signal (hold position until exit)
    position = signal.replace(0, np.nan).ffill().fillna(0)

    return pd.DataFrame({
        "spread": spread,
        "z_score": z_score,
        "signal": signal,
        "position": position,
    })


# --- Run the Scanner ---
np.random.seed(42)
n_days = 500
dates = pd.date_range("2023-01-02", periods=n_days, freq="B")

# Simulate 10 stocks (some cointegrated, some not)
random_walk = np.cumsum(np.random.normal(0, 1, n_days))

prices_dict = {}
# Cointegrated pair 1
prices_dict["STOCK_A"] = 50 + random_walk + np.random.normal(0, 0.5, n_days)
prices_dict["STOCK_B"] = 30 + 0.6 * random_walk + np.random.normal(0, 0.5, n_days)

# Cointegrated pair 2
random_walk_2 = np.cumsum(np.random.normal(0, 0.8, n_days))
prices_dict["STOCK_C"] = 80 + random_walk_2 + np.random.normal(0, 0.3, n_days)
prices_dict["STOCK_D"] = 45 + 0.5 * random_walk_2 + np.random.normal(0, 0.3, n_days)

# Independent stocks
for i in range(6):
    prices_dict[f"STOCK_{chr(69+i)}"] = (
        100 + np.cumsum(np.random.normal(0, 1, n_days))
    )

prices_df = pd.DataFrame(prices_dict, index=dates)

# Scan for pairs
pairs = find_cointegrated_pairs(prices_df, significance=0.05)
print(f"\n{'COINTEGRATED PAIRS FOUND':=^55}")
if len(pairs) > 0:
    print(pairs.to_string(index=False))
else:
    print("No cointegrated pairs found.")

# Generate signals for the best pair
if len(pairs) > 0:
    best = pairs.iloc[0]
    signals = compute_spread_signals(
        prices_df[best["ticker_a"]],
        prices_df[best["ticker_b"]],
        best["hedge_ratio"],
    )
    print(f"\nSpread Z-score Stats for {best['ticker_a']}/{best['ticker_b']}:")
    print(signals["z_score"].describe())
    print(f"Total signals generated: {(signals['signal'] != 0).sum()}")
```

### 8.4 Project 4: Factor Model Construction

```python
import numpy as np
import pandas as pd
import statsmodels.api as sm

def build_factor_model(returns_df, factor_data):
    """
    Build a cross-sectional factor model.

    For each time period:
      R_i = alpha + beta_1 * Factor1_i + beta_2 * Factor2_i + ... + eps_i

    Args:
        returns_df: DataFrame (dates x tickers) of stock returns
        factor_data: dict of DataFrames, each (dates x tickers) for a factor

    Returns:
        Factor returns (time series of factor premiums)
    """
    dates = returns_df.index
    factor_names = list(factor_data.keys())
    factor_returns = {name: [] for name in factor_names}
    factor_returns["alpha"] = []
    factor_dates = []

    for date in dates:
        # Get cross-section of returns
        y = returns_df.loc[date].dropna()
        if len(y) < 20:
            continue

        # Get factor exposures for this date
        X_dict = {}
        valid_tickers = y.index
        skip = False
        for name in factor_names:
            if date not in factor_data[name].index:
                skip = True
                break
            exposures = factor_data[name].loc[date].reindex(valid_tickers).dropna()
            valid_tickers = valid_tickers.intersection(exposures.index)
            X_dict[name] = exposures

        if skip or len(valid_tickers) < 20:
            continue

        # Align everything
        y = y.loc[valid_tickers]
        X = pd.DataFrame({n: X_dict[n].loc[valid_tickers] for n in factor_names})

        # Standardize factor exposures (cross-sectionally)
        X = (X - X.mean()) / X.std()
        X = sm.add_constant(X)

        # Cross-sectional regression
        try:
            model = sm.OLS(y, X).fit()
            factor_dates.append(date)
            factor_returns["alpha"].append(model.params["const"])
            for name in factor_names:
                factor_returns[name].append(model.params[name])
        except Exception:
            continue

    return pd.DataFrame(factor_returns, index=factor_dates)


# --- Simulate Factor Data ---
np.random.seed(42)
n_stocks = 200
n_days = 504
dates = pd.date_range("2023-01-02", periods=n_days, freq="B")
tickers = [f"STOCK_{i:03d}" for i in range(n_stocks)]

# Simulate factor exposures
# Value factor: book-to-market ratio (higher = cheaper)
value_exposure = pd.DataFrame(
    np.random.normal(0, 1, (n_days, n_stocks)),
    index=dates, columns=tickers
)
# Momentum factor: past 12-month return
momentum_exposure = pd.DataFrame(
    np.random.normal(0, 1, (n_days, n_stocks)),
    index=dates, columns=tickers
)
# Size factor: log market cap (negative = small)
size_exposure = pd.DataFrame(
    np.random.normal(0, 1, (n_days, n_stocks)),
    index=dates, columns=tickers
)

# Simulate returns with factor structure
# R_i = 0.0003 + 0.001*value + 0.0008*momentum - 0.0005*size + noise
returns_matrix = (
    0.0003
    + 0.001 * value_exposure.values
    + 0.0008 * momentum_exposure.values
    - 0.0005 * size_exposure.values
    + np.random.normal(0, 0.02, (n_days, n_stocks))
)
returns_df = pd.DataFrame(returns_matrix, index=dates, columns=tickers)

# Build the factor model
factor_data = {
    "value": value_exposure,
    "momentum": momentum_exposure,
    "size": size_exposure,
}
factor_returns = build_factor_model(returns_df, factor_data)

# Analyze factor premiums
print(f"\n{'FACTOR MODEL RESULTS':=^60}")
print(f"\nAnnualized Factor Premiums (mean daily return * 252):")
for col in factor_returns.columns:
    mean_ret = factor_returns[col].mean() * 252
    t_stat = (factor_returns[col].mean()
              / (factor_returns[col].std() / np.sqrt(len(factor_returns))))
    sharpe = factor_returns[col].mean() / factor_returns[col].std() * np.sqrt(252)
    print(f"  {col:<12} return={mean_ret:+.4f}  t-stat={t_stat:+.2f}  sharpe={sharpe:+.3f}")

# Factor correlation
print(f"\nFactor Return Correlations:")
print(factor_returns.corr().round(3))

# Cumulative factor returns
cum_factor = (1 + factor_returns).cumprod()
print(f"\nCumulative Factor Returns (final):")
for col in cum_factor.columns:
    total = cum_factor[col].iloc[-1] - 1
    print(f"  {col:<12} {total:+.2%}")
```

---

## Summary: The Python Quant Toolkit at a Glance

```
+------------------------------------------------------------------------+
|                    PYTHON QUANT CHEAT SHEET                             |
+------------------------------------------------------------------------+
|                                                                        |
|  DATA LOADING                                                          |
|    yf.download("AAPL", start="2020-01-01")                            |
|    pd.read_csv("data.csv", parse_dates=["date"], index_col="date")    |
|    pd.read_sql(query, connection)                                      |
|                                                                        |
|  RETURNS                                                               |
|    simple:  df.pct_change()                                            |
|    log:     np.log(df / df.shift(1))                                   |
|                                                                        |
|  ROLLING STATISTICS                                                    |
|    df.rolling(20).mean()          # SMA                                |
|    df.ewm(span=20).mean()        # EMA                                |
|    df.rolling(20).std() * sqrt(252)  # annualized vol                  |
|                                                                        |
|  PORTFOLIO MATH                                                        |
|    port_return = weights @ expected_returns                             |
|    port_vol = sqrt(weights @ cov @ weights)                            |
|    sharpe = (port_return - rf) / port_vol                              |
|                                                                        |
|  STATISTICS                                                            |
|    stats.ttest_1samp(returns, 0)     # test mean != 0                  |
|    stats.jarque_bera(returns)        # test normality                  |
|    adfuller(series)                  # test stationarity               |
|    coint(series_a, series_b)         # test cointegration              |
|    sm.OLS(y, X).fit()               # linear regression               |
|                                                                        |
|  PERFORMANCE                                                           |
|    1. Vectorize with NumPy           (10-100x speedup)                 |
|    2. Use Numba @njit                (100-1000x speedup)               |
|    3. Multiprocessing for sweeps     (Nx cores speedup)                |
|    4. Profile before optimizing      (always)                          |
|                                                                        |
+------------------------------------------------------------------------+
```

---

## Interview Questions

These are questions you might encounter in a quant interview related to this material.

**Q1: Why do we use log returns instead of simple returns?**
Log returns are additive over time (you can sum daily log returns to get the period log return), they are approximately normally distributed, and they prevent prices from going negative. Simple returns are used for cross-sectional aggregation (portfolio returns) because they are additive across assets.

**Q2: You have a Pandas DataFrame with 10 years of daily prices for 500 stocks. How do you compute the 60-day rolling correlation between every pair?**
Use `df.pct_change().rolling(60).corr()`. This returns a MultiIndex DataFrame. For a specific pair, use `.loc` indexing. Be aware this produces a (n_days x 500 x 500) result -- for memory efficiency, compute only the pairs you need.

**Q3: Your backtest loop takes 3 hours. Walk me through how you would speed it up.**
First, profile with `cProfile` or `line_profiler` to find the bottleneck. If the bottleneck is a Python loop over arrays, vectorize with NumPy. If the loop has sequential dependencies that prevent vectorization, use Numba `@njit`. If the bottleneck is a parameter sweep, use `multiprocessing.Pool`. If the data does not fit in memory, use Dask. Only consider C++ if all Python optimizations are insufficient and latency requirements demand it.

**Q4: Explain the difference between `np.linalg.inv(cov) @ ones` and `np.linalg.solve(cov, ones)`.**
`solve` is numerically more stable and faster because it does not explicitly compute the inverse. It uses LU decomposition to solve the linear system directly. Always prefer `solve` over `inv` in production code.

**Q5: How would you handle survivorship bias when building a local data store?**
Include delisted stocks in your database. When a stock is acquired, merged, or bankrupt, keep its historical data but mark the delisting date and reason. When running backtests, use the universe of stocks that were actually available at each point in time, not the current universe.

---

## Next Steps

With Python mastery in hand, you are ready to move to Chapter 4 where we build on these tools to implement complete trading strategies, beginning with statistical arbitrage and moving through factor models and machine learning approaches. Every technique in this chapter will be used repeatedly throughout the rest of this guide.
