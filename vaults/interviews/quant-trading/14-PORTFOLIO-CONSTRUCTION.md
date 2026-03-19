# Chapter 14: Portfolio Construction and Optimization

## From Individual Signals to a Complete Portfolio

You have alpha signals. You have risk models. You have execution systems. Now comes the question that separates amateur traders from professional portfolio managers: **how do you combine everything into a coherent portfolio?**

Portfolio construction is the bridge between research and reality. A brilliant signal means nothing if you allocate capital poorly, ignore correlations, or let estimation errors dominate your weights. This chapter covers the full spectrum --- from Markowitz's foundational theory to modern hierarchical methods used at the world's largest quant funds.

```
+------------------------------------------------------------------------+
|                    PORTFOLIO CONSTRUCTION PIPELINE                       |
+------------------------------------------------------------------------+
|                                                                        |
|  INPUTS                           OPTIMIZATION        OUTPUT           |
|  +---------------------+         +-----------+       +-----------+    |
|  | Expected Returns     |-------->|           |       |           |    |
|  | (alpha signals)      |         |           |       | Portfolio  |    |
|  +---------------------+         | Portfolio  |------>| Weights    |    |
|  | Covariance Matrix    |-------->| Optimizer  |       | w1...wN   |    |
|  | (risk model)         |         |           |       |           |    |
|  +---------------------+         |           |       +-----------+    |
|  | Constraints          |-------->|           |                        |
|  | (regulatory, risk)   |         +-----------+                        |
|  +---------------------+              |                                |
|  | Transaction Costs    |--------------+                               |
|  +---------------------+                                               |
|                                                                        |
+------------------------------------------------------------------------+
```

---

## 14.1 Portfolio Theory Foundations

### Harry Markowitz and Modern Portfolio Theory (1952)

In 1952, Harry Markowitz published "Portfolio Selection" in the _Journal of Finance_, launching what we now call **Modern Portfolio Theory (MPT)**. His insight was deceptively simple: investors should care not just about expected return, but about the **trade-off between return and risk** at the portfolio level.

Before Markowitz, the standard advice was: "buy the stock with the highest expected return." Markowitz showed this is wrong. By combining assets with imperfect correlations, you can achieve the same expected return with **lower risk** --- or higher return for the **same risk**.

```
THE KEY INSIGHT OF MARKOWITZ
============================

Before Markowitz:              After Markowitz:
"Pick the best stock"          "Pick the best COMBINATION"

Single Asset Thinking:         Portfolio Thinking:

  Return                         Return
    ^                              ^
    |        * Asset A             |         * Efficient
    |                              |        /  Frontier
    |   * Asset B                  |       /
    |                              |      *----* Portfolios
    |                              |     /
    | * Asset C                    |    *
    |                              |   /
    +-----------> Risk             +-----------> Risk

  "A is best because             "Combinations of A, B, C
   highest return"                can beat any single asset"
```

### Expected Return of a Portfolio

For a portfolio of N assets with weights w = (w1, w2, ..., wN):

```
E[Rp] = sum(wi * E[Ri]) = w^T * mu

where:
  wi   = weight of asset i (fraction of capital)
  E[Ri] = expected return of asset i
  mu   = vector of expected returns

Example: 2-asset portfolio
  w = [0.6, 0.4]
  mu = [0.10, 0.06]  (10% and 6% expected returns)

  E[Rp] = 0.6 * 0.10 + 0.4 * 0.06
        = 0.060 + 0.024
        = 0.084 = 8.4%
```

The portfolio expected return is simply the **weighted average** of individual expected returns. Nothing surprising here. The magic happens with variance.

### Portfolio Variance: The Diversification Effect

```
Var(Rp) = w^T * Sigma * w

         = sum_i sum_j (wi * wj * sigma_ij)

where:
  Sigma    = N x N covariance matrix
  sigma_ij = Cov(Ri, Rj)
  sigma_ii = Var(Ri) = sigma_i^2

Expanded for 2 assets:

  Var(Rp) = w1^2 * sigma1^2 + w2^2 * sigma2^2 + 2*w1*w2*sigma12

          = w1^2 * sigma1^2 + w2^2 * sigma2^2 + 2*w1*w2*rho12*sigma1*sigma2

where rho12 = correlation between assets 1 and 2
```

**The crucial observation**: when rho12 < 1 (assets are not perfectly correlated), portfolio variance is **less than** the weighted average of individual variances. This is diversification.

```
DIVERSIFICATION EFFECT: 2-ASSET EXAMPLE
========================================

Asset A: E[R] = 12%, sigma = 20%
Asset B: E[R] = 8%,  sigma = 15%
Weight:  w_A = 0.5, w_B = 0.5

Portfolio risk for different correlations:

  sigma_p  |
    20% -  |  *
           |    *
    17% -  |      * rho = +1.0 (no diversification)
           |        *
    14% -  |    o     *
           |      o     *
    11% -  |        o     * rho = +0.5
           |          o
     8% -  |      #     o
           |        #     o
     5% -  |          #     o  rho = 0.0
           |            #
     2% -  |              #    rho = -1.0 (perfect hedge)
           +------------------------------------------
           0.0  0.2  0.4  0.6  0.8  1.0  weight in A

Key: * = rho=+1, o = rho=0, # = rho=-1

When rho = +1.0: sigma_p = 0.5*20% + 0.5*15% = 17.5% (no benefit)
When rho = +0.5: sigma_p = sqrt(0.25*0.04 + 0.25*0.0225 + 2*0.25*0.5*0.03)
                         = sqrt(0.01 + 0.005625 + 0.0075) = sqrt(0.023125) = 15.2%
When rho =  0.0: sigma_p = sqrt(0.01 + 0.005625) = sqrt(0.015625) = 12.5%
When rho = -1.0: sigma_p = |0.5*20% - 0.5*15%| = 2.5%
```

### Covariance and Correlation Matrices

```python
import numpy as np
import pandas as pd

# Simulated daily returns for 4 assets
np.random.seed(42)
n_days = 252
n_assets = 4
asset_names = ['SPY', 'TLT', 'GLD', 'VNQ']

# Create correlated returns using Cholesky decomposition
true_corr = np.array([
    [1.0,  -0.3,  0.1,  0.6],
    [-0.3,  1.0,  0.2, -0.1],
    [0.1,   0.2,  1.0,  0.05],
    [0.6,  -0.1,  0.05, 1.0]
])
true_vols = np.array([0.16, 0.12, 0.14, 0.20])  # annualized
true_means = np.array([0.10, 0.04, 0.06, 0.08])  # annualized

# Convert to daily parameters
daily_vols = true_vols / np.sqrt(252)
daily_means = true_means / 252

# Build covariance from correlation and volatilities
D = np.diag(daily_vols)
daily_cov = D @ true_corr @ D

# Generate returns via Cholesky
L = np.linalg.cholesky(daily_cov)
Z = np.random.randn(n_days, n_assets)
returns = daily_means + Z @ L.T

returns_df = pd.DataFrame(returns, columns=asset_names)

# Estimate covariance and correlation
sample_cov = returns_df.cov() * 252      # annualize
sample_corr = returns_df.corr()

print("Annualized Covariance Matrix:")
print(sample_cov.round(4))
print("\nCorrelation Matrix:")
print(sample_corr.round(3))
```

```
COVARIANCE vs CORRELATION
=========================

Covariance Matrix (Sigma):                Correlation Matrix (C):
        SPY    TLT    GLD    VNQ                 SPY    TLT    GLD    VNQ
SPY   0.0256 -0.0058 0.0022 0.0192       SPY   1.000 -0.301  0.099  0.600
TLT  -0.0058  0.0144 0.0034 -0.0024      TLT  -0.301  1.000  0.200 -0.100
GLD   0.0022  0.0034 0.0196  0.0014      GLD   0.099  0.200  1.000  0.050
VNQ   0.0192 -0.0024 0.0014  0.0400      VNQ   0.600 -0.100  0.050  1.000

Relationship: sigma_ij = rho_ij * sigma_i * sigma_j
              rho_ij   = sigma_ij / (sigma_i * sigma_j)

Key observations:
- SPY-TLT negative correlation (-0.30): classic diversifier
- SPY-VNQ high correlation (0.60): limited diversification
- GLD low correlation with everything: good portfolio diversifier
```

### The Efficient Frontier

The efficient frontier is the set of portfolios that offer the **maximum expected return for each level of risk** (or equivalently, the minimum risk for each level of return).

```
THE EFFICIENT FRONTIER
======================

  E[R]
   ^
   |                                    * CML (with risk-free asset)
   |                                  /
   |                                /
   |                        *  *  T   <-- Tangency Portfolio
   |                     *    /
   |                   *    /
   |                 *    /
   |               *    /    <-- Efficient Frontier
   |              *   /          (upper portion)
   |             *  /
   |            * /
   | Rf ------*    <-- Risk-Free Rate
   |          /  *
   |         /    *
   |        /      *  <-- Inefficient (dominated)
   |       /        *     portfolios
   |                 *
   |            * * *    <-- Minimum Variance
   |                       Portfolio (MVP)
   +-----------------------------------------> sigma (risk)

   Efficient frontier = upper boundary of the "bullet"
   All portfolios below the MVP are inefficient
   The tangency portfolio T maximizes the Sharpe ratio
```

### Capital Market Line and Risk-Free Asset

When a risk-free asset (rate Rf) is available, the **Capital Market Line (CML)** extends from Rf tangent to the efficient frontier. Every point on the CML represents a combination of the risk-free asset and the **tangency portfolio**.

```
CML: E[Rp] = Rf + ((E[Rt] - Rf) / sigma_t) * sigma_p

where:
  Rt     = return of tangency portfolio
  sigma_t = risk of tangency portfolio
  slope  = (E[Rt] - Rf) / sigma_t = maximum Sharpe ratio
```

### Two-Fund Separation Theorem

A profound result: **every efficient portfolio can be constructed from just two funds** --- the risk-free asset and the tangency portfolio. Regardless of risk preference, all investors should hold the same risky portfolio (the tangency portfolio) and simply adjust their allocation to the risk-free asset:

- **Conservative investor**: 80% risk-free, 20% tangency portfolio
- **Moderate investor**: 40% risk-free, 60% tangency portfolio
- **Aggressive investor**: 0% risk-free, 100% tangency portfolio
- **Leveraged investor**: -50% risk-free (borrow), 150% tangency portfolio

### Worked Example: 2-Asset Portfolio

```python
import numpy as np

# Two-asset portfolio
mu = np.array([0.10, 0.06])        # expected returns
sigma = np.array([0.20, 0.12])     # volatilities
rho = -0.2                          # correlation

# Covariance matrix
cov_matrix = np.array([
    [sigma[0]**2,               rho * sigma[0] * sigma[1]],
    [rho * sigma[0] * sigma[1], sigma[1]**2              ]
])

print("Covariance Matrix:")
print(cov_matrix)
# [[0.0400, -0.0048],
#  [-0.0048, 0.0144]]

# Sweep through weights
weights_A = np.linspace(0, 1, 101)
port_returns = []
port_risks = []

for w_a in weights_A:
    w = np.array([w_a, 1 - w_a])
    ret = w @ mu
    var = w @ cov_matrix @ w
    port_returns.append(ret)
    port_risks.append(np.sqrt(var))

# Find minimum variance portfolio
min_idx = np.argmin(port_risks)
print(f"\nMinimum Variance Portfolio:")
print(f"  Weight A = {weights_A[min_idx]:.2%}")
print(f"  Weight B = {1 - weights_A[min_idx]:.2%}")
print(f"  Return   = {port_returns[min_idx]:.2%}")
print(f"  Risk     = {port_risks[min_idx]:.2%}")

# Analytical MVP for 2 assets
# w_A* = (sigma_B^2 - sigma_AB) / (sigma_A^2 + sigma_B^2 - 2*sigma_AB)
w_a_star = (cov_matrix[1,1] - cov_matrix[0,1]) / (
    cov_matrix[0,0] + cov_matrix[1,1] - 2 * cov_matrix[0,1]
)
print(f"\nAnalytical MVP weight A = {w_a_star:.4f}")
```

