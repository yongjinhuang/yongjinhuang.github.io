# Chapter 5: Statistical Arbitrage & Quantitative Strategies

## The Quant's Playbook

Statistical arbitrage (stat arb) is the systematic exploitation of pricing inefficiencies identified through statistical and mathematical models. Unlike fundamental investing, stat arb relies on the law of large numbers: individual trades may lose money, but across hundreds or thousands of positions, the edge compounds.

This chapter covers the full lifecycle of quantitative strategy development, from alpha research to live trading, with rigorous mathematical treatment of the core concepts.

```
+------------------------------------------------------------------------+
|              QUANTITATIVE STRATEGY DEVELOPMENT PIPELINE                  |
+------------------------------------------------------------------------+
|                                                                        |
|  ALPHA RESEARCH           PORTFOLIO CONSTRUCTION    EXECUTION          |
|  +-------------------+   +---------------------+   +---------------+  |
|  | Universe Selection |   | Optimization         |   | Order Routing  |  |
|  | Feature Engineering|-->| Risk Budgeting       |-->| Smart Routing  |  |
|  | Signal Generation  |   | Position Sizing      |   | Slippage Ctrl  |  |
|  | Backtesting        |   | Rebalancing Rules    |   | Fill Analysis  |  |
|  +-------------------+   +---------------------+   +---------------+  |
|           |                        |                        |          |
|           v                        v                        v          |
|  +-------------------+   +---------------------+   +---------------+  |
|  | RISK MANAGEMENT   |   | PERFORMANCE ANALYSIS |   | MONITORING    |  |
|  | VaR / CVaR         |   | Sharpe / Sortino     |   | PnL Attrib    |  |
|  | Drawdown Limits   |   | Factor Decomposition |   | Drift Detect   |  |
|  | Tail Risk Hedging  |   | Turnover Analysis    |   | Kill Switches  |  |
|  +-------------------+   +---------------------+   +---------------+  |
|                                                                        |
+------------------------------------------------------------------------+
```

---

## 1. Mean Reversion Strategies

Mean reversion is the hypothesis that asset prices tend to revert to some long-run equilibrium. This is the most studied class of stat arb strategies.

### 1.1 Pairs Trading

The simplest mean reversion strategy: find two comoving assets, go long the underperformer and short the outperformer, then wait for convergence.

```
PAIRS TRADING CONCEPT
=====================

Price
  ^
  |     Stock A          Stock B
  |      /\  /\            /\
  |     /  \/  \    /\    /  \        <-- Spread widens
  |    /        \  /  \  /    \       <-- ENTER: Long B, Short A
  |   /          \/    \/      \
  |  /                          \     <-- Spread narrows
  | /                            \    <-- EXIT: Close both
  +--------------------------------------> Time

  Spread (A - B):
  +2 |    *  *
  +1 |   *    *        *
   0 |--*------*------*---*----------- Mean
  -1 |          *    *     *
  -2 |           *  *       *  *
     +--------------------------------------> Time
         SELL    BUY       SELL  BUY
```

#### Mathematical Framework

Given two price series P_A(t) and P_B(t), we form a spread:

```
S(t) = P_A(t) - beta * P_B(t)

where beta is the hedge ratio estimated via OLS:
  P_A(t) = alpha + beta * P_B(t) + epsilon(t)
```

The trading signal is the z-score of the spread:

```
z(t) = (S(t) - mean(S)) / std(S)

Trading rules:
  z(t) > +2.0   -->  Short the spread (short A, long B)
  z(t) < -2.0   -->  Long the spread (long A, short B)
  |z(t)| < 0.5  -->  Close position (mean reversion achieved)
```

### 1.2 Cointegration

Two series are **cointegrated** if a linear combination of them is stationary, even if each individual series is non-stationary (I(1)).

This is stronger than correlation. Two stocks can be highly correlated but not cointegrated (e.g., trending upward together but diverging permanently). Cointegration implies a long-run equilibrium relationship.

#### Engle-Granger Two-Step Method

```
Step 1: Estimate the cointegrating regression
  Y(t) = alpha + beta * X(t) + epsilon(t)

Step 2: Test residuals for stationarity using ADF test
  delta(epsilon_t) = gamma * epsilon_{t-1} + sum(delta_i * delta(epsilon_{t-i})) + u_t

  H0: gamma = 0 (no cointegration, residuals have unit root)
  H1: gamma < 0 (cointegration, residuals are stationary)

  If ADF statistic < critical value --> reject H0 --> cointegrated
```

**Critical values** for the Engle-Granger test differ from standard ADF tables because we test residuals from an estimated regression (MacKinnon critical values).

#### Johansen Test

For systems with more than two variables, the Johansen test determines the number of cointegrating relationships.

```
Consider a VAR(p) model in error-correction form:

  delta(Y_t) = Pi * Y_{t-1} + sum(Gamma_i * delta(Y_{t-i})) + epsilon_t

where Pi = alpha * beta'

  alpha = adjustment coefficients (speed of reversion)
  beta  = cointegrating vectors

The rank of Pi determines the number of cointegrating relationships:
  rank(Pi) = 0   --> No cointegration
  rank(Pi) = r   --> r cointegrating relationships (0 < r < n)
  rank(Pi) = n   --> All series are stationary

Two test statistics:
  Trace test:     lambda_trace(r) = -T * sum_{i=r+1}^{n} ln(1 - lambda_hat_i)
  Max eigenvalue: lambda_max(r)   = -T * ln(1 - lambda_hat_{r+1})
```

