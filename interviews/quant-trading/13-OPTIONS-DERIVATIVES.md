# Chapter 13: Options & Derivatives Pricing

## Introduction

Derivatives are the Swiss Army knife of quantitative finance. They allow traders to express precise views on direction, volatility, correlation, and the shape of probability distributions. A quant who cannot price, hedge, and trade derivatives is missing arguably the most intellectually rich and commercially important toolset in finance.

This chapter takes you from first principles through to production-ready pricing models. By the end, you will understand how derivatives are structured, priced, hedged, and traded in real markets.

```
+------------------------------------------------------------------------+
|                    DERIVATIVES PRICING LANDSCAPE                        |
+------------------------------------------------------------------------+
|                                                                        |
|  FUNDAMENTALS          PRICING MODELS         ADVANCED TOPICS          |
|  +-----------------+   +-----------------+   +--------------------+    |
|  | Forwards/Futures|   | Black-Scholes   |   | Exotic Options     |    |
|  | Options Basics  |   | Binomial Trees  |   | Stochastic Vol     |    |
|  | Put-Call Parity |   | Monte Carlo     |   | Local Vol          |    |
|  | Swaps           |   | Greeks          |   | Interest Rate Deriv|    |
|  +-----------------+   +-----------------+   +--------------------+    |
|                                                                        |
|  VOLATILITY            STRATEGIES             RISK MANAGEMENT          |
|  +-----------------+   +-----------------+   +--------------------+    |
|  | Implied Vol     |   | Vol Trading     |   | Delta Hedging      |    |
|  | Vol Surface     |   | Gamma Scalping  |   | Portfolio Greeks    |    |
|  | VIX             |   | Dispersion      |   | Tail Risk          |    |
|  | Smile/Skew      |   | Skew Trading    |   | Stress Testing     |    |
|  +-----------------+   +-----------------+   +--------------------+    |
|                                                                        |
+------------------------------------------------------------------------+
```

---

## 1. Derivatives Fundamentals

### What Is a Derivative?

A **derivative** is a financial contract whose value is _derived_ from an underlying asset, rate, or index. The underlying can be a stock, bond, commodity, currency, interest rate, or even another derivative.

```
DERIVATIVE VALUE CHAIN
======================

  Underlying Asset          Derivative Contract         Market Value
  +---------------+        +-------------------+       +-----------+
  | Stock: AAPL   | -----> | Call Option on    | ----> | Premium:  |
  | Price: $150   |        | AAPL, Strike $155 |       | $3.50     |
  +---------------+        | Expiry: 30 days   |       +-----------+
                            +-------------------+
                                    |
                            Derives its value from
                            the underlying stock price
```

**Why do derivatives exist?**

1. **Hedging**: Farmers lock in crop prices with futures. Airlines hedge fuel costs.
2. **Speculation**: Express leveraged directional or volatility views.
3. **Arbitrage**: Exploit mispricings between derivative and underlying.
4. **Income generation**: Sell options premium for steady returns.
5. **Access**: Gain exposure to assets that are hard to trade directly.

### Forward Contracts

A **forward contract** is the simplest derivative: an agreement to buy or sell an asset at a specified price on a future date.

```
FORWARD CONTRACT STRUCTURE
==========================

  Today (t=0)                              Expiry (t=T)
  +---------------------------+            +---------------------------+
  | Buyer and seller agree:   |            | Settlement:               |
  | - Asset: 100 shares AAPL  |  ------->  | If S(T) > K: buyer profits|
  | - Forward price: K = $155 |            | If S(T) < K: seller profits|
  | - Delivery date: T        |            | Payoff = S(T) - K         |
  | - No money changes hands  |            +---------------------------+
  +---------------------------+

  S(T) = spot price at expiry
  K    = agreed forward price
```

**Forward pricing (cost of carry model)**:

The no-arbitrage forward price for a non-dividend-paying asset:

```
F = S * e^(r * T)

Where:
  F = forward price
  S = current spot price
  r = risk-free rate (continuously compounded)
  T = time to expiry (in years)
```

With continuous dividend yield `q`:

```
F = S * e^((r - q) * T)
```

With storage costs `u` (for commodities):

```
F = S * e^((r + u - y) * T)

Where y = convenience yield
```

**Payoff diagrams**:

```
LONG FORWARD PAYOFF                    SHORT FORWARD PAYOFF
(agreed to BUY at K)                   (agreed to SELL at K)

Profit                                 Profit
  |          /                           |    \
  |        /                             |      \
  |      /                               |        \
  |    /                                 |          \
  |  /                                   |            \
--+------------ S(T)                   --+------------ S(T)
  |/   K                                |\   K
  /                                      | \
/|                                       |   \
  |                                      |     \
  |                                      |       \
Loss                                   Loss

Payoff(long)  = S(T) - K               Payoff(short) = K - S(T)
```

```python
import numpy as np

def forward_price(spot, rate, time, div_yield=0.0):
    """Calculate the theoretical forward price."""
    return spot * np.exp((rate - div_yield) * time)

def forward_payoff(spot_at_expiry, forward_price, position='long'):
    """Calculate forward contract payoff at expiry."""
    if position == 'long':
        return spot_at_expiry - forward_price
    return forward_price - spot_at_expiry

# Example
S = 100       # current spot price
r = 0.05      # 5% risk-free rate
T = 0.5       # 6 months
q = 0.02      # 2% dividend yield

F = forward_price(S, r, T, q)
print(f"Forward price: ${F:.2f}")  # $101.51

# Payoff at expiry if spot = $110
payoff = forward_payoff(110, F, 'long')
print(f"Long forward payoff: ${payoff:.2f}")  # $8.49
```

### Futures Contracts

A **futures contract** is a standardized forward contract traded on an exchange. The key difference: **daily mark-to-market settlement**.

```
FUTURES vs FORWARDS
====================

Feature          | Forward              | Futures
-----------------+----------------------+----------------------
Trading venue    | OTC (bilateral)      | Exchange-traded
Standardization  | Customizable         | Standardized
Counterparty risk| Yes (credit risk)    | Clearinghouse guarantees
Settlement       | At expiry            | Daily mark-to-market
Margin           | None (or negotiated) | Initial + maintenance
Liquidity        | Low                  | High
Regulation       | Minimal              | Heavily regulated
```

**Margin and mark-to-market**:

```
DAILY SETTLEMENT EXAMPLE (Long 1 Crude Oil Future, $75.00 entry)
================================================================

Day  | Settle Price | Daily P&L  | Cumulative | Margin Balance | Action
-----+--------------+------------+------------+----------------+---------
  0  |   $75.00     |     --     |     --     |   $5,000       | Open
  1  |   $76.20     |  +$1,200   |  +$1,200   |   $6,200       |
  2  |   $74.80     |  -$1,400   |    -$200   |   $4,800       |
  3  |   $73.50     |  -$1,300   |  -$1,500   |   $3,500       | Margin call!
  4  |   $74.90     |  +$1,400   |    -$100   |   $6,400*      | *after deposit
  5  |   $76.00     |  +$1,100   |  +$1,000   |   $7,500       |

Contract size: 1,000 barrels
Daily P&L = (Settle_today - Settle_yesterday) * 1,000
Initial margin: $5,000
Maintenance margin: $3,750
```

### Swaps

A **swap** is an agreement to exchange cash flows over time. The most common types:

**Interest Rate Swap (IRS)**:

```
PLAIN VANILLA INTEREST RATE SWAP
================================

  Party A (Fixed Payer)                    Party B (Float Payer)
  +-------------------+                   +-------------------+
  |                   |  Fixed: 3.5%/yr   |                   |
  |  Corporation      | ----------------> |  Bank             |
  |  (wants floating) |                   |  (wants fixed)    |
  |                   | <---------------- |                   |
  |                   | Float: SOFR+0.5%  |                   |
  +-------------------+                   +-------------------+

  Notional: $100M (not exchanged)
  Tenor: 5 years
  Payment frequency: Semi-annual

  Net payment each period:
  If SOFR = 3.0%: Party A pays (3.5% - 3.5%) * $100M / 2 = $0
  If SOFR = 4.0%: Party B pays (4.5% - 3.5%) * $100M / 2 = $500K to A
  If SOFR = 2.0%: Party A pays (3.5% - 2.5%) * $100M / 2 = $500K to B
```

**Total Return Swap (TRS)**:

```
TOTAL RETURN SWAP
=================

  Hedge Fund                               Dealer Bank
  +-------------------+                   +-------------------+
  |                   | Total return on   |                   |
  |  Gets exposure    | <---------------- |  Owns the asset   |
  |  without owning   |  reference asset  |                   |
  |  the asset        | ----------------> |  Gets financing   |
  |                   | SOFR + spread     |  return            |
  +-------------------+                   +-------------------+

  Use case: Hedge fund gets leveraged exposure
  to an asset without actually purchasing it
```

```python
def swap_fixed_leg(notional, fixed_rate, periods, freq=2):
    """Calculate fixed leg cash flows for an interest rate swap."""
    payment = notional * fixed_rate / freq
    return [payment] * periods

def swap_floating_leg(notional, floating_rates, freq=2):
    """Calculate floating leg cash flows."""
    return [notional * rate / freq for rate in floating_rates]

def swap_value(notional, fixed_rate, floating_rates, freq=2):
    """Net value from fixed payer's perspective."""
    fixed_payments = swap_fixed_leg(notional, fixed_rate, len(floating_rates), freq)
    float_payments = swap_floating_leg(notional, floating_rates, freq)
    net_payments = [f - x for f, x in zip(float_payments, fixed_payments)]
    return net_payments

# Example: 2-year swap, semi-annual
notional = 100_000_000  # $100M
fixed_rate = 0.035       # 3.5%
sofr_path = [0.030, 0.032, 0.038, 0.041]  # realized SOFR rates

spread = 0.005  # 50bps spread
floating_rates = [s + spread for s in sofr_path]

net = swap_value(notional, fixed_rate, floating_rates)
for i, pmt in enumerate(net):
    print(f"Period {i+1}: Net payment = ${pmt:,.0f}")
```

---

## 2. Options Basics

### Call and Put Options

An **option** gives the holder the _right but not the obligation_ to buy (call) or sell (put) an underlying asset at a specified price (strike) on or before a specified date (expiry).

```
OPTION TERMINOLOGY
==================

  CALL OPTION                              PUT OPTION
  Right to BUY at strike K                 Right to SELL at strike K

  Buyer pays premium upfront               Buyer pays premium upfront
  Seller (writer) receives premium          Seller (writer) receives premium
  Buyer has limited risk (premium)          Buyer has limited risk (premium)
  Seller has unlimited risk (calls)         Seller risk limited to K (puts)
```

**American vs European**:

```
EXERCISE STYLES
===============

European: Can ONLY exercise at expiry
  |------ waiting period ------|X|  (exercise only at X)

American: Can exercise ANY TIME up to expiry
  |X---X---X---X---X---X---X--X|  (exercise at any X)

Bermudan: Can exercise on specific dates
  |------X---------X---------X|  (exercise at marked dates)

Note: American options >= European options in value
      (more flexibility can never hurt the holder)
```

### Moneyness