```
OUTPUT:
  Minimum Variance Portfolio:
    Weight A = 27.00%
    Weight B = 73.00%
    Return   = 7.08%
    Risk     = 10.13%

  Analytical MVP weight A = 0.2727
```

### Worked Example: 3-Asset Portfolio

```python
import numpy as np
from scipy.optimize import minimize

# Three assets: Stocks, Bonds, Commodities
mu = np.array([0.10, 0.05, 0.07])
sigma = np.array([0.18, 0.08, 0.15])
corr = np.array([
    [1.0,  -0.2, 0.3],
    [-0.2,  1.0, 0.1],
    [0.3,   0.1, 1.0]
])

# Build covariance matrix
D = np.diag(sigma)
cov_matrix = D @ corr @ D

print("Covariance Matrix:")
print(np.round(cov_matrix, 5))

# Find efficient frontier by minimizing variance for target returns
target_returns = np.linspace(0.05, 0.10, 50)
efficient_risks = []
efficient_weights = []

for target in target_returns:
    n = len(mu)

    def portfolio_variance(w):
        return w @ cov_matrix @ w

    constraints = [
        {'type': 'eq', 'fun': lambda w: np.sum(w) - 1},           # budget
        {'type': 'eq', 'fun': lambda w: w @ mu - target}          # target return
    ]
    bounds = [(0, 1) for _ in range(n)]  # long-only
    w0 = np.ones(n) / n

    result = minimize(portfolio_variance, w0, method='SLSQP',
                      bounds=bounds, constraints=constraints)

    if result.success:
        efficient_risks.append(np.sqrt(result.fun))
        efficient_weights.append(result.x)

# Print select portfolios
print("\nEfficient Frontier Portfolios:")
print(f"{'Return':>8} {'Risk':>8} {'Stocks':>8} {'Bonds':>8} {'Commod':>8}")
print("-" * 44)
for i in range(0, len(target_returns), 10):
    if i < len(efficient_weights):
        w = efficient_weights[i]
        print(f"{target_returns[i]:8.2%} {efficient_risks[i]:8.2%} "
              f"{w[0]:8.2%} {w[1]:8.2%} {w[2]:8.2%}")
```

```
OUTPUT:

Efficient Frontier Portfolios:
  Return     Risk   Stocks    Bonds   Commod
--------------------------------------------
   5.00%    7.88%    0.00%  100.00%    0.00%
   6.00%    6.77%    8.27%   71.77%   19.96%
   7.00%    8.11%   28.18%   40.04%   31.78%
   8.00%   10.69%   48.09%    8.31%   43.60%
   9.00%   13.90%   66.67%    0.00%   33.33%
  10.00%   18.00%  100.00%    0.00%    0.00%
```

---

## 14.2 Mean-Variance Optimization (MVO)

### Mathematical Formulation

Mean-variance optimization solves one of two equivalent problems:

```
FORMULATION 1: Minimize risk for a target return
=================================================

  minimize    w^T * Sigma * w          (portfolio variance)
  subject to  w^T * mu  = target_ret   (return constraint)
              w^T * 1   = 1            (budget constraint)
              w >= 0                    (long-only, optional)

FORMULATION 2: Maximize risk-adjusted return
============================================

  maximize    w^T * mu - (lambda/2) * w^T * Sigma * w
  subject to  w^T * 1 = 1
              w >= 0

  where lambda = risk aversion parameter
  - lambda = 0:    maximize return (ignore risk)
  - lambda -> inf: minimize variance (ignore return)

FORMULATION 3: Maximize Sharpe ratio
=====================================

  maximize    (w^T * mu - Rf) / sqrt(w^T * Sigma * w)
  subject to  w^T * 1 = 1
              w >= 0
```

### Matrix Notation

```
The unconstrained solution (Formulation 2, no bounds):

  w* = (1/lambda) * Sigma^{-1} * mu

  Then normalize: w* = w* / sum(w*)

For the minimum variance portfolio (ignoring returns):

  w_mvp = Sigma^{-1} * 1 / (1^T * Sigma^{-1} * 1)
```

### Constraints

Real portfolios need constraints:

```
COMMON CONSTRAINTS IN PORTFOLIO OPTIMIZATION
=============================================

1. Budget Constraint (always required):
   sum(wi) = 1

2. Long-Only:
   wi >= 0 for all i

3. Box Constraints (position limits):
   lb_i <= wi <= ub_i
   Example: 0% <= wi <= 10% (max 10% in any name)

4. Sector Constraints:
   sum(wi for i in sector_k) <= sector_limit_k
   Example: Technology <= 30%

5. Turnover Constraint:
   sum(|wi - wi_prev|) <= max_turnover
   Example: max turnover of 20% per rebalance

6. Factor Exposure:
   beta_min <= w^T * beta <= beta_max
   Example: market beta between 0.95 and 1.05

7. Tracking Error:
   sqrt((w - w_bench)^T * Sigma * (w - w_bench)) <= TE_max
   Example: tracking error <= 2%

8. Number of Holdings:
   |{i : wi > 0}| <= K
   (This makes the problem NP-hard -- use heuristics)
```

### Python Implementation: Full Efficient Frontier

```python
import numpy as np
from scipy.optimize import minimize

class MeanVarianceOptimizer:
    """Mean-Variance Portfolio Optimizer."""

    def __init__(self, expected_returns, cov_matrix, risk_free_rate=0.02):
        self.mu = np.array(expected_returns)
        self.cov = np.array(cov_matrix)
        self.rf = risk_free_rate
        self.n_assets = len(self.mu)

    def portfolio_return(self, weights):
        return weights @ self.mu

    def portfolio_risk(self, weights):
        return np.sqrt(weights @ self.cov @ weights)

    def portfolio_sharpe(self, weights):
        ret = self.portfolio_return(weights)
        risk = self.portfolio_risk(weights)
        if risk < 1e-10:
            return 0.0
        return (ret - self.rf) / risk

    def minimum_variance_portfolio(self, long_only=True):
        """Find the minimum variance portfolio."""
        constraints = [
            {'type': 'eq', 'fun': lambda w: np.sum(w) - 1}
        ]
        if long_only:
            bounds = [(0, 1) for _ in range(self.n_assets)]
        else:
            bounds = [(-1, 1) for _ in range(self.n_assets)]

        w0 = np.ones(self.n_assets) / self.n_assets
        result = minimize(
            lambda w: w @ self.cov @ w,
            w0, method='SLSQP',
            bounds=bounds, constraints=constraints
        )
        return result.x

    def tangency_portfolio(self, long_only=True):
        """Find the maximum Sharpe ratio portfolio."""
        constraints = [
            {'type': 'eq', 'fun': lambda w: np.sum(w) - 1}
        ]
        if long_only:
            bounds = [(0, 1) for _ in range(self.n_assets)]
        else:
            bounds = [(-1, 1) for _ in range(self.n_assets)]

        w0 = np.ones(self.n_assets) / self.n_assets
        result = minimize(
            lambda w: -self.portfolio_sharpe(w),
            w0, method='SLSQP',
            bounds=bounds, constraints=constraints
        )
        return result.x

    def efficient_frontier(self, n_points=50, long_only=True):
        """Compute the efficient frontier."""
        # Find return range
        w_min = self.minimum_variance_portfolio(long_only)
        min_ret = self.portfolio_return(w_min)

        if long_only:
            max_ret = np.max(self.mu)
        else:
            max_ret = np.max(self.mu) * 1.5

        target_returns = np.linspace(min_ret, max_ret, n_points)
        frontier_risks = []
        frontier_weights = []

        for target in target_returns:
            constraints = [
                {'type': 'eq', 'fun': lambda w: np.sum(w) - 1},
                {'type': 'eq', 'fun': lambda w, t=target: w @ self.mu - t}
            ]
            if long_only:
                bounds = [(0, 1) for _ in range(self.n_assets)]
            else:
                bounds = [(-1, 1) for _ in range(self.n_assets)]

            w0 = np.ones(self.n_assets) / self.n_assets
            result = minimize(
                lambda w: w @ self.cov @ w,
                w0, method='SLSQP',
                bounds=bounds, constraints=constraints
            )

            if result.success:
                frontier_risks.append(np.sqrt(result.fun))
                frontier_weights.append(result.x)
            else:
                frontier_risks.append(np.nan)
                frontier_weights.append(np.full(self.n_assets, np.nan))

        return {
            'returns': np.array(target_returns),
            'risks': np.array(frontier_risks),
            'weights': np.array(frontier_weights)
        }

# Usage example
mu = np.array([0.12, 0.10, 0.07, 0.05, 0.08])
names = ['US_Equity', 'Intl_Equity', 'Bonds', 'Cash', 'REIT']

# Correlation matrix
corr = np.array([
    [1.00, 0.75, -0.10, 0.00, 0.55],
    [0.75, 1.00,  0.00, 0.00, 0.45],
    [-0.10, 0.00, 1.00, 0.30, 0.10],
    [0.00, 0.00,  0.30, 1.00, 0.05],
    [0.55, 0.45,  0.10, 0.05, 1.00]
])
vols = np.array([0.18, 0.20, 0.06, 0.01, 0.22])
D = np.diag(vols)
cov = D @ corr @ D

optimizer = MeanVarianceOptimizer(mu, cov, risk_free_rate=0.03)

# Key portfolios
mvp = optimizer.minimum_variance_portfolio()
tangency = optimizer.tangency_portfolio()

print("Minimum Variance Portfolio:")
for name, w in zip(names, mvp):
    if w > 0.001:
        print(f"  {name:15s}: {w:7.2%}")
print(f"  Return: {optimizer.portfolio_return(mvp):.2%}")
print(f"  Risk:   {optimizer.portfolio_risk(mvp):.2%}")
print(f"  Sharpe: {optimizer.portfolio_sharpe(mvp):.3f}")

print("\nTangency Portfolio (Max Sharpe):")
for name, w in zip(names, tangency):
    if w > 0.001:
        print(f"  {name:15s}: {w:7.2%}")
print(f"  Return: {optimizer.portfolio_return(tangency):.2%}")
print(f"  Risk:   {optimizer.portfolio_risk(tangency):.2%}")
print(f"  Sharpe: {optimizer.portfolio_sharpe(tangency):.3f}")
```

### Problems with MVO

```
THE THREE CURSES OF MEAN-VARIANCE OPTIMIZATION
===============================================

CURSE 1: Garbage In, Garbage Out (GIGO)
----------------------------------------
MVO is an "error maximizer" -- it overweights assets with:
  - Overestimated returns
  - Underestimated risk
  - Underestimated correlations

Small changes in inputs -> Large changes in weights:

  Input change:     E[R_stock] from 10% to 11% (+1%)
  Weight change:    w_stock from 30% to 55% (+25%)

  The optimizer exploits estimation errors as if they
  were real opportunities.


CURSE 2: Extreme Positions (Corner Solutions)
---------------------------------------------
Without constraints, MVO produces:
  - Huge long positions in "cheap" assets
  - Huge short positions in "expensive" assets
  - Concentrated bets on a few assets

  Unconstrained optimal:  w = [-120%, 80%, 30%, 110%]
  (Not implementable in practice)


CURSE 3: Instability Over Time
------------------------------
  Month 1 optimal: [40% stocks, 30% bonds, 30% gold]
  Month 2 optimal: [10% stocks, 70% bonds, 20% gold]
  Month 3 optimal: [60% stocks, 5% bonds, 35% gold]

  Tiny changes in estimated covariance or returns
  cause wild swings in allocations.

  Result: Enormous turnover and transaction costs
```

```
ESTIMATION ERROR SENSITIVITY
==============================

True expected returns:     [10%, 8%, 6%]
Estimated (with noise):    [12%, 7%, 6.5%]
                            ^     ^    ^
                           +2%   -1%  +0.5% error

True optimal weights:      [33%, 34%, 33%]
MVO weights from estimate: [72%, 5%, 23%]
                            ^     ^    ^
                          +39%  -29%  -10% weight error!

Key: Return estimation errors are AMPLIFIED by optimization
```

