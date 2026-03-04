# Chapter 7: Options & Derivatives

## The Language of Optionality

Options are the most intellectually rich instruments in finance. They introduce nonlinearity, convexity, and a rich dependence on volatility that does not exist in linear instruments like stocks and bonds. Every quantitative trading firm trades options or uses options-related concepts in risk management.

This chapter covers options from the ground up, with rigorous treatment of the Greeks, volatility, pricing models, strategies, and exotics. The mathematics here is essential for interviews at any options market-making firm (Citadel Securities, Jane Street, Optiver, IMC, Susquehanna).

```
+------------------------------------------------------------------------+
|              OPTIONS & DERIVATIVES - CONCEPT MAP                        |
+------------------------------------------------------------------------+
|                                                                        |
|  FUNDAMENTALS              GREEKS                  VOLATILITY          |
|  +------------------+     +------------------+    +------------------+ |
|  | Payoffs           |     | Delta            |    | Historical       | |
|  | Moneyness         | --> | Gamma            | -->| Implied          | |
|  | Put-Call Parity   |     | Theta            |    | Surface          | |
|  | Early Exercise    |     | Vega             |    | Smile/Skew       | |
|  +------------------+     | Higher-Order     |    | Term Structure   | |
|                            +------------------+    +------------------+ |
|           |                        |                       |           |
|           v                        v                       v           |
|  PRICING MODELS          STRATEGIES              EXOTICS              |
|  +------------------+   +------------------+    +------------------+  |
|  | Black-Scholes     |   | Spreads          |    | Barrier          |  |
|  | Binomial Tree     |   | Straddle/Strangle|    | Asian            |  |
|  | Monte Carlo       |   | Butterfly        |    | Lookback         |  |
|  | Local Vol         |   | Iron Condor      |    | Digital          |  |
|  +------------------+   +------------------+    +------------------+  |
|                                                                        |
+------------------------------------------------------------------------+
```

---

## 1. Options Fundamentals

### 1.1 Payoff Structure

```
CALL OPTION PAYOFF AT EXPIRY
==============================

Profit
  ^
  |                          /
  |                        /
  |                      /
  |                    /
  |------------------*-----------> Stock Price
  | -Premium        K
  |
  v

  Payoff = max(S - K, 0)
  Profit = max(S - K, 0) - Premium

PUT OPTION PAYOFF AT EXPIRY
============================

Profit
  ^
  |  \
  |    \
  |      \
  |        \
  |----------*-------------------> Stock Price
  |          K         -Premium
  |
  v

  Payoff = max(K - S, 0)
  Profit = max(K - S, 0) - Premium
```

### 1.2 Intrinsic vs. Extrinsic Value

```
Option Price = Intrinsic Value + Extrinsic Value (Time Value)

Intrinsic Value:
  Call: max(S - K, 0)
  Put:  max(K - S, 0)

Extrinsic Value = Option Price - Intrinsic Value
  - Always non-negative for European options
  - Represents the value of optionality (uncertainty)
  - Decays to zero at expiration (theta decay)
  - Maximized for ATM options

Example:
  S = 105, K = 100, Call Price = 8.50
  Intrinsic = max(105 - 100, 0) = 5.00
  Extrinsic = 8.50 - 5.00 = 3.50
```

### 1.3 Moneyness

```
+-------------------+-------------------+-------------------+
|                   |  CALL              |  PUT               |
+-------------------+-------------------+-------------------+
| In-The-Money (ITM)| S > K             | S < K              |
| At-The-Money (ATM)| S = K             | S = K              |
| Out-of-Money (OTM)| S < K             | S > K              |
+-------------------+-------------------+-------------------+

Moneyness measure (log-moneyness):
  m = ln(S / K)

  m > 0: ITM call, OTM put
  m = 0: ATM
  m < 0: OTM call, ITM put

Standardized moneyness (accounts for time):
  d = ln(S/K) / (sigma * sqrt(T))
```

### 1.4 Put-Call Parity

The most important relationship in options:

```
For European options:

  C - P = S - K * e^{-rT}

  C = Call price
  P = Put price
  S = Spot price
  K = Strike price
  r = Risk-free rate
  T = Time to expiry

Derivation: Both sides have the same payoff at expiry.
  Left:  C - P = max(S_T - K, 0) - max(K - S_T, 0) = S_T - K
  Right: S_T - K * e^{-rT} * e^{rT} = S_T - K

Implications:
1. If you know C, you can compute P (and vice versa)
2. Violations = arbitrage opportunity
3. Implied vol for C and P at same strike must be equal
4. Doesn't hold exactly for American options (early exercise)
```

### 1.5 Early Exercise

```
AMERICAN VS EUROPEAN OPTIONS

American: Can exercise at any time before expiry
European: Can only exercise at expiry

When is early exercise optimal?

CALLS on non-dividend paying stock:
  NEVER optimal to exercise early!
  Proof: C >= S - K*e^{-rT} > S - K = intrinsic value
  The option is always worth more alive than dead.

CALLS on dividend-paying stock:
  May be optimal just before ex-dividend date
  If dividend D > K * (1 - e^{-r*dt}), exercise may be optimal

PUTS:
  May be optimal to exercise early when deeply ITM
  The time value of receiving K now vs. later matters
  Early exercise becomes more likely as:
  - Interest rates are high (opportunity cost of waiting)
  - Volatility is low (less chance of reversal)
  - Option is deep ITM (intrinsic value dominates)
```

---

## 2. The Greeks Deep-Dive

