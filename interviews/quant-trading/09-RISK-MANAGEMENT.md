# Chapter 9: Risk Management

## The Only Edge That Lasts

In quantitative trading, alpha is fleeting but risk is permanent. Every legendary blowup -- LTCM, Knight Capital, Archegos -- shares a common thread: not a lack of intelligence, but a failure of risk management. The best quant firms are risk management machines that happen to generate returns.

```
+------------------------------------------------------------------+
|                  RISK MANAGEMENT HIERARCHY                        |
+------------------------------------------------------------------+
|  LEVEL 5: Tail Risk / Black Swans     (Survival)                |
|  LEVEL 4: Portfolio Risk               (Diversification)         |
|  LEVEL 3: Position Sizing              (Capital Allocation)      |
|  LEVEL 2: Risk Measurement             (VaR, Drawdown)           |
|  LEVEL 1: Risk Identification          (Know Your Risks)         |
|  Foundation: Operational Risk Controls  (Kill Switches, Checks)  |
+------------------------------------------------------------------+
```

---

## 9.1 Why Risk Management Is Everything

### The Asymmetry of Gains and Losses

A 50% loss requires a 100% gain to recover. A 90% loss requires a 900% gain. This mathematical reality is why capital preservation dominates return generation.

```
  Loss      | Required Gain to Recover
  ----------|---------------------------
    -10%    |        +11.1%
    -20%    |        +25.0%
    -50%    |       +100.0%
    -70%    |       +233.3%
    -90%    |       +900.0%

  Recovery required grows EXPONENTIALLY.
```

```python
def recovery_needed(loss_pct: float) -> float:
    """Calculate the gain needed to recover from a percentage loss."""
    return (1.0 / (1.0 - loss_pct)) - 1.0
```

### Historical Blowups

**LTCM (1998):** Nobel laureates running convergence trades at 25:1 leverage. When Russia defaulted, correlations spiked to 1.0 across all assets. Lost $4.6B, required Fed-coordinated bailout. *Lesson: leverage amplifies model errors; correlations spike in crises.*

**Knight Capital (2012):** Software deployment activated old test code. In 45 minutes, the system bought high and sold low at massive volume. Lost $460M, firm destroyed. *Lesson: operational risk can kill faster than market risk; kill switches are non-negotiable.*

**Archegos (2021):** Concentrated positions (50%+ of single stocks) via total return swaps at 5-8x leverage. When positions reversed, prime brokers liquidated simultaneously. $10B+ losses across banks. *Lesson: concentration kills; leverage through derivatives obscures true risk.*

---

## 9.2 Types of Risk

```
+------------------------------------------------------------------+
|                    RISK TAXONOMY                                  |
+------------------------------------------------------------------+
|  MARKET RISK -----> Price moves against your positions           |
|    +-- Directional, Volatility, Interest Rate, Currency          |
|  IDIOSYNCRATIC ---> Single-name events (earnings, fraud)         |
|  LIQUIDITY -------> Cannot exit at reasonable prices             |
|  OPERATIONAL -----> System failures, human errors                |
|  MODEL -----------> Your model is wrong                          |
|  COUNTERPARTY ----> Your broker/exchange defaults                |
|  REGULATORY ------> Rules change, strategies become illegal      |
|  TAIL RISK -------> Extreme events beyond model assumptions      |
+------------------------------------------------------------------+
```

**Market Risk:** The most visible -- prices move against you. Includes equity, rate, FX, and commodity risk.

**Liquidity Risk:** In 2008, corporate bond spreads went from 10 bps to 500+ bps. Illiquid positions become prisons during stress.

**Model Risk:** All models are wrong. Includes parameter estimation error, overfitting, and regime changes that invalidate assumptions.

**Operational Risk:** Deployment errors, data feed failures, network outages, fat-finger trades. Knight Capital is the canonical example.

**Tail Risk:** Markets exhibit fat tails -- extreme moves occur far more often than a Gaussian model predicts. A 5-sigma event should occur once every 14,000 years under normality. In markets, they happen every few years.

---

## 9.3 Value at Risk (VaR)

VaR answers: "What is the maximum loss at a given confidence level over a given time horizon?" Example: "95% 1-day VaR = $1M" means there is a 5% chance of losing more than $1M in one day.

```
  Probability
  Density
     |          ___________
     |         /           \
     |        /             \
     |       /               \
     |  ___/                   \___
     |_/__|_____________________|__\____> Returns
       ^  |
       |  VaR (95%)
    5% of outcomes            95% of outcomes
```

### Historical VaR

Uses actual past returns -- no distributional assumptions. Sort returns, find the percentile.