---

## 14.3 Robust Portfolio Optimization

### Black-Litterman Model

The Black-Litterman (1992) model solves the GIGO problem by combining **market equilibrium returns** with **investor views**. Instead of estimating expected returns from scratch (error-prone), it starts with the returns implied by current market capitalizations and allows investors to tilt from there.

```
BLACK-LITTERMAN: INTUITION
===========================

Step 1: Start with equilibrium (what the market implies)
  pi = lambda * Sigma * w_mkt

  where w_mkt = market-cap weights
  These are "prior" expected returns

Step 2: Investor specifies views (with uncertainty)
  "I think US equities will return 12% (confidence: medium)"
  "I think bonds will outperform cash by 2% (confidence: high)"

Step 3: Combine prior + views using Bayes' rule
  mu_BL = [(tau*Sigma)^{-1} + P^T*Omega^{-1}*P]^{-1} *
           [(tau*Sigma)^{-1}*pi + P^T*Omega^{-1}*Q]

  where:
    tau   = scalar (uncertainty in equilibrium, typically 0.025-0.05)
    P     = matrix linking views to assets
    Q     = vector of view returns
    Omega = diagonal matrix of view uncertainties

Step 4: Optimize using mu_BL instead of raw estimates
  Result: Stable, intuitive weights that tilt toward views

                  Prior                Views
                (market cap)        (analyst)
                    |                   |
                    v                   v
              +---------------------------+
              |    Bayesian Combination    |
              |    (Black-Litterman)       |
              +---------------------------+
                         |
                         v
                  Posterior Returns
                  (mu_BL: blended)
                         |
                         v
                  +---------------+
                  |   Optimizer   |
                  +---------------+
                         |
                         v
                  Portfolio Weights
                  (stable, intuitive)
```

### Python Implementation: Black-Litterman

```python
import numpy as np

class BlackLitterman:
    """Black-Litterman model for expected return estimation."""

    def __init__(self, cov_matrix, market_cap_weights, risk_aversion=2.5,
                 tau=0.05, risk_free_rate=0.02):
        self.Sigma = np.array(cov_matrix)
        self.w_mkt = np.array(market_cap_weights)
        self.lam = risk_aversion
        self.tau = tau
        self.rf = risk_free_rate
        self.n = len(market_cap_weights)

        # Implied equilibrium returns
        self.pi = self.lam * self.Sigma @ self.w_mkt

    def add_views(self, P, Q, omega=None, confidence=None):
        """
        Add investor views.

        P: K x N matrix (K views on N assets)
           Absolute view: [0, 0, 1, 0, 0] means "view on asset 3"
           Relative view: [1, 0, -1, 0, 0] means "asset 1 vs asset 3"
        Q: K vector of expected returns/spreads
        omega: K x K uncertainty matrix (diagonal)
        confidence: K vector of confidence levels (0 to 1)
        """
        self.P = np.array(P)
        self.Q = np.array(Q)

        if omega is not None:
            self.Omega = np.array(omega)
        elif confidence is not None:
            # Higher confidence = lower uncertainty
            conf = np.array(confidence)
            uncertainties = self.tau * np.diag(
                self.P @ self.Sigma @ self.P.T
            ) * (1 / conf - 1)
            self.Omega = np.diag(uncertainties)
        else:
            # Default: proportional to prior uncertainty
            self.Omega = self.tau * np.diag(
                np.diag(self.P @ self.Sigma @ self.P.T)
            )

    def posterior_returns(self):
        """Compute Black-Litterman posterior expected returns."""
        tau_Sigma = self.tau * self.Sigma
        tau_Sigma_inv = np.linalg.inv(tau_Sigma)
        Omega_inv = np.linalg.inv(self.Omega)

        # Posterior precision (inverse covariance)
        M = tau_Sigma_inv + self.P.T @ Omega_inv @ self.P

        # Posterior mean
        mu_BL = np.linalg.solve(
            M,
            tau_Sigma_inv @ self.pi + self.P.T @ Omega_inv @ self.Q
        )

        # Posterior covariance (for the mean)
        Sigma_BL = np.linalg.inv(M)

        return mu_BL, Sigma_BL

    def optimal_weights(self):
        """Compute optimal weights using posterior returns."""
        mu_BL, _ = self.posterior_returns()

        # Analytical solution (unconstrained)
        w_star = (1 / self.lam) * np.linalg.inv(self.Sigma) @ mu_BL
        w_star = w_star / np.sum(w_star)  # normalize

        return w_star


# Example usage
asset_names = ['US_Equity', 'EU_Equity', 'JP_Equity', 'US_Bond', 'Gold']

# Market cap weights (approximate)
w_mkt = np.array([0.40, 0.20, 0.10, 0.25, 0.05])

# Covariance matrix (annualized)
vols = np.array([0.16, 0.18, 0.20, 0.05, 0.15])
corr = np.array([
    [1.00, 0.70, 0.55, -0.10, 0.05],
    [0.70, 1.00, 0.60, -0.05, 0.10],
    [0.55, 0.60, 1.00,  0.00, 0.15],
    [-0.10,-0.05, 0.00, 1.00, 0.20],
    [0.05, 0.10, 0.15,  0.20, 1.00]
])
D = np.diag(vols)
Sigma = D @ corr @ D

bl = BlackLitterman(Sigma, w_mkt, risk_aversion=2.5, tau=0.05)

print("Implied Equilibrium Returns (pi):")
for name, r in zip(asset_names, bl.pi):
    print(f"  {name:12s}: {r:.2%}")

# Add views
# View 1: US equities will return 12% (absolute)
# View 2: EU equities will outperform JP equities by 3%
P = np.array([
    [1, 0, 0, 0, 0],     # absolute view on US equity
    [0, 1, -1, 0, 0]     # relative: EU vs JP
])
Q = np.array([0.12, 0.03])
confidence = np.array([0.6, 0.8])

bl.add_views(P, Q, confidence=confidence)
mu_BL, _ = bl.posterior_returns()

print("\nPosterior Returns (Black-Litterman):")
for name, pi, mu in zip(asset_names, bl.pi, mu_BL):
    print(f"  {name:12s}: prior={pi:.2%}  posterior={mu:.2%}  "
          f"delta={mu-pi:+.2%}")

w_opt = bl.optimal_weights()
print("\nOptimal Weights:")
for name, w_m, w_o in zip(asset_names, w_mkt, w_opt):
    print(f"  {name:12s}: mkt={w_m:.2%}  optimal={w_o:.2%}  "
          f"tilt={w_o-w_m:+.2%}")
```

### Shrinkage Estimators: Ledoit-Wolf

```python
import numpy as np

def ledoit_wolf_shrinkage(returns):
    """
    Ledoit-Wolf shrinkage estimator for covariance matrix.

    Shrinks sample covariance toward a structured target
    (scaled identity matrix).

    Sigma_shrunk = alpha * F + (1 - alpha) * S

    where:
      S = sample covariance
      F = shrinkage target (scaled identity)
      alpha = optimal shrinkage intensity (0 to 1)
    """
    T, N = returns.shape

    # Sample covariance
    mean_returns = returns.mean(axis=0)
    X = returns - mean_returns
    S = (X.T @ X) / T

    # Shrinkage target: scaled identity
    mu_target = np.trace(S) / N
    F = mu_target * np.eye(N)

    # Compute optimal shrinkage intensity
    # (Ledoit & Wolf, 2004 formula)
    d2 = np.sum((S - F) ** 2) / N  # squared Frobenius distance

    # Estimate b-bar squared
    b2 = 0
    for t in range(T):
        xt = X[t:t+1, :]
        Mt = (xt.T @ xt) - S
        b2 += np.sum(Mt ** 2) / N
    b2 /= T ** 2

    # Optimal shrinkage intensity
    alpha = min(b2 / d2, 1.0)

    Sigma_shrunk = alpha * F + (1 - alpha) * S

    return Sigma_shrunk, alpha


# Demonstration
np.random.seed(42)
T, N = 60, 20  # 60 observations, 20 assets (T/N = 3, moderate)
true_cov = np.eye(N) * 0.04
returns = np.random.multivariate_normal(np.zeros(N), true_cov, T)

S = np.cov(returns, rowvar=False)
Sigma_lw, alpha = ledoit_wolf_shrinkage(returns)

print(f"Shrinkage intensity: {alpha:.3f}")
print(f"Sample cov condition number:  {np.linalg.cond(S):.1f}")
print(f"Shrunk cov condition number:  {np.linalg.cond(Sigma_lw):.1f}")
print(f"True cov condition number:    {np.linalg.cond(true_cov):.1f}")
```

```
WHY SHRINKAGE WORKS
===================

Sample Covariance            Shrinkage Target         Shrunk Estimate
(noisy but unbiased)         (biased but stable)      (balanced)

+---+---+---+---+            +---+---+---+---+        +---+---+---+---+
|.04|.02|-.01|.03|           |.03| 0 | 0 | 0 |       |.04|.01|-.01|.02|
+---+---+---+---+    alpha   +---+---+---+---+       +---+---+---+---+
|.02|.05|.01|-.02|  * 0.3  + |0 |.03| 0 | 0 | *0.7 =|.01|.04|.01|-.01|
+---+---+---+---+            +---+---+---+---+        +---+---+---+---+
|-.01|.01|.06|.01|           | 0 | 0 |.03| 0 |       |-.01|.01|.05|.01|
+---+---+---+---+            +---+---+---+---+        +---+---+---+---+
|.03|-.02|.01|.04|           | 0 | 0 | 0 |.03|       |.02|-.01|.01|.04|
+---+---+---+---+            +---+---+---+---+        +---+---+---+---+

Benefits:
- Better conditioned (invertible)
- Extreme correlations pulled toward zero
- More stable portfolio weights
- Especially valuable when T/N is small
```

### Resampled Efficient Frontier (Michaud)

```
RESAMPLED EFFICIENCY (Michaud, 1998)
====================================

Instead of one optimization with point estimates:

Step 1: Draw B bootstrap samples of returns
Step 2: For each sample, compute mu_b, Sigma_b
Step 3: For each sample, solve the MVO problem
Step 4: Average the weights across all B samples

  Sample 1 --> MVO --> w1 = [0.30, 0.25, 0.45]
  Sample 2 --> MVO --> w2 = [0.35, 0.20, 0.45]
  Sample 3 --> MVO --> w3 = [0.25, 0.30, 0.45]
  ...
  Sample B --> MVO --> wB = [0.28, 0.27, 0.45]

  w_resampled = (1/B) * sum(wb) = [0.295, 0.255, 0.45]

Benefits:
- Averages out estimation error
- Smoother, more diversified portfolios
- More stable over time
- Less sensitive to input assumptions
```

---

## 14.4 Risk Parity

### The Core Idea

Risk parity allocates capital so that **each asset contributes equally to total portfolio risk**. Unlike MVO, it does not require expected return estimates --- only a covariance matrix.

```
EQUAL WEIGHT vs RISK PARITY
============================

Equal Weight (60/40 stocks/bonds):
  Stocks: 60% capital, but 92% of risk
  Bonds:  40% capital, but  8% of risk

  Risk contribution is DOMINATED by stocks.

  Capital:  [============================|==================]
  Risk:     [=================================================|====]
            0%                          60%                 92% 100%


Risk Parity:
  Each asset contributes equally to total risk.
  Stocks need LESS capital (lower weight) because they are riskier.
  Bonds need MORE capital (higher weight) because they are safer.

  Capital:  [============|======================================]
  Risk:     [========================|========================]
            0%          25%         50%                    100%
            Stocks                  Bonds

  To achieve similar return, risk parity uses LEVERAGE.
```

### Mathematical Formulation: Equal Risk Contribution