### 2.1 Delta

```
Delta = dC/dS (rate of change of option price w.r.t. underlying)

For Black-Scholes:
  Delta_call = N(d1)        Range: [0, 1]
  Delta_put  = N(d1) - 1    Range: [-1, 0]

  where d1 = [ln(S/K) + (r + sigma^2/2)*T] / (sigma * sqrt(T))

DELTA BEHAVIOR
===============

Delta
  1.0 |                               ___________
      |                          ____/
      |                     ___/
  0.5 |  . . . . . . . ._/. . . . . . . . . . . .  ATM delta ~= 0.5
      |              __/
      |          ___/
  0.0 |_________/
      +----------------------------------------------> S/K
       Deep OTM        ATM         Deep ITM

Key properties:
- ATM forward delta ~= 0.5 (not exactly due to drift)
- Delta approaches 1 as option goes deep ITM
- Delta approaches 0 as option goes deep OTM
- Delta of digital call = spike at strike (Dirac-like)
```

#### Delta Hedging

```
Delta hedging: maintain a delta-neutral portfolio

Portfolio: Long 1 call, Short Delta shares
  Pi = C - Delta * S
  dPi = dC - Delta * dS = 0  (to first order)

Rehedging frequency:
- Continuous hedging: theoretically perfect, infinite cost
- Discrete hedging: residual risk proportional to gamma
  Hedging error ~ 0.5 * Gamma * (dS)^2 per rehedge

P&L of delta-hedged option position:
  dPnL = 0.5 * Gamma * (dS)^2 - Theta * dt
       = 0.5 * Gamma * S^2 * (realized_vol^2 - implied_vol^2) * dt

This is the fundamental equation of options market making:
  You MAKE money when realized vol > implied vol (if long gamma)
  You LOSE money when realized vol < implied vol (if long gamma)
```

### 2.2 Gamma

```
Gamma = d^2C/dS^2 = dDelta/dS

For Black-Scholes:
  Gamma = phi(d1) / (S * sigma * sqrt(T))

  where phi() is the standard normal PDF

GAMMA BEHAVIOR
===============

Gamma
  ^
  |           *
  |          * *
  |         *   *
  |        *     *
  |       *       *
  |      *         *
  |    *             *
  |  *                 *
  |*                     *
  +----------------------------------------------> S/K
   OTM            ATM            ITM

Key properties:
- Gamma is always positive for long options
- Maximum at ATM, decays for ITM and OTM
- Gamma INCREASES as expiry approaches (for ATM options)
- Near expiry, ATM gamma becomes very large (pin risk)

Gamma near expiry (pin risk):
  At expiry, delta jumps from 0 to 1 (call) at the strike.
  The rate of this jump (gamma) approaches infinity.
  This creates enormous hedging risk if pinned near strike.
```

#### Gamma Scalping

```
GAMMA SCALPING P&L
===================

Scenario: Long ATM straddle, delta-hedge continuously

Day  | Stock Move | Gamma P&L | Theta Cost | Net P&L
-----|------------|-----------|------------|--------
  1  | +2%        | +$4,000   | -$1,500    | +$2,500
  2  | -0.5%      | +$250     | -$1,500    | -$1,250
  3  | +3%        | +$9,000   | -$1,500    | +$7,500
  4  | +0.1%      | +$10      | -$1,500    | -$1,490
  5  | -2.5%      | +$6,250   | -$1,500    | +$4,750

Gamma P&L = 0.5 * Gamma * S^2 * (daily_move)^2
Theta cost = fixed daily decay

Profitable when realized moves are large (high realized vol).
Unprofitable when market is quiet (low realized vol).
Break-even: realized vol = implied vol (approximately).
```

### 2.3 Theta

```
Theta = dC/dt (rate of time decay, usually negative for long options)

For Black-Scholes call:
  Theta = -(S * phi(d1) * sigma) / (2 * sqrt(T))
          - r * K * e^{-rT} * N(d2)

THETA BEHAVIOR
===============

|Theta| (magnitude of daily decay)
  ^
  |           *
  |          * *
  |         *   *
  |        *     *     As T -> 0 (near expiry):
  |       *       *    ATM theta accelerates
  |      *         *   dramatically
  |    *             *
  |  *                 *
  +----------------------------------------------> S/K
   OTM            ATM            ITM

THE THETA-GAMMA RELATIONSHIP:

For a delta-hedged portfolio:
  Theta + 0.5 * sigma^2 * S^2 * Gamma = r * V

  where V = option value

This means:
  Theta = -0.5 * sigma^2 * S^2 * Gamma + r * V

For ATM options (V is small relative):
  Theta ~= -0.5 * sigma^2 * S^2 * Gamma

Theta and gamma are two sides of the same coin:
  Long gamma (good) costs theta (bad)
  Short gamma (risky) earns theta (income)
```

### 2.4 Vega

```
Vega = dC/d(sigma) (sensitivity to implied volatility)

For Black-Scholes:
  Vega = S * sqrt(T) * phi(d1)

Key properties:
- Always positive for long options (calls and puts)
- Maximum for ATM options
- Increases with time to expiry (longer-dated = more vega)
- Vega is not a Greek letter (hence sometimes called "kappa")

VEGA TERM STRUCTURE
====================

Vega
  ^
  |  *  *  * 1-year option (high vega)
  |    *   *
  |      *   *
  |   *    *   *  3-month option (medium vega)
  |     *    *
  |       *    *
  |    *     *   * 1-month option (low vega)
  |      *     *
  +----------------------------------------------> S/K
```