```python
import numpy as np
from scipy import stats
from typing import NamedTuple

class VaRResult(NamedTuple):
    var: float
    cvar: float
    confidence: float

def historical_var(
    returns: np.ndarray,
    confidence: float = 0.95,
    horizon_days: int = 1,
    portfolio_value: float = 1_000_000,
) -> VaRResult:
    """Calculate Historical VaR and CVaR."""
    scaled = returns * np.sqrt(horizon_days)
    cutoff = np.percentile(scaled, (1 - confidence) * 100)
    var_dollar = -cutoff * portfolio_value

    tail = scaled[scaled <= cutoff]
    cvar_dollar = -np.mean(tail) * portfolio_value if len(tail) > 0 else var_dollar

    return VaRResult(var=var_dollar, cvar=cvar_dollar, confidence=confidence)

# Example
np.random.seed(42)
daily_returns = np.random.normal(0.0005, 0.015, 252 * 5)
result = historical_var(daily_returns, 0.95, portfolio_value=10_000_000)
print(f"95% 1-day VaR:  ${result.var:,.0f}")
print(f"95% 1-day CVaR: ${result.cvar:,.0f}")
```

### Parametric (Variance-Covariance) VaR

Assumes normally distributed returns. Fast but underestimates tail risk.

```python
def parametric_var(
    returns: np.ndarray,
    confidence: float = 0.95,
    horizon_days: int = 1,
    portfolio_value: float = 1_000_000,
) -> VaRResult:
    """Parametric VaR assuming normal distribution."""
    mu = np.mean(returns) * horizon_days
    sigma = np.std(returns) * np.sqrt(horizon_days)
    z = stats.norm.ppf(1 - confidence)

    var_dollar = -(mu + z * sigma) * portfolio_value
    pdf_z = stats.norm.pdf(z)
    cvar_dollar = -(mu - sigma * pdf_z / (1 - confidence)) * portfolio_value

    return VaRResult(var=var_dollar, cvar=cvar_dollar, confidence=confidence)
```

### Monte Carlo VaR

Simulates thousands of scenarios. Handles non-linear portfolios and options.

```python
def monte_carlo_var(
    returns: np.ndarray,
    confidence: float = 0.95,
    horizon_days: int = 1,
    portfolio_value: float = 1_000_000,
    n_sims: int = 100_000,
) -> VaRResult:
    """Monte Carlo VaR using bootstrapped returns."""
    mu = np.mean(returns) * horizon_days
    sigma = np.std(returns) * np.sqrt(horizon_days)
    simulated = np.random.normal(mu, sigma, n_sims)

    cutoff = np.percentile(simulated, (1 - confidence) * 100)
    var_dollar = -cutoff * portfolio_value
    tail = simulated[simulated <= cutoff]
    cvar_dollar = -np.mean(tail) * portfolio_value if len(tail) > 0 else var_dollar

    return VaRResult(var=var_dollar, cvar=cvar_dollar, confidence=confidence)
```

### CVaR / Expected Shortfall

VaR tells you the threshold; CVaR tells you the average loss *given* the threshold is breached. CVaR is a **coherent risk measure** (satisfies subadditivity), while VaR is not.

```
  VaR says:  "We won't lose more than $X with 95% confidence"
  CVaR says: "IF we breach VaR, we expect to lose $Y on average"

  Example: 95% VaR = $1.0M, 95% CVaR = $1.6M
  CVaR is ALWAYS >= VaR and is more informative for tail risk.
```

### VaR Limitations and Backtesting

VaR limitations: (1) Not subadditive -- combined VaR can exceed sum of parts. (2) Says nothing about tail shape. (3) Assumes stationarity. (4) Square-root-of-time scaling assumes independent returns.

```python
def backtest_var(
    returns: np.ndarray,
    var_estimates: np.ndarray,
    confidence: float = 0.95,
) -> dict:
    """Backtest VaR using Kupiec's POF test."""
    n = len(returns)
    breaches = np.sum(returns < -var_estimates)
    breach_rate = breaches / n
    expected_rate = 1 - confidence

    if breaches == 0 or breaches == n:
        p_value = 0.0
    else:
        log_lr = 2 * (
            breaches * np.log(breach_rate / expected_rate)
            + (n - breaches) * np.log((1 - breach_rate) / confidence)
        )
        p_value = 1 - stats.chi2.cdf(log_lr, df=1)

    return {
        "n_breaches": int(breaches),
        "breach_rate": breach_rate,
        "expected_rate": expected_rate,
        "kupiec_p_value": p_value,
        "model_rejected": p_value < 0.05,
    }
```

---

## 9.4 Position Sizing

Position sizing determines how much capital to allocate per trade. Often more important than signal quality.