### 1.3 Ornstein-Uhlenbeck Process & Half-Life

The Ornstein-Uhlenbeck (OU) process is the continuous-time analog of a mean-reverting process:

```
dX(t) = theta * (mu - X(t)) * dt + sigma * dW(t)

Parameters:
  theta  = speed of mean reversion (higher = faster reversion)
  mu     = long-run mean level
  sigma  = volatility of the process
  W(t)   = standard Brownian motion
```

The **half-life** of mean reversion tells us how long it takes for the spread to revert halfway back to its mean:

```
Half-life = ln(2) / theta

Estimation from discrete data:
  delta(S_t) = phi * S_{t-1} + epsilon_t

  theta_hat = -ln(phi) / delta_t
  half_life = -ln(2) / ln(phi)

  For daily data (delta_t = 1):
    half_life = -ln(2) / ln(1 + phi_hat)
    or approximately: half_life = -ln(2) / phi_hat  (when phi_hat is small)
```

A half-life that is too short (< 1 day) means the signal is noise or already captured by HFT. Too long (> 60 days) means capital is tied up inefficiently. The sweet spot for medium-frequency stat arb is typically 5-30 days.

### 1.4 Python Implementation: Pairs Trading with Cointegration

```python
import numpy as np
import pandas as pd
from statsmodels.tsa.stattools import coint, adfuller
from statsmodels.regression.linear_model import OLS
from statsmodels.tools import add_constant


def find_cointegrated_pairs(prices_df: pd.DataFrame,
                            significance: float = 0.05
                            ) -> list[tuple[str, str, float]]:
    """
    Scan all pairs in a universe for cointegration.
    Returns list of (stock_a, stock_b, p_value) tuples.
    """
    n = prices_df.shape[1]
    tickers = prices_df.columns.tolist()
    pairs = []

    for i in range(n):
        for j in range(i + 1, n):
            series_a = prices_df.iloc[:, i]
            series_b = prices_df.iloc[:, j]
            _, p_value, _ = coint(series_a, series_b)
            if p_value < significance:
                pairs.append((tickers[i], tickers[j], p_value))

    return sorted(pairs, key=lambda x: x[2])


def estimate_hedge_ratio(series_a: pd.Series,
                         series_b: pd.Series) -> float:
    """Estimate hedge ratio via OLS regression."""
    x = add_constant(series_b)
    model = OLS(series_a, x).fit()
    return model.params[1]


def compute_spread(series_a: pd.Series,
                   series_b: pd.Series,
                   hedge_ratio: float) -> pd.Series:
    """Compute the cointegrated spread."""
    return series_a - hedge_ratio * series_b


def compute_half_life(spread: pd.Series) -> float:
    """
    Estimate the half-life of mean reversion using AR(1) regression.
    delta(S_t) = phi * S_{t-1} + epsilon_t
    half_life = -ln(2) / phi
    """
    spread_lag = spread.shift(1).dropna()
    spread_diff = spread.diff().dropna()

    # Align indices
    spread_lag = spread_lag.iloc[1:]
    spread_diff = spread_diff.iloc[1:]

    x = add_constant(spread_lag)
    model = OLS(spread_diff, x).fit()
    phi = model.params.iloc[1]

    if phi >= 0:
        return float('inf')  # Not mean-reverting

    return -np.log(2) / phi


def generate_zscore_signals(spread: pd.Series,
                            lookback: int = 60,
                            entry_z: float = 2.0,
                            exit_z: float = 0.5
                            ) -> pd.Series:
    """
    Generate trading signals based on z-score of spread.
    Returns: Series of positions (-1, 0, +1)
    """
    rolling_mean = spread.rolling(window=lookback).mean()
    rolling_std = spread.rolling(window=lookback).std()
    zscore = (spread - rolling_mean) / rolling_std

    positions = pd.Series(0.0, index=spread.index)
    position = 0.0

    for i in range(lookback, len(spread)):
        z = zscore.iloc[i]

        if position == 0:
            if z > entry_z:
                position = -1.0   # Short the spread
            elif z < -entry_z:
                position = 1.0    # Long the spread
        elif position == 1.0:
            if z > -exit_z:
                position = 0.0    # Close long
        elif position == -1.0:
            if z < exit_z:
                position = 0.0    # Close short

        positions.iloc[i] = position

    return positions


# Example usage
np.random.seed(42)
n_days = 500

# Simulate cointegrated pair
common_factor = np.cumsum(np.random.randn(n_days) * 0.5)
noise_a = np.cumsum(np.random.randn(n_days) * 0.1)
noise_b = np.cumsum(np.random.randn(n_days) * 0.1)

# Mean-reverting noise ensures cointegration
mr_noise = np.zeros(n_days)
for t in range(1, n_days):
    mr_noise[t] = 0.9 * mr_noise[t - 1] + np.random.randn()

price_a = pd.Series(100 + common_factor + mr_noise + noise_a)
price_b = pd.Series(100 + common_factor + noise_b)

# Run the pipeline
hedge_ratio = estimate_hedge_ratio(price_a, price_b)
spread = compute_spread(price_a, price_b, hedge_ratio)
half_life = compute_half_life(spread)
signals = generate_zscore_signals(spread, lookback=60)

print(f"Hedge ratio: {hedge_ratio:.4f}")
print(f"Half-life: {half_life:.1f} days")
print(f"Number of trades: {(signals.diff().abs() > 0).sum()}")
```