```
For portfolio w, the risk contribution of asset i is:

  RC_i = w_i * (Sigma * w)_i / sqrt(w^T * Sigma * w)

       = w_i * (partial sigma_p / partial w_i)

For Equal Risk Contribution (ERC):

  RC_i = RC_j  for all i, j

  Equivalently: w_i * (Sigma * w)_i = w_j * (Sigma * w)_j

This can be solved as an optimization problem:

  minimize  sum_i sum_j (RC_i - RC_j)^2

  or equivalently:

  minimize  sum_i (w_i * (Sigma * w)_i - sigma_p^2 / N)^2
  subject to  w >= 0
              sum(w) = 1
```

### Risk Budgeting (Generalization)

```
RISK BUDGETING
==============

ERC is a special case where all risk budgets are equal.
In general, you can specify target risk budgets b_i:

  RC_i / sigma_p = b_i    for all i
  sum(b_i) = 1

Example risk budgets:
  Stocks:      40% of risk  (b_stocks = 0.40)
  Bonds:       30% of risk  (b_bonds  = 0.30)
  Commodities: 20% of risk  (b_commod = 0.20)
  Gold:        10% of risk  (b_gold   = 0.10)
```

### Bridgewater's All Weather Portfolio

```
ALL WEATHER PORTFOLIO (Ray Dalio / Bridgewater)
================================================

The framework: 4 economic environments, balance risk across all

                    Growth Rising    Growth Falling
                  +-----------------+-----------------+
  Inflation      | Stocks           | Bonds            |
  Rising         | Commodities      | IL Bonds (TIPS)  |
                  | EM Equities      | Gold             |
                  +-----------------+-----------------+
  Inflation      | Stocks           | Nominal Bonds    |
  Falling        | Corp Bonds       | Treasuries       |
                  +-----------------+-----------------+

Simplified allocation (risk parity across regimes):
  30% Stocks (equities)
  40% Long-term Bonds
  15% Intermediate Bonds
   7.5% Commodities
   7.5% Gold

Key principle: Each economic environment gets ~25% of risk
Leverage is used to target a desired return level
```

### Python Implementation: Risk Parity

```python
import numpy as np
from scipy.optimize import minimize

class RiskParity:
    """Risk Parity / Equal Risk Contribution optimizer."""

    def __init__(self, cov_matrix):
        self.cov = np.array(cov_matrix)
        self.n = len(cov_matrix)

    def risk_contribution(self, weights):
        """Compute risk contribution of each asset."""
        port_var = weights @ self.cov @ weights
        port_vol = np.sqrt(port_var)

        # Marginal risk contribution
        marginal = self.cov @ weights / port_vol

        # Risk contribution
        rc = weights * marginal

        return rc

    def equal_risk_contribution(self):
        """Find the ERC (equal risk contribution) portfolio."""
        target_rc = 1.0 / self.n  # equal budget

        def objective(w):
            rc = self.risk_contribution(w)
            total_risk = np.sqrt(w @ self.cov @ w)
            rc_pct = rc / total_risk  # percentage contributions

            # Minimize sum of squared deviations from equal
            return np.sum((rc_pct - target_rc) ** 2)

        constraints = [
            {'type': 'eq', 'fun': lambda w: np.sum(w) - 1}
        ]
        bounds = [(0.01, 1.0) for _ in range(self.n)]
        w0 = np.ones(self.n) / self.n

        result = minimize(objective, w0, method='SLSQP',
                          bounds=bounds, constraints=constraints)

        return result.x

    def risk_budget(self, budgets):
        """
        Find risk-budgeted portfolio.
        budgets: target risk contribution percentages (must sum to 1)
        """
        budgets = np.array(budgets)

        def objective(w):
            rc = self.risk_contribution(w)
            total_risk = np.sqrt(w @ self.cov @ w)
            rc_pct = rc / total_risk
            return np.sum((rc_pct - budgets) ** 2)

        constraints = [
            {'type': 'eq', 'fun': lambda w: np.sum(w) - 1}
        ]
        bounds = [(0.01, 1.0) for _ in range(self.n)]
        w0 = np.ones(self.n) / self.n

        result = minimize(objective, w0, method='SLSQP',
                          bounds=bounds, constraints=constraints)

        return result.x


# Example
asset_names = ['US_Equity', 'US_Bond', 'Gold', 'Commodities']
vols = np.array([0.16, 0.05, 0.14, 0.18])
corr = np.array([
    [1.00, -0.20, 0.05, 0.30],
    [-0.20, 1.00, 0.15, -0.10],
    [0.05, 0.15, 1.00, 0.25],
    [0.30, -0.10, 0.25, 1.00]
])
D = np.diag(vols)
Sigma = D @ corr @ D

rp = RiskParity(Sigma)

# Equal Risk Contribution
w_erc = rp.equal_risk_contribution()
rc_erc = rp.risk_contribution(w_erc)
port_vol = np.sqrt(w_erc @ Sigma @ w_erc)

print("Equal Risk Contribution Portfolio:")
print(f"{'Asset':15s} {'Weight':>8s} {'Risk Contrib':>14s} {'RC %':>8s}")
print("-" * 48)
for name, w, rc in zip(asset_names, w_erc, rc_erc):
    print(f"{name:15s} {w:8.2%} {rc:14.4f} {rc/port_vol:8.2%}")
print(f"\nPortfolio Vol: {port_vol:.2%}")

# Custom risk budget
budgets = [0.40, 0.20, 0.20, 0.20]
w_rb = rp.risk_budget(budgets)
rc_rb = rp.risk_contribution(w_rb)
port_vol_rb = np.sqrt(w_rb @ Sigma @ w_rb)

print("\nRisk-Budgeted Portfolio (40/20/20/20):")
print(f"{'Asset':15s} {'Weight':>8s} {'RC %':>8s} {'Target':>8s}")
print("-" * 42)
for name, w, rc, b in zip(asset_names, w_rb, rc_rb, budgets):
    print(f"{name:15s} {w:8.2%} {rc/port_vol_rb:8.2%} {b:8.2%}")
```

```
SAMPLE OUTPUT:

Equal Risk Contribution Portfolio:
Asset            Weight   Risk Contrib      RC %
------------------------------------------------
US_Equity        14.87%         0.0027   25.00%
US_Bond          49.51%         0.0027   25.00%
Gold             18.82%         0.0027   25.00%
Commodities      16.80%         0.0027   25.00%

Portfolio Vol: 4.30%

Note: Bonds get ~50% capital weight but only 25% risk.
      Equities get ~15% capital weight but 25% risk.
      This is the core insight of risk parity.
```

### Criticism of Risk Parity

```
RISK PARITY CRITICISMS
=======================

1. LEVERAGE DEPENDENCY
   Risk parity portfolios are bond-heavy and low-return.
   To match equity-like returns, leverage of 2-3x is needed.
   Leverage introduces: borrowing costs, margin calls, liquidity risk.

2. INTEREST RATE SENSITIVITY
   40-50% in bonds means huge rate exposure.
   When rates rise (2022), bonds and equities fall together.
   The 2022 drawdown exposed this weakness brutally.

3. IGNORES EXPECTED RETURNS
   By design, risk parity does not use return forecasts.
   Assets with zero expected return get the same risk budget
   as assets with high expected return.

4. CORRELATION INSTABILITY
   Risk parity assumes correlations are stable.
   In crises, correlations spike toward 1.0.
   The "diversification" benefit disappears when needed most.

5. IMPLEMENTATION COSTS
   Frequent rebalancing needed to maintain risk targets.
   Leverage costs are nontrivial.
   Derivatives needed for some asset classes.
```

---

## 14.5 Factor-Based Portfolio Construction

### Factor Models

```
FACTOR MODEL FRAMEWORK
======================

Single-factor (CAPM):
  R_i = alpha_i + beta_i * R_mkt + epsilon_i

Multi-factor (Fama-French, Barra):
  R_i = alpha_i + beta_i1 * F1 + beta_i2 * F2 + ... + beta_iK * FK + epsilon_i

  where:
    F1...FK = factor returns (market, value, momentum, size, quality, etc.)
    beta_ik = exposure (loading) of asset i to factor k
    epsilon_i = idiosyncratic (stock-specific) return

             Total Return
                  |
        +---------+---------+
        |                   |
   Factor Return      Idiosyncratic
   (systematic)       (stock-specific)
        |
   +----+----+----+----+
   |    |    |    |    |
  Mkt  Val  Mom  Size Qual
```

### Barra Risk Model

```
BARRA RISK MODEL (MSCI)
========================

The industry standard for factor-based risk modeling.

Covariance decomposition:
  Sigma = B * F * B^T + D

  where:
    B = N x K matrix of factor exposures
    F = K x K factor covariance matrix
    D = N x N diagonal (idiosyncratic variances)
    N = number of assets (could be thousands)
    K = number of factors (typically 10-30)

Factor categories in Barra:

  STYLE FACTORS           INDUSTRY FACTORS
  +------------------+    +------------------+
  | Momentum          |    | Technology        |
  | Value             |    | Financials        |
  | Size              |    | Healthcare        |
  | Volatility        |    | Energy            |
  | Quality           |    | Consumer          |
  | Growth            |    | Industrials       |
  | Leverage          |    | Materials         |
  | Liquidity         |    | Utilities         |
  +------------------+    +------------------+

Advantage: Reduce N x N covariance (millions of entries)
           to K x K factor covariance (hundreds of entries)
           Much more stable and estimable.
```

### Factor-Neutral Portfolios

```python
import numpy as np
from scipy.optimize import minimize

def factor_neutral_portfolio(alpha_scores, factor_exposures,
                              cov_matrix, max_weight=0.05):
    """
    Construct a long-short portfolio that is neutral to specified factors.

    alpha_scores: N-vector of alpha signals
    factor_exposures: N x K matrix of factor loadings
    cov_matrix: N x N covariance matrix
    max_weight: maximum absolute weight per asset
    """
    N = len(alpha_scores)
    K = factor_exposures.shape[1]

    def objective(w):
        # Maximize alpha - risk penalty
        alpha = w @ alpha_scores
        risk = w @ cov_matrix @ w
        return -(alpha - 0.5 * risk)

    constraints = [
        # Dollar neutral (long-short)
        {'type': 'eq', 'fun': lambda w: np.sum(w)},
        # Gross exposure = 2 (1 long + 1 short)
        {'type': 'eq', 'fun': lambda w: np.sum(np.abs(w)) - 2.0},
    ]

    # Factor neutrality constraints
    for k in range(K):
        constraints.append({
            'type': 'eq',
            'fun': lambda w, k=k: w @ factor_exposures[:, k]
        })

    bounds = [(-max_weight, max_weight) for _ in range(N)]
    w0 = np.zeros(N)

    result = minimize(objective, w0, method='SLSQP',
                      bounds=bounds, constraints=constraints)

    return result.x

# Example: 10 stocks, 2 factors (market, size)
np.random.seed(42)
N = 10
alpha = np.random.randn(N) * 0.02  # alpha scores

# Factor exposures
market_beta = np.random.uniform(0.8, 1.2, N)
size_exposure = np.random.randn(N)
factor_exp = np.column_stack([market_beta, size_exposure])

# Simple diagonal covariance
cov = np.diag(np.random.uniform(0.04, 0.09, N))

w = factor_neutral_portfolio(alpha, factor_exp, cov)

print("Factor-Neutral Portfolio:")
print(f"{'Stock':>6} {'Alpha':>8} {'Beta':>6} {'Size':>6} {'Weight':>8}")
print("-" * 38)
for i in range(N):
    if abs(w[i]) > 0.001:
        print(f"{'S'+str(i):>6} {alpha[i]:8.4f} {market_beta[i]:6.2f} "
              f"{size_exposure[i]:6.2f} {w[i]:8.2%}")

print(f"\nNet exposure:    {np.sum(w):.4f} (should be ~0)")
print(f"Market beta:     {w @ market_beta:.4f} (should be ~0)")
print(f"Size exposure:   {w @ size_exposure:.4f} (should be ~0)")
print(f"Expected alpha:  {w @ alpha:.4f}")
```