```
  Method              Risk-Adjusted?  Complexity
  --------------------------------------------------
  Fixed Fractional    No              Low
  Kelly Criterion     Yes             Medium
  Half-Kelly          Yes             Medium
  Volatility-Based    Yes             Medium
  ATR-Based           Yes             Medium
  Equal Risk Contrib  Yes             High
```

### Fixed Fractional

Risk a fixed percentage of capital per trade.

```python
def fixed_fractional_size(
    capital: float, risk_pct: float, entry: float, stop: float,
) -> int:
    """Position size using fixed fractional method."""
    risk_per_share = abs(entry - stop)
    if risk_per_share == 0:
        return 0
    return int(capital * risk_pct / risk_per_share)

# $1M capital, 1% risk, buy at $50 with stop at $48
# Risk/share=$2, budget=$10K -> 5,000 shares
```

### Kelly Criterion

Maximizes long-run geometric growth rate. The optimal fraction of capital to bet.

```
  Discrete:   f* = (p*b - q) / b
  Continuous: f* = (mu - r) / sigma^2

  Where: p=win prob, q=1-p, b=win/loss ratio,
         mu=expected return, r=risk-free rate, sigma=volatility
```

```python
from dataclasses import dataclass

@dataclass(frozen=True)
class KellyResult:
    full_kelly: float
    half_kelly: float
    quarter_kelly: float

def kelly_criterion(win_rate: float, avg_win: float, avg_loss: float) -> KellyResult:
    """Kelly fraction for discrete outcomes."""
    b = avg_win / avg_loss
    f = max((win_rate * b - (1 - win_rate)) / b, 0.0)
    return KellyResult(full_kelly=f, half_kelly=f / 2, quarter_kelly=f / 4)

def kelly_continuous(
    expected_return: float, volatility: float, risk_free: float = 0.0,
) -> KellyResult:
    """Kelly fraction for continuous returns (optimal leverage)."""
    f = (expected_return - risk_free) / (volatility ** 2)
    return KellyResult(full_kelly=f, half_kelly=f / 2, quarter_kelly=f / 4)

# Discrete: 55% win rate, avg win $20K, avg loss $15K
r1 = kelly_criterion(0.55, 20, 15)
print(f"Full Kelly: {r1.full_kelly:.1%}, Half Kelly: {r1.half_kelly:.1%}")

# Continuous: 15% return, 20% vol
r2 = kelly_continuous(0.15, 0.20, 0.05)
print(f"Optimal leverage: {r2.full_kelly:.2f}x, Half-Kelly: {r2.half_kelly:.2f}x")
```

### Why Half-Kelly

Full Kelly maximizes growth but produces extreme drawdowns. Half-Kelly achieves 75% of growth with roughly half the volatility.

```
  Fraction      Growth Rate    Max Drawdown
  0.25 Kelly    ~44% of max    ~12%
  0.50 Kelly    ~75% of max    ~25%       <-- Recommended
  1.00 Kelly    100% of max    ~60%
  2.00 Kelly    0% growth      ~95%       <-- Guaranteed ruin

  Going BEYOND full Kelly REDUCES growth and INCREASES drawdown.
```

### Volatility-Based and ATR-Based Sizing

```python
def volatility_position_size(
    capital: float, target_vol: float, asset_vol: float, price: float,
) -> int:
    """Size positions to target a specific volatility contribution."""
    daily_vol_per_share = price * (asset_vol / np.sqrt(252))
    target_daily_vol = capital * (target_vol / np.sqrt(252))
    return int(target_daily_vol / daily_vol_per_share)

def atr_position_size(
    capital: float, risk_frac: float, atr: float, atr_mult: float,
) -> int:
    """ATR-based sizing. Stop at atr_mult * ATR from entry."""
    return int(capital * risk_frac / (atr * atr_mult))

# Equal-vol: target 1% annual vol per position
s1 = volatility_position_size(10_000_000, 0.01, 0.15, 100)  # Low-vol stock
s2 = volatility_position_size(10_000_000, 0.01, 0.45, 50)   # High-vol stock
# Low-vol gets MORE shares, high-vol gets FEWER -> equal risk contribution
```

---

## 9.5 Drawdown Management

A drawdown is the decline from a peak in portfolio value to a subsequent trough. Drawdown management determines whether you survive long enough for your edge to play out.

```
  Portfolio     Peak
  Value          /\
     |          /  \        Recovery
     |         /    \        /\    New Peak
     |        /      \      /  \   /
     |       /        \    /    \ /
     |      /          \  /
     |     /            \/  Trough
     +----/------------------------------------> Time
          |<-Drawdown->|
          |   Depth    |
          |<------- Drawdown Duration -------->|
```