---

## 2. Momentum Strategies

Momentum is the empirical observation that assets that have performed well recently tend to continue performing well (and vice versa). This is arguably the most robust anomaly in finance.

### 2.1 Time-Series Momentum (TSMOM)

Each asset is evaluated independently: go long if it has had positive returns, short if negative.

```
Signal for asset i at time t:

  r_i(t, t-k) = (P_i(t) - P_i(t-k)) / P_i(t-k)

  position_i(t) = sign(r_i(t, t-k)) * vol_target / sigma_i(t)

where:
  k          = lookback period (typically 1, 3, 6, or 12 months)
  vol_target = target annualized volatility (e.g., 10%)
  sigma_i(t) = estimated volatility of asset i
```

### 2.2 Cross-Sectional Momentum (XSMOM)

Assets are ranked relative to each other. Go long the top decile, short the bottom decile.

```
CROSS-SECTIONAL MOMENTUM
=========================

At each rebalance date:
1. Compute trailing returns for all N assets
2. Rank assets from 1 (worst) to N (best)
3. Long top quintile (rank > 0.8*N)
4. Short bottom quintile (rank < 0.2*N)

Returns:
  r_portfolio = (1/n_long) * sum(r_i for i in LONG)
              - (1/n_short) * sum(r_j for j in SHORT)

     Winners (Long)
  ^  +--------+
  |  | AAPL   | +25%    <-- Buy these
  |  | MSFT   | +22%
  |  | NVDA   | +18%
  |  |  ...   |
  R  | Neutral|
  a  |  ...   |
  n  | XOM    | -5%
  k  | BA     | -8%     <-- Short these
  |  | INTC   | -12%
  v  +--------+
     Losers (Short)
```

### 2.3 Momentum Crashes

Momentum strategies are subject to sudden, violent reversals, particularly during market regime changes:

```
Key risk factors:
1. Market reversals: When losers suddenly become winners (2009 March rally)
2. Crowding: When too many quants chase the same signal
3. Liquidity withdrawal: Short squeezes in shorted names
4. Regime change: Inflation/deflation shifts, policy changes

Mitigation:
- Dynamic hedging: Scale down when market volatility spikes
- Crash indicator: Monitor momentum factor's conditional skewness
- Diversification: Combine with value and other uncorrelated factors
- Stop-losses: Per-position and portfolio-level drawdown limits
```

---

## 3. Factor Models

Factor models decompose asset returns into systematic components (factors) and idiosyncratic residuals. They serve two purposes: explaining returns (risk model) and predicting returns (alpha model).

### 3.1 The Fama-French Framework

```
CAPM (1 factor):
  E[r_i] - r_f = beta_i * (E[r_m] - r_f)

Fama-French 3-Factor:
  r_i - r_f = alpha_i + beta_i^MKT * MKT + beta_i^SMB * SMB
            + beta_i^HML * HML + epsilon_i

  MKT = Market excess return (r_m - r_f)
  SMB = Small Minus Big (size factor)
  HML = High Minus Low (value factor: book-to-market)

Carhart 4-Factor (adds momentum):
  ... + beta_i^UMD * UMD + epsilon_i
  UMD = Up Minus Down (winners minus losers over past 12-1 months)

Fama-French 5-Factor:
  ... + beta_i^RMW * RMW + beta_i^CMA * CMA + epsilon_i
  RMW = Robust Minus Weak (profitability factor)
  CMA = Conservative Minus Aggressive (investment factor)
```

### 3.2 PCA-Based Statistical Factors

Instead of economically motivated factors, PCA extracts latent factors from the return covariance matrix:

```
Given return matrix R (T x N):

1. Compute covariance matrix: Sigma = (1/T) * R' * R
2. Eigendecomposition: Sigma = V * Lambda * V'
3. First k eigenvectors are the factor loadings
4. Factor returns: F = R * V_k

Choosing k:
- Scree plot: look for the "elbow"
- Explained variance ratio: cumsum(lambda_i) / sum(lambda_i) > threshold
- Tracy-Widom test for significant eigenvalues
- Typical: 5-15 factors explain 50-70% of variance for equities
```

### 3.3 Barra Risk Model

The Barra model (now MSCI) is the industry standard for equity risk:

```
r_i = sum_k(X_ik * f_k) + epsilon_i

X_ik = exposure of asset i to factor k (known, computed from observables)
f_k  = factor return at time t (estimated via cross-sectional regression)

Factor categories:
+------------------+----------------------------------+
| Category         | Factors                          |
+------------------+----------------------------------+
| Country          | USA, UK, Japan, ...              |
| Industry         | Technology, Healthcare, ...      |
| Style            | Value, Momentum, Size,           |
|                  | Volatility, Quality, Growth,     |
|                  | Dividend Yield, Leverage         |
+------------------+----------------------------------+

Risk model output:
  Sigma = X * F * X' + Delta

  X     = (N x K) factor exposure matrix
  F     = (K x K) factor covariance matrix
  Delta = (N x N) diagonal specific risk matrix
```

