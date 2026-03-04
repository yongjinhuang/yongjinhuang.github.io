# Time Series Analysis for Financial Data

## Introduction

Every price you see on a trading screen is a point in a time series. The entire history of a stock, bond, commodity, or cryptocurrency is an ordered sequence of observations indexed by time. Time series analysis gives us the mathematical machinery to decompose these sequences, model their dynamics, forecast their future, and -- most importantly for quant traders -- detect exploitable structure.

This chapter builds your toolkit from foundational concepts (stationarity, autocorrelation) through classical models (ARIMA, GARCH) to advanced techniques (cointegration, regime detection, spectral analysis, fractional differencing). Every concept connects directly to a trading application.

```
+------------------------------------------------------------------------+
|                TIME SERIES ANALYSIS PIPELINE                           |
+------------------------------------------------------------------------+
|                                                                        |
|  Raw Price Data                                                        |
|       |                                                                |
|       v                                                                |
|  [1. Stationarity Testing] -----> Non-stationary? ---> Transform       |
|       |                              (ADF, KPSS)        (diff, log)    |
|       v                                                                |
|  [2. Autocorrelation Analysis] --> ACF/PACF patterns                   |
|       |                              (Ljung-Box test)                  |
|       v                                                                |
|  [3. Model Selection] ----------> ARIMA for mean dynamics              |
|       |                           GARCH for volatility                 |
|       v                                                                |
|  [4. Multi-Asset Analysis] -----> Cointegration (pairs trading)        |
|       |                           VAR (cross-asset dynamics)           |
|       v                                                                |
|  [5. Regime Detection] ---------> HMM (bull/bear states)               |
|       |                           Change point detection               |
|       v                                                                |
|  [6. Frequency Domain] ---------> Fourier/Wavelet (cycle hunting)      |
|       |                                                                |
|       v                                                                |
|  Trading Signal Generation                                             |
|                                                                        |
+------------------------------------------------------------------------+
```

---

## 1. Stationarity

### Why Stationarity Matters

A time series is **stationary** when its statistical properties do not change over time. This is the single most important concept in time series analysis because virtually every classical model assumes stationarity.

```
STATIONARY SERIES                    NON-STATIONARY SERIES
(e.g., daily returns)                (e.g., stock prices)

  ^                                    ^
  |  *  *     *  *                     |                    *
  | * ** * * * ** *                    |                 *
  |* * * ** * * * **                   |              *
--+--*-*--*--*-*--*--> t              |           *
  |*  *  *  * *  *                     |        *
  | *    *     *                       |     *
  |                                    |  *
                                       +--*-*--------------> t
  Mean: constant                       Mean: trending up
  Variance: constant                   Variance: may change
  Autocovariance: f(lag only)          Autocovariance: f(time, lag)
```

**Why does this matter for trading?**

1. **Model validity**: OLS regression on non-stationary data produces spurious results (Granger & Newbold, 1974). R-squared looks great, t-stats look significant, but the relationship is meaningless.
2. **Forecast reliability**: Forecasting a stationary process gives bounded confidence intervals. Forecasting a random walk gives intervals that grow to infinity.
3. **Mean reversion**: Stationary series revert to their mean -- this is directly tradeable. Non-stationary series can wander arbitrarily far.

### Strict vs Weak Stationarity

**Strict (strong) stationarity**: The entire joint distribution of any collection of observations is invariant to time shifts. For any set of times t1, t2, ..., tk and any shift h:

```
F(x_{t1}, x_{t2}, ..., x_{tk}) = F(x_{t1+h}, x_{t2+h}, ..., x_{tk+h})
```

This is a very strong requirement -- all moments, all joint distributions must be time-invariant.

**Weak (covariance/second-order) stationarity**: Only the first two moments need be time-invariant:

```
1. E[X_t] = mu           (constant mean, for all t)
2. Var(X_t) = sigma^2    (constant variance, for all t)
3. Cov(X_t, X_{t+h}) = gamma(h)   (autocovariance depends only on lag h)
```

In practice, we almost always work with weak stationarity. Financial returns are typically weakly stationary (constant mean and variance) but not strictly stationary (the full distribution changes -- fat tails, skewness shifts).

### Unit Root Tests

A **unit root** means the series has a stochastic trend and is non-stationary. Consider the AR(1) model:

```
X_t = phi * X_{t-1} + epsilon_t

If |phi| < 1:  stationary (shocks decay, series reverts to mean)
If  phi  = 1:  unit root / random walk (shocks persist forever)
If |phi| > 1:  explosive (shocks amplify -- rare in financial data)
```

#### Augmented Dickey-Fuller (ADF) Test

The most widely used unit root test. Tests the null hypothesis that a unit root is present.

```
Regression:  delta(X_t) = alpha + beta*t + gamma*X_{t-1}
                          + sum(delta_i * delta(X_{t-i})) + epsilon_t

H0: gamma = 0   (unit root exists, non-stationary)
H1: gamma < 0   (no unit root, stationary)

Decision: Reject H0 if test statistic < critical value
          (uses non-standard Dickey-Fuller distribution, NOT normal)
```

```python
import numpy as np
import pandas as pd
from statsmodels.tsa.stattools import adfuller

def adf_test(series, name="Series"):
    """Run ADF test and print results."""
    result = adfuller(series.dropna(), autolag="AIC")

    labels = [
        "ADF Statistic",
        "p-value",
        "Lags Used",
        "Observations",
    ]

    output = dict(zip(labels, result[:4]))
    for key, value in result[4].items():
        output[f"Critical Value ({key})"] = value

    print(f"ADF Test: {name}")
    print("-" * 40)
    for key, val in output.items():
        print(f"  {key}: {val:.4f}" if isinstance(val, float) else f"  {key}: {val}")

    is_stationary = result[1] < 0.05
    print(f"  Conclusion: {'Stationary' if is_stationary else 'Non-stationary'} (5% level)")
    print()
    return is_stationary

# Example: SPY prices vs returns
prices = pd.Series([100, 101.2, 99.8, 102.5, 103.1, 101.9, 104.2, 105.0,
                     103.8, 106.1, 107.5, 105.2, 108.0, 109.3, 107.8])
returns = prices.pct_change().dropna()

adf_test(prices, "SPY Prices")      # Expect: Non-stationary
adf_test(returns, "SPY Returns")    # Expect: Stationary
```

#### KPSS Test (Kwiatkowski-Phillips-Schmidt-Shin)

The KPSS test flips the null hypothesis -- it tests whether the series IS stationary.

```
H0: Series is stationary (trend-stationary or level-stationary)
H1: Series has a unit root

Why use KPSS alongside ADF?
- ADF has low power against near-unit-root alternatives
- Using both tests together resolves ambiguity:

  ADF       KPSS       Conclusion
  --------- ---------- ---------------------------
  Reject    No reject  Stationary (both agree)
  No reject Reject     Non-stationary (both agree)
  Reject    Reject     Trend-stationary
  No reject No reject  Inconclusive (need more data)
```

```python
from statsmodels.tsa.stattools import kpss

def kpss_test(series, name="Series", regression="c"):
    """Run KPSS test. regression='c' for level, 'ct' for trend."""
    stat, p_value, n_lags, critical_values = kpss(
        series.dropna(), regression=regression, nlags="auto"
    )

    print(f"KPSS Test: {name} (regression='{regression}')")
    print("-" * 40)
    print(f"  KPSS Statistic: {stat:.4f}")
    print(f"  p-value: {p_value:.4f}")
    print(f"  Lags Used: {n_lags}")
    for key, val in critical_values.items():
        print(f"  Critical Value ({key}): {val:.4f}")

    is_stationary = p_value > 0.05
    print(f"  Conclusion: {'Stationary' if is_stationary else 'Non-stationary'} (5% level)")
    print()
    return is_stationary
```

#### Phillips-Perron Test

Similar to ADF but uses a non-parametric correction for serial correlation instead of adding lagged difference terms. More robust to heteroskedasticity.

```python
from arch.unitroot import PhillipsPerron

def pp_test(series, name="Series"):
    """Run Phillips-Perron test."""
    pp = PhillipsPerron(series.dropna())
    print(f"Phillips-Perron Test: {name}")
    print("-" * 40)
    print(f"  PP Statistic: {pp.stat:.4f}")
    print(f"  p-value: {pp.pvalue:.4f}")
    print(f"  Conclusion: {'Stationary' if pp.pvalue < 0.05 else 'Non-stationary'}")
    print()
```

### Making Financial Series Stationary

```
TRANSFORMATION PIPELINE
========================

Raw prices P_t
     |
     +---> [Log Transform] ---> log(P_t)
     |            |
     |            +---> [First Difference] ---> log(P_t) - log(P_{t-1})
     |                        |                     = log(P_t / P_{t-1})
     |                        |                     = log return (approx % return)
     |                        |
     |                        +---> Still non-stationary?
     |                                    |
     |                                    +---> [Second Difference] (rare)
     |
     +---> [Percentage Change] ---> (P_t - P_{t-1}) / P_{t-1}
                                        = simple return
```

```python
import numpy as np
import pandas as pd

def make_stationary(prices):
    """Transform price series to stationary returns."""
    # Simple returns: (P_t - P_{t-1}) / P_{t-1}
    simple_returns = prices.pct_change().dropna()

    # Log returns: log(P_t / P_{t-1})  -- preferred for many reasons
    log_returns = np.log(prices / prices.shift(1)).dropna()

    # First difference of prices: P_t - P_{t-1}
    price_diff = prices.diff().dropna()

    # First difference of log prices (same as log returns)
    log_diff = np.log(prices).diff().dropna()

    return {
        "simple_returns": simple_returns,
        "log_returns": log_returns,
        "price_diff": price_diff,
    }

# Why log returns are preferred:
# 1. Additive over time:  r_{t,t+2} = r_{t,t+1} + r_{t+1,t+2}
# 2. Symmetric: +5% and -5% are equidistant from 0
# 3. Approximately normal (by CLT)
# 4. Can't produce prices < 0 (exp of any number is positive)
# 5. For small returns: log(1+r) ≈ r
```

### Trend-Stationary vs Difference-Stationary

Two types of non-stationarity require different treatments:

```
TREND-STATIONARY                     DIFFERENCE-STATIONARY
X_t = alpha + beta*t + epsilon_t     X_t = X_{t-1} + epsilon_t

  ^     *                              ^
  |   *   *   *                        |          *
  | *   *   *   * *                    |       *    *
  |  * *  *  *  *   *                  |     *        *
  +---*--*---*---*-----> t             |  *     *
  |  Deterministic trend               | *
  |  Remove by regression              +*-*----------------> t
  |  (subtract fitted line)            | Stochastic trend
                                       | Remove by differencing
                                       | (X_t - X_{t-1})

Remedy: Detrend (regress on t)       Remedy: Difference
        X_t - (a + b*t)                      delta(X_t) = X_t - X_{t-1}
```

**Critical distinction**: If you difference a trend-stationary series, you introduce unnecessary MA structure. If you detrend a difference-stationary series, the residuals are still non-stationary.

---

## 2. Autocorrelation Analysis

### ACF (Autocorrelation Function)

The ACF measures the correlation between a time series and its lagged values:

```
            Cov(X_t, X_{t+k})       gamma(k)
rho(k) = ---------------------- = -----------
            Var(X_t)                gamma(0)

where gamma(k) is the autocovariance at lag k
```