### Drawdown Metrics

```python
def calculate_drawdown_metrics(equity: np.ndarray) -> dict:
    """Calculate comprehensive drawdown metrics."""
    peak = np.maximum.accumulate(equity)
    drawdown = (equity - peak) / peak
    max_dd = np.min(drawdown)
    max_dd_end = np.argmin(drawdown)
    max_dd_start = np.argmax(equity[:max_dd_end + 1])

    in_dd = drawdown < 0
    durations = []
    curr = 0
    for d in in_dd:
        if d:
            curr += 1
        elif curr > 0:
            durations.append(curr)
            curr = 0
    if curr > 0:
        durations.append(curr)

    return {
        "max_drawdown": max_dd,
        "max_dd_duration_days": int(max_dd_end - max_dd_start),
        "avg_drawdown": float(np.mean(drawdown[drawdown < 0])) if np.any(drawdown < 0) else 0.0,
        "longest_dd_days": max(durations) if durations else 0,
        "pct_time_in_drawdown": float(np.mean(in_dd)),
    }
```

### Circuit Breakers

```
  LEVEL 1 (YELLOW):  Daily loss > 1% NAV
    -> Reduce positions 50%, halt new trades, alert PM

  LEVEL 2 (ORANGE):  Daily loss > 2% NAV
    -> Flatten all positions over 30 min, halt for day

  LEVEL 3 (RED):     Daily loss > 5% NAV
    -> Immediate liquidation, shutdown minimum 1 week

  LEVEL 4 (CUMULATIVE): Monthly loss > 5% NAV
    -> Reduce gross exposure 75%, re-evaluate strategy
```

```python
from enum import Enum, auto

class AlertLevel(Enum):
    GREEN = auto()
    YELLOW = auto()
    ORANGE = auto()
    RED = auto()

def check_circuit_breakers(
    daily_pnl: float, monthly_pnl: float, nav: float,
) -> AlertLevel:
    """Check circuit breaker levels based on current PnL."""
    daily_loss = -daily_pnl / nav if daily_pnl < 0 else 0.0
    monthly_loss = -monthly_pnl / nav if monthly_pnl < 0 else 0.0

    if daily_loss >= 0.05:
        return AlertLevel.RED
    if daily_loss >= 0.02:
        return AlertLevel.ORANGE
    if daily_loss >= 0.01 or monthly_loss >= 0.05:
        return AlertLevel.YELLOW
    return AlertLevel.GREEN
```

### Time-Based Drawdown Limits

```
  30 days in drawdown:  Review strategy parameters
  60 days in drawdown:  Reduce position sizes by 50%
  90 days in drawdown:  Halt strategy, full review
  120 days in drawdown: Consider retiring strategy
```

---

## 9.6 Portfolio-Level Risk

### Correlation Instability

Correlations spike during crises -- exactly when diversification is most needed.

```
  CALM (VIX < 15):                CRISIS (VIX > 35):
  Stocks Bonds Cmdty              Stocks Bonds Cmdty
  [ 1.0  -0.2  0.1 ]              [ 1.0  -0.5  0.7 ]
  [-0.2   1.0 -0.1 ]              [-0.5   1.0 -0.3 ]
  [ 0.1  -0.1  1.0 ]              [ 0.7  -0.3  1.0 ]

  Avg pairwise: 0.12              Avg pairwise: 0.50
  Effective diversification: HIGH  Effective diversification: LOW
```

### Gross and Net Exposure

```
  Long: $6M, Short: $4M, NAV: $10M
  Gross = $6M + $4M = $10M  -> Gross leverage: 1.0x
  Net   = $6M - $4M = $2M  -> Net leverage: 0.2x (market-neutral)
```

### Beta Hedging

```python
def calculate_hedge(
    port_value: float, port_beta: float, hedge_price: float,
) -> dict:
    """Calculate SPY shares needed to neutralize portfolio beta."""
    hedge_notional = -port_value * port_beta
    hedge_shares = int(hedge_notional / hedge_price)
    return {"hedge_shares": hedge_shares, "hedge_notional": hedge_shares * hedge_price}

# $10M portfolio, beta 1.3, SPY at $450
h = calculate_hedge(10_000_000, 1.3, 450.0)
print(f"Short {abs(h['hedge_shares']):,} SPY shares (${abs(h['hedge_notional']):,.0f})")
```

### Stress Testing