### 2.5 Higher-Order Greeks

```
+----------+--------------------+----------------------------------------+
| Greek    | Definition         | Significance                            |
+----------+--------------------+----------------------------------------+
| Vanna    | d(Delta)/d(sigma)  | How delta changes with vol              |
|          | = d(Vega)/dS       | Important for skew trading              |
+----------+--------------------+----------------------------------------+
| Volga    | d(Vega)/d(sigma)   | Convexity of option price in vol        |
| (Vomma)  | = d^2C/d(sigma)^2  | Drives smile dynamics                   |
+----------+--------------------+----------------------------------------+
| Charm    | d(Delta)/dt        | How delta changes with time             |
|          |                    | Critical for overnight hedging          |
+----------+--------------------+----------------------------------------+
| Speed    | d(Gamma)/dS        | Rate of gamma change                    |
|          | = d^3C/dS^3        | Important for large moves               |
+----------+--------------------+----------------------------------------+
| Color    | d(Gamma)/dt        | How gamma changes with time             |
|          |                    | Important near expiry                   |
+----------+--------------------+----------------------------------------+
| Zomma    | d(Gamma)/d(sigma)  | How gamma changes with vol              |
|          |                    | Relevant for straddle traders           |
+----------+--------------------+----------------------------------------+

Vanna is particularly important for understanding skew risk:
  Vanna = d(Delta)/d(sigma) = d(Vega)/dS

  For OTM puts (downside protection):
    Vanna < 0: When vol increases, delta becomes more negative
    This amplifies the hedge during sell-offs (vol and spot move together)

  For market makers managing skew exposure:
    Net vanna = sum of vanna across all positions
    This determines P&L sensitivity to spot-vol correlation
```

---

## 3. Volatility

### 3.1 Historical vs. Implied Volatility

```
HISTORICAL (REALIZED) VOLATILITY
==================================

Close-to-close estimator:
  sigma_CC = sqrt((252 / (n-1)) * sum((ln(S_i/S_{i-1}) - mu_bar)^2))

Yang-Zhang estimator (uses OHLC, more efficient):
  sigma_YZ = sqrt(sigma_O^2 + k * sigma_C^2 + (1-k) * sigma_RS^2)

  where:
    sigma_O  = overnight volatility (open vs prev close)
    sigma_C  = close-to-close volatility
    sigma_RS = Rogers-Satchell (uses all of OHLC)
    k = 0.34 / (1.34 + (n+1)/(n-1))

IMPLIED VOLATILITY
====================

The volatility that, when plugged into Black-Scholes, gives the
market-observed option price.

  Market_Price = BS(S, K, r, sigma_implied, T)
  Solve for sigma_implied (no closed form, use Newton's method)

The implied-realized spread:
  IV - RV > 0 typically (volatility risk premium)
  Options are "expensive" on average
  This is compensation for selling insurance
```

### 3.2 The Volatility Smile and Skew

```
VOLATILITY SMILE / SKEW
=========================

Implied Vol
  ^
  |  *                         *    <-- OTM puts expensive
  |    *                     *        (crash protection)
  |      *                 *
  |        *             *
  |          *         *                <-- Equity skew
  |            * * * *
  |              ATM
  +----------------------------------------------> Strike (K)
  |  Low K      (S)       High K
  |  (OTM puts)           (OTM calls)

For equities: SKEW (downward sloping)
  - OTM puts have higher IV than OTM calls
  - Reflects crash risk and leveraged demand
  - Steepened after 1987 crash

For FX: SMILE (U-shaped)
  - Both OTM puts and calls have higher IV
  - Symmetric because either currency can crash

For commodities: SMIRK (varies)
  - Supply-demand driven
  - Often right-skewed (upside risk)
```

#### Sticky Strike vs. Sticky Delta

```
How does the smile move when the underlying moves?

STICKY STRIKE model:
  IV(K) stays constant as S moves
  Each strike retains its IV regardless of spot
  Delta changes because moneyness changes

  If S moves from 100 to 105:
    The 100 put was ATM, now is OTM
    Its IV stays the same (sticky to strike 100)

STICKY DELTA model:
  IV at a given delta stays constant as S moves
  The smile shifts with the underlying

  If S moves from 100 to 105:
    ATM strike shifts from 100 to 105
    The new ATM (105) gets the ATM IV

Reality: Between the two, often closer to sticky delta
for short-dated equity options, and market-dependent for
longer-dated.
```

### 3.3 Volatility Surface

```
THE VOLATILITY SURFACE: IV = f(K, T)
======================================

            T (time to expiry)
            |
  30%   *   |   *       *       *
            |
  25%     * | *     *       *
            |
  20%       *   *       *       *     <-- Term structure
            |     *           *       (usually upward sloping)
  15%       |       *
            |
            +-----------------------------> K (strike)
            90%   95%  100%  105%  110%

The surface must satisfy no-arbitrage constraints:
1. Calendar spread: IV should generally increase with T
   (no free theta)
2. Butterfly spread: d^2C/dK^2 >= 0
   (probability density must be non-negative)
3. No crossing of total variance: T1*IV(T1)^2 < T2*IV(T2)^2
   for T1 < T2 at same strike
```

---

## 4. Options Strategies with P&L Diagrams

### 4.1 Vertical Spreads