```
MONEYNESS (for a CALL option with strike K = $100)
==================================================

  In-The-Money (ITM)    At-The-Money (ATM)    Out-of-The-Money (OTM)
  S > K                 S ≈ K                  S < K
  S = $110              S = $100               S = $90

  +---------+           +---------+            +---------+
  |  CALL   |           |  CALL   |            |  CALL   |
  | Intrinsic|          | Intrinsic|           | Intrinsic|
  | = $10   |           | = $0    |            | = $0    |
  +---------+           +---------+            +---------+

  For PUTS, it's reversed:
  ITM: S < K    ATM: S ≈ K    OTM: S > K
```

### Intrinsic Value vs Time Value

```
OPTION VALUE DECOMPOSITION
==========================

  Option Premium = Intrinsic Value + Time Value

  Intrinsic Value:
    Call: max(S - K, 0)
    Put:  max(K - S, 0)

  Time Value:
    The extra premium above intrinsic value
    Reflects probability of favorable movement
    Decays as expiry approaches (theta decay)

  Example: AAPL Call, K=$150, S=$155, Premium=$8.00
    Intrinsic = max(155 - 150, 0) = $5.00
    Time Value = $8.00 - $5.00 = $3.00

  Option Value
  $8 |          ___________
     |        /            \      <-- Time Value
  $5 |------/-----          \
     |    /  |   Intrinsic   \
  $0 |__/    |   Value        \___
     +-------+---+---+---+---+---->
     $140  $145 $150 $155 $160     Stock Price
```

### Option Payoff Diagrams

```
LONG CALL (Buy Call, K=100, Premium=5)    LONG PUT (Buy Put, K=100, Premium=5)

Profit                                    Profit
  |           /                             |\
  |          /                              | \
  |         /                               |  \
  |        /                                |   \
-5|-------*         breakeven=105         -5|    *------- breakeven=95
  |      K=100                              |       K=100
  |                                         |
Loss                                      Loss


SHORT CALL (Sell Call, K=100, Premium=5)   SHORT PUT (Sell Put, K=100, Premium=5)

Profit                                    Profit
  |                                         |
 5|-------*                                5|        *-------
  |        \       breakeven=105            |       /  breakeven=95
  |         \                               |      /
  |          \                              |     /
  |           \                             |    /
  |                                         |   /
Loss                                      Loss
```

### Put-Call Parity

The fundamental relationship linking European calls, puts, the underlying, and the risk-free bond:

```
PUT-CALL PARITY
===============

  C - P = S - K * e^(-rT)

  Where:
    C = European call price
    P = European put price
    S = current stock price
    K = strike price
    r = risk-free rate
    T = time to expiry

  Rearranged forms:
    C = P + S - K * e^(-rT)     (synthetic call)
    P = C - S + K * e^(-rT)     (synthetic put)
    S = C - P + K * e^(-rT)     (synthetic stock)

  ARBITRAGE TABLE:
  If C - P > S - K*e^(-rT):     If C - P < S - K*e^(-rT):
    Sell call                       Buy call
    Buy put                        Sell put
    Buy stock                      Short stock
    Borrow K*e^(-rT)               Invest K*e^(-rT)
```

```python
import numpy as np

def put_call_parity_check(call_price, put_price, spot, strike, rate, time):
    """Verify put-call parity. Returns the discrepancy."""
    lhs = call_price - put_price
    rhs = spot - strike * np.exp(-rate * time)
    discrepancy = lhs - rhs
    print(f"C - P = {lhs:.4f}")
    print(f"S - K*e^(-rT) = {rhs:.4f}")
    print(f"Discrepancy = {discrepancy:.4f}")
    if abs(discrepancy) > 0.01:
        print("ARBITRAGE OPPORTUNITY DETECTED!")
    else:
        print("Parity holds (within tolerance)")
    return discrepancy

# Example
put_call_parity_check(
    call_price=10.45,
    put_price=5.52,
    spot=100,
    strike=95,
    rate=0.05,
    time=0.5
)
```

### Option Chains

```
AAPL OPTION CHAIN - Expiry: March 15, 2026
===========================================

                    CALLS                    |                    PUTS
Bid    Ask    Last   Vol    OI    Strike      |  Bid    Ask    Last   Vol    OI
15.20  15.50  15.35   2451  12340   140      |  0.85   0.92   0.88    890   5670
10.60  10.85  10.72   5234  18920   145      |  1.55   1.65   1.60   1230   8910
 6.80   7.00   6.90   8901  25670   150  ATM |  2.70   2.85   2.78   2340  11230
 3.90   4.10   4.00   6540  21340   155      |  4.80   4.95   4.88   1890   9870
 2.00   2.15   2.08   4320  16780   160      |  7.85   8.05   7.95   1120   7650

Vol = Volume (contracts traded today)
OI  = Open Interest (total outstanding contracts)
ATM = At-The-Money (strike nearest to current price ~$150)
```

### Common Option Strategies

**Bull Call Spread**:

```
BULL CALL SPREAD: Buy Call K1, Sell Call K2 (K1 < K2)
=====================================================
Example: Buy $100 Call (-$8), Sell $110 Call (+$3), Net cost = $5

Profit
  |
 5|              *-----------   max profit = (K2-K1) - net cost = $5
  |            /
  |          /
  |        /
  0|------*                     breakeven = K1 + net cost = $105
  |      K1=100
 -5|-----*                      max loss = net cost = $5
  |           K2=110
  +------+----+----+-----------
        100  105  110          Stock Price
```

**Straddle** (long volatility):

```
LONG STRADDLE: Buy Call + Buy Put at same strike K
===================================================
Example: K=$100, Call=$5, Put=$4, Total cost=$9

Profit
  |\               /|
  | \             / |
  |  \           /  |
  |   \         /   |
  |    \       /    |
 0|-----*-----*-----
  |      \   /      breakeven: K-9=$91 and K+9=$109
  |       \ /
-9|        *         max loss = total premium = $9
  |       K=100
  +---+---+---+---+---
     85   91 100 109 115    Stock Price

Best when: Expecting BIG move, direction unknown
```

**Strangle** (cheaper long volatility):

```
LONG STRANGLE: Buy OTM Call (K2) + Buy OTM Put (K1), K1 < K2
==============================================================
Example: Buy $95 Put ($2), Buy $105 Call ($2), Total cost=$4

Profit
 |\                     /|
 | \                   / |
 |  \                 /  |
 |   \               /   |
  0|---*-------------*---
  |    \             /    breakeven: $91 and $109
  |     \___________/
 -4|         *            max loss = $4 (between strikes)
  |     K1=95   K2=105
  +--+---+---+---+---+--
    85  91  95 105 109 115   Stock Price
```

**Butterfly Spread**:

```
LONG BUTTERFLY: Buy 1x K1 Call, Sell 2x K2 Call, Buy 1x K3 Call
================================================================
K1 < K2 < K3, K2 = (K1+K3)/2
Example: Buy $95C, Sell 2x $100C, Buy $105C, Net cost=$1

Profit
  |
 4|        *               max profit = K2-K1 - cost = $4
  |       / \
  |      /   \
  |     /     \
  |    /       \
 0|---*----+----*---
  |  K1   K2   K3         breakeven: K1+cost and K3-cost
-1|--*              *--   max loss = net cost = $1
  |  95  100  105
  +---+---+---+---+---
     90  95 100 105 110    Stock Price
```

**Iron Condor** (sell volatility):

```
IRON CONDOR: Bull Put Spread + Bear Call Spread
================================================
Sell K2 Put, Buy K1 Put, Sell K3 Call, Buy K4 Call
Example: Buy $90P, Sell $95P, Sell $105C, Buy $110C, Net credit=$3

Profit
  |
 3|       *-----------*        max profit = net credit = $3
  |      /             \
 0|-----*---+---+---+---*---
  |    /  K2         K3  \    breakeven: K2-credit and K3+credit
  |   /   95  100  105    \
-2|--*                     *-- max loss = width - credit = $2
  | K1=90             K4=110
  +--+---+---+---+---+---+--
    85  90  95 100 105 110 115  Stock Price

Best when: Expecting LOW volatility, range-bound market
```

---

## 3. The Black-Scholes Model

### Assumptions

The Black-Scholes model rests on several idealized assumptions:

```
BLACK-SCHOLES ASSUMPTIONS
=========================

1. Stock price follows geometric Brownian motion (GBM):
   dS = mu*S*dt + sigma*S*dW

2. Volatility (sigma) is constant over the option's life
3. Risk-free rate (r) is constant and known
4. No dividends during the option's life
5. No transaction costs or taxes
6. Continuous trading is possible
7. No arbitrage opportunities
8. European exercise only
9. Markets are frictionless and liquid

REALITY CHECK:
  Assumption          | Reality
  --------------------+----------------------------------
  Constant vol        | Vol changes constantly (smile/skew)
  No dividends        | Most stocks pay dividends
  Continuous trading   | Markets close, gaps happen
  No transaction costs | Commissions, bid-ask spreads
  Log-normal returns   | Fat tails, skewness observed
  Constant rates       | Interest rates fluctuate
```

### Derivation Intuition

The key insight: **you can replicate an option's payoff by continuously delta-hedging with the underlying stock and a risk-free bond**. Since the replicating portfolio and the option have the same payoff, they must have the same price (no arbitrage).

```
REPLICATING PORTFOLIO INTUITION
================================

  Option Value = Delta * Stock + Bond Position

  At each instant:
  1. Hold Delta shares of stock
  2. Borrow/lend at risk-free rate
  3. Adjust Delta as stock moves
  4. Portfolio perfectly tracks option value

  Since the hedge eliminates ALL risk:
  - The option's expected return must equal the risk-free rate
  - This gives us "risk-neutral pricing"
  - We can replace mu with r in the drift term

  RISK-NEUTRAL PRICING:
  Option Price = e^(-rT) * E_Q[Payoff]

  Where E_Q is expectation under the risk-neutral measure
  (stock drifts at r, not mu)
```

### The Black-Scholes Formula

```
BLACK-SCHOLES FORMULAS
======================

CALL:  C = S*N(d1) - K*e^(-rT)*N(d2)
PUT:   P = K*e^(-rT)*N(-d2) - S*N(-d1)

Where:
         ln(S/K) + (r + sigma^2/2)*T
  d1 = --------------------------------
              sigma * sqrt(T)

  d2 = d1 - sigma * sqrt(T)

  N(x) = cumulative standard normal distribution
  S    = current stock price
  K    = strike price
  r    = risk-free rate (continuous)
  T    = time to expiry (years)
  sigma = volatility (annualized)
```

### Worked Numerical Example

```
EXAMPLE: Price a European Call Option
======================================

Given:
  S     = $100    (stock price)
  K     = $105    (strike price)
  r     = 5%      (risk-free rate)
  sigma = 20%     (volatility)
  T     = 0.5     (6 months)

Step 1: Calculate d1
  d1 = [ln(100/105) + (0.05 + 0.04/2)*0.5] / (0.20 * sqrt(0.5))
     = [ln(0.9524) + (0.07)*0.5] / (0.20 * 0.7071)
     = [-0.04879 + 0.035] / 0.14142
     = -0.01379 / 0.14142
     = -0.09752

Step 2: Calculate d2
  d2 = -0.09752 - 0.20 * sqrt(0.5)
     = -0.09752 - 0.14142
     = -0.23894

Step 3: Look up N(d1) and N(d2)
  N(-0.09752) = 0.4612
  N(-0.23894) = 0.4055

Step 4: Calculate call price
  C = 100 * 0.4612 - 105 * e^(-0.05*0.5) * 0.4055
    = 46.12 - 105 * 0.9753 * 0.4055
    = 46.12 - 41.52
    = $4.60

Step 5: Put price via put-call parity
  P = C - S + K*e^(-rT)
    = 4.60 - 100 + 105*0.9753
    = 4.60 - 100 + 102.41
    = $7.01
```