```python
STRESS_SCENARIOS = {
    "Black Monday 1987":   -0.204,
    "LTCM 1998":           -0.195,
    "GFC 2008":            -0.568,
    "Flash Crash 2010":    -0.086,
    "COVID 2020":          -0.339,
    "Rate Shock 2022":     -0.252,
}

def stress_test(port_value: float, port_beta: float) -> dict:
    """Stress test portfolio against historical equity crashes."""
    return {
        name: port_value * port_beta * shock
        for name, shock in STRESS_SCENARIOS.items()
    }

results = stress_test(10_000_000, 0.5)
for name, pnl in results.items():
    print(f"  {name:25s} PnL: ${pnl:>12,.0f} ({pnl/10_000_000:>7.1%})")
```

### Portfolio Risk Dashboard

```python
def portfolio_risk_dashboard(
    weights: np.ndarray,
    betas: np.ndarray,
    returns_matrix: np.ndarray,
    portfolio_value: float,
) -> dict:
    """Comprehensive portfolio risk dashboard."""
    portfolio_returns = returns_matrix @ weights
    cov_matrix = np.cov(returns_matrix, rowvar=False) * 252

    port_var = weights @ cov_matrix @ weights
    port_vol = np.sqrt(port_var)

    # Risk contributions
    marginal = cov_matrix @ weights
    component = weights * marginal
    pct_contrib = component / port_var

    # VaR
    var_result = historical_var(portfolio_returns, 0.95, 1, portfolio_value)

    # Concentration (Herfindahl Index)
    hhi = np.sum(weights ** 2)

    return {
        "portfolio_vol": port_vol,
        "portfolio_beta": float(np.sum(weights * betas)),
        "var_95": var_result.var,
        "cvar_95": var_result.cvar,
        "gross_exposure": float(np.sum(np.abs(weights))),
        "net_exposure": float(np.sum(weights)),
        "effective_positions": 1.0 / hhi,
        "risk_pct_contributions": pct_contrib.tolist(),
    }
```

---

## 9.7 Tail Risk and Black Swans

Financial returns have fat tails. A 5-sigma event under normality should occur once per 14,000 years. In markets, they happen every few years.

```
  Event Size    Normal Probability    Actual Frequency
  3-sigma       1/370                 Several per year
  4-sigma       1/16,000              Roughly yearly
  5-sigma       1/3,500,000           Every few years
  6-sigma       1/500,000,000         Per decade

  Normal distribution MASSIVELY underestimates tail events.
```

### Extreme Value Theory (EVT)

EVT models only the tails using the Generalized Pareto Distribution (GPD), fitted to exceedances above a threshold.

```python
from scipy.stats import genpareto

def fit_evt_tail(returns: np.ndarray, threshold_pct: float = 5.0) -> dict:
    """Fit GPD to tail losses for EVT-based risk estimates."""
    losses = -returns
    threshold = np.percentile(losses, 100 - threshold_pct)
    exceedances = losses[losses > threshold] - threshold

    if len(exceedances) < 20:
        raise ValueError("Not enough tail observations")

    shape, _, scale = genpareto.fit(exceedances, floc=0)
    prob_exceed = len(exceedances) / len(losses)

    def evt_var(conf: float) -> float:
        p = 1 - conf
        return threshold + (scale / shape) * ((p / prob_exceed) ** (-shape) - 1)

    def evt_cvar(conf: float) -> float:
        v = evt_var(conf)
        return (v + scale - shape * threshold) / (1 - shape)

    return {
        "shape_xi": shape,
        "var_99": evt_var(0.99),
        "var_999": evt_var(0.999),
        "cvar_99": evt_cvar(0.99),
    }

# Fat-tailed returns (t-distribution, df=4)
from scipy.stats import t as t_dist
fat_returns = t_dist.rvs(df=4, loc=0.0003, scale=0.012, size=2520)
evt = fit_evt_tail(fat_returns)
print(f"99% VaR (EVT):   {evt['var_99']:.4f}")
print(f"99.9% VaR (EVT): {evt['var_999']:.4f}")
```

### Tail Risk Hedging

```
  Method          Cost     Protection   Convexity
  OTM Puts        High     Direct       High
  Put Spreads     Medium   Capped       Medium
  VIX Calls       Medium   Indirect     Very High
  Trend Following Low*     Dynamic      Moderate
  Cash Buffer     Zero     Limited      None

  * Trend following may profit in calm periods too.
  Target: 0.5-2% of NAV annually on tail hedging.
```

```python
def tail_hedge_analysis(
    port_value: float,
    put_strike_pct: float = 0.90,   # 10% OTM
    put_cost_pct: float = 0.015,    # 1.5% annual cost
) -> dict:
    """Cost/protection analysis for put-based tail hedge."""
    annual_cost = port_value * put_cost_pct
    max_loss = port_value * (1 - put_strike_pct) + annual_cost
    breakeven = (1 - put_strike_pct) + put_cost_pct
    return {
        "annual_cost": annual_cost,
        "max_loss_with_hedge": max_loss,
        "breakeven_decline": breakeven,
    }
```