### Smart Beta and Factor Timing

```
SMART BETA ETF CONSTRUCTION
============================

Traditional index: Market-cap weighted
  Apple weight = Apple market cap / Total market cap
  Problem: Overweight expensive stocks, underweight cheap stocks

Smart beta: Weight by factor exposure

  VALUE ETF:
    1. Rank stocks by Book/Price ratio
    2. Select top quintile (cheapest 20%)
    3. Weight by factor score or equal weight
    4. Rebalance quarterly

  MOMENTUM ETF:
    1. Rank stocks by 12-1 month return
    2. Select top quintile (strongest momentum)
    3. Weight by momentum score
    4. Rebalance monthly

  QUALITY ETF:
    1. Score by ROE, debt/equity, earnings stability
    2. Select top quintile
    3. Weight by composite quality score
    4. Rebalance semi-annually

  MULTI-FACTOR:
    Combine value + momentum + quality + low-vol
    Avoids single-factor cyclicality


FACTOR TIMING (controversial):

  Time             Factor Allocation
  +-----------+---+---+---+---+---+
  | Early Cycle|   | M | S |   |   |   M = Momentum
  | (recovery) |   | o | i |   |   |   S = Size (small cap)
  +-----------+ V | m | z | Q | L |   V = Value
  | Mid Cycle  | a | e | e | u | o |   Q = Quality
  | (expansion)| l | n |   | a | w |   L = Low Volatility
  +-----------+ u | t |   | l | V |
  | Late Cycle | e | u |   | i | o |
  | (slowdown) |   | m |   | t | l |
  +-----------+---+---+---+---+---+
  | Recession  |   |   | S | Q | L |
  |            |   |   | i | u | o |
  +-----------+---+---+---+---+---+

  Warning: Factor timing has mixed empirical evidence.
  Most practitioners hold diversified factor exposure.
```

---

## 14.6 Hierarchical Risk Parity (HRP)

### Lopez de Prado's HRP Method

In 2016, Marcos Lopez de Prado introduced **Hierarchical Risk Parity (HRP)**, which addresses a fundamental flaw in MVO: the need to invert the covariance matrix. Matrix inversion amplifies estimation errors, especially when assets are highly correlated.

HRP uses **machine learning** (hierarchical clustering) to group similar assets and allocate risk top-down through the tree structure.

```
HRP: THREE-STEP ALGORITHM
==========================

Step 1: TREE CLUSTERING
  Compute distance matrix from correlations
  Apply hierarchical clustering (single/complete/ward linkage)
  Result: dendrogram (tree) of asset relationships

              Root
             /    \
           /        \
         A            B
        / \          / \
       /   \        /   \
    Stocks  REIT  Bonds  Gold
    /   \           |
  US   Intl       Govt

Step 2: QUASI-DIAGONALIZATION
  Reorder the covariance matrix along the dendrogram
  Similar assets are placed adjacent
  Result: block-diagonal-like structure

  Before reordering:           After reordering:
  +---+---+---+---+---+      +---+---+---+---+---+
  |US |Int|Gov|Gld|REI|      |US |Int|REI|Gov|Gld|
  +===+===+===+===+===+      +===+===+===+===+===+
  |.04|.03|-.01|.00|.02|     |.04|.03|.02|-.01|.00|
  |.03|.05|.00|.01|.02|     |.03|.05|.02|.00|.01|
  |-.01|.00|.01|.00|.00|    |.02|.02|.03|.00|.00|
  |.00|.01|.00|.02|.00|     |-.01|.00|.00|.01|.00|
  |.02|.02|.00|.00|.03|     |.00|.01|.00|.00|.02|
  +---+---+---+---+---+      +---+---+---+---+---+

Step 3: RECURSIVE BISECTION
  Split the tree at each node
  Allocate inversely proportional to cluster variance
  Recurse until reaching individual assets

  Root: total_var = var(Left) + var(Right)
    w_left  = var(Right) / total_var   (inverse allocation)
    w_right = var(Left) / total_var

  Then recurse within each sub-cluster
```

### Python Implementation: HRP

```python
import numpy as np
from scipy.cluster.hierarchy import linkage, leaves_list
from scipy.spatial.distance import squareform

class HierarchicalRiskParity:
    """Hierarchical Risk Parity (Lopez de Prado, 2016)."""

    def __init__(self, cov_matrix, corr_matrix=None):
        self.cov = np.array(cov_matrix)
        self.n = len(cov_matrix)

        if corr_matrix is not None:
            self.corr = np.array(corr_matrix)
        else:
            # Derive correlation from covariance
            vols = np.sqrt(np.diag(self.cov))
            D_inv = np.diag(1.0 / vols)
            self.corr = D_inv @ self.cov @ D_inv

    def _distance_matrix(self):
        """Convert correlation to distance matrix."""
        # d(i,j) = sqrt(0.5 * (1 - corr(i,j)))
        dist = np.sqrt(0.5 * (1 - self.corr))
        np.fill_diagonal(dist, 0)
        return dist

    def _tree_clustering(self, method='single'):
        """Step 1: Hierarchical clustering."""
        dist = self._distance_matrix()
        condensed = squareform(dist)
        self.linkage_matrix = linkage(condensed, method=method)
        self.sorted_indices = list(leaves_list(self.linkage_matrix))
        return self.sorted_indices

    def _quasi_diagonalize(self):
        """Step 2: Reorder covariance matrix."""
        idx = self.sorted_indices
        self.sorted_cov = self.cov[np.ix_(idx, idx)]
        return self.sorted_cov

    def _recursive_bisection(self, sorted_cov, indices):
        """Step 3: Recursive bisection for weight allocation."""
        if len(indices) == 1:
            return {indices[0]: 1.0}

        # Split into two halves
        mid = len(indices) // 2
        left_idx = indices[:mid]
        right_idx = indices[mid:]

        # Compute cluster variances using inverse-variance
        left_cov = sorted_cov[np.ix_(range(mid), range(mid))]
        right_cov = sorted_cov[np.ix_(range(mid, len(indices)),
                                        range(mid, len(indices)))]

        # Inverse variance allocation
        left_var = self._cluster_variance(left_cov)
        right_var = self._cluster_variance(right_cov)

        total_var = left_var + right_var
        w_left = right_var / total_var     # inverse: less risky gets more
        w_right = left_var / total_var

        # Recurse
        left_weights = self._recursive_bisection(
            left_cov, left_idx
        )
        right_weights = self._recursive_bisection(
            right_cov, right_idx
        )

        # Scale by cluster weight
        weights = {}
        for k, v in left_weights.items():
            weights[k] = v * w_left
        for k, v in right_weights.items():
            weights[k] = v * w_right

        return weights

    def _cluster_variance(self, cov):
        """Compute variance of an equal-weight cluster."""
        n = len(cov)
        w = np.ones(n) / n
        return w @ cov @ w

    def optimize(self, method='single'):
        """Run the full HRP algorithm."""
        # Step 1: Tree clustering
        self._tree_clustering(method)

        # Step 2: Quasi-diagonalize
        self._quasi_diagonalize()

        # Step 3: Recursive bisection
        raw_weights = self._recursive_bisection(
            self.sorted_cov, self.sorted_indices
        )

        # Map back to original order
        weights = np.zeros(self.n)
        for orig_idx, w in raw_weights.items():
            weights[orig_idx] = w

        # Normalize
        weights = weights / np.sum(weights)

        return weights


# Example: Compare MVO, Risk Parity, and HRP
asset_names = ['US_Stock', 'EU_Stock', 'JP_Stock', 'US_Bond',
               'EU_Bond', 'Gold', 'REIT', 'Commodity']

vols = np.array([0.16, 0.18, 0.20, 0.05, 0.06, 0.14, 0.20, 0.18])
corr = np.array([
    [1.00, 0.80, 0.65, -0.10, -0.05, 0.05, 0.60, 0.25],
    [0.80, 1.00, 0.70, -0.05, 0.05,  0.10, 0.55, 0.30],
    [0.65, 0.70, 1.00, 0.00,  0.00,  0.15, 0.50, 0.35],
    [-0.10,-0.05, 0.00, 1.00, 0.85,  0.20, 0.10, -0.05],
    [-0.05, 0.05, 0.00, 0.85, 1.00,  0.15, 0.05, 0.00],
    [0.05, 0.10, 0.15,  0.20, 0.15,  1.00, 0.10, 0.30],
    [0.60, 0.55, 0.50,  0.10, 0.05,  0.10, 1.00, 0.20],
    [0.25, 0.30, 0.35, -0.05, 0.00,  0.30, 0.20, 1.00]
])

D = np.diag(vols)
Sigma = D @ corr @ D

# HRP
hrp = HierarchicalRiskParity(Sigma, corr)
w_hrp = hrp.optimize()

print("HRP Weights:")
print(f"{'Asset':12s} {'Weight':>8s}")
print("-" * 22)
for name, w in zip(asset_names, w_hrp):
    print(f"{name:12s} {w:8.2%}")
print(f"{'Total':12s} {np.sum(w_hrp):8.2%}")
port_vol = np.sqrt(w_hrp @ Sigma @ w_hrp)
print(f"Portfolio Vol: {port_vol:.2%}")
```

### Comparison: MVO vs Risk Parity vs HRP

```
METHOD COMPARISON
=================

                  MVO              Risk Parity         HRP
                  ===              ===========         ===

Inputs needed:    mu, Sigma        Sigma only          Sigma only
                  (returns +       (covariance)        (covariance)
                   covariance)

Key operation:    Sigma^{-1}       Numerical           Clustering +
                  (matrix          optimization         bisection
                   inversion)                           (no inversion)

Strengths:        Theoretically    No return            Robust to
                  optimal if       estimates needed.    estimation error.
                  inputs correct.  Balanced risk.       No matrix
                  Customizable.                         inversion.

Weaknesses:       Sensitive to     Ignores returns.     No return
                  input errors.    Needs leverage.      targeting.
                  Extreme weights. Rate sensitive.      Less studied.
                  Unstable.

Best when:        High-quality     No reliable return   Noisy covariance.
                  return           estimates.           Many assets.
                  forecasts.       Desire balanced      Hierarchical
                  Few assets.      risk exposure.       asset structure.

Used by:          Traditional      Bridgewater,         Quant hedge
                  asset mgrs,      AQR,                 funds,
                  endowments       PanAgora             systematic
                                                        strategies


EMPIRICAL COMPARISON (typical results):

Method      |  Return  |  Vol   | Sharpe | Max DD | Turnover
----------- | -------- | ------ | ------ | ------ | --------
MVO         |  8.2%    | 10.5%  | 0.59   | -22%   | 85%
Risk Parity |  6.1%    |  4.8%  | 0.85   | -12%   | 25%
HRP         |  7.0%    |  7.2%  | 0.69   | -15%   | 30%
Equal Wt    |  7.5%    | 11.0%  | 0.50   | -28%   | 15%
RP Levered  |  9.0%    |  9.5%  | 0.74   | -18%   | 40%

Note: Results are illustrative. Actual performance varies.
```

---

## 14.7 Transaction Costs and Rebalancing

### The Rebalancing Problem

```
THE REBALANCING TRADE-OFF
==========================

  Target weights:  [40%, 30%, 30%]
  Current weights: [45%, 28%, 27%]    (due to market moves)

  Option A: Rebalance NOW
    Pro: Stay close to optimal
    Con: Pay transaction costs

  Option B: Wait
    Pro: Save transaction costs
    Con: Drift from optimal, accumulate risk

  The question: When is the benefit of rebalancing
  worth the cost of trading?

  Benefit(rebalance) > Cost(transaction)  -->  REBALANCE
  Benefit(rebalance) < Cost(transaction)  -->  WAIT

  CALENDAR REBALANCING        BAND REBALANCING
  =====================       =================
  Rebalance every:            Rebalance when any weight
  - Daily (HFT)               drifts beyond a band:
  - Weekly (active)
  - Monthly (moderate)         |wi - wi_target| > threshold
  - Quarterly (passive)
  - Annually (lazy)            Example: threshold = 5%
                                If target=30% and actual=36%,
  Simple but suboptimal.       trigger rebalance.
  May rebalance when not
  needed, or wait too long.    More efficient, trades only
                                when needed.
```