### Python Implementation

```python
import numpy as np
from scipy.stats import norm

def black_scholes(S, K, T, r, sigma, option_type='call'):
    """
    Black-Scholes option pricing formula.

    Parameters:
        S: Current stock price
        K: Strike price
        T: Time to expiry (years)
        r: Risk-free rate (continuous)
        sigma: Volatility (annualized)
        option_type: 'call' or 'put'

    Returns:
        Option price
    """
    d1 = (np.log(S / K) + (r + sigma**2 / 2) * T) / (sigma * np.sqrt(T))
    d2 = d1 - sigma * np.sqrt(T)

    if option_type == 'call':
        price = S * norm.cdf(d1) - K * np.exp(-r * T) * norm.cdf(d2)
    elif option_type == 'put':
        price = K * np.exp(-r * T) * norm.cdf(-d2) - S * norm.cdf(-d1)
    else:
        raise ValueError("option_type must be 'call' or 'put'")

    return price

def black_scholes_with_dividends(S, K, T, r, sigma, q, option_type='call'):
    """Black-Scholes with continuous dividend yield q."""
    d1 = (np.log(S / K) + (r - q + sigma**2 / 2) * T) / (sigma * np.sqrt(T))
    d2 = d1 - sigma * np.sqrt(T)

    if option_type == 'call':
        price = (S * np.exp(-q * T) * norm.cdf(d1)
                 - K * np.exp(-r * T) * norm.cdf(d2))
    elif option_type == 'put':
        price = (K * np.exp(-r * T) * norm.cdf(-d2)
                 - S * np.exp(-q * T) * norm.cdf(-d1))
    else:
        raise ValueError("option_type must be 'call' or 'put'")

    return price

# Verify with our worked example
call_price = black_scholes(S=100, K=105, T=0.5, r=0.05, sigma=0.20, option_type='call')
put_price = black_scholes(S=100, K=105, T=0.5, r=0.05, sigma=0.20, option_type='put')

print(f"Call price: ${call_price:.2f}")  # $4.60
print(f"Put price:  ${put_price:.2f}")   # $7.01

# Verify put-call parity
parity_check = call_price - put_price - (100 - 105 * np.exp(-0.05 * 0.5))
print(f"Put-call parity error: {parity_check:.10f}")  # ~0
```

### Limitations of Black-Scholes

```
WHEN BLACK-SCHOLES BREAKS DOWN
===============================

Problem                | Consequence                  | Fix
-----------------------+------------------------------+-------------------
Constant vol assumption| Misprices OTM options         | Stochastic vol
Fat tails in returns   | Underestimates tail risk      | Jump-diffusion
No dividends           | Overprices calls on div stocks| Adjust for divs
Continuous hedging     | Impossible in practice        | Discrete hedging
No transaction costs   | Hedging costs ignored         | Utility models
European only          | Cannot price American options | Binomial/MC
Constant rates         | Wrong for long-dated options  | Stochastic rates

The volatility smile/skew is PROOF that Black-Scholes is wrong:
If BS were correct, implied vol would be the same for all strikes.
It isn't. Markets know about fat tails and jumps.
```

---

## 4. The Greeks

The Greeks measure an option's sensitivity to various factors. They are essential for hedging and risk management.

```
THE GREEKS AT A GLANCE
======================

Greek  | Measures                    | Formula (Call)
-------+-----------------------------+---------------------------
Delta  | dC/dS  (price sensitivity)  | N(d1)
Gamma  | d²C/dS² (delta sensitivity)| n(d1) / (S*sigma*sqrt(T))
Theta  | dC/dT  (time decay)         | -(S*n(d1)*sigma)/(2*sqrt(T)) - r*K*e^(-rT)*N(d2)
Vega   | dC/dsigma (vol sensitivity) | S*sqrt(T)*n(d1)
Rho    | dC/dr  (rate sensitivity)   | K*T*e^(-rT)*N(d2)

n(x) = standard normal PDF = (1/sqrt(2*pi)) * e^(-x^2/2)
N(x) = standard normal CDF
```

### Delta

```
DELTA: Sensitivity of option price to underlying price
======================================================

                Call Delta                    Put Delta
  Delta                                Delta
  1.0|          ___________            0.0|___________
     |        /                           |            \
     |      /                             |              \
  0.5|    /     <-- ATM delta ~0.5    -0.5|                \ <-- ATM ~-0.5
     |  /                                 |                  \
     |/                                   |                    \
  0.0|___________                     -1.0|                     ___________
     +------------ S                      +------------ S
          K                                    K

Interpretation:
  Delta = 0.6 means: for every $1 stock moves up,
  the call gains approximately $0.60

  Delta also approximates:
  - Probability the option expires ITM (roughly)
  - Number of shares to hedge 1 option contract
```

**Delta hedging**:

```
DELTA HEDGING EXAMPLE
=====================

You sold 100 call options (each on 100 shares) with delta = 0.55

Exposure: -100 * 100 * 0.55 = -5,500 share-equivalents
  (you are short 5,500 deltas)

To hedge: BUY 5,500 shares

After hedge:
  Portfolio delta = -5,500 (options) + 5,500 (shares) = 0
  You are "delta neutral"

Next day, stock moves up, delta becomes 0.62:
  New option exposure: -100 * 100 * 0.62 = -6,200
  Current share position: +5,500
  Net delta: -6,200 + 5,500 = -700
  Action: Buy 700 more shares to rebalance
```

### Gamma

```
GAMMA: Rate of change of delta
===============================

  Gamma
    |
    |       *
    |      / \
    |     /   \
    |    /     \
    |   /       \
    |  /         \
    | /           \
    |/             \___________
    +------------ S
         K

  Gamma peaks at ATM and near expiry
  Long options: positive gamma (good - delta moves in your favor)
  Short options: negative gamma (bad - delta moves against you)

  GAMMA RISK near expiry:

  Far from expiry:                Near expiry:
  Gamma                           Gamma
    |   ___                         |       |
    |  /   \                        |       |
    | /     \                       |      /|\
    |/       \___                   |     / | \
    +------------ S                 +----/--+--\--- S
         K                              K

  Near expiry, ATM gamma becomes HUGE (pin risk)
  Small stock moves cause large delta swings
```

### Theta

```
THETA: Time decay
=================

  Option Value vs Time

  Value
    |  \_
    |    \_
    |      \_
    |        \__
    |           \__
    |              \___
    |                  \____
    |                       \___
    |                           \
    +---+---+---+---+---+---+---+
    1yr     6mo     3mo    Expiry

  Theta is NEGATIVE for long options (time works against you)
  Theta is POSITIVE for short options (time works for you)

  ATM theta is largest:
  - ATM options have the most time value to lose
  - Theta accelerates as expiry approaches
  - "Theta burn" intensifies in the last 30 days

  Rule of thumb: ATM option loses ~1/sqrt(T) of its value per day
```

### Vega

```
VEGA: Sensitivity to implied volatility
========================================

  Vega
    |
    |       *
    |      / \
    |     /   \
    |    /     \
    |   /       \
    |  /         \
    | /           \___
    |/                 \___
    +------------ S
         K

  Vega peaks at ATM, decreases for deep ITM/OTM
  Longer-dated options have MORE vega

  Key insight:
    Vega risk is often LARGER than delta risk
    A 1% change in implied vol can move an option price
    more than a 1% change in the underlying

  Vega by expiry:
    30-day option:  vega ~ $0.10 per 1% vol change
    90-day option:  vega ~ $0.17 per 1% vol change
    365-day option: vega ~ $0.35 per 1% vol change
```

### Second-Order Greeks

```
SECOND-ORDER GREEKS
===================

Vanna = d(Delta)/d(sigma) = d(Vega)/d(S)
  How delta changes when vol changes
  Important for volatility traders

Volga (Vomma) = d(Vega)/d(sigma) = d²C/d(sigma)²
  How vega changes when vol changes
  Key for pricing vol-of-vol risk

Charm = d(Delta)/d(T) = -d(Theta)/d(S)
  How delta changes with time passage
  Critical for overnight delta hedging

Speed = d(Gamma)/d(S)
  How gamma changes with underlying
  Third derivative of price w.r.t. S

Color = d(Gamma)/d(T)
  How gamma changes over time
  Important for gamma traders near expiry
```

### Python Implementation of All Greeks