```
TYPICAL ACF PATTERNS
====================

AR(1), phi=0.8:              MA(1), theta=0.6:
  ACF                          ACF
  1.0 |*                       1.0 |*
  0.8 | *                      0.6 | *
  0.6 |  *                     0.0 |  *--*--*--*--*
  0.5 |   *                        |
  0.4 |    *                   (cuts off after lag 1)
  0.3 |     *
  0.2 |      *  *
  0.1 |            *  *  *
  0.0 +--+--+--+--+--+--+-lag
      0  1  2  3  4  5  6
  (decays exponentially)

AR(2):                         ARMA(1,1):
  ACF                          ACF
  1.0 |*                       1.0 |*
  0.7 | *                      0.7 | *
  0.3 |  *                     0.4 |  *
  0.0 |---*--------*-----      0.2 |   *
 -0.2 |      *        *       0.1 |    *  *
 -0.3 |         *              0.0 +--+--+--+--+--+-lag
  (damped sinusoidal decay)    (exponential decay after lag 1)

White Noise:                   Random Walk (differenced):
  ACF                          ACF
  1.0 |*                       1.0 |*
  0.0 |--*--*--*--*--*---      0.0 |--*--*--*--*--*---
      |                            |
  (no significant lags)        (no significant lags -- it IS white noise)
```

### PACF (Partial Autocorrelation Function)

The PACF measures the correlation between X_t and X_{t+k} **after removing the linear dependence on X_{t+1}, ..., X_{t+k-1}**.

```
PACF KEY INSIGHT:
=================
- AR(p) process: PACF cuts off after lag p
- MA(q) process: PACF decays gradually
- This is the MIRROR of ACF behavior

  Process    ACF                    PACF
  --------   -------------------    -------------------
  AR(p)      Decays gradually       Cuts off after lag p
  MA(q)      Cuts off after lag q   Decays gradually
  ARMA(p,q)  Decays gradually       Decays gradually

PACF for AR(2), phi1=0.6, phi2=0.3:

  PACF
  1.0 |*
  0.6 | *
  0.3 |  *
  0.0 |---*--*--*--*--*--> lag
      0  1  2  3  4  5  6
  (cuts off after lag 2 -- tells us AR order is 2)
```

```python
import numpy as np
import pandas as pd
from statsmodels.tsa.stattools import acf, pacf
from statsmodels.graphics.tsaplots import plot_acf, plot_pacf
from statsmodels.stats.diagnostic import acorr_ljungbox

def analyze_autocorrelation(series, nlags=20, name="Series"):
    """Comprehensive autocorrelation analysis."""
    acf_values = acf(series, nlags=nlags, fft=True)
    pacf_values = pacf(series, nlags=nlags, method="ywm")

    # Significance bound (95% confidence)
    n = len(series)
    sig_bound = 1.96 / np.sqrt(n)

    print(f"Autocorrelation Analysis: {name}")
    print(f"Observations: {n}")
    print(f"95% Significance Bound: +/- {sig_bound:.4f}")
    print()

    # Print ACF and PACF side by side
    print(f"{'Lag':<5} {'ACF':<10} {'PACF':<10} {'ACF Sig?':<10} {'PACF Sig?':<10}")
    print("-" * 45)
    for i in range(1, nlags + 1):
        acf_sig = "*" if abs(acf_values[i]) > sig_bound else ""
        pacf_sig = "*" if abs(pacf_values[i]) > sig_bound else ""
        print(f"{i:<5} {acf_values[i]:<10.4f} {pacf_values[i]:<10.4f} {acf_sig:<10} {pacf_sig:<10}")

    return acf_values, pacf_values
```

### Ljung-Box Test

Tests whether a series exhibits significant autocorrelation at any lag up to a specified number. Essential for checking if residuals from a fitted model are white noise.

```
H0: The data are independently distributed (no serial correlation)
H1: The data exhibit serial correlation

Test statistic:
                     k
Q(k) = n(n+2) * SUM    rho(j)^2 / (n - j)
                    j=1

Q(k) ~ chi-squared(k) under H0
```

```python
from statsmodels.stats.diagnostic import acorr_ljungbox

def ljung_box_test(series, lags=10, name="Series"):
    """Run Ljung-Box test for serial correlation."""
    result = acorr_ljungbox(series, lags=lags, return_df=True)

    print(f"Ljung-Box Test: {name}")
    print("-" * 50)
    print(f"{'Lag':<5} {'Q-Stat':<12} {'p-value':<12} {'Significant?':<12}")
    print("-" * 50)

    for lag in result.index:
        q_stat = result.loc[lag, "lb_stat"]
        p_val = result.loc[lag, "lb_pvalue"]
        sig = "***" if p_val < 0.01 else "**" if p_val < 0.05 else "*" if p_val < 0.10 else ""
        print(f"{lag:<5} {q_stat:<12.4f} {p_val:<12.4f} {sig}")

    return result

# Trading interpretation:
# - Significant autocorrelation in RETURNS = potential alpha signal
# - Significant autocorrelation in SQUARED RETURNS = volatility clustering
# - No autocorrelation in returns but present in |returns| = GARCH effects
```

### What Autocorrelation Means for Trading

```
AUTOCORRELATION AND TRADING STRATEGIES
========================================

Positive AC at lag 1 (momentum):
  Return today (+) --> Return tomorrow likely (+)
  Strategy: TREND FOLLOWING
  Example: Commodity futures often show lag-1 momentum

Negative AC at lag 1 (mean reversion):
  Return today (+) --> Return tomorrow likely (-)
  Strategy: MEAN REVERSION
  Example: Bid-ask bounce in high-frequency data

Significant AC at seasonal lags:
  Strong AC at lag 5 (weekly), 21 (monthly), 252 (yearly)
  Strategy: CALENDAR EFFECTS
  Example: Day-of-week effects, January effect

AC in squared returns (volatility clustering):
  |r_t| correlated with |r_{t+1}|
  Strategy: VOLATILITY TRADING (options, VIX)
  Example: Large moves followed by large moves

No AC anywhere:
  Random walk -- no linear predictability
  But: nonlinear predictability may still exist!
  Strategy: Look for nonlinear models, ML approaches
```

---

## 3. ARIMA Models

### AR (Autoregressive) Models

An AR(p) model expresses the current value as a linear combination of p past values:

```
AR(1):  X_t = c + phi_1 * X_{t-1} + epsilon_t
AR(2):  X_t = c + phi_1 * X_{t-1} + phi_2 * X_{t-2} + epsilon_t
AR(p):  X_t = c + SUM(phi_i * X_{t-i}, i=1..p) + epsilon_t

where epsilon_t ~ WN(0, sigma^2)

Stationarity conditions:
  AR(1): |phi_1| < 1
  AR(2): phi_1 + phi_2 < 1, phi_2 - phi_1 < 1, |phi_2| < 1
  AR(p): all roots of 1 - phi_1*z - phi_2*z^2 - ... - phi_p*z^p
         must lie outside the unit circle
```

### MA (Moving Average) Models

An MA(q) model expresses the current value as a linear combination of q past error terms:

```
MA(1):  X_t = mu + epsilon_t + theta_1 * epsilon_{t-1}
MA(q):  X_t = mu + epsilon_t + SUM(theta_j * epsilon_{t-j}, j=1..q)

Key properties:
  - Always stationary (regardless of parameter values)
  - ACF cuts off after lag q
  - Invertible if roots of 1 + theta_1*z + ... + theta_q*z^q
    lie outside the unit circle
```

### ARMA Models

Combine AR and MA components:

```
ARMA(p,q):
  X_t = c + SUM(phi_i * X_{t-i}) + epsilon_t + SUM(theta_j * epsilon_{t-j})

Common in practice:
  ARMA(1,1):  X_t = c + phi*X_{t-1} + epsilon_t + theta*epsilon_{t-1}
```

### ARIMA Models

When the series is non-stationary, we difference it d times before fitting ARMA:

```
ARIMA(p, d, q)
  p = order of AR component
  d = number of differences needed for stationarity
  q = order of MA component

Example: ARIMA(1,1,1)
  Step 1: Y_t = X_t - X_{t-1}           (difference once)
  Step 2: Y_t = c + phi*Y_{t-1} + e_t + theta*e_{t-1}   (fit ARMA(1,1))

For financial prices:
  d = 0: returns are already stationary
  d = 1: prices need one difference (most common)
  d = 2: rare, would mean returns have a unit root
```

### Box-Jenkins Methodology

The systematic approach to ARIMA model building:

```
BOX-JENKINS METHODOLOGY
========================

Step 1: IDENTIFICATION
+------------------+
| Plot the series  |
| Test stationarity|-----> Non-stationary? ---> Difference
| Examine ACF/PACF |                            (set d)
| Determine p,d,q  |
+------------------+
        |
        v
Step 2: ESTIMATION
+------------------+
| Estimate params  |
| (MLE or CSS)     |
| Check significance|
+------------------+
        |
        v
Step 3: DIAGNOSTICS
+------------------+
| Ljung-Box on     |
| residuals        |-----> Residuals not white noise?
| Check normality  |       ---> Go back to Step 1
| Check ACF of     |
| residuals        |
+------------------+
        |
        v
Step 4: FORECASTING
+------------------+
| Generate forecasts|
| Confidence intervals|
| Evaluate out-of- |
| sample performance|
+------------------+
```

### Model Selection: AIC and BIC

```
AIC = -2 * log(L) + 2k          (Akaike Information Criterion)
BIC = -2 * log(L) + k * log(n)  (Bayesian Information Criterion)

where:
  L = maximized likelihood
  k = number of parameters
  n = number of observations

AIC: penalizes complexity less --> may overfit
BIC: penalizes complexity more --> more parsimonious
     BIC is consistent (selects true model as n -> inf)

Rule: LOWER is better for both AIC and BIC
```

```python
import numpy as np
import pandas as pd
import warnings
from statsmodels.tsa.arima.model import ARIMA
from itertools import product

def select_arima_order(series, max_p=5, max_d=2, max_q=5, criterion="bic"):
    """Grid search for optimal ARIMA order using AIC or BIC."""
    best_score = np.inf
    best_order = None
    results = []

    for p, d, q in product(range(max_p + 1), range(max_d + 1), range(max_q + 1)):
        if p == 0 and q == 0:
            continue
        try:
            with warnings.catch_warnings():
                warnings.simplefilter("ignore")
                model = ARIMA(series, order=(p, d, q))
                fitted = model.fit()
                score = fitted.bic if criterion == "bic" else fitted.aic
                results.append({
                    "order": (p, d, q),
                    "aic": fitted.aic,
                    "bic": fitted.bic,
                })
                if score < best_score:
                    best_score = score
                    best_order = (p, d, q)
        except Exception:
            continue

    results_df = pd.DataFrame(results).sort_values(criterion)
    print(f"Top 5 models by {criterion.upper()}:")
    print(results_df.head(5).to_string(index=False))
    print(f"\nBest order: ARIMA{best_order} ({criterion.upper()} = {best_score:.2f})")

    return best_order, results_df


def fit_arima(series, order, forecast_steps=10):
    """Fit ARIMA model and generate forecasts."""
    model = ARIMA(series, order=order)
    fitted = model.fit()

    print(f"ARIMA{order} Model Summary")
    print("=" * 50)
    print(f"AIC: {fitted.aic:.2f}")
    print(f"BIC: {fitted.bic:.2f}")
    print(f"Log-Likelihood: {fitted.llf:.2f}")
    print()
    print("Parameters:")
    for param_name, param_val in zip(fitted.param_names, fitted.params):
        print(f"  {param_name}: {param_val:.6f}")
    print()

    # Diagnostics: Ljung-Box test on residuals
    residuals = fitted.resid
    lb_result = acorr_ljungbox(residuals, lags=10, return_df=True)
    min_p = lb_result["lb_pvalue"].min()
    print(f"Ljung-Box min p-value (lags 1-10): {min_p:.4f}")
    print(f"Residuals are {'white noise' if min_p > 0.05 else 'NOT white noise'}")

    # Forecast
    forecast = fitted.get_forecast(steps=forecast_steps)
    forecast_df = forecast.summary_frame(alpha=0.05)

    return fitted, forecast_df
```