---

## 9.8 Risk Attribution

Risk attribution answers: "Where is my risk coming from?" It decomposes portfolio risk into factor and idiosyncratic components.

### Factor-Based Risk Decomposition

```
  Total Portfolio Risk (Variance)
       |
       +-- Factor Risk (Systematic)
       |     +-- Market (beta)           45%
       |     +-- Size (SMB)              12%
       |     +-- Value (HML)              8%
       |     +-- Momentum (UMD)          15%
       |
       +-- Idiosyncratic Risk (Residual) 20%
```

```python
def factor_risk_decomposition(
    portfolio_returns: np.ndarray,
    factor_returns: np.ndarray,
    factor_names: list[str],
) -> dict:
    """Decompose portfolio risk into factor and idiosyncratic components."""
    n_days = len(portfolio_returns)
    X = np.column_stack([np.ones(n_days), factor_returns])

    betas, _, _, _ = np.linalg.lstsq(X, portfolio_returns, rcond=None)
    alpha = betas[0]
    factor_betas = betas[1:]

    predicted = X @ betas
    residual = portfolio_returns - predicted

    total_var = np.var(portfolio_returns) * 252
    factor_var = np.var(predicted) * 252
    idio_var = np.var(residual) * 252

    contributions = {}
    for i, name in enumerate(factor_names):
        cv = (factor_betas[i] ** 2) * np.var(factor_returns[:, i]) * 252
        contributions[name] = {"beta": float(factor_betas[i]), "pct_of_total": float(cv / total_var)}

    return {
        "alpha_annual": float(alpha * 252),
        "total_vol": float(np.sqrt(total_var)),
        "factor_vol": float(np.sqrt(factor_var)),
        "idio_vol": float(np.sqrt(idio_var)),
        "r_squared": float(factor_var / total_var),
        "contributions": contributions,
    }
```

### Marginal and Component Risk

**Marginal risk** = how portfolio risk changes with a small increase in a position. **Component risk** = each position's total contribution (they sum to portfolio risk).

```python
def component_risk(weights: np.ndarray, cov_matrix: np.ndarray) -> dict:
    """Marginal and component risk contributions."""
    port_vol = np.sqrt(weights @ cov_matrix @ weights)
    mcr = (cov_matrix @ weights) / port_vol       # Marginal
    ccr = weights * mcr                             # Component
    pct = ccr / port_vol                            # Percentage
    return {"port_vol": port_vol, "mcr": mcr, "ccr": ccr, "pct": pct}

# 3-asset example
w = np.array([0.5, 0.3, 0.2])
cov = np.array([
    [0.04,  0.006, 0.002],
    [0.006, 0.09,  0.003],
    [0.002, 0.003, 0.0625],
])
r = component_risk(w, cov)
for i in range(3):
    print(f"  Asset {chr(65+i)}: MCR={r['mcr'][i]:.4f}, CCR={r['ccr'][i]:.4f}, Pct={r['pct'][i]:.1%}")
```

### Component VaR

Splits portfolio VaR into contributions that sum to total VaR:

```
  Component_VaR_i = w_i * (Cov_{i,portfolio} / sigma_p) * z * Value
  Property: Sum of all Component VaRs = Total Portfolio VaR
```

---

## 9.9 Operational Risk

Operational failures cause losses faster than any market move. Every production system needs multiple independent safeguards.

```
  TECHNOLOGY RISK             PROCESS RISK
  - System outages            - Deployment errors
  - Data feed failure         - Configuration mistakes
  - Network issues            - Reconciliation failures
  - Software bugs             - Incorrect parameters

  HUMAN RISK                  EXTERNAL RISK
  - Fat-finger trades         - Exchange outages
  - Parameter errors          - Cyber attacks
  - Unauthorized trading      - Vendor failures
```

### Kill Switches