```python
import numpy as np
from scipy.stats import norm

class BlackScholesGreeks:
    """Complete Black-Scholes Greeks calculator."""

    def __init__(self, S, K, T, r, sigma, q=0.0):
        self.S = S
        self.K = K
        self.T = T
        self.r = r
        self.sigma = sigma
        self.q = q

        self.d1 = ((np.log(S / K) + (r - q + sigma**2 / 2) * T)
                    / (sigma * np.sqrt(T)))
        self.d2 = self.d1 - sigma * np.sqrt(T)

        self._nd1 = norm.pdf(self.d1)   # standard normal PDF at d1
        self._Nd1 = norm.cdf(self.d1)   # standard normal CDF at d1
        self._Nd2 = norm.cdf(self.d2)

    def price(self, option_type='call'):
        S, K, T, r, q = self.S, self.K, self.T, self.r, self.q
        if option_type == 'call':
            return (S * np.exp(-q * T) * self._Nd1
                    - K * np.exp(-r * T) * self._Nd2)
        return (K * np.exp(-r * T) * norm.cdf(-self.d2)
                - S * np.exp(-q * T) * norm.cdf(-self.d1))

    def delta(self, option_type='call'):
        factor = np.exp(-self.q * self.T)
        if option_type == 'call':
            return factor * self._Nd1
        return factor * (self._Nd1 - 1)

    def gamma(self):
        """Same for calls and puts."""
        return (np.exp(-self.q * self.T) * self._nd1
                / (self.S * self.sigma * np.sqrt(self.T)))

    def theta(self, option_type='call'):
        S, K, T, r, sigma, q = self.S, self.K, self.T, self.r, self.sigma, self.q
        term1 = -(S * np.exp(-q * T) * self._nd1 * sigma) / (2 * np.sqrt(T))
        if option_type == 'call':
            term2 = -r * K * np.exp(-r * T) * self._Nd2
            term3 = q * S * np.exp(-q * T) * self._Nd1
            return (term1 + term2 + term3) / 365  # daily theta
        term2 = r * K * np.exp(-r * T) * norm.cdf(-self.d2)
        term3 = -q * S * np.exp(-q * T) * norm.cdf(-self.d1)
        return (term1 + term2 + term3) / 365

    def vega(self):
        """Same for calls and puts. Per 1% vol move."""
        return (self.S * np.exp(-self.q * self.T)
                * np.sqrt(self.T) * self._nd1 / 100)

    def rho(self, option_type='call'):
        """Per 1% rate move."""
        if option_type == 'call':
            return (self.K * self.T * np.exp(-self.r * self.T)
                    * self._Nd2 / 100)
        return (-self.K * self.T * np.exp(-self.r * self.T)
                * norm.cdf(-self.d2) / 100)

    def vanna(self):
        """d(delta)/d(sigma) = d(vega)/d(S)."""
        return (-np.exp(-self.q * self.T) * self._nd1
                * self.d2 / self.sigma)

    def volga(self):
        """d(vega)/d(sigma), also called vomma."""
        vega_raw = (self.S * np.exp(-self.q * self.T)
                    * np.sqrt(self.T) * self._nd1)
        return vega_raw * self.d1 * self.d2 / self.sigma

    def charm(self, option_type='call'):
        """d(delta)/d(T), daily."""
        S, K, T, r, sigma, q = self.S, self.K, self.T, self.r, self.sigma, self.q
        factor = np.exp(-q * T) * self._nd1
        term = (2 * (r - q) * T - self.d2 * sigma * np.sqrt(T)) / (2 * T * sigma * np.sqrt(T))
        if option_type == 'call':
            return (-q * np.exp(-q * T) * self._Nd1 + factor * term) / 365
        return (-q * np.exp(-q * T) * (self._Nd1 - 1) + factor * term) / 365

    def summary(self, option_type='call'):
        """Print all Greeks."""
        print(f"{'='*50}")
        print(f"Black-Scholes Greeks Summary ({option_type.upper()})")
        print(f"{'='*50}")
        print(f"S={self.S}, K={self.K}, T={self.T:.3f}, "
              f"r={self.r:.2%}, sigma={self.sigma:.2%}, q={self.q:.2%}")
        print(f"{'='*50}")
        print(f"Price:   ${self.price(option_type):.4f}")
        print(f"Delta:   {self.delta(option_type):.4f}")
        print(f"Gamma:   {self.gamma():.4f}")
        print(f"Theta:   ${self.theta(option_type):.4f} /day")
        print(f"Vega:    ${self.vega():.4f} /1% vol")
        print(f"Rho:     ${self.rho(option_type):.4f} /1% rate")
        print(f"Vanna:   {self.vanna():.4f}")
        print(f"Volga:   {self.volga():.4f}")
        print(f"Charm:   {self.charm(option_type):.6f} /day")

# Example usage
greeks = BlackScholesGreeks(S=100, K=105, T=0.5, r=0.05, sigma=0.20)
greeks.summary('call')
greeks.summary('put')

# Portfolio Greeks example
print("\n" + "="*50)
print("PORTFOLIO GREEKS EXAMPLE")
print("="*50)

portfolio = [
    {'type': 'call', 'S': 100, 'K': 100, 'T': 0.25, 'r': 0.05,
     'sigma': 0.20, 'quantity': 50},
    {'type': 'put',  'S': 100, 'K': 95,  'T': 0.25, 'r': 0.05,
     'sigma': 0.22, 'quantity': -30},
    {'type': 'call', 'S': 100, 'K': 110, 'T': 0.50, 'r': 0.05,
     'sigma': 0.18, 'quantity': -20},
]

total_delta = 0
total_gamma = 0
total_theta = 0
total_vega = 0

for pos in portfolio:
    g = BlackScholesGreeks(pos['S'], pos['K'], pos['T'], pos['r'], pos['sigma'])
    qty = pos['quantity'] * 100  # each contract = 100 shares
    total_delta += g.delta(pos['type']) * qty
    total_gamma += g.gamma() * qty
    total_theta += g.theta(pos['type']) * qty
    total_vega += g.vega() * qty

print(f"Portfolio Delta: {total_delta:,.1f}")
print(f"Portfolio Gamma: {total_gamma:,.1f}")
print(f"Portfolio Theta: ${total_theta:,.2f}/day")
print(f"Portfolio Vega:  ${total_vega:,.2f}/1% vol")
```

---

## 5. Volatility

Volatility is the single most important concept in options trading. It is the one input to Black-Scholes that is not directly observable, making it simultaneously the hardest to estimate and the most valuable to get right.

### Historical/Realized Volatility

```python
import numpy as np

def realized_volatility(prices, window=20, annualize=True):
    """
    Calculate realized (historical) volatility from price series.
    Uses close-to-close log returns.
    """
    log_returns = np.diff(np.log(prices))

    if window is None:
        vol = np.std(log_returns, ddof=1)
    else:
        # Rolling volatility
        vol = np.array([
            np.std(log_returns[max(0, i-window+1):i+1], ddof=1)
            for i in range(len(log_returns))
        ])

    if annualize:
        vol = vol * np.sqrt(252)  # 252 trading days

    return vol

def yang_zhang_volatility(open_prices, high, low, close, window=20):
    """
    Yang-Zhang estimator: more efficient than close-to-close.
    Uses open, high, low, close data.
    """
    n = len(close)
    log_ho = np.log(high / open_prices)
    log_lo = np.log(low / open_prices)
    log_co = np.log(close / open_prices)
    log_oc = np.log(open_prices[1:] / close[:-1])

    # Overnight variance
    sigma_oc = np.var(log_oc, ddof=1)

    # Rogers-Satchell variance
    rs = log_ho * (log_ho - log_co) + log_lo * (log_lo - log_co)
    sigma_rs = np.mean(rs)

    # Close-to-close variance
    sigma_cc = np.var(np.diff(np.log(close)), ddof=1)

    k = 0.34 / (1.34 + (window + 1) / (window - 1))
    sigma_yz = np.sqrt(sigma_oc + k * sigma_cc + (1 - k) * sigma_rs) * np.sqrt(252)

    return sigma_yz

# Example
np.random.seed(42)
prices = 100 * np.exp(np.cumsum(np.random.normal(0.0003, 0.015, 252)))
vol = realized_volatility(prices, window=20)
print(f"20-day realized vol (latest): {vol[-1]:.2%}")
```

### Implied Volatility

Implied volatility (IV) is the volatility value that, when plugged into Black-Scholes, produces the observed market price. It must be solved numerically since the Black-Scholes formula cannot be inverted analytically for sigma.

```python
from scipy.optimize import brentq

def implied_volatility(market_price, S, K, T, r, option_type='call'):
    """
    Find implied volatility using Brent's method (root finding).
    """
    def objective(sigma):
        return black_scholes(S, K, T, r, sigma, option_type) - market_price

    try:
        iv = brentq(objective, 1e-6, 5.0, xtol=1e-8)
        return iv
    except ValueError:
        return np.nan  # no solution found

def implied_vol_newton(market_price, S, K, T, r, option_type='call',
                        tol=1e-8, max_iter=100):
    """
    Newton-Raphson method for implied volatility.
    Faster convergence than Brent's method.
    """
    # Initial guess using Brenner-Subrahmanyam approximation
    sigma = np.sqrt(2 * np.pi / T) * market_price / S

    for _ in range(max_iter):
        g = BlackScholesGreeks(S, K, T, r, sigma)
        price = g.price(option_type)
        vega_raw = g.S * np.sqrt(g.T) * g._nd1  # raw vega (not per 1%)

        diff = price - market_price
        if abs(diff) < tol:
            return sigma
        if abs(vega_raw) < 1e-12:
            break
        sigma = sigma - diff / vega_raw

    return sigma

# Example: find implied vol
market_call_price = 7.50
S, K, T, r = 100, 100, 0.25, 0.05

iv = implied_volatility(market_call_price, S, K, T, r, 'call')
print(f"Implied volatility: {iv:.2%}")

# Verify
bs_price = black_scholes(S, K, T, r, iv, 'call')
print(f"BS price at IV: ${bs_price:.4f} (market: ${market_call_price})")
```

### Volatility Smile and Skew

```
VOLATILITY SMILE AND SKEW
==========================

If Black-Scholes were perfectly correct, implied vol would be
the same for all strikes. In reality, it varies:

EQUITY SKEW (typical for stocks):      CURRENCY SMILE (typical for FX):

IV                                     IV
  |  \                                   |  \           /
  |   \                                  |   \         /
  |    \                                 |    \       /
  |     \___                             |     \_____/
  |         \___                         |
  |             \_____                   |
  +--------+---------> Strike           +--------+---------> Strike
       ATM                                   ATM

Why does the skew exist?

1. DEMAND: Portfolio managers buy OTM puts for protection
   -> High demand pushes up put prices -> higher IV for low strikes

2. FEAR: Markets crash faster than they rally
   -> Fat left tail -> OTM puts should be more expensive

3. LEVERAGE: As stock falls, company leverage increases
   -> Higher effective volatility -> higher IV for low strikes

4. JUMP RISK: Black-Scholes assumes continuous paths
   -> Gaps/jumps make OTM options more valuable than BS predicts
```

### Volatility Surface

```
VOLATILITY SURFACE (Strike x Expiry x IV)
==========================================

The vol surface is a 3D object: IV as a function of both strike and expiry.

          IV
          ^
    35%   |  *  .                         * = short-dated
          |   *  .   .                    . = medium-dated
    30%   |    .  *   .   .               o = long-dated
          |     .  .   *   .
    25%   |      .  .   .   *   .
          |       o  .   .   .   *
    20%   |        o  o   .   .   .
          |         o  o   o   o   o
    18%   |          o   o   o   o
          +--+---+---+---+---+---+---> Strike/Delta
           80  90  95 100 105 110 120
          OTM Put       ATM       OTM Call

Key observations:
  1. Short-dated options: steeper skew
  2. Long-dated options: flatter skew
  3. ATM vol may increase or decrease with expiry (term structure)
  4. The surface must be arbitrage-free
```

```python
def build_vol_surface(spot, strikes, expiries, market_prices, option_types):
    """
    Build an implied volatility surface from market prices.

    Returns a 2D array of implied volatilities.
    """
    r = 0.05  # assumed risk-free rate
    surface = np.zeros((len(expiries), len(strikes)))

    for i, T in enumerate(expiries):
        for j, K in enumerate(strikes):
            otype = option_types[i][j]
            price = market_prices[i][j]
            iv = implied_volatility(price, spot, K, T, r, otype)
            surface[i, j] = iv

    return surface

def interpolate_vol(surface, strikes, expiries, target_strike, target_expiry):
    """
    Bilinear interpolation on the vol surface.
    In production, use cubic splines or SABR parameterization.
    """
    from scipy.interpolate import RectBivariateSpline

    interp = RectBivariateSpline(expiries, strikes, surface, kx=3, ky=3)
    return float(interp(target_expiry, target_strike))
```

### Term Structure of Volatility

```
VOLATILITY TERM STRUCTURE
==========================

ATM IV
  |
  |                          Contango (normal):
  |                ________  IV increases with expiry
  |            ___/          (uncertainty grows with time)
  |        ___/
  |    ___/
  |___/
  +---+---+---+---+---+--->  Expiry
  1w  1m  3m  6m  1yr 2yr

ATM IV
  |
  |___
  |   \___
  |       \___               Backwardation (inverted):
  |           \___           IV decreases with expiry
  |               \____      (near-term event causing fear,
  |                    ____   e.g., earnings, election)
  +---+---+---+---+---+--->  Expiry
  1w  1m  3m  6m  1yr 2yr
```

### The VIX Index