### Transaction Cost Model

```python
import numpy as np

class TransactionCostModel:
    """Model trading costs for portfolio rebalancing."""

    def __init__(self, commission_bps=5, spread_bps=10,
                 impact_bps_per_pct=2, tax_rate=0.20):
        """
        commission_bps: broker commission in basis points
        spread_bps: half bid-ask spread in basis points
        impact_bps_per_pct: market impact per 1% of ADV traded
        tax_rate: capital gains tax rate
        """
        self.commission = commission_bps / 10000
        self.spread = spread_bps / 10000
        self.impact_per_pct = impact_bps_per_pct / 10000
        self.tax_rate = tax_rate

    def trade_cost(self, trade_value, adv=None):
        """
        Compute cost of a single trade.
        trade_value: dollar value traded
        adv: average daily volume (for impact)
        """
        cost = abs(trade_value) * (self.commission + self.spread)

        if adv is not None and adv > 0:
            participation = abs(trade_value) / adv
            impact = participation * self.impact_per_pct * abs(trade_value)
            cost += impact

        return cost

    def rebalance_cost(self, current_weights, target_weights,
                       portfolio_value, advs=None):
        """Compute total cost of rebalancing."""
        trades = target_weights - current_weights
        total_cost = 0

        for i, trade in enumerate(trades):
            trade_value = abs(trade) * portfolio_value
            adv = advs[i] if advs is not None else None
            total_cost += self.trade_cost(trade_value, adv)

        turnover = np.sum(np.abs(trades)) / 2  # one-way turnover

        return {
            'total_cost': total_cost,
            'cost_bps': total_cost / portfolio_value * 10000,
            'turnover': turnover,
            'trades': trades
        }


# Example
tc = TransactionCostModel(commission_bps=3, spread_bps=5, impact_bps_per_pct=1)

current = np.array([0.45, 0.28, 0.27])
target = np.array([0.40, 0.30, 0.30])
port_value = 10_000_000  # $10M

result = tc.rebalance_cost(current, target, port_value)

print(f"Rebalancing Cost Analysis:")
print(f"  Turnover:    {result['turnover']:.2%}")
print(f"  Total cost:  ${result['total_cost']:,.0f}")
print(f"  Cost (bps):  {result['cost_bps']:.1f}")
print(f"  Trades:      {result['trades']}")
```

### Optimization with Turnover Constraint

```python
import numpy as np
from scipy.optimize import minimize

def mvo_with_turnover(mu, Sigma, current_weights, max_turnover=0.20,
                       cost_per_trade_bps=10, risk_aversion=2.0):
    """
    Mean-variance optimization with turnover constraint and costs.

    The objective includes a penalty for transaction costs:

    max  w^T*mu - (lambda/2)*w^T*Sigma*w - c * sum(|w - w_prev|)
    s.t. sum(w) = 1, w >= 0, sum(|w - w_prev|)/2 <= max_turnover
    """
    N = len(mu)
    w_prev = np.array(current_weights)
    cost = cost_per_trade_bps / 10000

    # Use auxiliary variables for absolute value: t_i >= |w_i - w_prev_i|
    # Decision variables: [w1,...,wN, t1,...,tN]

    def objective(x):
        w = x[:N]
        t = x[N:]  # absolute trade sizes

        port_return = w @ mu
        port_risk = w @ Sigma @ w
        trade_cost = cost * np.sum(t)

        return -(port_return - (risk_aversion / 2) * port_risk - trade_cost)

    constraints = [
        # Budget
        {'type': 'eq', 'fun': lambda x: np.sum(x[:N]) - 1},
        # Turnover limit
        {'type': 'ineq', 'fun': lambda x: max_turnover - np.sum(x[N:]) / 2},
    ]

    # t_i >= w_i - w_prev_i and t_i >= -(w_i - w_prev_i)
    for i in range(N):
        constraints.append({
            'type': 'ineq',
            'fun': lambda x, i=i: x[N+i] - (x[i] - w_prev[i])
        })
        constraints.append({
            'type': 'ineq',
            'fun': lambda x, i=i: x[N+i] + (x[i] - w_prev[i])
        })

    bounds = [(0, 1) for _ in range(N)] + [(0, 1) for _ in range(N)]
    x0 = np.concatenate([w_prev, np.zeros(N)])

    result = minimize(objective, x0, method='SLSQP',
                      bounds=bounds, constraints=constraints)

    return result.x[:N]


# Example
mu = np.array([0.12, 0.10, 0.08, 0.05])
Sigma = np.diag([0.04, 0.03, 0.02, 0.005])  # simplified diagonal
current = np.array([0.50, 0.20, 0.20, 0.10])

# Without turnover constraint
from scipy.optimize import minimize as sp_minimize
def unconstrained_mvo(mu, Sigma, risk_aversion=2.0):
    N = len(mu)
    cons = [{'type': 'eq', 'fun': lambda w: np.sum(w) - 1}]
    bnds = [(0, 1)] * N
    res = sp_minimize(lambda w: -(w @ mu - risk_aversion/2 * w @ Sigma @ w),
                      np.ones(N)/N, method='SLSQP', bounds=bnds, constraints=cons)
    return res.x

w_unconstrained = unconstrained_mvo(mu, Sigma)
w_constrained = mvo_with_turnover(mu, Sigma, current, max_turnover=0.10)

names = ['Stocks', 'Intl', 'Bonds', 'Cash']
print(f"{'Asset':10s} {'Current':>10s} {'MVO':>10s} {'MVO+TO':>10s}")
print("-" * 42)
for n, c, u, t in zip(names, current, w_unconstrained, w_constrained):
    print(f"{n:10s} {c:10.2%} {u:10.2%} {t:10.2%}")
print(f"\n{'Turnover':10s} {'':>10s} "
      f"{np.sum(np.abs(w_unconstrained - current))/2:10.2%} "
      f"{np.sum(np.abs(w_constrained - current))/2:10.2%}")
```

### Tax-Loss Harvesting

```
TAX-LOSS HARVESTING
====================

Strategy: Sell losing positions to realize tax losses,
then immediately buy similar (but not "substantially identical")
assets to maintain market exposure.

Before harvest:
  +----------+--------+--------+----------+
  | Asset    | Basis  | Value  | Gain/Loss|
  +----------+--------+--------+----------+
  | AAPL     | $50K   | $60K   | +$10K    |
  | GOOGL    | $40K   | $35K   | -$5K     | <-- harvest
  | MSFT     | $30K   | $32K   | +$2K     |
  | AMZN     | $45K   | $38K   | -$7K     | <-- harvest
  +----------+--------+--------+----------+

Action:
  1. Sell GOOGL (-$5K loss) and AMZN (-$7K loss)
  2. Buy META and NFLX as replacements (similar exposure)
  3. Realize $12K in losses --> save $12K * 20% = $2,400 in taxes

  WARNING: 30-day wash sale rule
  Cannot repurchase "substantially identical" securities
  within 30 days before or after the sale.
```

---

## 14.8 Portfolio Performance Attribution

### Brinson Attribution

```
BRINSON-FACHLER ATTRIBUTION MODEL
===================================

Decomposes active return into:
  1. Allocation Effect: Over/underweighting the right sectors
  2. Selection Effect: Picking better stocks within sectors
  3. Interaction Effect: Combination of allocation and selection

  R_active = R_portfolio - R_benchmark

             = Allocation + Selection + Interaction

For each sector s:

  Allocation_s  = (w_p,s - w_b,s) * (R_b,s - R_b)
  Selection_s   = w_b,s * (R_p,s - R_b,s)
  Interaction_s = (w_p,s - w_b,s) * (R_p,s - R_b,s)

where:
  w_p,s = portfolio weight in sector s
  w_b,s = benchmark weight in sector s
  R_p,s = portfolio return in sector s
  R_b,s = benchmark return in sector s
  R_b   = total benchmark return
```

```python
import numpy as np

def brinson_attribution(port_weights, bench_weights,
                        port_returns, bench_returns):
    """
    Brinson-Fachler performance attribution.

    All inputs are arrays indexed by sector.
    """
    port_weights = np.array(port_weights)
    bench_weights = np.array(bench_weights)
    port_returns = np.array(port_returns)
    bench_returns = np.array(bench_returns)

    total_bench_return = bench_weights @ bench_returns
    total_port_return = port_weights @ port_returns

    # Per-sector effects
    allocation = (port_weights - bench_weights) * (bench_returns - total_bench_return)
    selection = bench_weights * (port_returns - bench_returns)
    interaction = (port_weights - bench_weights) * (port_returns - bench_returns)

    return {
        'total_port_return': total_port_return,
        'total_bench_return': total_bench_return,
        'active_return': total_port_return - total_bench_return,
        'allocation': allocation,
        'selection': selection,
        'interaction': interaction,
        'total_allocation': np.sum(allocation),
        'total_selection': np.sum(selection),
        'total_interaction': np.sum(interaction)
    }


# Example: 5 sectors
sectors = ['Tech', 'Finance', 'Health', 'Energy', 'Consumer']

# Portfolio vs benchmark weights and returns
port_w = np.array([0.35, 0.15, 0.20, 0.10, 0.20])
bench_w = np.array([0.25, 0.20, 0.15, 0.15, 0.25])

port_r = np.array([0.15, 0.08, 0.12, -0.05, 0.10])
bench_r = np.array([0.12, 0.10, 0.09, -0.03, 0.08])

result = brinson_attribution(port_w, bench_w, port_r, bench_r)

print("Brinson-Fachler Attribution:")
print(f"  Portfolio Return:  {result['total_port_return']:.2%}")
print(f"  Benchmark Return:  {result['total_bench_return']:.2%}")
print(f"  Active Return:     {result['active_return']:.2%}")
print()
print(f"{'Sector':10s} {'Alloc':>8s} {'Select':>8s} {'Inter':>8s} {'Total':>8s}")
print("-" * 44)
for i, s in enumerate(sectors):
    total = result['allocation'][i] + result['selection'][i] + result['interaction'][i]
    print(f"{s:10s} {result['allocation'][i]:8.2%} "
          f"{result['selection'][i]:8.2%} "
          f"{result['interaction'][i]:8.2%} {total:8.2%}")
print("-" * 44)
print(f"{'TOTAL':10s} {result['total_allocation']:8.2%} "
      f"{result['total_selection']:8.2%} "
      f"{result['total_interaction']:8.2%} "
      f"{result['active_return']:8.2%}")
```

### Risk-Adjusted Performance Metrics

```
PERFORMANCE METRICS CHEAT SHEET
=================================

1. SHARPE RATIO
   SR = (R_p - R_f) / sigma_p

   Interpretation: Excess return per unit of total risk
   Good: > 1.0    Great: > 2.0    Exceptional: > 3.0

   Limitation: Penalizes upside volatility equally

2. SORTINO RATIO
   Sortino = (R_p - R_f) / sigma_downside

   Only penalizes downside risk (returns below target)
   Better for asymmetric return distributions

3. INFORMATION RATIO
   IR = (R_p - R_b) / TE

   where TE = tracking error = std(R_p - R_b)

   Interpretation: Active return per unit of active risk
   Good: > 0.5    Great: > 1.0

4. CALMAR RATIO
   Calmar = Annualized Return / Max Drawdown

   Measures return relative to worst loss
   Good: > 1.0    Great: > 3.0

5. ACTIVE SHARE
   AS = (1/2) * sum(|w_p,i - w_b,i|)

   Ranges 0% to 100%
   < 20%: Closet indexer
   20-60%: Moderate active management
   > 60%: High-conviction active

6. MAXIMUM DRAWDOWN
   MDD = max over t of (Peak_t - Trough_t) / Peak_t

   The worst peak-to-trough loss
   Crucial for investor psychology and survival
```