### SARIMA for Seasonality

Extends ARIMA with seasonal components:

```
SARIMA(p,d,q)(P,D,Q)[s]

  Non-seasonal: (p,d,q) -- same as ARIMA
  Seasonal:     (P,D,Q) -- AR, differencing, MA at seasonal lags
  s = seasonal period (12 for monthly, 4 for quarterly, 252 for daily trading)

Example: SARIMA(1,1,1)(1,1,1)[12] for monthly data
  (1-phi*B)(1-Phi*B^12)(1-B)(1-B^12) X_t
      = (1+theta*B)(1+Theta*B^12) epsilon_t

where B is the backshift operator: B*X_t = X_{t-1}
```

### ARIMA Limitations for Financial Data

```
WHY ARIMA ALONE IS INSUFFICIENT FOR FINANCE
=============================================

1. LINEAR ASSUMPTION
   ARIMA captures only linear dependencies.
   Financial returns have significant nonlinear structure.

2. CONSTANT VARIANCE
   ARIMA assumes homoskedastic errors.
   Financial returns exhibit volatility clustering.
   --> Need GARCH for variance dynamics

3. GAUSSIAN ERRORS
   ARIMA typically assumes normal errors.
   Financial returns have fat tails (kurtosis >> 3).
   --> Need t-distribution or other heavy-tailed distributions

4. NO LEVERAGE EFFECT
   ARIMA treats positive/negative shocks symmetrically.
   In equities, negative returns increase volatility more.
   --> Need EGARCH or GJR-GARCH

5. WEAK AUTOCORRELATION IN RETURNS
   Efficient markets imply near-zero autocorrelation.
   ARIMA finds little signal in liquid market returns.
   --> Better for volatility modeling, less liquid markets

PRACTICAL RULE:
  Returns = ARIMA (weak signal, if any)
  Volatility = GARCH (strong signal, always present)
```

---

## 4. Volatility Modeling

### Stylized Facts of Financial Returns

Before modeling volatility, understand the empirical regularities:

```
STYLIZED FACTS OF FINANCIAL RETURNS
======================================

1. VOLATILITY CLUSTERING
   "Large changes tend to be followed by large changes,
    of either sign." -- Mandelbrot (1963)

   |r_t|:  ***   *          ***    *
           * * * * *        * ** * * *
   -------*---*---*---*--*-*--*---*--*------> t
                       * *           *  *
                                        *

2. FAT TAILS (LEPTOKURTOSIS)
   Real distribution vs Normal:

       Normal          Real Returns
         /\              /\
        /  \            /  \
       / .. \          /    \
      / .  . \        /      \
     /.      .\      / ..  .. \    <-- fat tails
    /...........\   /............\
   More peaked, heavier tails, kurtosis >> 3

3. LEVERAGE EFFECT (equities)
   Negative returns --> higher future volatility
   Positive returns --> lower future volatility
   (Asymmetric response)

4. VOLATILITY MEAN REVERSION
   Volatility reverts to long-run average
   (unlike prices, which can trend indefinitely)

5. LONG MEMORY IN VOLATILITY
   |r_t| has slowly decaying autocorrelation
   ACF of |r_t| significant at lags 50, 100, even 500+

6. VOLUME-VOLATILITY CORRELATION
   High volume days tend to be high volatility days
```

### ARCH Model

Engle (1982) introduced the ARCH (Autoregressive Conditional Heteroskedasticity) model:

```
ARCH(q):
  r_t = mu + epsilon_t
  epsilon_t = sigma_t * z_t,    z_t ~ N(0,1)
  sigma_t^2 = omega + alpha_1 * epsilon_{t-1}^2 + ... + alpha_q * epsilon_{t-q}^2

Key insight: the VARIANCE is time-varying and depends on past squared shocks.

Constraints:
  omega > 0
  alpha_i >= 0 for all i
  SUM(alpha_i) < 1 for stationarity

Problem: Often needs many lags (large q) to capture volatility persistence.
```

### GARCH(1,1) -- The Workhorse

Bollerslev (1986) generalized ARCH to include lagged variance terms:

```
GARCH(1,1):
  r_t = mu + epsilon_t
  epsilon_t = sigma_t * z_t,    z_t ~ N(0,1)
  sigma_t^2 = omega + alpha * epsilon_{t-1}^2 + beta * sigma_{t-1}^2
              -----   ----------------------   --------------------
              base     reaction to news         persistence
              level    (ARCH effect)            (GARCH effect)

Parameters and interpretation:
  omega: long-run variance floor (omega > 0)
  alpha: how much yesterday's shock affects today's variance (alpha >= 0)
  beta:  how persistent yesterday's variance is (beta >= 0)
  alpha + beta: persistence of volatility (must be < 1 for stationarity)

Long-run (unconditional) variance:
  sigma^2_LR = omega / (1 - alpha - beta)

Half-life of volatility shock:
  h = log(0.5) / log(alpha + beta)

Typical estimates for daily equity returns:
  alpha ~ 0.05-0.10  (news impact)
  beta  ~ 0.85-0.95  (persistence)
  alpha + beta ~ 0.95-0.99  (high persistence)
```

```
NUMERICAL EXAMPLE: GARCH(1,1) VARIANCE EVOLUTION
==================================================

Parameters: omega=0.00001, alpha=0.08, beta=0.90
Long-run variance = 0.00001 / (1 - 0.08 - 0.90) = 0.0005
Long-run daily vol = sqrt(0.0005) = 2.24%

Day    Return   epsilon^2     sigma^2         sigma (vol)
----   ------   ---------     -------         -----------
  0      --        --         0.000500  (LR)  2.24%
  1    -0.5%    0.000025      0.000473        2.17%
  2    +0.2%    0.000004      0.000436        2.09%
  3    -3.0%    0.000900      0.000464        2.15%   <-- big shock
  4    +0.1%    0.000001      0.000490        2.21%   <-- vol jumps up
  5    -0.3%    0.000009      0.000452        2.13%   <-- slowly decays
  6    +0.4%    0.000016      0.000417        2.04%

sigma_4^2 = 0.00001 + 0.08*(0.0009) + 0.90*(0.000464) = 0.000490
  The -3% shock on day 3 caused variance to jump up on day 4.
  It then slowly decays back toward the long-run level.
```

```python
from arch import arch_model

def fit_garch(returns, p=1, q=1, dist="normal"):
    """Fit GARCH(p,q) model to return series."""
    # Scale returns to percentage (arch library convention)
    returns_pct = returns * 100

    model = arch_model(
        returns_pct,
        vol="Garch",
        p=p,
        q=q,
        dist=dist,     # "normal", "t", "skewt", "ged"
        mean="ARX",
        lags=0,
    )
    result = model.fit(disp="off")

    print(f"GARCH({p},{q}) with {dist} distribution")
    print("=" * 50)
    print(f"Log-Likelihood: {result.loglikelihood:.2f}")
    print(f"AIC: {result.aic:.2f}")
    print(f"BIC: {result.bic:.2f}")
    print()

    # Extract parameters
    params = result.params
    print("Parameters:")
    for name, val in params.items():
        print(f"  {name}: {val:.6f}")
    print()

    # Persistence and long-run vol
    alpha_sum = sum(params.get(f"alpha[{i}]", 0) for i in range(1, q + 1))
    beta_sum = sum(params.get(f"beta[{i}]", 0) for i in range(1, p + 1))
    persistence = alpha_sum + beta_sum
    omega = params.get("omega", 0)

    if persistence < 1:
        lr_var = omega / (1 - persistence)
        lr_vol = np.sqrt(lr_var)
        half_life = np.log(0.5) / np.log(persistence)
        print(f"Persistence (alpha+beta): {persistence:.4f}")
        print(f"Long-run daily vol: {lr_vol:.2f}%")
        print(f"Half-life of vol shock: {half_life:.1f} days")
    else:
        print(f"Persistence: {persistence:.4f} (IGARCH -- integrated)")

    # Conditional volatility series (annualized)
    cond_vol = result.conditional_volatility / 100  # back to decimal
    annual_vol = cond_vol * np.sqrt(252)

    return result, cond_vol


def forecast_volatility(garch_result, horizon=10):
    """Generate volatility forecasts from fitted GARCH model."""
    forecasts = garch_result.forecast(horizon=horizon)

    # Variance forecasts (in percentage squared)
    var_forecast = forecasts.variance.iloc[-1]

    # Convert to daily volatility (decimal)
    vol_forecast = np.sqrt(var_forecast) / 100

    print(f"Volatility Forecast ({horizon}-day horizon):")
    print("-" * 35)
    for i, vol in enumerate(vol_forecast, 1):
        annual = vol * np.sqrt(252) * 100
        print(f"  Day {i}: {vol*100:.2f}% daily ({annual:.1f}% annualized)")

    return vol_forecast
```

### EGARCH (Exponential GARCH)

Nelson (1991) proposed EGARCH to capture asymmetric effects:

```
EGARCH(1,1):
  log(sigma_t^2) = omega + alpha * |z_{t-1}| + gamma * z_{t-1} + beta * log(sigma_{t-1}^2)

where z_t = epsilon_t / sigma_t (standardized residual)

Advantages over GARCH:
  1. No parameter constraints needed (model is on LOG variance)
  2. gamma captures leverage effect:
     gamma < 0 means negative shocks increase volatility more
  3. More flexible asymmetric response
```

### GJR-GARCH (Glosten-Jagannathan-Runkle)

```
GJR-GARCH(1,1):
  sigma_t^2 = omega + (alpha + gamma * I_{t-1}) * epsilon_{t-1}^2 + beta * sigma_{t-1}^2

where I_{t-1} = 1 if epsilon_{t-1} < 0, else 0

  gamma > 0: negative shocks have larger impact (leverage effect)
  Total impact of negative shock: alpha + gamma
  Total impact of positive shock: alpha
```

```python
def compare_garch_models(returns):
    """Fit and compare multiple GARCH variants."""
    returns_pct = returns * 100
    models_spec = {
        "GARCH(1,1)": {"vol": "Garch", "p": 1, "q": 1},
        "EGARCH(1,1)": {"vol": "EGARCH", "p": 1, "q": 1},
        "GJR-GARCH(1,1)": {"vol": "Garch", "p": 1, "o": 1, "q": 1},
    }

    results = {}
    print(f"{'Model':<20} {'AIC':<12} {'BIC':<12} {'LogLik':<12}")
    print("-" * 56)

    for name, spec in models_spec.items():
        try:
            model = arch_model(returns_pct, mean="ARX", lags=0, **spec)
            fit = model.fit(disp="off")
            results[name] = fit
            print(f"{name:<20} {fit.aic:<12.2f} {fit.bic:<12.2f} {fit.loglikelihood:<12.2f}")
        except Exception as e:
            print(f"{name:<20} FAILED: {e}")

    return results
```

### Realized Volatility from High-Frequency Data

```
REALIZED VOLATILITY
====================

Instead of modeling volatility parametrically, measure it from
intraday returns:

                    N
RV_t = SUM  r_{t,i}^2
                   i=1

where r_{t,i} is the i-th intraday return on day t
      N = number of intraday intervals

Sampling frequency trade-off:
  Too high (every tick): microstructure noise dominates
  Too low (hourly):      lose information
  Sweet spot: 5-minute returns (standard in literature)

Noise-robust estimators:
  - Two-scale RV (Zhang, Mykland, Ait-Sahalia)
  - Kernel-based RV (Barndorff-Nielsen et al.)
  - Pre-averaging estimator
```