```python
from datetime import datetime, timedelta

@dataclass(frozen=True)
class KillSwitchConfig:
    max_orders_per_second: int = 50
    max_orders_per_minute: int = 500
    max_notional_per_order: float = 1_000_000
    max_daily_loss: float = 500_000
    max_position_size: float = 5_000_000

class KillSwitch:
    """Independent kill switch monitoring trading activity."""

    def __init__(self, config: KillSwitchConfig = KillSwitchConfig()):
        self._config = config
        self._timestamps: list[datetime] = []
        self._daily_pnl: float = 0.0
        self._killed: bool = False
        self._reason: str = ""

    def check_pre_trade(self, order_notional: float, current_pos: float) -> tuple[bool, str]:
        """Pre-trade check. Returns (allowed, reason)."""
        if self._killed:
            return False, f"KILLED: {self._reason}"

        now = datetime.utcnow()
        recent_1s = [t for t in self._timestamps if (now - t) < timedelta(seconds=1)]
        if len(recent_1s) >= self._config.max_orders_per_second:
            return self._kill("Rate limit: orders/second")

        if order_notional > self._config.max_notional_per_order:
            return False, "Order notional exceeds limit"

        if abs(current_pos) + order_notional > self._config.max_position_size:
            return False, "Would exceed position limit"

        if self._daily_pnl < -self._config.max_daily_loss:
            return self._kill("Daily loss limit breached")

        self._timestamps.append(now)
        return True, "OK"

    def _kill(self, reason: str) -> tuple[bool, str]:
        self._killed = True
        self._reason = reason
        return False, reason

    def update_pnl(self, change: float) -> None:
        self._daily_pnl += change
```

### Fat-Finger Protection

```python
def fat_finger_check(
    shares: int, price: float, market_price: float, adv: int,
) -> tuple[bool, str]:
    """Check order for fat-finger errors."""
    if abs(shares) > 100_000:
        return False, f"Shares {shares} > 100K limit"
    if abs(shares) > adv * 0.05:
        return False, "Exceeds 5% of ADV"
    deviation = abs(price - market_price) / market_price
    if deviation > 0.05:
        return False, f"Price deviates {deviation:.1%} from market"
    if abs(shares * price) > 2_000_000:
        return False, "Notional exceeds $2M"
    return True, "OK"
```

### Reconciliation

```
  INTERNAL STATE       COMPARISON      EXTERNAL STATE
  (Your System)                        (Broker/Exchange)
  +-----------+       +--------+       +-----------+
  | Positions |<----->| RECON  |<----->| Positions |
  | Orders    |       | ENGINE |       | Fills     |
  | Cash      |       | Alerts |       | Cash      |
  +-----------+       +--------+       +-----------+

  Frequency: Real-time for positions, T+1 for cash
  Tolerance: Zero for share counts, small for dollars
```

---

## 9.10 Risk Limits Framework

### Hierarchical Risk Limits

```
  FIRM LEVEL:
    Max Gross Leverage: 3.0x    Max Net Exposure: +/- 0.3x
    Max Daily Loss: 2% NAV      Max Monthly Loss: 5% NAV
    Max VaR (99%): 3% NAV       Stress Loss Limit: 10% NAV

  STRATEGY LEVEL:
    Stat Arb:  Gross 1.5x, Daily Loss 0.5%, Monthly 2%
    Momentum:  Gross 1.0x, Daily Loss 0.8%, Monthly 3%

  POSITION LEVEL:
    Max Single Position: 5% NAV
    Max Sector Exposure: 20% NAV
    Max % of ADV: 10%
```

### Pre-Trade Risk Checks

```python
from enum import Enum

class CheckResult(Enum):
    PASS = "PASS"
    SOFT_REJECT = "SOFT_REJECT"
    HARD_REJECT = "HARD_REJECT"

@dataclass(frozen=True)
class RiskLimits:
    max_gross_leverage: float = 3.0
    max_single_position_pct: float = 0.05
    max_sector_pct: float = 0.20
    max_daily_loss_pct: float = 0.02
    max_monthly_loss_pct: float = 0.05
    max_order_notional: float = 5_000_000

def pre_trade_check(
    order_notional: float,
    order_side: str,
    symbol: str,
    sector_exposure: float,
    nav: float,
    gross_exposure: float,
    current_position: float,
    daily_pnl: float,
    monthly_pnl: float,
    limits: RiskLimits = RiskLimits(),
) -> list[tuple[CheckResult, str]]:
    """Comprehensive pre-trade risk checks."""
    results = []

    if order_notional > limits.max_order_notional:
        results.append((CheckResult.HARD_REJECT, "Order notional exceeds limit"))

    sign = 1 if order_side == "BUY" else -1
    new_pos = abs(current_position + sign * order_notional)
    if new_pos / nav > limits.max_single_position_pct:
        results.append((CheckResult.HARD_REJECT, "Position concentration exceeds limit"))

    if (sector_exposure + order_notional) / nav > limits.max_sector_pct:
        results.append((CheckResult.SOFT_REJECT, "Sector concentration warning"))

    if (gross_exposure + order_notional) / nav > limits.max_gross_leverage:
        results.append((CheckResult.HARD_REJECT, "Gross leverage exceeds limit"))

    if daily_pnl < 0 and abs(daily_pnl) / nav > limits.max_daily_loss_pct:
        results.append((CheckResult.HARD_REJECT, "Daily loss limit breached"))

    if monthly_pnl < 0 and abs(monthly_pnl) / nav > limits.max_monthly_loss_pct:
        results.append((CheckResult.HARD_REJECT, "Monthly loss limit breached"))

    if not results:
        results.append((CheckResult.PASS, "All checks passed"))
    return results
```