---

## 4. Alpha Research Pipeline

### 4.1 The Systematic Process

```
+----------+     +----------+     +----------+     +----------+
| Universe |     | Feature  |     | Signal   |     | Back-    |
| Selection| --> | Engineer | --> | Gener-   | --> | testing  |
|          |     |          |     | ation    |     |          |
+----------+     +----------+     +----------+     +----------+
     |                |                |                |
     v                v                v                v
  - Liquidity     - Price-based    - Z-scores       - Walk-forward
  - Market cap    - Fundamental    - Rank signals   - Transaction
  - Sector        - Alternative    - Composite        costs
  - ADV filter      data             alphas         - Slippage
                  - Microstructure                  - Capacity
                                        |
                                        v
                                  +----------+     +----------+
                                  | Paper    |     | Live     |
                                  | Trading  | --> | Trading  |
                                  +----------+     +----------+
```

### 4.2 Feature Engineering for Quant Strategies

```python
import pandas as pd
import numpy as np


def compute_alpha_features(prices: pd.DataFrame,
                           volumes: pd.DataFrame
                           ) -> pd.DataFrame:
    """
    Compute a battery of alpha features from price/volume data.
    Each feature is cross-sectionally ranked to normalize.
    """
    returns = prices.pct_change()
    log_returns = np.log(prices / prices.shift(1))

    features = {}

    # Momentum features
    for lookback in [5, 21, 63, 126, 252]:
        features[f'mom_{lookback}d'] = prices / prices.shift(lookback) - 1

    # Mean reversion (short-term reversal)
    features['reversal_5d'] = -(prices / prices.shift(5) - 1)

    # Volatility features
    for lookback in [21, 63]:
        features[f'realized_vol_{lookback}d'] = (
            returns.rolling(lookback).std() * np.sqrt(252)
        )

    # Volume features
    features['volume_ratio_5_20'] = (
        volumes.rolling(5).mean() / volumes.rolling(20).mean()
    )

    # VWAP reversion
    features['price_to_vwap'] = prices / (
        (prices * volumes).rolling(20).sum() /
        volumes.rolling(20).sum()
    )

    # Idiosyncratic volatility (residual vol after removing market)
    market_return = returns.mean(axis=1)
    for col in returns.columns:
        beta = (
            returns[col].rolling(63).cov(market_return) /
            market_return.rolling(63).var()
        )
        residual = returns[col] - beta * market_return
        features.setdefault('idio_vol', pd.DataFrame())[col] = (
            residual.rolling(63).std() * np.sqrt(252)
        )

    # Cross-sectional rank normalization
    ranked_features = {}
    for name, feature_df in features.items():
        if isinstance(feature_df, pd.DataFrame):
            ranked_features[name] = feature_df.rank(axis=1, pct=True) - 0.5
        else:
            ranked_features[name] = feature_df

    return ranked_features
```

---

## 5. Machine Learning in Quant Finance

### 5.1 Cross-Validation for Time Series

Standard k-fold CV is invalid for time series because it leaks future information. Use time-aware methods:

```
WALK-FORWARD VALIDATION
========================

Time -->
|--TRAIN--|--TEST--|
     |--TRAIN--|--TEST--|
          |--TRAIN--|--TEST--|

With embargo (gap between train and test to prevent leakage):

|--TRAIN--|--GAP--|--TEST--|
     |--TRAIN--|--GAP--|--TEST--|

PURGED K-FOLD (de Prado)
=========================

For overlapping labels (e.g., forward returns computed over 5 days):
- Remove from training any sample whose label overlaps with test period
- Add embargo period after each test fold

Fold 1: |---TEST---|=EMBARGO=|---TRAIN (purged)---|
Fold 2: |---TRAIN (purged)---|=EMBARGO=|---TEST---|---TRAIN (purged)---|
```

```python
from sklearn.model_selection import TimeSeriesSplit


def walk_forward_cv(features: pd.DataFrame,
                    labels: pd.Series,
                    model_class,
                    n_splits: int = 5,
                    embargo_pct: float = 0.01):
    """
    Walk-forward cross-validation with embargo period.
    """
    tscv = TimeSeriesSplit(n_splits=n_splits)
    results = []

    for train_idx, test_idx in tscv.split(features):
        # Apply embargo: remove last embargo_pct of training data
        embargo_size = int(len(train_idx) * embargo_pct)
        if embargo_size > 0:
            train_idx = train_idx[:-embargo_size]

        x_train = features.iloc[train_idx]
        y_train = labels.iloc[train_idx]
        x_test = features.iloc[test_idx]
        y_test = labels.iloc[test_idx]

        model = model_class()
        model.fit(x_train, y_train)
        predictions = model.predict(x_test)

        ic = np.corrcoef(predictions, y_test)[0, 1]
        results.append({
            'train_start': features.index[train_idx[0]],
            'train_end': features.index[train_idx[-1]],
            'test_start': features.index[test_idx[0]],
            'test_end': features.index[test_idx[-1]],
            'ic': ic,
            'n_train': len(train_idx),
            'n_test': len(test_idx)
        })

    return pd.DataFrame(results)
```