```
BULL CALL SPREAD: Buy C(K1), Sell C(K2), K1 < K2
=====================================================

Profit
  ^
  |                 _______________
  |                /
  |               /
  |              /        Max profit = K2 - K1 - net premium
  |  -----------/
  | -Premium   K1     K2
  v

Max profit: K2 - K1 - net debit
Max loss: net debit paid
Break-even: K1 + net debit


BEAR PUT SPREAD: Buy P(K2), Sell P(K1), K1 < K2
=====================================================

Profit
  ^
  |  _______________
  |                 \
  |                  \
  |                   \       Max profit = K2 - K1 - net premium
  |                    \-----------
  |                   K1    K2    -Premium
  v
```

### 4.2 Straddle and Strangle

```
LONG STRADDLE: Buy C(K) + Buy P(K) at same strike
=====================================================

Profit
  ^
  |  \                         /
  |    \                     /
  |      \                 /
  |        \             /
  |          \         /
  |            \     /
  |  -----------*---*-----------   <-- Max loss = total premium
  |            K-P  K+P
  v            Break-even points

  Long straddle profits from LARGE moves in either direction.
  You are LONG GAMMA, LONG VEGA, SHORT THETA.


LONG STRANGLE: Buy C(K2) + Buy P(K1), K1 < K2
=====================================================

Profit
  ^
  |  \                              /
  |    \                          /
  |      \                      /
  |        \                  /
  |  -------\--------------/-------   <-- Max loss
  |         K1             K2
  v

  Cheaper than straddle (lower premium).
  Requires larger move to profit.
```

### 4.3 Butterfly Spread

```
LONG BUTTERFLY: Buy C(K1) + Buy C(K3) + Sell 2*C(K2)
where K2 = (K1 + K3) / 2
======================================================

Profit
  ^
  |              *
  |             / \
  |            /   \       Max profit at K2 (middle strike)
  |           /     \
  |          /       \
  |  -------*---------*-------   <-- Max loss = net premium
  |        K1   K2    K3
  v

  Bet that stock will be NEAR K2 at expiry.
  Low cost, limited risk on both sides.
  Equivalent to: long K1-K2 call spread + short K2-K3 call spread
```

### 4.4 Iron Condor

```
IRON CONDOR: Sell P(K2) + Buy P(K1) + Sell C(K3) + Buy C(K4)
K1 < K2 < K3 < K4
================================================================

Profit
  ^
  |           _________________
  |  --------/                 \--------
  |         /    Max profit     \       Max profit = net credit
  |        /     = premium       \
  |  -----/                       \-----
  |      K1  K2              K3  K4
  v

  Bet that stock stays BETWEEN K2 and K3.
  Collect premium (short vol strategy).
  Limited risk in both directions.
  Popular with retail but DANGEROUS in tail events.
```

### 4.5 Risk Reversal

```
RISK REVERSAL: Sell OTM Put + Buy OTM Call (or vice versa)
=============================================================

Profit
  ^
  |                              /
  |                            /
  |  -------------------------/   K_call
  |  K_put                   /
  |  -----\               /
  |        \             /
  |          \         /
  v

  Expresses a DIRECTIONAL view.
  Often done for zero net premium.
  Risk reversal PRICES indicate market skew:
    If 25-delta RR is negative, OTM puts are more expensive.
```

---

## 5. Exotic Options

### 5.1 Barrier Options

```
BARRIER OPTION TYPES
=====================

+-------------------+--------------------------------------------+
| Type              | Payoff Condition                            |
+-------------------+--------------------------------------------+
| Up-and-Out Call   | Standard call BUT knocked out if S > H      |
| Up-and-In Call    | Becomes a call only if S > H               |
| Down-and-Out Put  | Standard put BUT knocked out if S < H      |
| Down-and-In Put   | Becomes a put only if S < H                |
+-------------------+--------------------------------------------+

In-Out Parity: Knock-In + Knock-Out = Vanilla
  C_DI(H) + C_DO(H) = C_vanilla
  (If barrier is never hit, DO pays; if hit, DI pays)

PRICE BEHAVIOR NEAR BARRIER
=============================

Option Price
  ^
  |  Vanilla Call
  |  ---------..
  |            . \
  |            .  \   Down-and-Out Call
  |            .   \  (goes to zero at barrier)
  |            .    \
  |            .     \
  |  ..........       *----> 0
  +-----+------+------+-------> S
        H   (barrier) K

  Near the barrier, gamma becomes extremely large.
  Hedging barrier options is notoriously difficult.
```

### 5.2 Asian Options

```
Asian Option: payoff depends on AVERAGE price over a period

Arithmetic Asian Call:
  Payoff = max(A - K, 0)
  where A = (1/n) * sum(S(t_i))

Geometric Asian Call:
  Payoff = max(G - K, 0)
  where G = (prod(S(t_i)))^(1/n)

Properties:
- Cheaper than vanilla (averaging reduces volatility)
- Geometric Asian has closed-form solution
- Arithmetic Asian requires Monte Carlo or approximations
- Used heavily in commodity markets (averaging contracts)
- Less susceptible to price manipulation at expiry

Effective volatility of average:
  sigma_avg ~= sigma / sqrt(3)  (for continuous averaging)
  This explains why Asian options are ~1/sqrt(3) cheaper
```

### 5.3 Lookback Options

```
Lookback Options: payoff depends on MAX or MIN price

Floating strike lookback call:
  Payoff = S(T) - min_{0<=t<=T} S(t)
  "Buy at the lowest price, sell at current"

Fixed strike lookback call:
  Payoff = max(max_{0<=t<=T} S(t) - K, 0)
  "Call on the maximum price achieved"

These are the MOST EXPENSIVE vanilla exotics because
they perfectly capture the best possible outcome.

Pricing: closed-form exists for GBM (Goldman, Sosin, Gatto 1979)
```