```
VIX: THE "FEAR GAUGE"
=====================

The CBOE Volatility Index (VIX) measures 30-day expected volatility
of the S&P 500, derived from option prices.

VIX Level  | Market Interpretation
-----------+-----------------------------------
  < 12     | Extreme complacency (rare, be cautious)
  12-17    | Low volatility, calm markets
  17-25    | Normal/moderate volatility
  25-35    | Elevated fear, significant uncertainty
  35-50    | High fear, crisis-level volatility
  > 50     | Panic (2008: ~80, COVID 2020: ~82)

Key properties:
  1. VIX is MEAN-REVERTING (always comes back to ~15-20)
  2. VIX is NEGATIVELY CORRELATED with S&P 500 (~-0.7 to -0.8)
  3. VIX tends to OVERSHOOT realized volatility (variance risk premium)
  4. VIX futures are usually in CONTANGO (upward sloping term structure)

VARIANCE RISK PREMIUM:
  VRP = IV² - RV²
  Typically positive: sellers of vol are compensated
  for bearing tail risk (insurance premium)
```

### Stochastic Volatility Models

```
HESTON MODEL
=============

The Heston model makes volatility itself a random process:

  dS = mu*S*dt + sqrt(v)*S*dW_1          (stock price)
  dv = kappa*(theta - v)*dt + xi*sqrt(v)*dW_2  (variance)

  Corr(dW_1, dW_2) = rho                 (typically rho < 0)

Parameters:
  kappa = mean reversion speed of variance
  theta = long-run variance level
  xi    = volatility of volatility (vol-of-vol)
  rho   = correlation between stock and vol shocks
  v_0   = initial variance

Key features:
  - Generates volatility smile/skew naturally
  - rho < 0 creates skew (stock falls -> vol rises)
  - xi > 0 creates smile (fat tails)
  - Mean-reverting vol matches empirical observations
  - Semi-analytical pricing via characteristic functions
```

```
SABR MODEL
===========

Popular for interest rate options (swaptions, caps):

  dF = sigma * F^beta * dW_1             (forward rate)
  d(sigma) = alpha * sigma * dW_2        (stochastic vol)

  Corr(dW_1, dW_2) = rho

Parameters:
  alpha = vol-of-vol
  beta  = CEV exponent (0=normal, 1=lognormal)
  rho   = correlation (controls skew)
  sigma_0 = initial vol

Hagan's approximation gives closed-form implied vol:
  sigma_BS(K) ≈ ... (function of alpha, beta, rho, F, K)

Advantage: Easy calibration to market smile at each expiry
```

```python
def heston_char_func(phi, S, K, T, r, v0, kappa, theta, xi, rho):
    """
    Heston model characteristic function for pricing via FFT.
    """
    d = np.sqrt((rho * xi * 1j * phi - kappa)**2
                + xi**2 * (1j * phi + phi**2))
    g = (kappa - rho * xi * 1j * phi - d) / (kappa - rho * xi * 1j * phi + d)

    C = (r * 1j * phi * T
         + kappa * theta / xi**2
         * ((kappa - rho * xi * 1j * phi - d) * T
            - 2 * np.log((1 - g * np.exp(-d * T)) / (1 - g))))

    D = ((kappa - rho * xi * 1j * phi - d) / xi**2
         * (1 - np.exp(-d * T)) / (1 - g * np.exp(-d * T)))

    return np.exp(C + D * v0 + 1j * phi * np.log(S))

def heston_price(S, K, T, r, v0, kappa, theta, xi, rho, option_type='call'):
    """
    Price European option under Heston model using numerical integration.
    """
    from scipy.integrate import quad

    def integrand(phi, j):
        if j == 1:
            # P1 integrand
            cf = heston_char_func(phi - 1j, S, K, T, r, v0, kappa, theta, xi, rho)
            cf /= heston_char_func(-1j, S, K, T, r, v0, kappa, theta, xi, rho)
        else:
            # P2 integrand
            cf = heston_char_func(phi, S, K, T, r, v0, kappa, theta, xi, rho)

        return np.real(np.exp(-1j * phi * np.log(K)) * cf / (1j * phi))

    P1 = 0.5 + (1/np.pi) * quad(lambda phi: integrand(phi, 1), 0, 100)[0]
    P2 = 0.5 + (1/np.pi) * quad(lambda phi: integrand(phi, 2), 0, 100)[0]

    call_price = S * P1 - K * np.exp(-r * T) * P2

    if option_type == 'call':
        return call_price
    return call_price - S + K * np.exp(-r * T)  # put via parity

# Example
price = heston_price(
    S=100, K=100, T=0.5, r=0.05,
    v0=0.04,        # initial variance (vol = 20%)
    kappa=2.0,      # mean reversion speed
    theta=0.04,     # long-run variance
    xi=0.3,         # vol of vol
    rho=-0.7        # correlation
)
print(f"Heston call price: ${price:.4f}")
```

---

## 6. Binomial Tree Model

The binomial model is the workhorse of American option pricing. It discretizes time and models stock movements as a series of up/down steps.

### One-Step Model

```
ONE-STEP BINOMIAL TREE
=======================

                    S*u = 100 * 1.1 = $110
                   /     Call payoff = max(110-105,0) = $5
  S = $100       /
  (today)  -----<
                  \
                   \    S*d = 100 * 0.9 = $90
                    \   Call payoff = max(90-105,0) = $0

  u = up factor = 1.1
  d = down factor = 0.9
  K = 105
  r = 5%, T = 1 year

  Risk-neutral probability:
  p = (e^(rT) - d) / (u - d)
    = (1.0513 - 0.9) / (1.1 - 0.9)
    = 0.7565

  Option value:
  C = e^(-rT) * [p * C_u + (1-p) * C_d]
    = e^(-0.05) * [0.7565 * 5 + 0.2435 * 0]
    = 0.9512 * 3.7825
    = $3.60
```

### Multi-Step Binomial Tree

```
THREE-STEP BINOMIAL TREE (CRR Model)
=====================================

  Parameters: S=100, K=100, T=0.75, r=5%, sigma=20%
  dt = T/N = 0.25
  u = e^(sigma*sqrt(dt)) = e^(0.20*0.5) = 1.1052
  d = 1/u = 0.9048
  p = (e^(r*dt) - d) / (u - d) = 0.5264

  Step 0      Step 1      Step 2      Step 3

                                      S*u^3 = 134.99
                                     / C = 34.99
                          S*u^2=122.14
                         / C = 24.73
              S*u=110.52              S*u^2*d = 110.52
             / C = 14.41             / C = 10.52
  S=100                   S*u*d=100.00
  C=10.15  \             / C = 5.60
            S*d=90.48               S*u*d^2 = 90.48
             \ C = 2.98            / C = 0
                         S*d^2=81.87
                          \ C = 0
                                     S*d^3 = 74.08
                                      C = 0

  Backward induction (European):
  At each node: C = e^(-r*dt) * [p * C_up + (1-p) * C_down]
```

### Python Implementation

```python
import numpy as np

def binomial_tree(S, K, T, r, sigma, N, option_type='call',
                  exercise='european', return_tree=False):
    """
    Binomial tree option pricing (Cox-Ross-Rubinstein model).

    Parameters:
        S: spot price
        K: strike price
        T: time to expiry (years)
        r: risk-free rate
        sigma: volatility
        N: number of time steps
        option_type: 'call' or 'put'
        exercise: 'european' or 'american'
        return_tree: if True, return the full price tree

    Returns:
        Option price (and optionally the tree)
    """
    dt = T / N
    u = np.exp(sigma * np.sqrt(dt))
    d = 1 / u
    p = (np.exp(r * dt) - d) / (u - d)
    disc = np.exp(-r * dt)

    # Build stock price tree at maturity
    stock_prices = S * u ** np.arange(N, -1, -1) * d ** np.arange(0, N + 1)

    # Calculate payoffs at maturity
    if option_type == 'call':
        option_values = np.maximum(stock_prices - K, 0)
    else:
        option_values = np.maximum(K - stock_prices, 0)

    # Store tree for visualization
    tree = [option_values.copy()] if return_tree else None

    # Backward induction
    for step in range(N - 1, -1, -1):
        # Stock prices at this step
        stock_at_step = S * u ** np.arange(step, -1, -1) * d ** np.arange(0, step + 1)

        # European value (discounted expected value)
        option_values = disc * (p * option_values[:-1] + (1 - p) * option_values[1:])

        # American: check for early exercise
        if exercise == 'american':
            if option_type == 'call':
                exercise_values = np.maximum(stock_at_step - K, 0)
            else:
                exercise_values = np.maximum(K - stock_at_step, 0)
            option_values = np.maximum(option_values, exercise_values)

        if return_tree:
            tree.append(option_values.copy())

    if return_tree:
        tree.reverse()
        return option_values[0], tree

    return option_values[0]

# Compare European and American puts
S, K, T, r, sigma = 100, 100, 1.0, 0.05, 0.20

euro_put = binomial_tree(S, K, T, r, sigma, N=500,
                          option_type='put', exercise='european')
amer_put = binomial_tree(S, K, T, r, sigma, N=500,
                          option_type='put', exercise='american')
bs_put = black_scholes(S, K, T, r, sigma, 'put')

print(f"European put (binomial, N=500): ${euro_put:.4f}")
print(f"European put (Black-Scholes):   ${bs_put:.4f}")
print(f"American put (binomial, N=500): ${amer_put:.4f}")
print(f"Early exercise premium:          ${amer_put - euro_put:.4f}")

# Convergence study
print("\nConvergence to Black-Scholes:")
for n in [10, 25, 50, 100, 200, 500, 1000]:
    price = binomial_tree(S, K, T, r, sigma, N=n, option_type='call')
    error = price - bs_put
    print(f"  N={n:5d}: ${price:.4f}  (error: {error:+.4f})")
```

---

## 7. Monte Carlo Pricing

Monte Carlo simulation is the most flexible pricing method. It can handle any payoff structure, path dependence, and complex stochastic processes.

### Geometric Brownian Motion Simulation

```
MONTE CARLO PRICING CONCEPT
============================

1. Simulate many random stock price paths
2. Calculate the option payoff for each path
3. Average the payoffs
4. Discount back to today

  Price paths:
  S |    /\    /\  /----   path 1
    |   /  \  /  \/        path 2: ___/\___/\_
    |  /    \/             path 3:      /\_____
    | /                    path 4: \___/
    |/                     path 5: \_________
    +----+----+----+----
    0   0.25  0.5  0.75   T=1.0

  Under risk-neutral measure:
  S(T) = S(0) * exp((r - sigma^2/2)*T + sigma*sqrt(T)*Z)

  where Z ~ N(0,1)
```