### 5.2 Overfitting Detection

```
Signs of overfitting:
1. In-sample Sharpe >> Out-of-sample Sharpe (ratio > 2x is suspect)
2. Strategy requires many parameters (degrees of freedom)
3. Performance degrades sharply with transaction costs
4. Large gap between walk-forward folds
5. Strategy only works on specific time period

The Deflated Sharpe Ratio (Bailey & de Prado):
  Tests whether observed Sharpe is significant given the number
  of strategies tried (multiple testing correction).

  DSR = Phi(
    (SR_hat - SR_0) * sqrt(T) /
    sqrt(1 - skew * SR_hat + (kurt - 1)/4 * SR_hat^2)
  )

  where SR_0 = E[max(SR_1, ..., SR_N)] for N independent trials
  under H0 that all true Sharpes are zero.

Minimum Backtest Length (MinBTL):
  The minimum history needed to distinguish skill from luck:

  MinBTL = (1 + (1 - skew * SR + (kurt-1)/4 * SR^2)) /
           (SR^2 / (1 - skew * SR + ...))

  For SR = 1.0 with normal returns, MinBTL ~= 4 years
  For SR = 2.0, MinBTL ~= 1 year
```

---

## 6. Portfolio Construction

### 6.1 Mean-Variance Optimization (Markowitz)

```
Objective: maximize expected return for a given level of risk

  max   w' * mu - (lambda/2) * w' * Sigma * w
  s.t.  sum(w_i) = 1
        w_i >= 0  (long-only constraint, optional)

Solution (unconstrained):
  w* = (1/lambda) * Sigma^{-1} * mu

Problems with naive MV optimization:
1. Sigma^{-1} is unstable (small eigenvalues amplified)
2. mu is estimated with large error
3. Optimal weights are extreme (corner solutions)
4. Highly sensitive to input changes

Remedies:
- Shrinkage estimators (Ledoit-Wolf) for Sigma
- Bayesian priors (Black-Litterman) for mu
- Regularization: add penalty ||w||^2 to objective
- Robust optimization: optimize for worst-case inputs
```

### 6.2 Black-Litterman Model

```
Black-Litterman combines market equilibrium returns with investor views:

Step 1: Implied equilibrium returns
  pi = lambda * Sigma * w_mkt

  where w_mkt = market cap weights
        lambda = risk aversion coefficient

Step 2: Express views as P * mu = q + epsilon
  P = (K x N) pick matrix (which assets the view is about)
  q = (K x 1) expected returns under each view
  Omega = (K x K) uncertainty in views

Step 3: Posterior expected returns
  mu_BL = [(tau * Sigma)^{-1} + P' * Omega^{-1} * P]^{-1}
        * [(tau * Sigma)^{-1} * pi + P' * Omega^{-1} * q]

Step 4: Posterior covariance
  Sigma_BL = Sigma + [(tau * Sigma)^{-1} + P' * Omega^{-1} * P]^{-1}

Step 5: Optimize using mu_BL and Sigma_BL
```

### 6.3 Risk Parity

```
Risk parity equalizes the risk contribution of each asset:

  RC_i = w_i * (Sigma * w)_i / (w' * Sigma * w)

  Target: RC_i = 1/N for all i (equal risk contribution)

This leads to the optimization:
  min  sum_i (RC_i - 1/N)^2

  which has closed-form for 2 assets:
    w_1 / w_2 = sigma_2 / sigma_1

For N assets with no correlations:
  w_i proportional to 1 / sigma_i
```

### 6.4 Kelly Criterion

```
The Kelly criterion maximizes the long-run growth rate of wealth:

Single asset (binary outcome):
  f* = (p * b - q) / b

  where p = probability of winning
        b = odds (win amount / bet amount)
        q = 1 - p

Continuous case (normally distributed returns):
  f* = mu / sigma^2

Multi-asset Kelly:
  f* = Sigma^{-1} * mu

In practice, use FRACTIONAL Kelly (typically 1/4 to 1/2 Kelly):
- Full Kelly has very large drawdowns
- Half-Kelly achieves 75% of the growth rate with much lower variance
- Quarter-Kelly is common in production trading systems
```

### 6.5 Python Implementation: Mean-Variance Optimization