### 5.4 Digital / Binary Options

```
DIGITAL (BINARY) OPTIONS
==========================

Cash-or-nothing call:
  Pays $1 if S(T) > K, else $0

  Price = e^{-rT} * N(d2)
  Delta = e^{-rT} * phi(d2) / (S * sigma * sqrt(T))

  Delta is EXTREMELY large near strike close to expiry!
  This is the "digital risk" or "pin risk" problem.

Asset-or-nothing call:
  Pays S(T) if S(T) > K, else $0

  Price = S * N(d1)

Replication (useful in practice):
  A digital call with notional N at strike K can be
  approximately replicated by:

  (N / epsilon) * [C(K - epsilon/2) - C(K + epsilon/2)]

  where epsilon = small spread around K
  This is a tight call spread, and is the standard hedge.
```

---

## 6. Volatility Trading

### 6.1 Variance Swaps

```
VARIANCE SWAP
==============

A variance swap pays the difference between realized variance
and a fixed strike (implied variance):

  Payoff = Notional * (sigma_realized^2 - K_var)

  K_var is the variance strike, set at inception to make
  the swap have zero initial value.

Fair value of K_var:
  K_var = (2/T) * integral_0^inf (C(K)/(K^2) + P(K)/(K^2)) dK

  This is the model-free implied variance!
  It only requires option prices across all strikes.

  The VIX index is essentially sqrt(K_var) * 100
  VIX = 100 * sqrt((2/T) * sum(delta_K_i / K_i^2 * Q(K_i)))

Convexity adjustment:
  E[sigma_realized] != sqrt(E[sigma_realized^2])

  Variance is convex in volatility, so:
  Fair variance strike > (Fair volatility strike)^2
  This difference is the "convexity adjustment"
```

### 6.2 Dispersion Trading

```
DISPERSION TRADING
===================

Idea: Trade index vol vs. single-stock vol

  Index variance = sum_i sum_j (w_i * w_j * rho_ij * sigma_i * sigma_j)

  If rho is overestimated by the market:
    Index vol is too high relative to single-stock vol
    --> Short index options, long single-stock options

Typical implementation:
  - Short index straddle (short index vol)
  - Long single-stock straddles (long stock vol)
  - Delta-hedge everything

  P&L ~ Notional * (implied_correlation - realized_correlation)

Risk:
  - Correlation can spike (crisis = correlation goes to 1)
  - Very dangerous in a crash (opposite of diversification)
  - Needs careful position sizing and stop-losses
```

---

## 7. Options Market Making

### 7.1 Quoting and Inventory Management

```
MARKET MAKER P&L DECOMPOSITION
================================

Revenue sources:
  1. Bid-ask spread (flow P&L)
  2. Gamma scalping (hedging P&L)
  3. Theta collection (if net short options)

Cost sources:
  1. Adverse selection (informed flow)
  2. Inventory risk (unhedged positions)
  3. Transaction costs (hedging costs)
  4. Model risk (wrong vol estimate)

Inventory management:
  - Risk limits: max delta, gamma, vega per product
  - Skew management: flatten vanna exposure
  - Hedge ratio: use model delta with adjustments for skew
  - Internalization: offset client flows when possible

Quote width decision:
  Spread = f(inventory, volatility, flow_toxicity, competition)

  Wider when:
    - Inventory is extreme (risk aversion)
    - Vol is high (uncertainty in fair value)
    - Flow is informed (adverse selection)
    - Approaching events (earnings, FOMC)

  Tighter when:
    - Competition is fierce
    - Flow is mostly retail (uninformed)
    - Hedging is easy (liquid underlying)
```

---

## 8. Python Implementations

### 8.1 Complete Black-Scholes Calculator

```python
import numpy as np
from scipy.stats import norm
from dataclasses import dataclass


@dataclass(frozen=True)
class OptionResult:
    price: float
    delta: float
    gamma: float
    theta: float
    vega: float
    rho: float


def black_scholes(
    S: float,       # Spot price
    K: float,       # Strike price
    r: float,       # Risk-free rate (annualized)
    sigma: float,   # Volatility (annualized)
    T: float,       # Time to expiry (years)
    option_type: str = 'call'  # 'call' or 'put'
) -> OptionResult:
    """
    Complete Black-Scholes calculation with all Greeks.
    """
    if T <= 0:
        intrinsic = max(S - K, 0) if option_type == 'call' else max(K - S, 0)
        delta = 1.0 if (option_type == 'call' and S > K) else (
            -1.0 if (option_type == 'put' and S < K) else 0.0
        )
        return OptionResult(intrinsic, delta, 0, 0, 0, 0)

    sqrt_T = np.sqrt(T)
    d1 = (np.log(S / K) + (r + 0.5 * sigma**2) * T) / (sigma * sqrt_T)
    d2 = d1 - sigma * sqrt_T

    Nd1 = norm.cdf(d1)
    Nd2 = norm.cdf(d2)
    nd1 = norm.pdf(d1)

    if option_type == 'call':
        price = S * Nd1 - K * np.exp(-r * T) * Nd2
        delta = Nd1
        rho = K * T * np.exp(-r * T) * Nd2 / 100
    else:
        price = K * np.exp(-r * T) * norm.cdf(-d2) - S * norm.cdf(-d1)
        delta = Nd1 - 1
        rho = -K * T * np.exp(-r * T) * norm.cdf(-d2) / 100

    gamma = nd1 / (S * sigma * sqrt_T)
    theta = (-(S * nd1 * sigma) / (2 * sqrt_T)
             - r * K * np.exp(-r * T) * Nd2) / 365  # Daily theta
    if option_type == 'put':
        theta = (-(S * nd1 * sigma) / (2 * sqrt_T)
                 + r * K * np.exp(-r * T) * norm.cdf(-d2)) / 365

    vega = S * sqrt_T * nd1 / 100  # Per 1% vol change

    return OptionResult(
        price=price,
        delta=delta,
        gamma=gamma,
        theta=theta,
        vega=vega,
        rho=rho,
    )


# Example
result = black_scholes(S=100, K=105, r=0.05, sigma=0.25, T=0.5, option_type='call')
print(f"Price:  {result.price:.4f}")
print(f"Delta:  {result.delta:.4f}")
print(f"Gamma:  {result.gamma:.6f}")
print(f"Theta:  {result.theta:.4f} (per day)")
print(f"Vega:   {result.vega:.4f} (per 1% vol)")
print(f"Rho:    {result.rho:.4f}")
```