```python
def realized_volatility(intraday_prices, freq="5min"):
    """Calculate realized volatility from intraday data."""
    # Resample to desired frequency
    resampled = intraday_prices.resample(freq).last().dropna()

    # Intraday log returns
    intraday_returns = np.log(resampled / resampled.shift(1)).dropna()

    # Daily RV = sum of squared intraday returns
    daily_rv = intraday_returns.groupby(intraday_returns.index.date).apply(
        lambda x: np.sum(x ** 2)
    )

    # Daily realized vol
    daily_rvol = np.sqrt(daily_rv)

    # Annualized
    annual_rvol = daily_rvol * np.sqrt(252)

    return daily_rv, daily_rvol, annual_rvol
```

---

## 5. Cointegration

### Correlation vs Cointegration

This is one of the most important distinctions in quantitative finance:

```
CORRELATION VS COINTEGRATION
==============================

CORRELATION                           COINTEGRATION
-----------                           --------------
Measures linear co-movement           Measures long-run equilibrium
of RETURNS (stationary)               of PRICES (non-stationary)

Can be unstable over time             Relationship is stable by definition
(rolling correlation varies)          (deviations are stationary)

Two trending stocks can have          Two cointegrated stocks maintain
high correlation but diverge          a stable spread -- deviations
permanently                           are temporary

  Correlated but NOT cointegrated:    Cointegrated:

  ^  Stock A                          ^  Stock A
  |       ____                        |        ___
  |      /    ---                     |       /   \___
  |   __/        \___                 |   ___/        \___
  |  /               ----            |  /                \___
  | /                                 | /
  +--------------------------> t      +--------------------------> t

  ^  Stock B                          ^  Stock B (= beta * A + const)
  |            ___                    |        ___
  |     ___   /   \                   |       /   \___
  |    /   --/     \                  |   ___/        \___
  |   /             ---               |  /                \___
  |  /                                | /
  +--------------------------> t      +--------------------------> t

  Spread (A - B):                     Spread (A - beta*B):
  ^                                   ^
  |   ___                             |   *       *
  |  /   ---     ___                  |  * * * * * * *
  | /       --- /   \                 +--*---*---*---*---> t
  |/            /    \---             |     *   *
  +-------------------*---> t         |
  (trending, non-stationary)          (mean-reverting, stationary!)
```

### Engle-Granger Two-Step Method

```
ENGLE-GRANGER COINTEGRATION TEST
==================================

Step 1: Run OLS regression
  Y_t = alpha + beta * X_t + epsilon_t

Step 2: Test residuals for stationarity (ADF test)
  If residuals are stationary --> Y and X are cointegrated
  If residuals are non-stationary --> no cointegration

  (Use Engle-Granger critical values, NOT standard ADF values)

IMPORTANT CAVEATS:
  - Results depend on which variable is Y and which is X
  - Only tests for ONE cointegrating relationship
  - For >2 variables, use Johansen test instead
```

```python
import numpy as np
import pandas as pd
from statsmodels.tsa.stattools import coint
from statsmodels.regression.linear_model import OLS
from statsmodels.tools import add_constant

def engle_granger_test(y, x, name_y="Y", name_x="X"):
    """Engle-Granger cointegration test between two series."""
    # Step 1: Cointegrating regression
    x_const = add_constant(x)
    ols_result = OLS(y, x_const).fit()

    alpha = ols_result.params[0]    # intercept
    beta = ols_result.params[1]     # hedge ratio
    residuals = ols_result.resid

    print(f"Engle-Granger Cointegration Test: {name_y} vs {name_x}")
    print("=" * 55)
    print(f"Cointegrating regression: {name_y} = {alpha:.4f} + {beta:.4f} * {name_x}")
    print(f"R-squared: {ols_result.rsquared:.4f}")
    print()

    # Step 2: ADF test on residuals
    coint_stat, p_value, crit_values = coint(y, x)

    print(f"Cointegration test statistic: {coint_stat:.4f}")
    print(f"p-value: {p_value:.4f}")
    print(f"Critical values: 1%={crit_values[0]:.4f}, 5%={crit_values[1]:.4f}, 10%={crit_values[2]:.4f}")

    is_coint = p_value < 0.05
    print(f"Conclusion: {'Cointegrated' if is_coint else 'NOT cointegrated'} at 5% level")

    return {
        "beta": beta,
        "alpha": alpha,
        "residuals": residuals,
        "p_value": p_value,
        "is_cointegrated": is_coint,
    }
```

### Johansen Test

For testing cointegration among more than two variables:

```
JOHANSEN TEST
==============

Tests the number of cointegrating relationships among k variables.

Null hypotheses tested sequentially:
  H0: r = 0  (no cointegration)
  H0: r <= 1 (at most 1 cointegrating vector)
  H0: r <= 2 (at most 2 cointegrating vectors)
  ...up to r <= k-1

Two test statistics:
  Trace statistic:     tests H0: rank <= r against H1: rank > r
  Max eigenvalue stat: tests H0: rank = r against H1: rank = r+1

Advantages over Engle-Granger:
  - Handles multiple variables
  - Finds ALL cointegrating relationships
  - Results invariant to variable ordering
  - Can include deterministic trends
```

```python
from statsmodels.tsa.vector_ar.vecm import coint_johansen

def johansen_test(data, det_order=0, k_ar_diff=1):
    """
    Johansen cointegration test for multiple time series.

    det_order: -1 (no constant), 0 (constant), 1 (constant + trend)
    k_ar_diff: number of lagged differences in the VECM
    """
    result = coint_johansen(data, det_order=det_order, k_ar_diff=k_ar_diff)

    n_vars = data.shape[1]
    col_names = data.columns.tolist() if hasattr(data, "columns") else [f"Var{i}" for i in range(n_vars)]

    print("Johansen Cointegration Test")
    print("=" * 60)
    print(f"Variables: {', '.join(col_names)}")
    print(f"Lag order: {k_ar_diff}")
    print()

    # Trace test
    print("Trace Test:")
    print(f"{'H0: r<=':<10} {'Trace Stat':<15} {'5% CV':<12} {'Reject?':<10}")
    print("-" * 47)
    for i in range(n_vars):
        trace_stat = result.lr1[i]
        cv_5pct = result.cvt[i, 1]   # 5% critical value
        reject = "Yes ***" if trace_stat > cv_5pct else "No"
        print(f"{i:<10} {trace_stat:<15.4f} {cv_5pct:<12.4f} {reject}")

    print()

    # Max eigenvalue test
    print("Max Eigenvalue Test:")
    print(f"{'H0: r=':<10} {'Max Eig':<15} {'5% CV':<12} {'Reject?':<10}")
    print("-" * 47)
    for i in range(n_vars):
        max_eig = result.lr2[i]
        cv_5pct = result.cvm[i, 1]
        reject = "Yes ***" if max_eig > cv_5pct else "No"
        print(f"{i:<10} {max_eig:<15.4f} {cv_5pct:<12.4f} {reject}")

    # Number of cointegrating relationships
    n_coint = sum(1 for i in range(n_vars) if result.lr1[i] > result.cvt[i, 1])
    print(f"\nNumber of cointegrating relationships: {n_coint}")

    if n_coint > 0:
        print("\nCointegrating vectors (normalized):")
        for i in range(n_coint):
            vec = result.evec[:, i]
            vec_norm = vec / vec[0]  # normalize first element to 1
            print(f"  Vector {i+1}: {vec_norm}")

    return result, n_coint
```

### Error Correction Model (ECM)

Once cointegration is established, the ECM describes the short-run adjustment dynamics:

```
ERROR CORRECTION MODEL (ECM)
==============================

For two cointegrated series Y_t and X_t with beta as the hedge ratio:

  Spread: z_t = Y_t - alpha - beta * X_t   (cointegrating residual)

  ECM:
  delta(Y_t) = gamma * z_{t-1} + sum(a_i * delta(Y_{t-i}))
               + sum(b_j * delta(X_{t-j})) + epsilon_t

  where:
    gamma = speed of adjustment (should be negative)
    |gamma| close to 0: slow mean reversion
    |gamma| close to 1: fast mean reversion

  Half-life of mean reversion:
    h = -log(2) / log(1 + gamma)

TRADING INTERPRETATION:
  z_t > 0 (spread too wide):  Y is overpriced relative to X
    --> Short Y, Long X  (spread will contract)
  z_t < 0 (spread too narrow): Y is underpriced relative to X
    --> Long Y, Short X  (spread will expand)

  Entry: |z_t| > k * sigma_z  (k typically 1.5 to 2.5)
  Exit:  z_t crosses 0 (or some smaller threshold)
```

### Pairs Trading Implementation

```python
import numpy as np
import pandas as pd
from statsmodels.tsa.stattools import coint
from statsmodels.regression.linear_model import OLS
from statsmodels.tools import add_constant

class PairsTrader:
    """Cointegration-based pairs trading strategy."""

    def __init__(self, entry_z=2.0, exit_z=0.5, lookback=252):
        self.entry_z = entry_z
        self.exit_z = exit_z
        self.lookback = lookback
        self.hedge_ratio = None
        self.spread_mean = None
        self.spread_std = None

    def find_cointegrated_pairs(self, price_data, significance=0.05):
        """
        Scan universe of assets for cointegrated pairs.
        price_data: DataFrame with assets as columns.
        """
        n = price_data.shape[1]
        pairs = []
        tickers = price_data.columns.tolist()

        pvalue_matrix = pd.DataFrame(
            np.ones((n, n)),
            index=tickers,
            columns=tickers,
        )

        for i in range(n):
            for j in range(i + 1, n):
                _, p_value, _ = coint(price_data.iloc[:, i], price_data.iloc[:, j])
                pvalue_matrix.iloc[i, j] = p_value
                pvalue_matrix.iloc[j, i] = p_value

                if p_value < significance:
                    pairs.append({
                        "asset_1": tickers[i],
                        "asset_2": tickers[j],
                        "p_value": p_value,
                    })

        pairs_df = pd.DataFrame(pairs).sort_values("p_value")
        print(f"Found {len(pairs)} cointegrated pairs (p < {significance}):")
        print(pairs_df.to_string(index=False))

        return pairs_df, pvalue_matrix

    def calibrate(self, y, x):
        """Estimate hedge ratio and spread statistics."""
        x_const = add_constant(x)
        ols = OLS(y, x_const).fit()

        self.hedge_ratio = ols.params[1]
        intercept = ols.params[0]

        spread = y - self.hedge_ratio * x - intercept
        self.spread_mean = spread.mean()
        self.spread_std = spread.std()

        # Half-life estimation via AR(1) on spread
        spread_lag = spread.shift(1).dropna()
        spread_diff = spread.diff().dropna()
        aligned_lag = spread_lag.loc[spread_diff.index]

        ar1 = OLS(spread_diff, add_constant(aligned_lag)).fit()
        gamma = ar1.params[1]
        half_life = -np.log(2) / np.log(1 + gamma) if gamma < 0 else np.inf

        print(f"Hedge ratio: {self.hedge_ratio:.4f}")
        print(f"Spread mean: {self.spread_mean:.4f}")
        print(f"Spread std:  {self.spread_std:.4f}")
        print(f"Half-life:   {half_life:.1f} days")

        return {
            "hedge_ratio": self.hedge_ratio,
            "spread_mean": self.spread_mean,
            "spread_std": self.spread_std,
            "half_life": half_life,
        }

    def generate_signals(self, y, x):
        """Generate trading signals based on z-score of spread."""
        spread = y - self.hedge_ratio * x
        z_score = (spread - self.spread_mean) / self.spread_std

        signals = pd.Series(0, index=z_score.index)

        # Long spread (long Y, short X) when z < -entry
        signals[z_score < -self.entry_z] = 1

        # Short spread (short Y, long X) when z > entry
        signals[z_score > self.entry_z] = -1

        # Exit when |z| < exit threshold
        signals[abs(z_score) < self.exit_z] = 0

        # Forward fill to maintain positions
        signals = signals.replace(0, np.nan).ffill().fillna(0)

        return signals, z_score
```