```python
import numpy as np

def monte_carlo_european(S, K, T, r, sigma, n_sims=100_000,
                          option_type='call', seed=42):
    """
    Monte Carlo pricing for European options.
    """
    rng = np.random.default_rng(seed)
    Z = rng.standard_normal(n_sims)

    # Simulate terminal stock prices under risk-neutral measure
    ST = S * np.exp((r - sigma**2 / 2) * T + sigma * np.sqrt(T) * Z)

    # Calculate payoffs
    if option_type == 'call':
        payoffs = np.maximum(ST - K, 0)
    else:
        payoffs = np.maximum(K - ST, 0)

    # Discount to present
    price = np.exp(-r * T) * np.mean(payoffs)
    se = np.exp(-r * T) * np.std(payoffs) / np.sqrt(n_sims)

    return price, se

def monte_carlo_paths(S, T, r, sigma, n_steps, n_sims, seed=42):
    """
    Generate full stock price paths for path-dependent options.

    Returns: array of shape (n_sims, n_steps+1)
    """
    rng = np.random.default_rng(seed)
    dt = T / n_steps

    # Pre-allocate
    paths = np.zeros((n_sims, n_steps + 1))
    paths[:, 0] = S

    Z = rng.standard_normal((n_sims, n_steps))

    for t in range(1, n_steps + 1):
        paths[:, t] = paths[:, t-1] * np.exp(
            (r - sigma**2 / 2) * dt + sigma * np.sqrt(dt) * Z[:, t-1]
        )

    return paths

# Example: Compare MC to Black-Scholes
S, K, T, r, sigma = 100, 105, 0.5, 0.05, 0.20

mc_price, mc_se = monte_carlo_european(S, K, T, r, sigma, n_sims=500_000)
bs_price = black_scholes(S, K, T, r, sigma, 'call')

print(f"Monte Carlo call: ${mc_price:.4f} +/- ${1.96*mc_se:.4f} (95% CI)")
print(f"Black-Scholes:    ${bs_price:.4f}")
```

### Variance Reduction Techniques

```python
def mc_antithetic(S, K, T, r, sigma, n_sims=100_000,
                   option_type='call', seed=42):
    """
    Antithetic variates: use Z and -Z to reduce variance.
    """
    rng = np.random.default_rng(seed)
    Z = rng.standard_normal(n_sims // 2)

    # Two paths: one with Z, one with -Z
    ST_pos = S * np.exp((r - sigma**2 / 2) * T + sigma * np.sqrt(T) * Z)
    ST_neg = S * np.exp((r - sigma**2 / 2) * T + sigma * np.sqrt(T) * (-Z))

    if option_type == 'call':
        payoffs = (np.maximum(ST_pos - K, 0) + np.maximum(ST_neg - K, 0)) / 2
    else:
        payoffs = (np.maximum(K - ST_pos, 0) + np.maximum(K - ST_neg, 0)) / 2

    price = np.exp(-r * T) * np.mean(payoffs)
    se = np.exp(-r * T) * np.std(payoffs) / np.sqrt(len(payoffs))

    return price, se

def mc_control_variate(S, K, T, r, sigma, n_sims=100_000,
                        option_type='call', seed=42):
    """
    Control variate: use the stock itself as a control.
    E[S(T)] = S*e^(rT) is known exactly.
    """
    rng = np.random.default_rng(seed)
    Z = rng.standard_normal(n_sims)

    ST = S * np.exp((r - sigma**2 / 2) * T + sigma * np.sqrt(T) * Z)

    if option_type == 'call':
        payoffs = np.maximum(ST - K, 0)
    else:
        payoffs = np.maximum(K - ST, 0)

    # Control variate adjustment
    expected_ST = S * np.exp(r * T)
    cov_matrix = np.cov(payoffs, ST)
    beta = cov_matrix[0, 1] / cov_matrix[1, 1]

    adjusted_payoffs = payoffs - beta * (ST - expected_ST)

    price = np.exp(-r * T) * np.mean(adjusted_payoffs)
    se = np.exp(-r * T) * np.std(adjusted_payoffs) / np.sqrt(n_sims)

    return price, se

# Compare variance reduction methods
S, K, T, r, sigma = 100, 105, 0.5, 0.05, 0.20
n = 100_000

plain_price, plain_se = monte_carlo_european(S, K, T, r, sigma, n)
anti_price, anti_se = mc_antithetic(S, K, T, r, sigma, n)
cv_price, cv_se = mc_control_variate(S, K, T, r, sigma, n)
bs = black_scholes(S, K, T, r, sigma, 'call')

print(f"{'Method':<25} {'Price':>8} {'Std Err':>10} {'Var Reduction':>15}")
print(f"{'-'*60}")
print(f"{'Plain MC':<25} ${plain_price:>7.4f} {plain_se:>10.4f} {'baseline':>15}")
print(f"{'Antithetic':<25} ${anti_price:>7.4f} {anti_se:>10.4f} "
      f"{(plain_se/anti_se)**2:>14.1f}x")
print(f"{'Control Variate':<25} ${cv_price:>7.4f} {cv_se:>10.4f} "
      f"{(plain_se/cv_se)**2:>14.1f}x")
print(f"{'Black-Scholes':<25} ${bs:>7.4f}")
```

### Least-Squares Monte Carlo (Longstaff-Schwartz)

For American options, we need the Longstaff-Schwartz algorithm, which uses regression to estimate the continuation value at each exercise opportunity.

```python
def longstaff_schwartz(S, K, T, r, sigma, n_steps, n_sims,
                        option_type='put', seed=42):
    """
    Least-Squares Monte Carlo for American options.
    Longstaff-Schwartz (2001) algorithm.
    """
    rng = np.random.default_rng(seed)
    dt = T / n_steps
    discount = np.exp(-r * dt)

    # Generate paths
    paths = monte_carlo_paths(S, T, r, sigma, n_steps, n_sims, seed)

    # Initialize cash flow matrix with terminal payoff
    if option_type == 'put':
        payoff = np.maximum(K - paths[:, -1], 0)
    else:
        payoff = np.maximum(paths[:, -1] - K, 0)

    cash_flows = payoff.copy()

    # Backward induction
    for t in range(n_steps - 1, 0, -1):
        stock = paths[:, t]

        # Immediate exercise value
        if option_type == 'put':
            exercise_value = np.maximum(K - stock, 0)
        else:
            exercise_value = np.maximum(stock - K, 0)

        # Only consider paths that are in the money
        itm = exercise_value > 0

        if np.sum(itm) == 0:
            cash_flows = cash_flows * discount
            continue

        # Regression: estimate continuation value
        # Use polynomial basis: 1, S, S^2, S^3
        X = stock[itm]
        Y = cash_flows[itm] * discount  # discounted future cash flows

        # Fit polynomial regression
        basis = np.column_stack([
            np.ones_like(X),
            X,
            X**2,
            X**3
        ])

        try:
            coeffs = np.linalg.lstsq(basis, Y, rcond=None)[0]
            continuation_value = basis @ coeffs
        except np.linalg.LinAlgError:
            continuation_value = Y  # fallback

        # Exercise decision: exercise if immediate value > continuation
        exercise_mask = np.zeros(n_sims, dtype=bool)
        exercise_mask[itm] = exercise_value[itm] > continuation_value

        # Update cash flows
        cash_flows[exercise_mask] = exercise_value[exercise_mask]
        cash_flows[~exercise_mask] *= discount

    # Discount all remaining cash flows to time 0
    price = discount * np.mean(cash_flows)
    se = discount * np.std(cash_flows) / np.sqrt(n_sims)

    return price, se

# Compare American put pricing methods
S, K, T, r, sigma = 100, 100, 1.0, 0.05, 0.20

lsm_price, lsm_se = longstaff_schwartz(S, K, T, r, sigma,
                                          n_steps=50, n_sims=100_000)
bin_price = binomial_tree(S, K, T, r, sigma, N=500,
                           option_type='put', exercise='american')

print(f"LSM American put:      ${lsm_price:.4f} +/- ${1.96*lsm_se:.4f}")
print(f"Binomial American put: ${bin_price:.4f}")
```

---

## 8. Exotic Options

Exotic options have payoff structures more complex than standard European/American calls and puts. They are widely traded in OTC markets.

### Barrier Options

```
BARRIER OPTIONS
===============

The option's existence depends on whether the underlying
crosses a barrier level H during the option's life.

KNOCK-OUT (dies if barrier is hit):
  Down-and-Out Call: Call that ceases to exist if S falls below H
  Up-and-Out Put:    Put that ceases to exist if S rises above H

KNOCK-IN (born if barrier is hit):
  Down-and-In Call:  Call that comes into existence if S falls below H
  Up-and-In Put:     Put that comes into existence if S rises above H

KEY IDENTITY:
  Knock-In + Knock-Out = Vanilla

Stock Price
  |         ____
  |        /    \          <- barrier NOT hit: knock-out survives
  |  _____/      \____
  |                    \___
  +----H---+---+---+---+---> Time
  Barrier level

Stock Price
  |         ____
  |        /    \    /
  |  _____/      \/        <- barrier HIT: knock-out dies (X)
  +----H---+---+--X--+----> Time
  Barrier level
```

```python
def barrier_option_mc(S, K, H, T, r, sigma, n_steps, n_sims,
                       barrier_type='down-and-out', option_type='call', seed=42):
    """
    Monte Carlo pricing for barrier options.

    barrier_type: 'down-and-out', 'down-and-in', 'up-and-out', 'up-and-in'
    """
    paths = monte_carlo_paths(S, T, r, sigma, n_steps, n_sims, seed)

    # Check if barrier was crossed
    if barrier_type.startswith('down'):
        barrier_hit = np.any(paths <= H, axis=1)
    else:
        barrier_hit = np.any(paths >= H, axis=1)

    ST = paths[:, -1]

    if option_type == 'call':
        payoffs = np.maximum(ST - K, 0)
    else:
        payoffs = np.maximum(K - ST, 0)

    # Apply barrier condition
    if barrier_type.endswith('out'):
        payoffs[barrier_hit] = 0    # knock-out: zero if barrier hit
    else:
        payoffs[~barrier_hit] = 0   # knock-in: zero if barrier NOT hit

    price = np.exp(-r * T) * np.mean(payoffs)
    se = np.exp(-r * T) * np.std(payoffs) / np.sqrt(n_sims)

    return price, se

# Example: Down-and-out call
S, K, T, r, sigma = 100, 100, 1.0, 0.05, 0.20
H = 85  # barrier at $85

dao_price, dao_se = barrier_option_mc(S, K, H, T, r, sigma,
                                        n_steps=252, n_sims=200_000,
                                        barrier_type='down-and-out',
                                        option_type='call')
vanilla_price = black_scholes(S, K, T, r, sigma, 'call')

print(f"Down-and-Out Call (H=$85): ${dao_price:.4f} +/- ${1.96*dao_se:.4f}")
print(f"Vanilla Call:              ${vanilla_price:.4f}")
print(f"Barrier discount:          {(1 - dao_price/vanilla_price)*100:.1f}%")
```

### Asian Options

```
ASIAN OPTIONS
=============

Payoff depends on the AVERAGE price over the option's life,
not just the terminal price.

Types:
  Fixed-strike: payoff = max(A - K, 0)  for call
  Floating-strike: payoff = max(S(T) - A, 0)  for call

  Where A = average of S over [0, T]

Average types:
  Arithmetic: A = (1/n) * sum(S(t_i))    (no closed form)
  Geometric:  A = (prod(S(t_i)))^(1/n)   (closed form exists)

Pricing:
  Geometric Asian: use adjusted BS formula
  Arithmetic Asian: Monte Carlo (geometric as control variate)
```