### 8.2 Monte Carlo Pricing for Exotic Options

```python
import numpy as np


def price_exotic_options(
    S0: float,
    K: float,
    r: float,
    sigma: float,
    T: float,
    n_steps: int = 252,
    n_paths: int = 100000,
    barrier: float = None,
    barrier_type: str = None,
) -> dict:
    """
    Monte Carlo pricer for vanilla and exotic options.
    Simulates GBM paths and computes various payoffs.
    """
    dt = T / n_steps
    sqrt_dt = np.sqrt(dt)
    drift = (r - 0.5 * sigma**2) * dt

    # Generate all paths at once
    Z = np.random.randn(n_paths, n_steps)
    log_returns = drift + sigma * sqrt_dt * Z
    log_paths = np.cumsum(log_returns, axis=1)
    log_paths = np.column_stack([np.zeros(n_paths), log_paths])
    paths = S0 * np.exp(log_paths)

    S_T = paths[:, -1]
    S_max = np.max(paths, axis=1)
    S_min = np.min(paths, axis=1)
    S_avg = np.mean(paths[:, 1:], axis=1)

    discount = np.exp(-r * T)
    results = {}

    # European call and put
    results['european_call'] = discount * np.mean(np.maximum(S_T - K, 0))
    results['european_put'] = discount * np.mean(np.maximum(K - S_T, 0))

    # Asian options (arithmetic average)
    results['asian_call'] = discount * np.mean(np.maximum(S_avg - K, 0))
    results['asian_put'] = discount * np.mean(np.maximum(K - S_avg, 0))

    # Lookback options (floating strike)
    results['lookback_call'] = discount * np.mean(S_T - S_min)
    results['lookback_put'] = discount * np.mean(S_max - S_T)

    # Digital (cash-or-nothing) call
    results['digital_call'] = discount * np.mean(S_T > K)

    # Barrier options
    if barrier is not None:
        if barrier_type == 'up_and_out':
            alive = S_max < barrier
            results['barrier_call'] = (
                discount * np.mean(np.maximum(S_T - K, 0) * alive)
            )
        elif barrier_type == 'down_and_out':
            alive = S_min > barrier
            results['barrier_call'] = (
                discount * np.mean(np.maximum(S_T - K, 0) * alive)
            )
        elif barrier_type == 'up_and_in':
            triggered = S_max >= barrier
            results['barrier_call'] = (
                discount * np.mean(np.maximum(S_T - K, 0) * triggered)
            )
        elif barrier_type == 'down_and_in':
            triggered = S_min <= barrier
            results['barrier_call'] = (
                discount * np.mean(np.maximum(S_T - K, 0) * triggered)
            )

    return results


# Example
np.random.seed(42)
results = price_exotic_options(
    S0=100, K=100, r=0.05, sigma=0.25, T=1.0,
    n_steps=252, n_paths=200000,
    barrier=120, barrier_type='up_and_out'
)

for name, price in results.items():
    print(f"{name:20s}: {price:.4f}")
```

### 8.3 Implied Volatility Surface Builder