```
PAIRS TRADING SIGNAL DIAGRAM
==============================

Z-Score of Spread:

  +3 |                                        SHORT SPREAD
  +2 |----*-----------entry threshold---------*-----------
  +1 |   * *                                 * *
   0 |--*---*-------*----*----*-----------*-----*--*------
  -1 |         *  *   *    *   *        *           *
  -2 |----------*------exit---*---entry-*--------------*--
  -3 |                          *                       *
     +-------------------------------------------------> t
             LONG SPREAD               LONG SPREAD

Positions:
  z < -2.0: ENTER long spread  (buy Y, sell beta*X)
  z >  2.0: ENTER short spread (sell Y, buy beta*X)
  |z| < 0.5: EXIT position
```

---

## 6. Regime Detection

### Hidden Markov Models (HMM)

Markets cycle through distinct regimes -- bull, bear, and sideways. HMMs formalize this intuition by modeling an unobserved (hidden) state variable.

```
HIDDEN MARKOV MODEL STRUCTURE
===============================

Hidden States:   S1 -----> S2 -----> S3 ----->
(unobserved)     Bull      Bear      Sideways
                  |          |          |
                  v          v          v
Observations:   r_t1       r_t2       r_t3
(returns)       mu=+0.08%  mu=-0.12%  mu=+0.01%
                sig=0.8%   sig=1.8%   sig=0.5%

Transition Matrix (daily):
                To:  Bull   Bear   Side
  From: Bull   [   0.98   0.01   0.01  ]
        Bear   [   0.02   0.95   0.03  ]
        Side   [   0.03   0.02   0.95  ]

Reading: If in Bull today, 98% chance of staying Bull tomorrow,
         1% chance of transitioning to Bear, 1% to Sideways.

Emission Distributions:
  Bull:     r_t ~ N(mu_bull, sigma_bull^2)     e.g., N(+0.08%, 0.8%^2)
  Bear:     r_t ~ N(mu_bear, sigma_bear^2)     e.g., N(-0.12%, 1.8%^2)
  Sideways: r_t ~ N(mu_side, sigma_side^2)     e.g., N(+0.01%, 0.5%^2)
```

```python
import numpy as np
import pandas as pd
from hmmlearn.hmm import GaussianHMM

def fit_regime_model(returns, n_regimes=2, n_iter=100):
    """
    Fit Hidden Markov Model to detect market regimes.

    n_regimes: 2 (bull/bear) or 3 (bull/bear/sideways)
    """
    # Reshape for hmmlearn (needs 2D array)
    X = returns.values.reshape(-1, 1)

    model = GaussianHMM(
        n_components=n_regimes,
        covariance_type="full",
        n_iter=n_iter,
        random_state=42,
    )
    model.fit(X)

    # Predict hidden states
    hidden_states = model.predict(X)
    state_probs = model.predict_proba(X)

    print(f"HMM with {n_regimes} Regimes")
    print("=" * 50)

    # Sort regimes by mean return (so regime 0 = lowest mean)
    regime_order = np.argsort(model.means_.flatten())

    regime_names = {2: ["Bear", "Bull"], 3: ["Bear", "Sideways", "Bull"]}
    names = regime_names.get(n_regimes, [f"Regime {i}" for i in range(n_regimes)])

    for idx, regime_idx in enumerate(regime_order):
        mean = model.means_[regime_idx, 0]
        std = np.sqrt(model.covars_[regime_idx, 0, 0])
        name = names[idx]

        days_in_regime = (hidden_states == regime_idx).sum()
        pct = days_in_regime / len(hidden_states) * 100

        print(f"\n  {name} (Regime {regime_idx}):")
        print(f"    Mean daily return: {mean*100:.3f}%")
        print(f"    Daily volatility:  {std*100:.3f}%")
        print(f"    Annual return:     {mean*252*100:.1f}%")
        print(f"    Annual volatility: {std*np.sqrt(252)*100:.1f}%")
        print(f"    Days in regime:    {days_in_regime} ({pct:.1f}%)")

    print("\n  Transition Matrix:")
    trans = model.transmat_
    for i, row in enumerate(trans):
        from_name = names[list(regime_order).index(i)] if i in regime_order else f"R{i}"
        row_str = "  ".join(f"{p:.3f}" for p in row)
        print(f"    {from_name}: [{row_str}]")

    # Expected duration in each regime
    print("\n  Expected Regime Duration:")
    for idx, regime_idx in enumerate(regime_order):
        duration = 1 / (1 - trans[regime_idx, regime_idx])
        print(f"    {names[idx]}: {duration:.1f} days")

    # Create result DataFrame
    result_df = pd.DataFrame({
        "return": returns.values,
        "regime": hidden_states,
    }, index=returns.index)

    for i in range(n_regimes):
        result_df[f"prob_regime_{i}"] = state_probs[:, i]

    return model, result_df
```

### Structural Break Detection

```
STRUCTURAL BREAK METHODS
==========================

1. CUSUM (Cumulative Sum) Test
   Detects shifts in mean of a series.

   S_t = SUM(X_i - X_bar, i=1..t)

   Plot S_t: if the process is stable, S_t fluctuates around 0.
   A break causes S_t to trend upward or downward.

   S_t:
    ^
    |        /\
    |       /  \        BREAK
    |      /    \-------*-------
    |     /              \
    |    /                \
    |   /                  \
    +--/--------------------\---> t

2. BAI-PERRON TEST
   Tests for multiple structural breaks in regression.
   Determines optimal number and location of breakpoints.
   Can find up to m breaks simultaneously.

3. CHANGE POINT DETECTION (Bayesian approach)
   Estimates posterior probability of a break at each point.
```

```python
import numpy as np
import pandas as pd

def cusum_test(series, threshold=None):
    """CUSUM test for structural breaks in the mean."""
    n = len(series)
    mean_val = series.mean()
    std_val = series.std()

    # Cumulative sum of deviations from mean
    cusum = np.cumsum(series - mean_val)

    # Normalized CUSUM
    cusum_norm = cusum / (std_val * np.sqrt(n))

    # Default threshold (5% significance)
    if threshold is None:
        threshold = 1.358  # 5% critical value for Brownian bridge

    # Detect break points where CUSUM exceeds threshold
    break_indices = np.where(np.abs(cusum_norm) > threshold)[0]

    # Find the most significant break (max |CUSUM|)
    max_idx = np.argmax(np.abs(cusum_norm))
    max_cusum = cusum_norm[max_idx]

    print(f"CUSUM Test")
    print("=" * 40)
    print(f"Max |CUSUM|: {abs(max_cusum):.4f} at index {max_idx}")
    print(f"Threshold: {threshold:.4f}")
    print(f"Break detected: {'Yes' if abs(max_cusum) > threshold else 'No'}")

    if len(break_indices) > 0:
        print(f"Break region: indices {break_indices[0]} to {break_indices[-1]}")

    return cusum_norm, break_indices


def detect_changepoints_bayesian(series, prior_prob=1/252):
    """
    Simple Bayesian online change point detection.
    prior_prob: prior probability of a change at any point (e.g., 1/252 = once per year)
    """
    n = len(series)
    run_length = np.zeros(n)
    changepoints = []

    # Online estimation of mean and variance
    window = 60  # lookback for local stats

    for t in range(window, n):
        local_mean = series[t - window:t].mean()
        local_std = series[t - window:t].std()

        if local_std == 0:
            continue

        # How surprising is the current observation?
        z_score = abs(series.iloc[t] - local_mean) / local_std

        # Simple Bayesian update
        # P(change | data) proportional to P(data | change) * P(change)
        likelihood_ratio = np.exp(0.5 * (z_score ** 2 - 4))  # vs normal range
        posterior = likelihood_ratio * prior_prob

        if posterior > 0.5:
            changepoints.append({
                "index": t,
                "date": series.index[t] if hasattr(series.index, "date") else t,
                "posterior": min(posterior, 1.0),
                "z_score": z_score,
            })

    if changepoints:
        cp_df = pd.DataFrame(changepoints)
        print(f"Detected {len(changepoints)} potential change points")
        print(cp_df.head(10).to_string(index=False))
    else:
        print("No change points detected")

    return changepoints
```

### Markov-Switching Models

More principled than simple HMM -- they embed the regime structure directly into an econometric model:

```
MARKOV-SWITCHING AUTOREGRESSION
=================================

r_t = mu(S_t) + phi(S_t) * r_{t-1} + sigma(S_t) * epsilon_t

where S_t in {1, 2, ..., K} is the regime

Each regime has its own:
  - Mean return:     mu(S_t)
  - AR coefficient:  phi(S_t)
  - Volatility:      sigma(S_t)

Example with 2 regimes:
  Regime 1 (Bull): mu=0.05%, phi=0.02, sigma=0.8%
  Regime 2 (Bear): mu=-0.10%, phi=-0.05, sigma=1.6%
```

```python
import statsmodels.api as sm

def fit_markov_switching(returns, n_regimes=2, order=1):
    """Fit Markov-Switching AR model."""
    model = sm.tsa.MarkovAutoregression(
        returns,
        k_regimes=n_regimes,
        order=order,
        switching_ar=True,
        switching_variance=True,
    )
    result = model.fit(maxiter=200)

    print("Markov-Switching AR Model")
    print("=" * 50)
    print(result.summary())

    # Smoothed regime probabilities
    smoothed_probs = result.smoothed_marginal_probabilities

    return result, smoothed_probs
```

### Application to Strategy Allocation

```
REGIME-BASED STRATEGY ALLOCATION
===================================

Detect regime --> Adjust portfolio

  Regime         Strategy                    Position Sizing
  -------------- -------------------------- ----------------
  Bull (high     Trend following             Full size
   confidence)   Momentum strategies         Leverage OK
                 Long equity beta

  Bear (high     Mean reversion              Reduced size
   confidence)   Defensive / hedged          Tight stops
                 Short equity beta           Cash reserves

  Sideways       Range-bound strategies      Small size
   (uncertain)   Options selling (premium)   Wide diversification
                 Carry trades

  Transition     Reduce all positions        Minimal exposure
   (regime       Wait for confirmation       Preserve capital
    change        Monitor indicators
    detected)

Implementation:
  1. Fit HMM on rolling window (e.g., 2 years)
  2. At each rebalance, check P(current regime)
  3. If P(regime_i) > 0.8, allocate to regime_i strategy
  4. If uncertain (no regime > 0.6), reduce exposure
  5. On regime transition, reduce position size by 50%
```

---

## 7. Spectral Analysis

### Fourier Transforms for Cycle Detection

Every time series can be decomposed into a sum of sinusoidal components at different frequencies. Spectral analysis reveals which frequencies dominate.

```
TIME DOMAIN VS FREQUENCY DOMAIN
==================================

Time Domain:                    Frequency Domain:
  r_t = f(t)                     S(f) = |F{r_t}|^2

  ^                               ^
  |  *  *     *                   |
  | * ** * * * *                  |    *
  |* * * ** * * *                 |   * *       *
  +--*-*--*--*-*--> t             |  *   *     * *
  |*  *  *  * *                   | *     *   *   *
  | *    *     *                  |*       * *     *
  |                               +--*-----------*---> f
  "What happened when?"           "What frequencies are present?"

  Fourier Transform:
  X(f) = SUM  x_t * e^(-2*pi*i*f*t)
             t

  Power Spectral Density:
  S(f) = |X(f)|^2 / N
```