```python
import numpy as np
from scipy.optimize import minimize


def mean_variance_optimize(
    expected_returns: np.ndarray,
    cov_matrix: np.ndarray,
    risk_aversion: float = 1.0,
    long_only: bool = True,
    max_weight: float = 0.10
) -> np.ndarray:
    """
    Mean-variance portfolio optimization with constraints.
    """
    n_assets = len(expected_returns)

    def neg_utility(weights):
        port_return = weights @ expected_returns
        port_variance = weights @ cov_matrix @ weights
        return -(port_return - (risk_aversion / 2) * port_variance)

    constraints = [
        {'type': 'eq', 'fun': lambda w: np.sum(w) - 1.0}
    ]

    if long_only:
        bounds = [(0.0, max_weight) for _ in range(n_assets)]
    else:
        bounds = [(-max_weight, max_weight) for _ in range(n_assets)]

    initial_weights = np.ones(n_assets) / n_assets

    result = minimize(
        neg_utility,
        initial_weights,
        method='SLSQP',
        bounds=bounds,
        constraints=constraints
    )

    if not result.success:
        raise ValueError(f"Optimization failed: {result.message}")

    return result.x


def risk_parity_optimize(cov_matrix: np.ndarray) -> np.ndarray:
    """
    Risk parity portfolio: equalize risk contributions.
    """
    n_assets = cov_matrix.shape[0]

    def risk_budget_objective(weights):
        port_vol = np.sqrt(weights @ cov_matrix @ weights)
        marginal_risk = cov_matrix @ weights
        risk_contributions = weights * marginal_risk / port_vol
        target_rc = port_vol / n_assets
        return np.sum((risk_contributions - target_rc) ** 2)

    constraints = [
        {'type': 'eq', 'fun': lambda w: np.sum(w) - 1.0}
    ]
    bounds = [(0.01, 1.0) for _ in range(n_assets)]
    initial_weights = np.ones(n_assets) / n_assets

    result = minimize(
        risk_budget_objective,
        initial_weights,
        method='SLSQP',
        bounds=bounds,
        constraints=constraints
    )

    return result.x


# Example
np.random.seed(42)
n_assets = 5
mu = np.array([0.08, 0.10, 0.12, 0.06, 0.09])

# Generate a valid covariance matrix
A = np.random.randn(n_assets, n_assets) * 0.1
cov = A @ A.T + np.eye(n_assets) * 0.01

w_mv = mean_variance_optimize(mu, cov, risk_aversion=2.0)
w_rp = risk_parity_optimize(cov)

print("Mean-Variance weights:", np.round(w_mv, 4))
print("Risk Parity weights:", np.round(w_rp, 4))
```

---

## 7. Risk Management

### 7.1 Value at Risk (VaR)

VaR answers: "What is the maximum loss at confidence level alpha over horizon h?"

```
VaR_alpha = -quantile(portfolio_returns, 1 - alpha)

Three approaches:

1. HISTORICAL VaR
   - Sort historical returns
   - VaR = negative of the (1-alpha) percentile
   - Pro: No distributional assumptions
   - Con: Limited by historical sample, slow to adapt

2. PARAMETRIC (GAUSSIAN) VaR
   - Assume returns ~ N(mu, sigma^2)
   - VaR_alpha = -(mu + z_alpha * sigma)
   - For 99% VaR: z_0.01 = -2.326
   - Pro: Simple, fast
   - Con: Underestimates tail risk (fat tails in practice)

3. MONTE CARLO VaR
   - Simulate thousands of portfolio return scenarios
   - VaR = negative of the (1-alpha) percentile of simulations
   - Pro: Handles nonlinear positions (options), fat tails
   - Con: Computationally expensive, model-dependent

VaR Scaling (square-root of time):
  VaR_h = VaR_1 * sqrt(h)
  (Only valid under i.i.d. assumption -- often violated!)
```

### 7.2 CVaR / Expected Shortfall

```
CVaR (Conditional VaR) = Expected loss given that loss exceeds VaR

  CVaR_alpha = -E[r | r < -VaR_alpha]
             = -(1/(1-alpha)) * integral_{-inf}^{-VaR} r * f(r) dr

For Gaussian:
  CVaR_alpha = -(mu + sigma * phi(z_alpha) / (1-alpha))

  where phi() is the standard normal PDF
        z_alpha is the alpha-quantile of N(0,1)

CVaR is "coherent" (satisfies subadditivity), VaR is not.
Regulators increasingly prefer CVaR (Basel III uses Expected Shortfall).
```

### 7.3 Drawdown Analysis

```
Drawdown at time t:
  DD(t) = (Peak(t) - Value(t)) / Peak(t)
  where Peak(t) = max_{s <= t} Value(s)

Maximum Drawdown:
  MDD = max_t DD(t)

Calmar Ratio = Annual Return / Maximum Drawdown
  - Calmar > 1.0 is acceptable
  - Calmar > 2.0 is good
  - Calmar > 3.0 is excellent

Sterling Ratio = Annual Return / Average of N worst drawdowns
```

---

## 8. Backtesting Pitfalls

### 8.1 Common Biases

```
+------------------+----------------------------------------------+
| Bias             | Description & Remedy                          |
+------------------+----------------------------------------------+
| Look-ahead       | Using future data in decisions               |
|                  | --> Strict point-in-time data management      |
+------------------+----------------------------------------------+
| Survivorship     | Only testing on stocks that still exist       |
|                  | --> Use survivorship-bias-free datasets       |
+------------------+----------------------------------------------+
| Overfitting      | Tuning parameters to fit noise               |
|                  | --> Walk-forward validation, regularization   |
+------------------+----------------------------------------------+
| Selection        | Cherry-picking the best backtest run          |
|                  | --> Deflated Sharpe Ratio correction          |
+------------------+----------------------------------------------+
| Transaction cost | Ignoring or underestimating trading costs     |
|                  | --> Model spread, market impact, commissions  |
+------------------+----------------------------------------------+
| Fill assumption  | Assuming trades execute at desired price      |
|                  | --> Model slippage, partial fills, latency    |
+------------------+----------------------------------------------+
```