```python
import numpy as np
from scipy.optimize import brentq
from scipy.stats import norm
from scipy.interpolate import RectBivariateSpline


def bs_call_price(S, K, r, sigma, T):
    """Black-Scholes call price."""
    if T <= 0 or sigma <= 0:
        return max(S - K * np.exp(-r * T), 0)
    d1 = (np.log(S / K) + (r + 0.5 * sigma**2) * T) / (sigma * np.sqrt(T))
    d2 = d1 - sigma * np.sqrt(T)
    return S * norm.cdf(d1) - K * np.exp(-r * T) * norm.cdf(d2)


def implied_vol_brent(market_price, S, K, r, T,
                      low=0.001, high=5.0):
    """
    Compute implied vol using Brent's method (bracketed root finding).
    More robust than Newton's for extreme cases.
    """
    def objective(sigma):
        return bs_call_price(S, K, r, sigma, T) - market_price

    try:
        return brentq(objective, low, high, xtol=1e-8)
    except ValueError:
        return np.nan


def build_vol_surface(
    S: float,
    r: float,
    strikes: np.ndarray,
    expiries: np.ndarray,
    market_prices: np.ndarray  # shape: (len(expiries), len(strikes))
) -> tuple:
    """
    Build implied volatility surface from market prices.
    Returns interpolated surface function.
    """
    n_exp, n_strike = market_prices.shape
    iv_grid = np.zeros_like(market_prices)

    for i in range(n_exp):
        for j in range(n_strike):
            iv_grid[i, j] = implied_vol_brent(
                market_prices[i, j], S, strikes[j], r, expiries[i]
            )

    # Fit smooth surface using bivariate spline
    surface = RectBivariateSpline(expiries, strikes, iv_grid, kx=3, ky=3)

    return iv_grid, surface


# Example: generate synthetic smile
S = 100
r = 0.05
strikes = np.array([85, 90, 95, 100, 105, 110, 115])
expiries = np.array([0.083, 0.25, 0.5, 1.0])  # 1m, 3m, 6m, 1y

# Synthetic IV surface with skew
iv_surface = np.zeros((len(expiries), len(strikes)))
for i, T in enumerate(expiries):
    for j, K in enumerate(strikes):
        moneyness = np.log(K / S) / np.sqrt(T)
        base_vol = 0.20
        skew = -0.10 * moneyness  # Negative skew
        smile = 0.02 * moneyness**2  # Smile curvature
        term = 0.01 * np.sqrt(T)  # Term structure
        iv_surface[i, j] = base_vol + skew + smile + term

# Generate prices from synthetic IV
prices = np.zeros_like(iv_surface)
for i, T in enumerate(expiries):
    for j, K in enumerate(strikes):
        prices[i, j] = bs_call_price(S, K, r, iv_surface[i, j], T)

# Recover implied vols
recovered_iv, spline = build_vol_surface(S, r, strikes, expiries, prices)

print("Original IV surface:")
print(np.round(iv_surface * 100, 2))
print("\nRecovered IV surface:")
print(np.round(recovered_iv * 100, 2))
```

---

## 9. Interview Problems

### Problem 1: Put-Call Parity Arbitrage

**Q: A European call on a non-dividend stock is priced at $12. The stock is at $100, strike is $95, risk-free rate is 5%, and expiry is 6 months. What should the put cost? If the put is trading at $4, is there an arbitrage?**

**A:**
```
Put-Call Parity: C - P = S - K * e^{-rT}

  12 - P = 100 - 95 * e^{-0.05 * 0.5}
  12 - P = 100 - 95 * 0.97531
  12 - P = 100 - 92.654
  12 - P = 7.346
  P = 12 - 7.346 = 4.654

If P is trading at $4 (too cheap):
  Buy the put at $4
  Sell the call at $12
  Buy the stock at $100
  Borrow $92.654 (= K*e^{-rT})

  Net cash: 12 - 4 - 100 + 92.654 = $0.654 (risk-free profit)

At expiry:
  If S > 95: Call exercised, sell stock at 95, put expires worthless
  If S < 95: Exercise put, sell stock at 95, call expires worthless
  Either way: receive 95, repay 95 loan. Net = $0.654 profit.
```

### Problem 2: Delta Hedging P&L

**Q: You are long 100 ATM calls with delta 0.50 and gamma 0.02. The stock is at $100. You delta-hedge. The stock moves to $103. What is your P&L? What if it then moves back to $100?**

**A:**
```
Initial position: Long 100 calls, Short 50 shares (delta hedge)

Stock moves $100 -> $103 (dS = +3):
  Call P&L: 100 * [Delta * dS + 0.5 * Gamma * dS^2]
          = 100 * [0.50 * 3 + 0.5 * 0.02 * 9]
          = 100 * [1.50 + 0.09]
          = 100 * 1.59 = $159

  Stock P&L: -50 * 3 = -$150

  Net P&L = $159 - $150 = $9 (profit from gamma)

Now at S=103, new delta = 0.50 + 0.02 * 3 = 0.56
Rehedge: need to short 56 shares total (sell 6 more at $103)

Stock moves $103 -> $100 (dS = -3):
  Call P&L: 100 * [0.56 * (-3) + 0.5 * 0.02 * 9]
          = 100 * [-1.68 + 0.09]
          = 100 * (-1.59) = -$159

  Stock P&L: -56 * (-3) = +$168

  Net P&L = -$159 + $168 = $9 (profit from gamma again!)

Total P&L = $9 + $9 = $18

Key insight: You profit from GAMMA regardless of direction!
The gamma P&L is always 0.5 * Gamma * (dS)^2, always positive.
The cost is theta (not shown here).
```

### Problem 3: Volatility Smile Explanation

**Q: Why is the implied volatility for deep OTM puts higher than for ATM options on equity indices?**

**A:**
```
Multiple explanations (all contribute):

1. SUPPLY-DEMAND: Portfolio insurance
   - Institutional investors buy OTM puts for crash protection
   - This demand pushes up OTM put prices -> higher implied vol
   - Supply of puts is limited (who wants to sell crash insurance?)

2. LEVERAGE EFFECT:
   - When stock falls, company leverage (debt/equity) increases
   - Higher leverage -> higher equity volatility
   - This creates natural negative correlation between returns and vol

3. FAT TAILS / JUMP RISK:
   - Real-world returns have fatter tails than log-normal
   - Crashes (large negative moves) are more likely than BS predicts
   - OTM put prices reflect this tail risk
   - To match these prices, BS must use higher sigma for OTM puts

4. RISK AVERSION:
   - Investors are more risk-averse to losses than gains
   - They are willing to overpay for downside protection
   - This is the volatility risk premium applied asymmetrically

5. POST-1987 STRUCTURAL CHANGE:
   - Before the 1987 crash, the smile was much flatter
   - After Black Monday, traders permanently repriced tail risk
   - Regulatory requirements for portfolio insurance increased demand
```