```python
import numpy as np
import pandas as pd
from scipy import signal

def spectral_analysis(series, sampling_freq=252, name="Returns"):
    """
    Perform spectral analysis on a time series.
    sampling_freq: observations per year (252 for daily, 12 for monthly)
    """
    # Remove mean (detrend)
    detrended = series - series.mean()
    n = len(detrended)

    # FFT
    fft_result = np.fft.fft(detrended)
    frequencies = np.fft.fftfreq(n, d=1/sampling_freq)

    # Power spectral density (only positive frequencies)
    positive_freq_mask = frequencies > 0
    freqs = frequencies[positive_freq_mask]
    power = np.abs(fft_result[positive_freq_mask]) ** 2 / n

    # Convert frequency to period (in trading days)
    periods = sampling_freq / freqs

    # Find dominant frequencies
    top_k = 5
    top_indices = np.argsort(power)[-top_k:][::-1]

    print(f"Spectral Analysis: {name}")
    print("=" * 55)
    print(f"{'Rank':<6} {'Frequency':<12} {'Period (days)':<16} {'Power':<12}")
    print("-" * 55)
    for rank, idx in enumerate(top_indices, 1):
        print(f"{rank:<6} {freqs[idx]:<12.4f} {periods[idx]:<16.1f} {power[idx]:<12.6f}")

    return freqs, power, periods


def welch_spectral_density(series, sampling_freq=252, nperseg=None):
    """
    Welch's method for smoother spectral density estimation.
    Uses overlapping segments to reduce variance.
    """
    if nperseg is None:
        nperseg = min(256, len(series) // 4)

    freqs, psd = signal.welch(
        series - series.mean(),
        fs=sampling_freq,
        nperseg=nperseg,
        noverlap=nperseg // 2,
        window="hann",
    )

    # Convert to periods
    periods = np.where(freqs > 0, sampling_freq / freqs, np.inf)

    return freqs, psd, periods
```

### Wavelet Analysis

Wavelets improve on Fourier analysis by providing time-frequency localization -- you can see which frequencies are active at which times.

```
FOURIER VS WAVELET
====================

Fourier:
  - Frequency resolution: Excellent
  - Time resolution: None (averages over entire series)
  - Best for: Stationary signals with fixed frequencies

Wavelet:
  - Frequency resolution: Good (varies with scale)
  - Time resolution: Good (varies with scale)
  - Best for: Non-stationary signals, transient events

WAVELET SCALOGRAM (time-frequency map):

  Scale     |                    ***
  (period)  |          ***      ** **
            |    ***  ** **    **   **     ***
  High      |   ** ** *   *   *      *   ** **
  (slow)    |  *    **     * *        * *    **
            |  *           **          *
            +-----+----+----+----+----+----+----> Time
  Low       |* * ** ***  *  ** *** ** * ** ***
  (fast)    |*** ***  ** ** ***  **** *** ****
            | Noise / high-frequency structure
```

```python
import numpy as np
import pywt

def wavelet_analysis(series, wavelet="db4", max_level=None):
    """
    Multi-resolution wavelet analysis.

    wavelet: 'db4' (Daubechies-4), 'haar', 'sym8', etc.
    """
    values = series.values if hasattr(series, "values") else np.array(series)

    if max_level is None:
        max_level = pywt.dwt_max_level(len(values), wavelet)

    # Multi-level discrete wavelet transform
    coeffs = pywt.wavedec(values, wavelet, level=max_level)

    # coeffs[0] = approximation at coarsest level
    # coeffs[1] = detail at coarsest level
    # coeffs[-1] = detail at finest level

    print(f"Wavelet Decomposition ({wavelet}, {max_level} levels)")
    print("=" * 55)
    print(f"{'Level':<8} {'Type':<15} {'Coeffs':<10} {'Energy':<12} {'Period (days)'}")
    print("-" * 55)

    total_energy = sum(np.sum(c ** 2) for c in coeffs)

    for i, c in enumerate(coeffs):
        energy = np.sum(c ** 2)
        pct = energy / total_energy * 100

        if i == 0:
            level_type = "Approx"
            period = f">{2**max_level}"
        else:
            level_type = "Detail"
            level_num = max_level - i + 1
            period = f"{2**(level_num-1)}-{2**level_num}"

        print(f"{i:<8} {level_type:<15} {len(c):<10} {pct:<12.1f}% {period}")

    return coeffs


def wavelet_denoise(series, wavelet="db4", threshold_mode="soft", level=None):
    """Denoise a time series using wavelet thresholding."""
    values = series.values if hasattr(series, "values") else np.array(series)

    if level is None:
        level = pywt.dwt_max_level(len(values), wavelet)

    coeffs = pywt.wavedec(values, wavelet, level=level)

    # Universal threshold (VisuShrink)
    sigma = np.median(np.abs(coeffs[-1])) / 0.6745
    threshold = sigma * np.sqrt(2 * np.log(len(values)))

    # Threshold detail coefficients (keep approximation)
    denoised_coeffs = [coeffs[0]]
    for c in coeffs[1:]:
        denoised_coeffs.append(pywt.threshold(c, threshold, mode=threshold_mode))

    # Reconstruct
    denoised = pywt.waverec(denoised_coeffs, wavelet)[:len(values)]

    if hasattr(series, "index"):
        return pd.Series(denoised, index=series.index)
    return denoised
```

### Is There a "Cycle" in Markets?

```
COMMON CYCLES INVESTIGATED IN FINANCIAL MARKETS
=================================================

Cycle                    Period          Evidence
-----------------------  -------------- -------------------------
Intraday (U-shape vol)   ~1 day         Strong (market open/close)
Weekly (day-of-week)     ~5 days        Weak, mostly disappeared
Monthly (turn-of-month)  ~21 days       Moderate (fund flows)
Quarterly (earnings)     ~63 days       Moderate (earnings season)
Presidential cycle       ~4 years       Weak (small sample)
Business cycle           3-7 years      Moderate (macro regime)
Kondratiev wave          40-60 years    Very weak (unfalsifiable)

IMPORTANT CAVEATS:
  1. Most "cycles" are not periodic -- they are quasi-periodic
     (variable period, variable amplitude)
  2. The Efficient Market Hypothesis implies that once a cycle
     is widely known, it gets arbitraged away
  3. Spectral analysis often finds "significant" peaks that are
     just noise (multiple testing problem)
  4. Financial time series have very low signal-to-noise ratio
     compared to physical signals

PRACTICAL ADVICE:
  - Do NOT rely on spectral peaks alone for trading signals
  - Use spectral analysis for hypothesis generation, not confirmation
  - Combine with economic reasoning (WHY would this cycle exist?)
  - Out-of-sample testing is essential
```

---

## 8. Advanced Topics

### Fractional Differencing

Standard differencing (d=1) makes prices stationary but destroys all memory (long-run information). Fractional differencing uses a non-integer d (typically 0 < d < 1) to achieve stationarity while preserving as much memory as possible.

```
THE FRACTIONAL DIFFERENCING SPECTRUM
======================================

d = 0.0:  Original prices (non-stationary, full memory)
d = 0.3:  Fractionally differenced (stationary, good memory)
d = 0.5:  Fractionally differenced (stationary, moderate memory)
d = 1.0:  First difference / returns (stationary, minimal memory)

      Memory preserved
  1.0 |*
      | *
  0.5 |  *
      |    *
  0.0 |       *  *  *  *
      +--+--+--+--+--+---> d
      0  0.2 0.4 0.6 0.8 1.0
         ^                ^
         |                |
     "sweet spot"     returns
     stationary +     (all memory
     max memory       destroyed)

The fractional difference operator:
  (1 - B)^d = SUM  C(d,k) * (-B)^k,  k=0,1,2,...

  where C(d,k) = d! / (k! * (d-k)!)   (generalized binomial)

  For d=0.4, the weights decay slowly:
  w_0 = 1.000
  w_1 = -0.400
  w_2 = -0.120
  w_3 = -0.064
  w_4 = -0.042
  ...they decay but never quite reach zero (long memory)
```

```python
import numpy as np
import pandas as pd
from statsmodels.tsa.stattools import adfuller

def get_frac_diff_weights(d, threshold=1e-5, max_size=500):
    """
    Compute weights for fractional differencing.
    Weights decay as a power law, truncated at threshold.
    """
    weights = [1.0]
    k = 1
    while k < max_size:
        w = -weights[-1] * (d - k + 1) / k
        if abs(w) < threshold:
            break
        weights.append(w)
        k += 1
    return np.array(weights)


def frac_diff(series, d, threshold=1e-5):
    """Apply fractional differencing of order d to a series."""
    weights = get_frac_diff_weights(d, threshold)
    width = len(weights)

    result = pd.Series(index=series.index, dtype=float)

    for i in range(width - 1, len(series)):
        window = series.iloc[i - width + 1:i + 1].values[::-1]
        result.iloc[i] = np.dot(weights[:len(window)], window)

    return result.dropna()


def find_min_d(series, max_d=1.0, step=0.05, pvalue_threshold=0.05):
    """
    Find minimum d that makes the series stationary.
    This is the "sweet spot" that preserves maximum memory.
    """
    results = []

    for d in np.arange(0, max_d + step, step):
        if d == 0:
            diffed = series
        else:
            diffed = frac_diff(series, d)

        if len(diffed.dropna()) < 20:
            continue

        adf_stat, adf_pval, _, _, _, _ = adfuller(diffed.dropna(), maxlag=10, autolag="AIC")

        results.append({
            "d": d,
            "adf_stat": adf_stat,
            "adf_pval": adf_pval,
            "is_stationary": adf_pval < pvalue_threshold,
            "correlation_with_original": series.corr(diffed) if len(diffed) > 0 else np.nan,
        })

    results_df = pd.DataFrame(results)

    # Find minimum d where stationary
    stationary_results = results_df[results_df["is_stationary"]]

    if len(stationary_results) > 0:
        min_d_row = stationary_results.iloc[0]
        print(f"Minimum d for stationarity: {min_d_row['d']:.2f}")
        print(f"ADF p-value at d={min_d_row['d']:.2f}: {min_d_row['adf_pval']:.4f}")
        print(f"Correlation with original: {min_d_row['correlation_with_original']:.4f}")
    else:
        print("Could not find stationary transformation up to d=1.0")

    print(f"\n{'d':<6} {'ADF Stat':<12} {'p-value':<10} {'Stationary?':<14} {'Corr w/ orig':<14}")
    print("-" * 56)
    for _, row in results_df.iterrows():
        stat_str = "Yes" if row["is_stationary"] else "No"
        print(f"{row['d']:<6.2f} {row['adf_stat']:<12.4f} {row['adf_pval']:<10.4f} {stat_str:<14} {row['correlation_with_original']:<14.4f}")

    return results_df
```

### Long Memory Processes (ARFIMA)

```
ARFIMA(p, d, q) -- Autoregressive Fractionally Integrated Moving Average
==========================================================================

(1 - phi_1*B - ... - phi_p*B^p) * (1-B)^d * X_t
    = (1 + theta_1*B + ... + theta_q*B^q) * epsilon_t

where 0 < d < 0.5 for stationarity with long memory

ACF behavior:
  ARMA:   rho(k) decays EXPONENTIALLY  -- short memory
  ARFIMA: rho(k) decays as POWER LAW   -- long memory

  k     ARMA ACF    ARFIMA ACF (d=0.3)
  1     0.500       0.500
  5     0.031       0.300
  10    0.001       0.230
  50    ~0          0.140
  100   ~0          0.110
  500   ~0          0.065

  Long memory means autocorrelations at very long lags are still
  significant -- this is characteristic of volatility series.
```

```python
from statsmodels.tsa.arima.model import ARIMA

def fit_arfima(series, p=1, d_frac=0.4, q=1):
    """
    Fit ARFIMA model by first fractionally differencing,
    then fitting ARMA to the result.
    """
    # Step 1: Fractionally difference
    diffed = frac_diff(series, d_frac)

    # Step 2: Fit ARMA(p,q) to differenced series
    model = ARIMA(diffed, order=(p, 0, q))
    result = model.fit()

    print(f"ARFIMA({p}, {d_frac:.2f}, {q}) Model")
    print("=" * 50)
    print(f"Fractional d: {d_frac}")
    print(f"AIC: {result.aic:.2f}")
    print(f"BIC: {result.bic:.2f}")
    print()
    print("Parameters:")
    for name, val in zip(result.param_names, result.params):
        print(f"  {name}: {val:.6f}")

    return result
```