```python
def asian_option_mc(S, K, T, r, sigma, n_steps, n_sims,
                     avg_type='arithmetic', option_type='call', seed=42):
    """Price Asian (average price) option via Monte Carlo."""
    paths = monte_carlo_paths(S, T, r, sigma, n_steps, n_sims, seed)

    if avg_type == 'arithmetic':
        averages = np.mean(paths[:, 1:], axis=1)
    elif avg_type == 'geometric':
        averages = np.exp(np.mean(np.log(paths[:, 1:]), axis=1))
    else:
        raise ValueError("avg_type must be 'arithmetic' or 'geometric'")

    if option_type == 'call':
        payoffs = np.maximum(averages - K, 0)
    else:
        payoffs = np.maximum(K - averages, 0)

    price = np.exp(-r * T) * np.mean(payoffs)
    se = np.exp(-r * T) * np.std(payoffs) / np.sqrt(n_sims)

    return price, se

def lookback_option_mc(S, T, r, sigma, n_steps, n_sims,
                        option_type='call', seed=42):
    """
    Price lookback option via Monte Carlo.
    Floating strike: call pays S(T) - min(S), put pays max(S) - S(T)
    """
    paths = monte_carlo_paths(S, T, r, sigma, n_steps, n_sims, seed)
    ST = paths[:, -1]

    if option_type == 'call':
        min_S = np.min(paths, axis=1)
        payoffs = ST - min_S  # always >= 0
    else:
        max_S = np.max(paths, axis=1)
        payoffs = max_S - ST  # always >= 0

    price = np.exp(-r * T) * np.mean(payoffs)
    se = np.exp(-r * T) * np.std(payoffs) / np.sqrt(n_sims)

    return price, se

# Compare exotic option prices
S, K, T, r, sigma = 100, 100, 1.0, 0.05, 0.20
n_steps, n_sims = 252, 200_000

vanilla = black_scholes(S, K, T, r, sigma, 'call')
asian_arith, _ = asian_option_mc(S, K, T, r, sigma, n_steps, n_sims,
                                   'arithmetic', 'call')
asian_geom, _ = asian_option_mc(S, K, T, r, sigma, n_steps, n_sims,
                                  'geometric', 'call')
lookback, _ = lookback_option_mc(S, T, r, sigma, n_steps, n_sims, 'call')

print(f"{'Option Type':<25} {'Price':>8}")
print(f"{'-'*35}")
print(f"{'Vanilla Call':<25} ${vanilla:>7.4f}")
print(f"{'Asian (arithmetic)':<25} ${asian_arith:>7.4f}")
print(f"{'Asian (geometric)':<25} ${asian_geom:>7.4f}")
print(f"{'Lookback (floating)':<25} ${lookback:>7.4f}")
```

### Digital/Binary Options

```
DIGITAL (BINARY) OPTIONS
=========================

Pay a fixed amount if the option expires ITM, zero otherwise.

  Cash-or-Nothing Call: pays $1 if S(T) > K
  Cash-or-Nothing Put:  pays $1 if S(T) < K
  Asset-or-Nothing Call: pays S(T) if S(T) > K

Payoff (Cash-or-Nothing Call):

  Payoff
  $1|              ___________
    |             |
    |             |
  $0|_____________|
    +--------+----+----------->  S(T)
             K

BS Price: C_digital = e^(-rT) * N(d2)
                      (discounted risk-neutral probability of ITM)
```

```python
def digital_option(S, K, T, r, sigma, option_type='call',
                    payout_type='cash', cash_amount=1.0):
    """Price a digital (binary) option under Black-Scholes."""
    d1 = (np.log(S / K) + (r + sigma**2 / 2) * T) / (sigma * np.sqrt(T))
    d2 = d1 - sigma * np.sqrt(T)

    if payout_type == 'cash':
        if option_type == 'call':
            return cash_amount * np.exp(-r * T) * norm.cdf(d2)
        return cash_amount * np.exp(-r * T) * norm.cdf(-d2)
    elif payout_type == 'asset':
        if option_type == 'call':
            return S * norm.cdf(d1)
        return S * norm.cdf(-d1)
    else:
        raise ValueError("payout_type must be 'cash' or 'asset'")

# Example
dig_call = digital_option(100, 100, 0.5, 0.05, 0.20, 'call', 'cash', 100)
print(f"Digital call ($100 payout): ${dig_call:.2f}")
```

### Other Exotics

```
COMPOUND OPTIONS
================
  An option on an option.
  Call-on-Call: right to buy a call option at a future date
  Put-on-Call: right to sell a call option at a future date

  Used for: hedging option portfolios, real options analysis

CHOOSER OPTIONS
===============
  At time t1, holder chooses whether option becomes a call or put
  with strike K and expiry T > t1.

  Pricing: via put-call parity, a chooser with equal K and T
  equals a call plus a put with adjusted parameters.

  Used for: situations where direction is uncertain but a
  big move is expected (similar to straddle but cheaper)

RAINBOW OPTIONS
===============
  Payoff depends on multiple underlying assets.

  Best-of: max(S1, S2, ..., Sn) - K
  Worst-of: min(S1, S2, ..., Sn) - K
  Spread: S1 - S2 - K

  Require modeling correlations between underlyings
```

---

## 9. Options Trading Strategies for Quants

### Volatility Trading

```
VOLATILITY TRADING FRAMEWORK
=============================

The core idea: trade IMPLIED volatility vs REALIZED volatility.

If IV > Expected RV: SELL options (collect premium)
If IV < Expected RV: BUY options (cheap insurance)

  P&L from delta-hedged option position:

  Daily P&L ≈ (1/2) * Gamma * S^2 * (realized_move^2 - implied_move^2)

  Where:
    realized_move = actual daily return
    implied_move  = daily vol implied by option price

  Over the option's life:
  Total P&L ≈ integral of [Gamma * S^2 * (sigma_R^2 - sigma_I^2)] dt

  This is the FUNDAMENTAL EQUATION of volatility trading.
```

### Gamma Scalping

```
GAMMA SCALPING
==============

Strategy: Buy options (long gamma), delta-hedge, profit from
realized moves exceeding implied volatility.

  Step 1: Buy ATM straddle (long gamma, long vega)
  Step 2: Delta-hedge to neutralize directional risk
  Step 3: As stock moves, re-hedge and lock in profits

  Stock moves UP:                    Stock moves DOWN:
  Delta becomes positive             Delta becomes negative
  Sell shares to re-hedge             Buy shares to re-hedge
  Locked in small profit              Locked in small profit

  Cumulative gamma scalping P&L:

  P&L
   |          /\    /\
   |    /\   /  \  /  \  /\   <- Each zig-zag = scalp profit
   |   /  \ /    \/    \/  \
   |  /    V                 \
   | /                        \ <- Theta decay eroding profits
   |/
   +--------+---+---+---+---+--->  Time
   0       Expiry

  Profitable when: realized vol > implied vol
  Losing when: realized vol < implied vol (theta eats you alive)
```

```python
def simulate_gamma_scalp(S0, K, T, r, sigma_implied, sigma_realized,
                          n_steps=252, seed=42):
    """
    Simulate gamma scalping P&L.
    Buy ATM straddle and delta-hedge daily.
    """
    rng = np.random.default_rng(seed)
    dt = T / n_steps

    # Initial position: buy straddle
    g = BlackScholesGreeks(S0, K, T, r, sigma_implied)
    straddle_cost = g.price('call') + g.price('put')

    S = S0
    total_pnl = 0
    hedge_shares = 0

    for step in range(n_steps):
        t_remaining = T - step * dt
        if t_remaining <= dt:
            break

        # Current Greeks
        g = BlackScholesGreeks(S, K, t_remaining, r, sigma_implied)
        current_delta = g.delta('call') + g.delta('put')  # straddle delta

        # Rebalance hedge
        shares_to_trade = current_delta - hedge_shares
        hedge_shares = current_delta

        # Simulate stock move with REALIZED volatility
        dW = rng.standard_normal()
        S_new = S * np.exp((r - sigma_realized**2 / 2) * dt
                            + sigma_realized * np.sqrt(dt) * dW)

        # Gamma scalping P&L for this period
        gamma_pnl = 0.5 * g.gamma() * (S_new - S)**2
        theta_cost = g.theta('call') + g.theta('put')  # daily theta (negative)

        daily_pnl = gamma_pnl + theta_cost
        total_pnl += daily_pnl

        S = S_new

    # Final payoff
    final_payoff = max(S - K, 0) + max(K - S, 0)
    net_pnl = final_payoff - straddle_cost + total_pnl

    return {
        'straddle_cost': straddle_cost,
        'final_payoff': final_payoff,
        'scalping_pnl': total_pnl,
        'net_pnl': net_pnl,
        'final_stock': S
    }

# Example: IV=20%, but realized vol = 25% (favorable for gamma scalper)
result = simulate_gamma_scalp(
    S0=100, K=100, T=0.25, r=0.05,
    sigma_implied=0.20, sigma_realized=0.25
)
print("Gamma Scalping Simulation:")
print(f"  Straddle cost:     ${result['straddle_cost']:.2f}")
print(f"  Final stock price: ${result['final_stock']:.2f}")
print(f"  Final payoff:      ${result['final_payoff']:.2f}")
print(f"  Scalping P&L:      ${result['scalping_pnl']:.2f}")
print(f"  Net P&L:           ${result['net_pnl']:.2f}")
```

### Dispersion Trading

```
DISPERSION TRADING
==================

Exploit the difference between index implied vol and
constituent stock implied vols.

Observation: Index IV is typically HIGHER than the
vol-weighted average of constituent IVs.

Why? Correlation risk premium. The market pays extra for
index protection because correlation spikes in crashes.

Strategy:
  SELL index options (expensive IV)
  BUY constituent stock options (cheaper IV)

  Profit when: realized correlation < implied correlation
  Lose when: realized correlation > implied correlation (crash)

  Index Vol vs Weighted Avg Constituent Vol:

  Vol
  30%|  Index IV
     |  * * *
  25%|* * * * *
     |  * * *    Constituent avg IV
  20%|    * * * * * * * *
     |      * * * * *
  15%|
     +---+---+---+---+---+---> Time

  The gap = correlation risk premium
```

### Delta-Neutral Portfolio Construction

```
DELTA-NEUTRAL PORTFOLIO CONSTRUCTION
=====================================

Goal: Zero portfolio delta, then trade gamma/vega/theta.

Step 1: Calculate net delta from all option positions
Step 2: Offset with underlying shares
Step 3: Monitor and rebalance

  Position             Qty    Delta/unit   Position Delta
  ------------------   -----  -----------  ---------------
  Long $100 Calls       +50     +0.55        +2,750
  Short $110 Calls      -30     +0.35        -1,050
  Long $95 Puts         +20     -0.40          -800
  Short $90 Puts        -40     -0.25        +1,000
  ------------------   -----  -----------  ---------------
  Net Option Delta                            +1,900

  Hedge: SHORT 1,900 shares

  Portfolio Delta: +1,900 - 1,900 = 0  (delta neutral)

  Now exposed to:
  - Gamma (how delta changes)
  - Vega (how vol changes)
  - Theta (time decay)
  - Higher-order Greeks
```

### Skew Trading

```
SKEW TRADING
=============

Trade the SHAPE of the volatility smile, not the level.

RISK REVERSAL: Sell OTM put, buy OTM call (or vice versa)
  - Expresses a view on skew steepness
  - If skew is too steep: buy risk reversal (buy put, sell call)
  - If skew is too flat: sell risk reversal (sell put, buy call)

BUTTERFLY SPREAD on the vol surface:
  - Buy 95 strike, sell 2x 100 strike, buy 105 strike
  - Profits from specific vol surface shape changes

Calendar skew trade:
  - Trade front-month vs back-month skew
  - If front skew is steep relative to back:
    sell front put spread, buy back put spread

  Skew P&L Surface:

  P&L
   |     Skew flattening        Skew steepening
   |         profit                  loss
   |     ___/                           \___
   |    /                                   \
   0|---*-----------------------------------*---
   |                current skew level
   |
```