### 8.2 Transaction Cost Modeling

```
Total cost per trade = Spread cost + Market impact + Commission

Spread cost = 0.5 * bid_ask_spread

Market impact (Almgren-Chriss):
  I = gamma * sigma * sqrt(V / ADV) * sign(V)

  gamma = market impact coefficient (~0.1 to 0.5)
  sigma = daily volatility
  V     = trade size
  ADV   = average daily volume

Example: Trading $1M of a stock with ADV = $50M, sigma = 2%
  I = 0.3 * 0.02 * sqrt(1/50) = 0.3 * 0.02 * 0.141 = 0.085%
  Cost = $1M * 0.00085 = $850
```

---

## 9. Interview Problems

### Problem 1: Pairs Trading Design

**Q: You discover that Coca-Cola (KO) and PepsiCo (PEP) are cointegrated. Design a full pairs trading strategy. What could go wrong?**

**A:**
```
Strategy Design:
1. Estimate hedge ratio via rolling OLS (60-day window)
2. Compute spread: S(t) = KO(t) - beta * PEP(t)
3. Compute rolling z-score (60-day lookback)
4. Entry: |z| > 2.0, Exit: |z| < 0.5, Stop-loss: |z| > 4.0
5. Position size: 1% of NAV per unit of spread

Risk factors:
- Structural break: M&A, management change, regulatory shift
  breaks the cointegrating relationship permanently
- Divergence risk: spread can widen before reverting
  (need stop-losses and max holding period)
- Liquidity risk: bid-ask spread widens during stress
- Crowding: many quants trade the same pairs
- Hedge ratio instability: beta changes over time
  (use rolling estimation, Kalman filter)
- Transaction costs: frequent rebalancing erodes edge
- Short squeeze: difficulty borrowing shares to short
```

### Problem 2: Factor Model Regression

**Q: You run a regression of stock returns on Fama-French factors and get alpha = 0.3% per month with t-stat = 1.8. Is this significant?**

**A:**
```
At 5% significance, we need |t| > 1.96 for a two-sided test.
t = 1.8 < 1.96, so NOT significant at 5%.

However, we must consider:
1. Multiple testing: If we tested 100 strategies, by chance
   5 would have |t| > 1.96. Apply Bonferroni or BH correction.

2. Practical significance: 0.3%/month = 3.6%/year excess return.
   Even if marginally insignificant, this could be economically
   meaningful with enough data.

3. Power considerations: With short sample (e.g., 5 years = 60 obs),
   we have low power to detect true alpha.

4. Harvey, Liu & Zhu (2016) argue that for new factors,
   t-stat should exceed 3.0 given the multiple testing problem
   in published finance research.

5. Out-of-sample testing is more convincing than in-sample t-stats.
```

### Problem 3: Sharpe Ratio Estimation

**Q: Your backtest shows a Sharpe ratio of 2.5 over 3 years. How confident should you be?**

**A:**
```
The standard error of the Sharpe ratio is approximately:

  SE(SR) = sqrt((1 + 0.5 * SR^2) / T)

For SR = 2.5, T = 3 years:
  SE(SR) = sqrt((1 + 0.5 * 6.25) / 3) = sqrt(4.125 / 3) = sqrt(1.375)
         = 1.17

95% CI: SR +/- 1.96 * SE = 2.5 +/- 2.3 = (0.2, 4.8)

The confidence interval includes values close to zero!
A Sharpe of 2.5 over only 3 years is NOT statistically robust.

Additional concerns:
- Was this the only strategy tested? (selection bias)
- Are returns normally distributed? (fat tails inflate SR)
- Is the strategy capacity-constrained?
- Does it survive realistic transaction costs?
```

### Problem 4: Mean Reversion vs. Momentum

**Q: Can mean reversion and momentum both be true simultaneously?**

**A:**
```
Yes! They operate at different frequencies and asset levels:

Frequency decomposition:
- Ultra-short term (seconds-minutes): Microstructure mean reversion
- Short term (1-5 days): Mean reversion (bid-ask bounce, overreaction)
- Medium term (1-12 months): Momentum (underreaction to information)
- Long term (3-5 years): Mean reversion (value, contrarian)

Cross-sectional vs. time-series:
- Cross-sectionally: momentum (winners keep winning vs. losers)
- Within a single asset: mean reversion at different horizons

The Jegadeesh & Titman (1993) finding of 12-month momentum
coexists with De Bondt & Thaler (1985) finding of 3-5 year
reversal. There is no contradiction.

In practice, many quant firms combine both signals with
appropriate horizons and horizon-specific portfolio construction.
```

### Problem 5: Walk-Forward Overfitting

**Q: You test 1000 parameter combinations and select the best Sharpe. How do you adjust for overfitting?**