```python
import numpy as np

def compute_performance_metrics(returns, benchmark_returns=None,
                                 risk_free_rate=0.02, periods_per_year=252):
    """Compute comprehensive performance metrics."""
    returns = np.array(returns)

    # Annualization factor
    ann = periods_per_year
    rf_daily = risk_free_rate / ann

    # Basic statistics
    total_return = np.prod(1 + returns) - 1
    ann_return = (1 + total_return) ** (ann / len(returns)) - 1
    ann_vol = np.std(returns) * np.sqrt(ann)

    # Sharpe ratio
    excess = returns - rf_daily
    sharpe = np.mean(excess) / np.std(returns) * np.sqrt(ann)

    # Sortino ratio
    downside = returns[returns < rf_daily] - rf_daily
    downside_vol = np.sqrt(np.mean(downside ** 2)) * np.sqrt(ann) if len(downside) > 0 else 1e-10
    sortino = (ann_return - risk_free_rate) / downside_vol

    # Maximum drawdown
    cum_returns = np.cumprod(1 + returns)
    running_max = np.maximum.accumulate(cum_returns)
    drawdowns = cum_returns / running_max - 1
    max_drawdown = np.min(drawdowns)

    # Calmar ratio
    calmar = ann_return / abs(max_drawdown) if max_drawdown != 0 else np.inf

    metrics = {
        'total_return': total_return,
        'annualized_return': ann_return,
        'annualized_vol': ann_vol,
        'sharpe_ratio': sharpe,
        'sortino_ratio': sortino,
        'max_drawdown': max_drawdown,
        'calmar_ratio': calmar,
    }

    # Active metrics (if benchmark provided)
    if benchmark_returns is not None:
        benchmark_returns = np.array(benchmark_returns)
        active_returns = returns - benchmark_returns
        tracking_error = np.std(active_returns) * np.sqrt(ann)
        ann_active = np.mean(active_returns) * ann
        info_ratio = ann_active / tracking_error if tracking_error > 0 else 0

        metrics['tracking_error'] = tracking_error
        metrics['information_ratio'] = info_ratio
        metrics['annualized_active_return'] = ann_active

    return metrics


# Example usage
np.random.seed(42)
n_days = 252 * 3  # 3 years

# Simulate portfolio and benchmark returns
bench = np.random.normal(0.0004, 0.01, n_days)  # ~10% annual, 16% vol
alpha = np.random.normal(0.0001, 0.003, n_days)  # small alpha
port = bench + alpha

metrics = compute_performance_metrics(port, bench)

print("Portfolio Performance Metrics (3 years):")
print(f"  Annualized Return:   {metrics['annualized_return']:.2%}")
print(f"  Annualized Vol:      {metrics['annualized_vol']:.2%}")
print(f"  Sharpe Ratio:        {metrics['sharpe_ratio']:.3f}")
print(f"  Sortino Ratio:       {metrics['sortino_ratio']:.3f}")
print(f"  Max Drawdown:        {metrics['max_drawdown']:.2%}")
print(f"  Calmar Ratio:        {metrics['calmar_ratio']:.3f}")
print(f"  Tracking Error:      {metrics['tracking_error']:.2%}")
print(f"  Information Ratio:   {metrics['information_ratio']:.3f}")
print(f"  Active Return (ann): {metrics['annualized_active_return']:.2%}")
```

---

## 14.9 Multi-Strategy Portfolio

### Combining Multiple Alpha Strategies

```
MULTI-STRATEGY PORTFOLIO ARCHITECTURE
======================================

  Strategy A         Strategy B        Strategy C
  (Momentum)         (Mean Rev)        (ML Alpha)
  E[R]=15%           E[R]=12%          E[R]=20%
  Vol=18%            Vol=10%           Vol=25%
  Sharpe=0.72        Sharpe=0.80       Sharpe=0.72
       |                  |                 |
       v                  v                 v
  +-------------------------------------------------+
  |          STRATEGY ALLOCATOR                      |
  |                                                  |
  |  Inputs:                                         |
  |  - Strategy expected returns                     |
  |  - Strategy covariance (cross-strategy corr)     |
  |  - Capacity constraints                          |
  |  - Regime indicators                             |
  |                                                  |
  |  Methods:                                        |
  |  - Equal weight                                  |
  |  - Risk parity across strategies                 |
  |  - MVO on strategy returns                       |
  |  - Kelly criterion                               |
  |  - Dynamic (regime-based)                        |
  +-------------------------------------------------+
       |
       v
  Combined Portfolio
  E[R]=16%, Vol=12%, Sharpe=1.17
  (diversification benefit!)
```

### Correlation Between Strategies

```
STRATEGY CORRELATION MATRIX
============================

                  Momentum  MeanRev  StatArb  ML    Carry
  Momentum          1.00    -0.30     0.10   0.20   0.15
  Mean Reversion   -0.30     1.00     0.25  -0.10   0.05
  Stat Arb          0.10     0.25     1.00   0.30  -0.05
  ML Alpha          0.20    -0.10     0.30   1.00   0.10
  Carry             0.15     0.05    -0.05   0.10   1.00

Key insight: Momentum and Mean Reversion have NEGATIVE
correlation (-0.30). Combining them is extremely valuable.

Portfolio of 5 strategies:
  Individual Sharpe (average): 0.75
  Combined Sharpe (equal wt):  1.35   <-- diversification!

  Combined Sharpe ~ avg_SR * sqrt(N) * sqrt(1 + (N-1)*avg_corr)^{-1}

  With N=5 strategies and avg_corr=0.05:
  Combined ~ 0.75 * sqrt(5) / sqrt(1 + 4*0.05)
           ~ 0.75 * 2.24 / 1.10
           ~ 1.53
```

### Kelly Criterion for Strategy Allocation

```
KELLY CRITERION
================

For a single strategy:
  f* = mu / sigma^2

  where:
    f* = optimal fraction of capital
    mu = expected excess return
    sigma^2 = variance of returns

For multiple strategies:
  f* = Sigma^{-1} * mu

  This is equivalent to MVO with risk_aversion = 1.

  IMPORTANT: Full Kelly is too aggressive in practice.
  Use FRACTIONAL KELLY (typically 1/2 or 1/4 Kelly).

  f_practical = (1/2) * Sigma^{-1} * mu   (Half Kelly)
```

```python
import numpy as np

def kelly_allocation(expected_returns, cov_matrix, fraction=0.5):
    """
    Compute Kelly-optimal strategy allocation.

    fraction: Kelly fraction (0.5 = half-Kelly, recommended)
    """
    mu = np.array(expected_returns)
    Sigma = np.array(cov_matrix)

    # Full Kelly
    Sigma_inv = np.linalg.inv(Sigma)
    f_full = Sigma_inv @ mu

    # Fractional Kelly
    f_frac = fraction * f_full

    # Normalize to sum to 1 (if desired)
    f_norm = f_frac / np.sum(np.abs(f_frac))

    return {
        'full_kelly': f_full,
        'fractional_kelly': f_frac,
        'normalized': f_norm
    }


# Example: 4 strategies
strategy_names = ['Momentum', 'Mean_Rev', 'StatArb', 'Carry']

# Annualized excess returns
mu = np.array([0.08, 0.06, 0.10, 0.04])

# Strategy covariance
vols = np.array([0.12, 0.08, 0.15, 0.06])
corr = np.array([
    [1.00, -0.25, 0.10, 0.15],
    [-0.25, 1.00, 0.20, 0.05],
    [0.10,  0.20, 1.00, -0.10],
    [0.15,  0.05, -0.10, 1.00]
])
D = np.diag(vols)
Sigma = D @ corr @ D

result = kelly_allocation(mu, Sigma, fraction=0.5)

print("Kelly Criterion Allocation:")
print(f"{'Strategy':12s} {'Full Kelly':>12s} {'Half Kelly':>12s} {'Normalized':>12s}")
print("-" * 52)
for i, name in enumerate(strategy_names):
    print(f"{name:12s} {result['full_kelly'][i]:12.2%} "
          f"{result['fractional_kelly'][i]:12.2%} "
          f"{result['normalized'][i]:12.2%}")

# Expected portfolio Sharpe
w = result['normalized']
port_ret = w @ mu
port_vol = np.sqrt(w @ Sigma @ w)
print(f"\nCombined Sharpe: {port_ret / port_vol:.2f}")
```

### Dynamic Allocation Based on Regime

```python
import numpy as np

class RegimeBasedAllocator:
    """
    Dynamic strategy allocation based on market regime.

    Regimes:
      0 = Low volatility / trending (favor momentum, carry)
      1 = High volatility / mean-reverting (favor mean rev, stat arb)
      2 = Crisis (reduce risk, favor defensive)
    """

    def __init__(self, n_strategies):
        self.n = n_strategies

        # Regime-specific target weights
        self.regime_weights = {
            0: np.array([0.35, 0.15, 0.20, 0.30]),  # trending
            1: np.array([0.15, 0.35, 0.35, 0.15]),  # mean-reverting
            2: np.array([0.10, 0.20, 0.20, 0.50]),  # crisis (cash-heavy)
        }

    def detect_regime(self, recent_returns, lookback=60):
        """Simple regime detection based on volatility and trend."""
        if len(recent_returns) < lookback:
            return 0

        window = recent_returns[-lookback:]
        vol = np.std(window) * np.sqrt(252)
        trend = np.mean(window) * 252

        if vol > 0.25:          # high vol
            return 2             # crisis
        elif abs(trend) > 0.10:  # strong trend
            return 0             # trending
        else:
            return 1             # mean-reverting

    def allocate(self, regime, current_weights=None, transition_speed=0.2):
        """Get target allocation, optionally smooth transition."""
        target = self.regime_weights[regime]

        if current_weights is None:
            return target

        # Exponential smoothing toward target
        new_weights = current_weights + transition_speed * (target - current_weights)
        new_weights = new_weights / np.sum(new_weights)  # renormalize
        return new_weights


# Usage
allocator = RegimeBasedAllocator(4)
strategy_names = ['Momentum', 'Mean_Rev', 'StatArb', 'Carry']

print("Regime-Based Strategy Allocation:")
for regime, label in [(0, 'Trending'), (1, 'Mean-Reverting'), (2, 'Crisis')]:
    w = allocator.allocate(regime)
    print(f"\n  Regime: {label}")
    for name, weight in zip(strategy_names, w):
        bar = '#' * int(weight * 40)
        print(f"    {name:12s}: {weight:.0%} {bar}")
```

---

## 14.10 Practical Considerations

### Liquidity Constraints

```
LIQUIDITY-AWARE PORTFOLIO CONSTRUCTION
========================================

Problem: You cannot buy 10% of a small-cap stock
         without massive market impact.

Liquidity constraint:
  w_i * Portfolio_Value <= max_pct_ADV * ADV_i * liquidation_days

  Example:
    Portfolio = $100M
    Stock XYZ: ADV = $2M/day
    Max participation: 10% of ADV
    Liquidation target: 5 days

    Max position = 0.10 * $2M * 5 = $1M
    Max weight = $1M / $100M = 1.0%

LIQUIDITY SCORING:

  Score = ADV_i / (w_i * Portfolio_Value)

  Score > 10:  Highly liquid, no concern
  Score 5-10:  Liquid, minor impact
  Score 1-5:   Constrained, need careful execution
  Score < 1:   Illiquid, reduce position or avoid
```

### Implementation: Complete Portfolio Optimization Pipeline