### Vector Autoregression (VAR)

VAR models capture the dynamic interrelationships between multiple time series simultaneously:

```
VAR(p) MODEL
==============

For k variables, each equation includes p lags of ALL variables:

  Y_t = c + A_1 * Y_{t-1} + A_2 * Y_{t-2} + ... + A_p * Y_{t-p} + u_t

  where Y_t is a k x 1 vector, A_i are k x k coefficient matrices

Example: VAR(1) for stocks and bonds:

  [r_stock_t]   [c1]   [a11  a12] [r_stock_{t-1}]   [u1_t]
  [          ] = [  ] + [        ] [              ] + [     ]
  [r_bond_t ]   [c2]   [a21  a22] [r_bond_{t-1} ]   [u2_t]

  a12: effect of lagged bond return on stock return (cross-effect)
  a21: effect of lagged stock return on bond return (cross-effect)
  a11: own persistence of stock returns
  a22: own persistence of bond returns

APPLICATIONS IN TRADING:
  - Model lead-lag relationships between assets
  - Forecast multiple assets jointly
  - Impulse response analysis (how does a shock to one asset affect others?)
  - Variance decomposition (what drives volatility of each asset?)
```

```python
import numpy as np
import pandas as pd
from statsmodels.tsa.api import VAR

def fit_var(data, maxlags=10, ic="bic"):
    """
    Fit VAR model to multivariate time series.
    data: DataFrame where each column is a variable.
    """
    model = VAR(data)

    # Select lag order
    lag_order = model.select_order(maxlags=maxlags)
    print("Lag Order Selection:")
    print(lag_order.summary())

    # Fit with optimal lag
    optimal_lag = lag_order.selected_orders[ic]
    result = model.fit(optimal_lag)

    print(f"\nVAR({optimal_lag}) Model Summary")
    print("=" * 50)

    # Granger causality tests
    print("\nGranger Causality Tests (p-values):")
    variables = data.columns.tolist()
    for caused in variables:
        for causing in variables:
            if caused != causing:
                gc_test = result.test_causality(caused, [causing], kind="f")
                p_val = gc_test.pvalue
                sig = "***" if p_val < 0.01 else "**" if p_val < 0.05 else "*" if p_val < 0.10 else ""
                print(f"  {causing} -> {caused}: p={p_val:.4f} {sig}")

    return result


def impulse_response(var_result, periods=20, shock_var=None):
    """
    Compute impulse response functions from VAR model.
    Shows how a one-unit shock to one variable propagates to all variables.
    """
    irf = var_result.irf(periods=periods)

    print(f"Impulse Response Functions ({periods} periods)")
    print("=" * 50)

    variables = var_result.names

    for shock_idx, shock_name in enumerate(variables):
        print(f"\nShock to {shock_name}:")
        print(f"{'Period':<8}", end="")
        for resp_name in variables:
            print(f"{resp_name:<12}", end="")
        print()
        print("-" * (8 + 12 * len(variables)))

        for t in range(min(periods, 10)):
            print(f"{t:<8}", end="")
            for resp_idx in range(len(variables)):
                val = irf.irfs[t, resp_idx, shock_idx]
                print(f"{val:<12.6f}", end="")
            print()

    return irf
```

### Granger Causality

```
GRANGER CAUSALITY
==================

X "Granger-causes" Y if past values of X help predict Y
beyond what past values of Y alone can predict.

Test: Compare two models:
  Restricted:   Y_t = a + SUM(b_i * Y_{t-i}) + e_t
  Unrestricted: Y_t = a + SUM(b_i * Y_{t-i}) + SUM(c_j * X_{t-j}) + e_t

  H0: all c_j = 0 (X does NOT Granger-cause Y)
  Test: F-test on joint significance of X lags

CRITICAL WARNINGS:
  1. Granger causality != true causality
     It only means predictability, not mechanism
  2. Both X and Y might be caused by a third variable Z
  3. Direction matters: X may GC Y but not vice versa
  4. Sensitive to lag selection and variable omission

TRADING APPLICATIONS:
  - Does VIX Granger-cause S&P 500 returns? (fear leading prices)
  - Do oil prices Granger-cause airline stocks?
  - Does institutional order flow Granger-cause price?
  - Lead-lag relationships between related markets
```

```python
from statsmodels.tsa.stattools import grangercausalitytests

def granger_causality_matrix(data, max_lag=5, significance=0.05):
    """
    Test pairwise Granger causality for all variable pairs.
    Returns a matrix of minimum p-values across tested lags.
    """
    variables = data.columns.tolist()
    n = len(variables)
    results = pd.DataFrame(
        np.ones((n, n)),
        index=variables,
        columns=variables,
    )

    for i, caused in enumerate(variables):
        for j, causing in enumerate(variables):
            if i == j:
                results.iloc[i, j] = np.nan
                continue

            test_data = data[[caused, causing]].dropna()
            try:
                gc = grangercausalitytests(test_data, maxlag=max_lag, verbose=False)
                min_p = min(gc[lag][0]["ssr_ftest"][1] for lag in range(1, max_lag + 1))
                results.iloc[i, j] = min_p
            except Exception:
                results.iloc[i, j] = np.nan

    print("Granger Causality Matrix (min p-values)")
    print("Rows = caused, Columns = causing")
    print("=" * 50)
    print(results.round(4).to_string())
    print()

    # Significant relationships
    print(f"Significant relationships (p < {significance}):")
    for i, caused in enumerate(variables):
        for j, causing in enumerate(variables):
            if i != j and results.iloc[i, j] < significance:
                print(f"  {causing} --> {caused} (p = {results.iloc[i, j]:.4f})")

    return results
```

### Kalman Filtering

The Kalman filter estimates hidden state variables that evolve over time. In finance, it is used to estimate time-varying parameters (dynamic hedge ratios, time-varying betas, unobserved factors).

```
KALMAN FILTER FRAMEWORK
========================

State equation (hidden dynamics):
  x_t = F * x_{t-1} + B * u_t + w_t,    w_t ~ N(0, Q)

Observation equation (what we see):
  y_t = H * x_t + v_t,                   v_t ~ N(0, R)

where:
  x_t = state vector (hidden)
  y_t = observation vector (measured)
  F   = state transition matrix
  H   = observation matrix
  Q   = process noise covariance
  R   = measurement noise covariance

RECURSIVE ALGORITHM:
  Predict --> Update --> Predict --> Update --> ...

  PREDICT (time update):
    x_hat_{t|t-1} = F * x_hat_{t-1|t-1}        (predicted state)
    P_{t|t-1} = F * P_{t-1|t-1} * F' + Q       (predicted covariance)

  UPDATE (measurement update):
    K_t = P_{t|t-1} * H' * (H*P_{t|t-1}*H' + R)^{-1}   (Kalman gain)
    x_hat_{t|t} = x_hat_{t|t-1} + K_t * (y_t - H*x_hat_{t|t-1})
    P_{t|t} = (I - K_t*H) * P_{t|t-1}

  K_t (Kalman gain):
    K close to 1: trust observation more (measurement noise low)
    K close to 0: trust prediction more (process noise low)
```

```python
import numpy as np
import pandas as pd

class KalmanFilter:
    """
    Simple Kalman filter for dynamic linear regression.
    Estimates time-varying regression coefficients:
      y_t = beta_t' * x_t + epsilon_t
      beta_t = beta_{t-1} + eta_t
    """

    def __init__(self, n_states, obs_noise=1.0, state_noise=0.01):
        self.n_states = n_states
        self.R = obs_noise           # Observation noise variance
        self.Q = np.eye(n_states) * state_noise  # State noise covariance

    def filter(self, y, X):
        """
        Run Kalman filter.
        y: observations (n_obs,)
        X: regressors (n_obs, n_states)
        """
        n_obs = len(y)

        # Initialize
        beta = np.zeros(self.n_states)           # state estimate
        P = np.eye(self.n_states) * 10           # state covariance (uncertain)

        # Storage
        betas = np.zeros((n_obs, self.n_states))
        predictions = np.zeros(n_obs)
        errors = np.zeros(n_obs)

        for t in range(n_obs):
            x_t = X[t]

            # PREDICT
            beta_pred = beta                      # Random walk state transition
            P_pred = P + self.Q

            # Prediction error
            y_pred = x_t @ beta_pred
            error = y[t] - y_pred

            # UPDATE
            S = x_t @ P_pred @ x_t + self.R       # Innovation variance
            K = P_pred @ x_t / S                   # Kalman gain

            beta = beta_pred + K * error
            P = P_pred - np.outer(K, K) * S

            # Store
            betas[t] = beta
            predictions[t] = y_pred
            errors[t] = error

        return betas, predictions, errors


def dynamic_hedge_ratio(y, x, obs_noise=1.0, state_noise=0.001):
    """
    Estimate time-varying hedge ratio using Kalman filter.

    y, x: two price series (cointegrated pair)
    Returns dynamic hedge ratio over time.
    """
    # Prepare data: y_t = alpha_t + beta_t * x_t
    X = np.column_stack([np.ones(len(x)), x.values])

    kf = KalmanFilter(n_states=2, obs_noise=obs_noise, state_noise=state_noise)
    betas, predictions, errors = kf.filter(y.values, X)

    result = pd.DataFrame({
        "alpha": betas[:, 0],
        "beta": betas[:, 1],
        "prediction": predictions,
        "error": errors,
    }, index=y.index)

    print("Dynamic Hedge Ratio (Kalman Filter)")
    print("=" * 45)
    print(f"Final alpha: {result['alpha'].iloc[-1]:.4f}")
    print(f"Final beta:  {result['beta'].iloc[-1]:.4f}")
    print(f"Beta range:  [{result['beta'].min():.4f}, {result['beta'].max():.4f}]")
    print(f"RMSE: {np.sqrt(np.mean(errors**2)):.6f}")

    return result
```

```
KALMAN FILTER FOR DYNAMIC PAIRS TRADING
==========================================

Static hedge ratio (OLS):         Dynamic hedge ratio (Kalman):
beta = constant for all t          beta_t varies over time

  Beta                                Beta
  ^                                   ^
  |                                   |      ___
  |  ==================               |   __/   \____
  |  (fixed at 0.85)                  |  /           \___
  |                                   | /                \__
  +------------------------> t       +/-----------------------\-> t
                                      0.70   0.85   0.90   0.78

  Problem: true relationship          Advantage: tracks the true
  may drift over time                 time-varying relationship

  Spread = Y - 0.85*X                Spread = Y - beta_t*X
  (may diverge if beta shifts)       (stays mean-reverting)
```

### State-Space Models

The Kalman filter is a special case of the broader state-space framework. State-space models unify many time series models:

```
STATE-SPACE REPRESENTATION OF COMMON MODELS
==============================================

1. ARMA(1,1):
   State: [X_t, epsilon_t]'
   Transition: [X_t    ]   [phi  theta] [X_{t-1}    ]   [1]
               [eps_t  ] = [0      0  ] [eps_{t-1}  ] + [1] * eta_t
   Observation: Y_t = [1  0] * [X_t, eps_t]'

2. Local Level (Random Walk + Noise):
   State: mu_t (unobserved level)
   mu_t = mu_{t-1} + eta_t           (state)
   y_t  = mu_t + epsilon_t           (observation)

3. Local Linear Trend:
   State: [mu_t, nu_t] (level and slope)
   mu_t = mu_{t-1} + nu_{t-1} + eta1_t
   nu_t = nu_{t-1} + eta2_t
   y_t  = mu_t + epsilon_t

4. Dynamic Factor Model:
   State: f_t (unobserved factors)
   f_t = Phi * f_{t-1} + eta_t
   Y_t = Lambda * f_t + epsilon_t    (many observables, few factors)
```