**A:**
```
Multiple testing correction approaches:

1. Bonferroni: Divide significance level by number of tests
   alpha_adjusted = 0.05 / 1000 = 0.00005
   Extremely conservative (assumes independence)

2. Holm-Bonferroni: Sequential rejection (less conservative)

3. Benjamini-Hochberg (FDR): Control false discovery rate
   Sort p-values, reject if p_(i) < (i/m) * alpha

4. Deflated Sharpe Ratio (Bailey & de Prado):
   Computes the probability that the best Sharpe is due to luck:
   SR_0 = sqrt(V[(SR)]) * ((1 - gamma) * Phi^{-1}(1 - 1/N)
          + gamma * Phi^{-1}(1 - 1/(N*e)))
   where gamma ~= 0.5772 (Euler-Mascheroni constant)
         N = number of trials

   For N=1000 and annual SR variance of 1:
   SR_0 ~= 3.1
   So your observed SR must exceed ~3.1 to be significant!

5. CSCV (Combinatorially Symmetric Cross-Validation):
   - Split backtest into S subsets
   - For each combination of train/test split,
     select best model on train, evaluate on test
   - If most test Sharpes are positive, strategy is likely real
```

### Problem 6: Portfolio Risk Decomposition

**Q: How would you decompose a portfolio's risk into factor risk and idiosyncratic risk?**

**A:**
```
Using the factor model: r = X * f + epsilon

Portfolio variance:
  sigma_p^2 = w' * Sigma * w
            = w' * (X * F * X' + Delta) * w
            = (w'X) * F * (X'w) + w' * Delta * w
            = h' * F * h + sum(w_i^2 * delta_i^2)

where:
  h = X'w = portfolio factor exposures
  h' * F * h = systematic (factor) risk
  sum(w_i^2 * delta_i^2) = idiosyncratic risk

Risk contribution of factor k:
  RC_k = h_k * (F * h)_k / sigma_p^2

In a well-diversified portfolio (N > 50):
  - Factor risk dominates (~90-95% of total risk)
  - Idiosyncratic risk diversifies away (~5-10%)

If idiosyncratic risk is high, the portfolio is concentrated.
If factor risk is dominated by one factor, the portfolio
is essentially a factor bet, not true alpha.
```

### Problem 7: Capacity Estimation

**Q: Your strategy trades US mid-cap stocks and generates 15% annual alpha with $100M. How do you estimate capacity?**

**A:**
```
Capacity analysis:

1. Market impact analysis:
   For each stock, compute: impact = gamma * sigma * sqrt(V_i / ADV_i)
   Aggregate impact = sum(|w_i| * impact_i)

   Find AUM where aggregate impact erodes alpha by 50%:
   alpha_net(AUM) = alpha_gross - f(AUM)
   Solve for AUM where alpha_net = alpha_gross / 2

2. Participation rate constraint:
   Daily turnover * AUM < X% of ADV for each stock
   Typical constraint: < 5% of ADV for mid-caps

   If universe median ADV = $20M, strategy turns over 100%/month:
   Max position per stock: 5% * $20M = $1M
   With 200 stocks: Capacity ~= 200 * $1M = $200M

3. Liquidity-adjusted capacity:
   Weight by liquidity: more liquid names get larger positions
   Recompute using Almgren-Chriss optimal execution

4. Decay function:
   Plot Sharpe ratio vs. AUM from backtest with realistic
   market impact. Capacity = AUM where Sharpe drops below 1.0.
```

### Problem 8: Correlation Breakdown

**Q: Why do correlations increase during market crises, and how does this affect portfolio construction?**

**A:**
```
Correlations increase in crises due to:

1. Common factor exposure: During crises, one factor (market risk)
   dominates, making all stocks move together.

2. Leverage-liquidity spiral: Forced selling affects all assets,
   creating artificial correlation.

3. Contagion: Defaults and margin calls cascade across markets.

4. Behavioral herding: Panic selling is indiscriminate.

Impact on portfolio construction:
- Diversification benefits disappear exactly when needed most
- VaR computed with normal-period correlations is too optimistic
- Risk parity portfolios can underperform (all assets fall together)

Remedies:
- Regime-dependent covariance estimation (DCC-GARCH, Markov switching)
- Stress testing with crisis-period correlations
- Tail risk hedging (put options, volatility strategies)
- Copula models that capture tail dependence (Clayton, Gumbel)
- Use shrinkage toward higher correlation as conservative estimate

Formal: if rho_calm = 0.3 and rho_crisis = 0.8,
  and P(crisis) = 0.1, then:
  E[rho] = 0.9 * 0.3 + 0.1 * 0.8 = 0.35
  But the marginal risk of the crisis state dominates total risk.
```

---

## 10. Key Formulas Reference

```
+----------------------------------------------+
| STATISTICAL ARBITRAGE CHEAT SHEET             |
+----------------------------------------------+
| Z-score: z = (x - mu) / sigma               |
| Half-life: HL = -ln(2) / ln(1 + phi)        |
| Sharpe: SR = (r_p - r_f) / sigma_p          |
| Info Ratio: IR = alpha / tracking_error      |
| Kelly: f* = mu / sigma^2                    |
| VaR(99%): mu + 2.326 * sigma               |
| Max Drawdown: max_t (peak_t - value_t)/peak |
| Herfindahl: H = sum(w_i^2)                  |
| Effective N: N_eff = 1 / H                  |
| Annualized SR: SR_annual = SR_daily*sqrt(252)|
+----------------------------------------------+
```

---

*Next Chapter: [Chapter 6 - Coding Challenges for Quant Interviews](06-CODING-CHALLENGES.md)*