---

## 10. Interest Rate Derivatives (Overview)

### Bond Pricing and Yield

```
BOND PRICING FUNDAMENTALS
==========================

A bond pays periodic coupons C and returns face value F at maturity.

Price = sum(C / (1+y)^t) + F / (1+y)^T

  Cash flow diagram for a 5-year, 4% coupon bond (face=$1000):

  $40    $40    $40    $40    $40+$1000
   |      |      |      |      |
   v      v      v      v      v
  -+------+------+------+------+--->  Time
   1      2      3      4      5

  At y=4%:  Price = $1,000 (par)
  At y=5%:  Price = $956.71 (discount)
  At y=3%:  Price = $1,045.80 (premium)

  YIELD CURVE:

  Yield
  5.0%|                        ___________
      |                  _____/
  4.0%|            _____/
      |      _____/
  3.0%| ____/
      |/
  2.0%+---+---+---+---+---+---+---+---> Maturity
      3m  6m  1y  2y  3y  5y  10y 30y

  Normal: upward sloping (longer maturity = higher yield)
  Inverted: downward sloping (recession signal)
  Flat: roughly equal across maturities
```

### Interest Rate Swaps (Detailed)

```python
def price_interest_rate_swap(notional, fixed_rate, discount_factors,
                               forward_rates, payment_times):
    """
    Price a plain vanilla interest rate swap (fixed payer perspective).

    Parameters:
        notional: swap notional amount
        fixed_rate: fixed leg coupon rate
        discount_factors: DF at each payment date
        forward_rates: forward rates for each period
        payment_times: year fractions for each period
    """
    fixed_leg_pv = 0
    float_leg_pv = 0

    for i in range(len(payment_times)):
        dt = payment_times[i] - (payment_times[i-1] if i > 0 else 0)
        fixed_leg_pv += notional * fixed_rate * dt * discount_factors[i]
        float_leg_pv += notional * forward_rates[i] * dt * discount_factors[i]

    # Swap value (from fixed payer perspective)
    swap_value = float_leg_pv - fixed_leg_pv

    return {
        'fixed_leg_pv': fixed_leg_pv,
        'float_leg_pv': float_leg_pv,
        'swap_value': swap_value
    }

def par_swap_rate(discount_factors, payment_times):
    """Calculate the par swap rate (rate that makes swap value = 0)."""
    annuity = 0
    for i in range(len(payment_times)):
        dt = payment_times[i] - (payment_times[i-1] if i > 0 else 0)
        annuity += dt * discount_factors[i]

    # Par rate = (1 - DF(T)) / annuity
    return (1 - discount_factors[-1]) / annuity

# Example: 3-year swap, semi-annual
payment_times = [0.5, 1.0, 1.5, 2.0, 2.5, 3.0]
discount_factors = [0.9876, 0.9753, 0.9632, 0.9512, 0.9394, 0.9277]
forward_rates = [0.025, 0.028, 0.030, 0.032, 0.034, 0.036]

par_rate = par_swap_rate(discount_factors, payment_times)
print(f"Par swap rate: {par_rate:.4%}")

result = price_interest_rate_swap(
    notional=10_000_000,
    fixed_rate=par_rate,
    discount_factors=discount_factors,
    forward_rates=forward_rates,
    payment_times=payment_times
)
print(f"Swap value at par rate: ${result['swap_value']:,.2f}")
```

### Caps, Floors, and Swaptions

```
CAPS AND FLOORS
===============

CAP: Portfolio of call options (caplets) on interest rates
  Payoff per period = Notional * max(Rate - Cap_Rate, 0) * dt
  Protects floating rate borrower from rate increases

FLOOR: Portfolio of put options (floorlets) on interest rates
  Payoff per period = Notional * max(Floor_Rate - Rate, 0) * dt
  Protects floating rate investor from rate decreases

COLLAR: Long cap + short floor (limits rate to a range)

  Rate
    |
  Cap|----.-----.-----.---  Cap rate = 5%
    |
    |         /\    /       Actual floating rate path
    |    /\  /  \  /
    |   /  \/    \/
    |  /
Floor|----.-----.-----.---  Floor rate = 2%
    |
    +---+---+---+---+----> Time

  Effective rate stays between Floor and Cap


SWAPTIONS
=========

An option to enter into an interest rate swap at a future date.

Payer Swaption: Right to PAY fixed / receive floating
  Valuable when: rates rise (higher floating receipts)

Receiver Swaption: Right to RECEIVE fixed / pay floating
  Valuable when: rates fall (lock in high fixed rate)

Pricing: Black's model (modified Black-Scholes for interest rates)
  Payer Swaption = A * [F*N(d1) - K*N(d2)]

  Where:
    A = annuity factor of the underlying swap
    F = forward swap rate
    K = strike swap rate
```

### Credit Default Swaps (CDS)

```
CREDIT DEFAULT SWAP
====================

Protection buyer pays periodic premium to protection seller.
If reference entity defaults, seller pays buyer the loss.

  Protection Buyer                     Protection Seller
  +-------------------+               +-------------------+
  |                   |  Premium leg   |                   |
  |  Bond holder      | ------------> |  Insurance seller  |
  |  (hedging credit  | (e.g., 150bps)|  (taking credit    |
  |   risk)           |               |   risk)            |
  |                   | <------------ |                   |
  |                   | Protection leg|                   |
  +-------------------+ (if default)  +-------------------+

  If NO default: buyer pays premiums until maturity
  If DEFAULT: seller pays (1 - Recovery Rate) * Notional

  CDS Spread and Credit Quality:

  CDS Spread
  2000bps|  *                           <- Distressed
         |  *
  1000bps|   *
         |    *
   500bps|      *
         |         *
   200bps|              *  *            <- Investment grade
   100bps|                     *  *  *  <- High quality
    50bps|                              <- AAA
         +--+--+--+--+--+--+--+--+--+-> Credit Rating
          CCC  B   BB  BBB  A   AA  AAA
```

### The 2008 Financial Crisis: What Went Wrong with Derivatives

```
THE 2008 CRISIS: DERIVATIVES LESSONS
=====================================

The chain of failure:

1. SUBPRIME MORTGAGES: Loans to unqualified borrowers
   |
   v
2. SECURITIZATION: Mortgages packaged into MBS/CDOs
   |
   v
3. TRANCHING: Senior/mezzanine/equity tranches
   "Diversification" supposedly made senior tranches safe
   |
   v
4. RATING AGENCIES: Rated senior tranches AAA
   Using correlation models (Gaussian copula) that BROKE
   |
   v
5. CDS ON CDOs: AIG sold massive CDS protection
   Collected premiums, assumed defaults were uncorrelated
   |
   v
6. CORRELATION SPIKE: When housing fell, ALL tranches failed
   Assumed correlation: 0.2, Realized: 0.9+
   |
   v
7. COUNTERPARTY RISK: AIG couldn't pay CDS claims
   Lehman collapsed. Systemic contagion.

LESSONS FOR QUANTS:
  1. Correlation is NOT constant (it spikes in crises)
  2. Models are approximations (Gaussian copula was a disaster)
  3. Tail risk is REAL (6-sigma events happen)
  4. Counterparty risk matters (even "safe" counterparties can fail)
  5. Complexity + leverage + opacity = systemic risk
  6. The map is NOT the territory

  David Li's Gaussian Copula formula:
  Simple, elegant, tractable... and catastrophically wrong.

  It assumed you could model default correlation with a single
  number derived from market CDS spreads. When the regime
  changed, the entire framework collapsed.
```

---

## Summary and Key Takeaways

```
OPTIONS & DERIVATIVES MASTERY CHECKLIST
========================================

FUNDAMENTALS
[ ] Understand forward/futures pricing via cost of carry
[ ] Know the mechanics of daily mark-to-market
[ ] Grasp swap structures (IRS, TRS, CDS)

OPTION BASICS
[ ] Draw payoff diagrams for any option strategy
[ ] Apply put-call parity
[ ] Read and interpret option chains
[ ] Construct multi-leg strategies (spreads, straddles, condors)

BLACK-SCHOLES
[ ] Know the assumptions and their violations
[ ] Implement the formula from scratch
[ ] Price European calls and puts
[ ] Understand risk-neutral pricing intuition

THE GREEKS
[ ] Calculate all first-order Greeks
[ ] Understand second-order Greeks (vanna, volga, charm)
[ ] Construct delta-neutral portfolios
[ ] Manage portfolio Greeks in aggregate

VOLATILITY
[ ] Calculate historical and implied volatility
[ ] Interpret the volatility surface (smile, skew, term structure)
[ ] Understand VIX and the variance risk premium
[ ] Know Heston and SABR model basics

NUMERICAL METHODS
[ ] Build a binomial tree for American options
[ ] Price European and exotic options via Monte Carlo
[ ] Apply variance reduction techniques
[ ] Implement Longstaff-Schwartz for American options

EXOTIC OPTIONS
[ ] Price barrier, Asian, lookback, and digital options
[ ] Understand when each exotic is appropriate
[ ] Choose the right pricing method for each type

TRADING STRATEGIES
[ ] Implement gamma scalping
[ ] Understand dispersion trading mechanics
[ ] Construct delta-neutral, vega-targeted portfolios
[ ] Trade the volatility surface (skew, term structure)

INTEREST RATE DERIVATIVES
[ ] Price bonds and calculate yields
[ ] Understand swap mechanics and par swap rates
[ ] Know caps, floors, swaptions at a conceptual level
[ ] Learn the lessons of 2008
```

```
PRICING METHOD SELECTION GUIDE
===============================

Option Type          | Best Method         | Alternative
---------------------+---------------------+-------------------
European vanilla     | Black-Scholes       | Binomial, MC
American vanilla     | Binomial tree       | LSM Monte Carlo
Barrier options      | Monte Carlo         | PDE methods
Asian (arithmetic)   | Monte Carlo + CV    | PDE
Asian (geometric)    | Closed form         | Monte Carlo
Lookback             | Monte Carlo         | PDE
Digital/Binary       | Black-Scholes mod   | Monte Carlo
Compound             | Analytical (2D N()) | Monte Carlo
Multi-asset          | Monte Carlo         | PDE (2-3 assets)
Path-dependent       | Monte Carlo         | Lattice methods

CV = Control Variate
PDE = Partial Differential Equation (finite difference)
LSM = Least-Squares Monte Carlo
```

---

## What Comes Next

In **Chapter 14: Portfolio Construction & Optimization**, we will learn how to combine individual positions (including derivatives) into optimally constructed portfolios. We will cover mean-variance optimization, risk parity, factor investing, and how options can be used to shape portfolio return distributions.

The ability to price, hedge, and trade derivatives is what separates a quantitative analyst from a data scientist who happens to work in finance. Master these tools and you will have the foundational skills needed for any derivatives desk, volatility fund, or quantitative trading firm.

---

_Next Chapter: [14-PORTFOLIO-CONSTRUCTION](./14-PORTFOLIO-CONSTRUCTION.md)_
_Previous Chapter: [12-HFT-LOW-LATENCY](./12-HFT-LOW-LATENCY.md)_
_[Return to Roadmap](./00-ROADMAP.md)_