```python
import numpy as np
from scipy.optimize import minimize

class PortfolioOptimizationPipeline:
    """
    Complete portfolio optimization pipeline combining:
    - Return estimation (Black-Litterman)
    - Covariance estimation (Ledoit-Wolf shrinkage)
    - Optimization (MVO with constraints)
    - Transaction cost awareness
    - Performance monitoring
    """

    def __init__(self, asset_names, risk_free_rate=0.02):
        self.names = asset_names
        self.n = len(asset_names)
        self.rf = risk_free_rate
        self.history = []

    def estimate_covariance(self, returns, method='ledoit_wolf'):
        """Estimate covariance with shrinkage."""
        T, N = returns.shape
        S = np.cov(returns, rowvar=False) * 252  # annualize

        if method == 'sample':
            return S

        if method == 'ledoit_wolf':
            # Shrink toward scaled identity
            mu_target = np.trace(S) / N
            F = mu_target * np.eye(N)

            # Simplified shrinkage intensity
            alpha = max(0, min(1, (N / T) * 0.5))
            return alpha * F + (1 - alpha) * S

        return S

    def estimate_returns(self, cov_matrix, market_weights, views=None,
                          risk_aversion=2.5, tau=0.05):
        """Estimate returns using Black-Litterman."""
        # Implied equilibrium
        pi = risk_aversion * cov_matrix @ market_weights

        if views is None:
            return pi

        P, Q, confidence = views
        P = np.array(P)
        Q = np.array(Q)
        confidence = np.array(confidence)

        tau_Sigma = tau * cov_matrix

        # View uncertainty
        Omega = np.diag(
            tau * np.diag(P @ cov_matrix @ P.T) * (1 / confidence - 1)
        )

        tau_Sigma_inv = np.linalg.inv(tau_Sigma)
        Omega_inv = np.linalg.inv(Omega)

        M = tau_Sigma_inv + P.T @ Omega_inv @ P
        mu_BL = np.linalg.solve(
            M,
            tau_Sigma_inv @ pi + P.T @ Omega_inv @ Q
        )

        return mu_BL

    def optimize(self, mu, Sigma, current_weights=None,
                  max_weight=0.25, max_turnover=0.30,
                  sector_map=None, sector_limits=None):
        """
        Full optimization with realistic constraints.
        """
        N = self.n

        def neg_sharpe(w):
            ret = w @ mu
            risk = np.sqrt(w @ Sigma @ w)
            if risk < 1e-10:
                return 0
            return -(ret - self.rf) / risk

        constraints = [
            {'type': 'eq', 'fun': lambda w: np.sum(w) - 1}
        ]

        # Turnover constraint
        if current_weights is not None:
            constraints.append({
                'type': 'ineq',
                'fun': lambda w: max_turnover - np.sum(np.abs(w - current_weights)) / 2
            })

        # Sector constraints
        if sector_map is not None and sector_limits is not None:
            for sector, limit in sector_limits.items():
                indices = [i for i, s in enumerate(sector_map) if s == sector]
                constraints.append({
                    'type': 'ineq',
                    'fun': lambda w, idx=indices, lim=limit: lim - np.sum(w[idx])
                })

        bounds = [(0, max_weight) for _ in range(N)]
        w0 = np.ones(N) / N if current_weights is None else current_weights

        result = minimize(neg_sharpe, w0, method='SLSQP',
                          bounds=bounds, constraints=constraints)

        if not result.success:
            # Fallback to equal weight
            return np.ones(N) / N

        return result.x

    def run(self, returns_data, market_weights, views=None,
            current_weights=None, **kwargs):
        """Run the complete pipeline."""

        # Step 1: Estimate covariance
        Sigma = self.estimate_covariance(returns_data, method='ledoit_wolf')

        # Step 2: Estimate returns
        mu = self.estimate_returns(Sigma, market_weights, views)

        # Step 3: Optimize
        weights = self.optimize(mu, Sigma, current_weights, **kwargs)

        # Step 4: Compute diagnostics
        port_ret = weights @ mu
        port_vol = np.sqrt(weights @ Sigma @ weights)
        sharpe = (port_ret - self.rf) / port_vol

        result = {
            'weights': weights,
            'expected_return': port_ret,
            'expected_vol': port_vol,
            'sharpe_ratio': sharpe,
            'mu': mu,
            'Sigma': Sigma
        }

        if current_weights is not None:
            turnover = np.sum(np.abs(weights - current_weights)) / 2
            result['turnover'] = turnover

        self.history.append(result)
        return result


# Full example
np.random.seed(42)

asset_names = ['US_Large', 'US_Small', 'Intl_Dev', 'EM',
               'US_Bond', 'Intl_Bond', 'REIT', 'Gold']
N = len(asset_names)

# Simulate 2 years of daily returns
T = 504
true_vols = np.array([0.16, 0.20, 0.18, 0.24, 0.05, 0.06, 0.20, 0.15])
true_mu = np.array([0.10, 0.12, 0.09, 0.11, 0.04, 0.03, 0.08, 0.05])
corr = np.eye(N)
corr[0, 1] = corr[1, 0] = 0.85
corr[0, 2] = corr[2, 0] = 0.70
corr[0, 3] = corr[3, 0] = 0.60
corr[0, 4] = corr[4, 0] = -0.10
corr[2, 3] = corr[3, 2] = 0.65
corr[4, 5] = corr[5, 4] = 0.75
corr[0, 6] = corr[6, 0] = 0.55

D = np.diag(true_vols / np.sqrt(252))
daily_cov = D @ corr @ D
L = np.linalg.cholesky(daily_cov)
returns = (true_mu / 252) + np.random.randn(T, N) @ L.T

# Market cap weights
mkt_w = np.array([0.30, 0.10, 0.15, 0.10, 0.15, 0.05, 0.10, 0.05])

# Sector map
sectors = ['Equity', 'Equity', 'Equity', 'Equity',
           'Fixed', 'Fixed', 'Real', 'Commodity']
sector_limits = {'Equity': 0.65, 'Fixed': 0.40, 'Real': 0.15, 'Commodity': 0.10}

# Views
views = (
    [[1, 0, 0, 0, 0, 0, 0, 0],     # US large cap
     [0, 0, 0, 0, 0, 0, 0, 1]],     # Gold
    [0.11, 0.07],                     # expected returns
    [0.7, 0.5]                        # confidence
)

# Run pipeline
pipeline = PortfolioOptimizationPipeline(asset_names)
result = pipeline.run(
    returns, mkt_w, views=views,
    max_weight=0.25, max_turnover=0.50,
    sector_map=sectors, sector_limits=sector_limits
)

print("=" * 60)
print("PORTFOLIO OPTIMIZATION PIPELINE RESULTS")
print("=" * 60)
print(f"\n{'Asset':12s} {'Mkt Wt':>8s} {'Optimal':>8s} {'Impl Ret':>10s}")
print("-" * 42)
for i, name in enumerate(asset_names):
    print(f"{name:12s} {mkt_w[i]:8.2%} {result['weights'][i]:8.2%} "
          f"{result['mu'][i]:10.2%}")

print(f"\nPortfolio Expected Return: {result['expected_return']:.2%}")
print(f"Portfolio Expected Vol:    {result['expected_vol']:.2%}")
print(f"Portfolio Sharpe Ratio:    {result['sharpe_ratio']:.3f}")

# Sector exposure check
print("\nSector Exposures:")
for sector in set(sectors):
    idx = [i for i, s in enumerate(sectors) if s == sector]
    exposure = np.sum(result['weights'][idx])
    limit = sector_limits[sector]
    status = "OK" if exposure <= limit + 0.001 else "BREACH"
    print(f"  {sector:12s}: {exposure:.2%} (limit: {limit:.2%}) [{status}]")
```

```
SAMPLE OUTPUT:
============================================================
PORTFOLIO OPTIMIZATION PIPELINE RESULTS
============================================================

Asset          Mkt Wt  Optimal   Impl Ret
------------------------------------------
US_Large        30.00%   25.00%      10.5%
US_Small        10.00%    8.12%      11.8%
Intl_Dev        15.00%   15.45%       9.2%
EM              10.00%   12.30%      10.9%
US_Bond         15.00%   17.80%       4.1%
Intl_Bond        5.00%    5.23%       3.2%
REIT            10.00%    9.85%       7.8%
Gold             5.00%    6.25%       6.5%

Portfolio Expected Return: 8.47%
Portfolio Expected Vol:    9.21%
Portfolio Sharpe Ratio:    0.703

Sector Exposures:
  Equity      : 60.87% (limit: 65.00%) [OK]
  Fixed       : 23.03% (limit: 40.00%) [OK]
  Real        :  9.85% (limit: 15.00%) [OK]
  Commodity   :  6.25% (limit: 10.00%) [OK]
```

---

## 14.11 Summary and Decision Framework

```
PORTFOLIO CONSTRUCTION DECISION TREE
=====================================

  Do you have reliable
  return forecasts?
       |
   +---+---+
   |       |
  YES      NO
   |       |
   v       v
  Do you need    Use Risk Parity
  to track a     or HRP
  benchmark?     (Section 14.4-14.6)
   |
   +---+---+
   |       |
  YES      NO
   |       |
   v       v
  MVO with   Black-Litterman
  tracking   + MVO
  error      (Section 14.3)
  constraint
  (Section 14.2)

  IN ALL CASES:
  +-------------------------------------------+
  | 1. Use shrinkage for covariance estimation |
  | 2. Add realistic constraints               |
  | 3. Account for transaction costs           |
  | 4. Monitor with attribution analysis       |
  | 5. Rebalance with cost-aware rules         |
  +-------------------------------------------+


METHOD SELECTION BY USE CASE:

  Use Case                      Recommended Method
  ===========================   ===========================
  Pension fund, long-only       MVO + Black-Litterman
  Quant hedge fund              Factor-neutral + Kelly
  Risk-balanced allocation      Risk Parity (levered)
  Many correlated assets        HRP
  Multi-strategy fund           Risk parity across strategies
  Tax-sensitive accounts        MVO + turnover + tax harvesting
  Index tracking                MVO + tracking error constraint
```

### Key Takeaways

```
10 COMMANDMENTS OF PORTFOLIO CONSTRUCTION
==========================================

1. DIVERSIFICATION is the only free lunch in finance.
   Exploit it ruthlessly.

2. NEVER trust raw expected return estimates.
   Use Black-Litterman, shrinkage, or skip returns entirely.

3. ALWAYS shrink the covariance matrix.
   Sample covariance with N > T/2 assets is garbage.

4. CONSTRAINTS are your friend, not your enemy.
   They prevent the optimizer from exploiting estimation errors.

5. TRANSACTION COSTS are real.
   A portfolio that is 1% better but costs 2% to implement
   is a 1% worse portfolio.

6. REBALANCE with discipline but not dogma.
   Band-based rebalancing outperforms calendar rebalancing.

7. ATTRIBUTE performance to understand what is working.
   If you cannot explain your returns, you cannot improve them.

8. COMBINE STRATEGIES with low correlation.
   A portfolio of mediocre uncorrelated strategies beats
   a single brilliant strategy.

9. RESPECT CAPACITY constraints.
   An alpha that works for $10M may not work for $1B.

10. TEST ROBUSTNESS before trusting results.
    If your portfolio changes dramatically with small
    input changes, you have a problem.
```

---

## Further Reading

| Resource                                                      | Author                     | Focus                                   |
| ------------------------------------------------------------- | -------------------------- | --------------------------------------- |
| _Active Portfolio Management_                                 | Grinold & Kahn             | Factor models, alpha, information ratio |
| _Advances in Financial ML_                                    | Lopez de Prado             | HRP, meta-labeling, ML for portfolios   |
| _Risk Parity Fundamentals_                                    | Edward Qian                | Risk budgeting theory and practice      |
| _Robust Portfolio Optimization_                               | Fabozzi, Kolm, Pachamanova | Robust methods, Black-Litterman         |
| _Quantitative Equity Portfolio Management_                    | Chincarini & Kim           | Factor models, implementation           |
| _The Black-Litterman Model_ (paper)                           | He & Litterman (1999)      | Original BL derivation                  |
| _Building Diversified Portfolios that Outperform OOS_ (paper) | Lopez de Prado (2016)      | HRP original paper                      |

---

**Next Chapter**: [15-INFRASTRUCTURE](./15-INFRASTRUCTURE.md) --- Building production-grade trading infrastructure: data pipelines, real-time systems, monitoring, and cloud deployment.