### Margin Requirements

```
  Reg-T (US Equities):
    Initial: 50%, Maintenance: 25%

  Portfolio Margin (SPAN-like):
    Risk-based, typically 15-20% for diversified portfolios
    Can be 8% for well-hedged books

  Example ($10M NAV, $30M gross):
    Reg-T needs $15M -> EXCEEDS CAPITAL
    Portfolio margin needs $4.5M -> OK with buffer

  RULE: Always maintain 20%+ buffer above margin requirements.
```

---

## 9.11 Putting It All Together

### Risk Management Checklist

```
  DAILY:
    [ ] Check PnL against expectations
    [ ] Reconcile positions with broker
    [ ] Review VaR and factor exposures
    [ ] Verify data feeds operational

  WEEKLY:
    [ ] Review drawdown status
    [ ] Update correlation estimates
    [ ] Check margin utilization

  MONTHLY:
    [ ] Backtest VaR model (count breaches)
    [ ] Run stress test suite
    [ ] Review risk limit utilization

  QUARTERLY:
    [ ] Disaster recovery drill
    [ ] Review and update risk limits
    [ ] Tail hedging strategy review
```

### Key Formulas

```
  Portfolio Variance:    sigma_p^2 = w' * Cov * w
  Parametric VaR (95%): VaR = 1.645 * sigma * Value
  Kelly Criterion:      f* = (p*b - q) / b
  Recovery Required:    gain = 1/(1-loss) - 1
  Beta Hedge Shares:    -(Value * Beta) / Hedge_Price
  Component VaR_i:      w_i * (Cov_{i,p} / sigma_p) * z * Value
```

---

## Summary

Risk management is not a constraint on trading -- it is the foundation that makes trading possible.

1. **Losses are asymmetric.** A 50% loss requires 100% to recover. Protect capital above all else.
2. **Use half-Kelly.** Full Kelly maximizes growth but the drawdowns will destroy you.
3. **Correlations lie.** They spike to 1.0 in crises, exactly when you need diversification.
4. **VaR is necessary but insufficient.** Supplement with CVaR, stress tests, and scenario analysis.
5. **Operational risk kills faster than market risk.** Kill switches and reconciliation are non-negotiable.
6. **Risk limits must be hierarchical.** Firm, strategy, and position levels with independent enforcement.
7. **Tail events are not rare.** Fat tails mean 5-sigma events happen every few years.
8. **Drawdown duration matters as much as depth.** A 10% drawdown lasting 6 months may signal a broken strategy.
9. **Pre-trade checks must be independent.** Separate process from trading logic, no override.
10. **Test your disaster recovery.** Discover problems during drills, not during actual disasters.

---

## Interview Questions

**Q: A portfolio has 95% 1-day VaR of $1M. What does this mean? What does it NOT tell you?**

It means on 95% of days, the portfolio will not lose more than $1M. It does NOT tell you how much you could lose on the worst 5% of days. You might lose $1.1M or $10M -- VaR cannot distinguish the two. Use CVaR to characterize the tail.

**Q: Your strategy has 55% win rate, avg win $20K, avg loss $15K. What is the optimal Kelly fraction?**

b = 20/15 = 1.333, p = 0.55, q = 0.45. f* = (0.55 * 1.333 - 0.45) / 1.333 = 0.283 / 1.333 = 21.2%. In practice, use half-Kelly: 10.6%.

**Q: Why is VaR not subadditive? Why does this matter?**

VaR of a combined portfolio can exceed the sum of individual VaRs: VaR(A+B) > VaR(A) + VaR(B). This violates the intuition that diversification reduces risk. CVaR is subadditive and therefore coherent. For capital allocation, non-subadditivity means a desk could appear to reduce firm risk by splitting into two desks.

**Q: What destroyed LTCM?**

They assumed stable correlations and that convergence trades would converge within their liquidity horizon. 25:1 leverage amplified model errors. Core failure: no stress testing for correlation regime changes and underestimated liquidity risk.

**Q: Design a kill switch system for a new strategy.**

Monitor: orders/second (rate limit), daily notional, daily PnL, position sizes, order-to-fill ratio, price deviation from NBBO, data feed staleness. Each check runs independently. Any breach triggers order cancellation and position freeze. Kill state requires manual reset.

---

*Next Chapter: [Chapter 10 - Trade Execution and Order Management Systems](10-EXECUTION-SYSTEMS.md)*