```python
import statsmodels.api as sm

def fit_local_level(series, name="Series"):
    """
    Fit local level (random walk + noise) state space model.
    Decomposes series into unobserved level + noise.
    """
    model = sm.tsa.UnobservedComponents(
        series,
        level="local level",
    )
    result = model.fit(disp=False)

    print(f"Local Level Model: {name}")
    print("=" * 45)
    print(f"Observation noise variance: {result.params[0]:.6f}")
    print(f"Level noise variance:       {result.params[1]:.6f}")
    print(f"Signal-to-noise ratio:      {result.params[1]/result.params[0]:.4f}")
    print(f"Log-Likelihood: {result.llf:.2f}")
    print(f"AIC: {result.aic:.2f}")

    # Smoothed level
    level = result.level.smoothed

    return result, level


def fit_local_linear_trend(series, name="Series"):
    """
    Fit local linear trend state space model.
    Decomposes into level + trend + noise.
    """
    model = sm.tsa.UnobservedComponents(
        series,
        level="local linear trend",
    )
    result = model.fit(disp=False)

    print(f"Local Linear Trend Model: {name}")
    print("=" * 45)
    print(result.summary().tables[1])

    level = result.level.smoothed
    trend = result.trend.smoothed

    return result, level, trend
```

---

## Putting It All Together: A Complete Time Series Analysis Pipeline

```python
import numpy as np
import pandas as pd
import warnings
warnings.filterwarnings("ignore")

class TimeSeriesAnalyzer:
    """
    Complete time series analysis pipeline for financial data.
    Performs stationarity testing, model fitting, and signal generation.
    """

    def __init__(self, prices, name="Asset"):
        self.prices = prices
        self.name = name
        self.returns = np.log(prices / prices.shift(1)).dropna()
        self.results = {}

    def step1_stationarity(self):
        """Test stationarity and transform if needed."""
        print(f"{'='*60}")
        print(f"STEP 1: STATIONARITY ANALYSIS -- {self.name}")
        print(f"{'='*60}\n")

        # ADF on prices
        from statsmodels.tsa.stattools import adfuller, kpss

        adf_prices = adfuller(self.prices.dropna(), autolag="AIC")
        adf_returns = adfuller(self.returns.dropna(), autolag="AIC")

        print(f"ADF Test on Prices:  stat={adf_prices[0]:.4f}, p={adf_prices[1]:.4f}")
        print(f"ADF Test on Returns: stat={adf_returns[0]:.4f}, p={adf_returns[1]:.4f}")
        print()

        # KPSS
        kpss_prices = kpss(self.prices.dropna(), regression="c", nlags="auto")
        kpss_returns = kpss(self.returns.dropna(), regression="c", nlags="auto")

        print(f"KPSS Test on Prices:  stat={kpss_prices[0]:.4f}, p={kpss_prices[1]:.4f}")
        print(f"KPSS Test on Returns: stat={kpss_returns[0]:.4f}, p={kpss_returns[1]:.4f}")

        self.results["prices_stationary"] = adf_prices[1] < 0.05
        self.results["returns_stationary"] = adf_returns[1] < 0.05

        print(f"\nPrices stationary: {self.results['prices_stationary']}")
        print(f"Returns stationary: {self.results['returns_stationary']}")
        print()

    def step2_autocorrelation(self):
        """Analyze autocorrelation structure."""
        print(f"{'='*60}")
        print(f"STEP 2: AUTOCORRELATION ANALYSIS -- {self.name}")
        print(f"{'='*60}\n")

        from statsmodels.tsa.stattools import acf, pacf
        from statsmodels.stats.diagnostic import acorr_ljungbox

        acf_vals = acf(self.returns, nlags=20, fft=True)
        pacf_vals = pacf(self.returns, nlags=20, method="ywm")

        n = len(self.returns)
        sig = 1.96 / np.sqrt(n)

        print(f"Significant ACF lags (95%):  ", end="")
        sig_acf = [i for i in range(1, 21) if abs(acf_vals[i]) > sig]
        print(sig_acf if sig_acf else "None")

        print(f"Significant PACF lags (95%): ", end="")
        sig_pacf = [i for i in range(1, 21) if abs(pacf_vals[i]) > sig]
        print(sig_pacf if sig_pacf else "None")

        # Ljung-Box
        lb = acorr_ljungbox(self.returns, lags=10, return_df=True)
        print(f"\nLjung-Box Test (lag 10): Q={lb.iloc[-1]['lb_stat']:.2f}, p={lb.iloc[-1]['lb_pvalue']:.4f}")

        # Also test squared returns (ARCH effects)
        lb_sq = acorr_ljungbox(self.returns ** 2, lags=10, return_df=True)
        print(f"Ljung-Box on r^2 (lag 10): Q={lb_sq.iloc[-1]['lb_stat']:.2f}, p={lb_sq.iloc[-1]['lb_pvalue']:.4f}")

        has_arch = lb_sq.iloc[-1]["lb_pvalue"] < 0.05
        print(f"\nARCH effects present: {has_arch}")
        self.results["has_arch_effects"] = has_arch
        print()

    def step3_fit_models(self):
        """Fit ARIMA and GARCH models."""
        print(f"{'='*60}")
        print(f"STEP 3: MODEL FITTING -- {self.name}")
        print(f"{'='*60}\n")

        from statsmodels.tsa.arima.model import ARIMA
        from arch import arch_model

        # Fit ARIMA (on returns)
        best_aic = np.inf
        best_order = (0, 0, 0)

        for p in range(4):
            for q in range(4):
                try:
                    model = ARIMA(self.returns, order=(p, 0, q))
                    fit = model.fit()
                    if fit.aic < best_aic:
                        best_aic = fit.aic
                        best_order = (p, 0, q)
                except Exception:
                    continue

        arima_model = ARIMA(self.returns, order=best_order)
        arima_fit = arima_model.fit()

        print(f"Best ARIMA order: {best_order}")
        print(f"ARIMA AIC: {arima_fit.aic:.2f}")

        # Fit GARCH on residuals (or returns)
        returns_pct = self.returns * 100
        garch = arch_model(returns_pct, vol="Garch", p=1, q=1, mean="ARX", lags=0)
        garch_fit = garch.fit(disp="off")

        print(f"\nGARCH(1,1) results:")
        print(f"  omega: {garch_fit.params.get('omega', 0):.6f}")
        print(f"  alpha: {garch_fit.params.get('alpha[1]', 0):.4f}")
        print(f"  beta:  {garch_fit.params.get('beta[1]', 0):.4f}")

        alpha = garch_fit.params.get("alpha[1]", 0)
        beta = garch_fit.params.get("beta[1]", 0)
        persistence = alpha + beta
        print(f"  persistence: {persistence:.4f}")

        self.results["arima_order"] = best_order
        self.results["garch_persistence"] = persistence
        self.results["arima_fit"] = arima_fit
        self.results["garch_fit"] = garch_fit
        print()

    def run_full_analysis(self):
        """Run the complete pipeline."""
        self.step1_stationarity()
        self.step2_autocorrelation()
        self.step3_fit_models()

        print(f"{'='*60}")
        print(f"SUMMARY -- {self.name}")
        print(f"{'='*60}")
        print(f"Prices stationary:  {self.results.get('prices_stationary', 'N/A')}")
        print(f"Returns stationary: {self.results.get('returns_stationary', 'N/A')}")
        print(f"ARCH effects:       {self.results.get('has_arch_effects', 'N/A')}")
        print(f"ARIMA order:        {self.results.get('arima_order', 'N/A')}")
        print(f"GARCH persistence:  {self.results.get('garch_persistence', 'N/A'):.4f}")

        return self.results


# Usage:
# analyzer = TimeSeriesAnalyzer(spy_prices, name="SPY")
# results = analyzer.run_full_analysis()
```

---

## Summary and Decision Framework

```
TIME SERIES TOOLBOX -- WHEN TO USE WHAT
==========================================

QUESTION                          TOOL                    SECTION
----------------------------      ----------------------  -------
Is my series stationary?          ADF + KPSS tests        1
What lags matter?                 ACF / PACF              2
Can I forecast the mean?          ARIMA / SARIMA          3
Can I forecast volatility?        GARCH family            4
Are two assets linked long-term?  Cointegration tests     5
Is the market regime changing?    HMM / Markov-switching  6
Are there hidden cycles?          FFT / wavelets          7
How to preserve memory?           Fractional differencing 8
Multi-asset dynamics?             VAR / Granger causality 8
Time-varying parameters?          Kalman filter           8

COMMON PITFALLS:
  1. Applying ARIMA to non-stationary data (spurious results)
  2. Confusing correlation with cointegration
  3. Overfitting ARIMA with too many parameters
  4. Ignoring volatility clustering (need GARCH)
  5. Assuming detected "cycles" are persistent
  6. Using in-sample fit as evidence of predictability
  7. Full differencing when fractional would preserve signal
  8. Treating Granger causality as true causality

WORKFLOW RECOMMENDATION:
  1. Always start with stationarity testing
  2. Examine ACF/PACF of returns AND squared returns
  3. Fit parsimonious models (prefer BIC over AIC)
  4. Always validate out-of-sample
  5. Use multiple models and ensemble their signals
  6. Respect the Efficient Market Hypothesis --
     most "signals" vanish after transaction costs
```

---

## Key Formulas Reference

```
QUICK REFERENCE
=================

Log return:           r_t = log(P_t / P_{t-1})
ADF regression:       dX_t = alpha + beta*t + gamma*X_{t-1} + SUM(delta_i*dX_{t-i}) + e_t
ACF:                  rho(k) = gamma(k) / gamma(0)
ARIMA(p,d,q):         phi(B)(1-B)^d X_t = theta(B) e_t
GARCH(1,1):           sigma_t^2 = omega + alpha*e_{t-1}^2 + beta*sigma_{t-1}^2
Cointegration:        Y_t = alpha + beta*X_t + z_t,  z_t ~ I(0)
ECM:                  dY_t = gamma*z_{t-1} + short-run terms + e_t
Half-life:            h = -log(2) / log(1 + gamma)
Frac diff weights:    w_k = -w_{k-1} * (d - k + 1) / k
Kalman gain:          K_t = P_{t|t-1} H' (H P_{t|t-1} H' + R)^{-1}
Granger causality:    F-test on lagged X terms in regression of Y on own lags + X lags
Spectral density:     S(f) = |FFT(X)|^2 / N
```

---

## Further Reading

The canonical references for each topic covered in this chapter:

- **Stationarity and Unit Roots**: Hamilton, *Time Series Analysis* (1994), Chapters 15-17
- **ARIMA**: Box, Jenkins, Reinsel, Ljung, *Time Series Analysis* (5th ed., 2015)
- **GARCH**: Engle, "Autoregressive Conditional Heteroscedasticity" (1982); Bollerslev, "Generalized ARCH" (1986)
- **Cointegration**: Engle & Granger, "Co-integration and Error Correction" (1987); Johansen, *Likelihood-Based Inference in Cointegrated VAR Models* (1995)
- **Regime Switching**: Hamilton, "A New Approach to the Economic Analysis of Nonstationary Time Series" (1989)
- **Fractional Differencing**: de Prado, *Advances in Financial Machine Learning* (2018), Chapter 5
- **Wavelets**: Percival & Walden, *Wavelet Methods for Time Series Analysis* (2000)
- **Kalman Filter**: Durbin & Koopman, *Time Series Analysis by State Space Methods* (2012)
- **Applied Finance**: Tsay, *Analysis of Financial Time Series* (3rd ed., 2010)