### Problem 4: Straddle Pricing

**Q: An ATM straddle is priced at $8. The stock is at $100. What is the market implying about the expected move?**

**A:**
```
A straddle costs the sum of ATM call + ATM put premiums.

Approximate ATM straddle value:
  Straddle ~= 2 * 0.4 * S * sigma * sqrt(T)
            ~= 0.8 * S * sigma * sqrt(T)

So: 8 = 0.8 * 100 * sigma * sqrt(T)
    sigma * sqrt(T) = 0.10

The expected move (in standard deviations) for a straddle:
  Expected |move| = straddle_price / stock_price
                   = 8 / 100 = 8%

This means the market expects approximately an 8% move in
either direction by expiration.

More precisely, the break-even points are at:
  Upper: 100 + 8 = 108
  Lower: 100 - 8 = 92

If this is a 30-day option:
  sigma * sqrt(30/365) = 0.10
  sigma = 0.10 / 0.2867 = 34.9% implied volatility

Expected daily move = sigma / sqrt(252) = 34.9% / 15.87 = 2.2%
Expected 30-day move = 34.9% * sqrt(30/365) = 10.0%

Note: Straddle break-even (8%) < expected move (10%) because
the straddle has a non-linear payoff (convexity benefit).
```

### Problem 5: Pin Risk

**Q: You have sold 1000 contracts of an at-the-money call option with the stock at $50 and the option expires tomorrow. What risks do you face?**

**A:**
```
PIN RISK SCENARIO
==================

Position: Short 1000 ATM calls at strike $50
Each contract = 100 shares
Total exposure: 100,000 shares

If stock closes at exactly $50:
  - You DON'T KNOW if the calls will be exercised
  - Some holders exercise, some don't
  - You could be assigned on anywhere from 0 to 100% of contracts
  - If you hedged at 0.5 delta (short 50,000 shares):
    * If 100% exercised: you owe 100K shares, have 50K -> short 50K more
    * If 0% exercised: you have 50K shares to unwind at open
    * HUGE uncertainty in position size

Risks:
1. ASSIGNMENT UNCERTAINTY: Binary outcome on exercise
2. GAMMA EXPLOSION: ATM gamma approaches infinity near expiry
   Gamma ~ phi(0) / (S * sigma * sqrt(dt))
   As dt -> 0, gamma -> infinity for ATM options
3. AFTER-HOURS RISK: Stock can move after close but before
   exercise decision deadline (typically 5:30 PM ET)
4. HEDGING IMPOSSIBLE: Cannot delta-hedge accurately when
   delta flips between 0 and 1

Mitigation:
- Roll or close position before last day
- Use wide spread quotes on expiration day
- Reduce position size as expiry approaches
- Accept the binary risk and size accordingly
```

### Problem 6: Calendar Spread

**Q: You believe volatility will increase in 2 months but not immediately. What options strategy would you use?**

**A:**
```
LONG CALENDAR SPREAD (Long Vega, Short Gamma near-term)

Strategy: Sell near-term ATM option, buy longer-term ATM option

Example:
  Sell 1-month ATM call at $100 strike -> receive $3.50
  Buy 3-month ATM call at $100 strike -> pay $6.00
  Net debit: $2.50

Why this works:
1. Near-term option has less vega -> small loss when vol rises
2. Far-term option has more vega -> large gain when vol rises
3. Net vega is POSITIVE (you benefit from vol increase)
4. Near-term theta decays faster -> you collect theta difference

Greek profile:
  Net Delta:  ~0 (both ATM)
  Net Gamma:  Negative (short near-term gamma dominates)
  Net Theta:  Positive (short near-term decays faster)
  Net Vega:   Positive (long far-term vega dominates)

Risk:
- If vol increases IMMEDIATELY and stock moves a lot,
  you lose on the short near-term option (gamma risk)
- Maximum profit when near-term expires with stock at strike
  and long-term IV has increased

Alternative: DIAGONAL SPREAD (calendar + directional view)
  Sell near-term ATM, buy longer-term slightly OTM
  Adds directional bias to the vol view
```

---

## 10. Key Formulas Reference

```
+------------------------------------------------------------+
| OPTIONS FORMULAS CHEAT SHEET                                |
+------------------------------------------------------------+
| d1 = [ln(S/K) + (r + sig^2/2)*T] / (sig*sqrt(T))        |
| d2 = d1 - sig*sqrt(T)                                     |
| C  = S*N(d1) - K*e^(-rT)*N(d2)                           |
| P  = K*e^(-rT)*N(-d2) - S*N(-d1)                         |
| Put-Call: C - P = S - K*e^(-rT)                           |
| Delta_C = N(d1), Delta_P = N(d1) - 1                     |
| Gamma = phi(d1) / (S*sig*sqrt(T))                         |
| Vega = S*sqrt(T)*phi(d1)                                  |
| Theta_C = -S*phi(d1)*sig/(2*sqrt(T)) - rKe^(-rT)*N(d2)  |
| Straddle ~= 0.8 * S * sig * sqrt(T)                      |
| Gamma P&L = 0.5 * Gamma * S^2 * (realized^2 - implied^2) |
+------------------------------------------------------------+
```

---

*Next Chapter: [Chapter 8 - Game Theory, Auctions & Strategic Thinking](08-GAME-THEORY-AND-AUCTIONS.md)*
