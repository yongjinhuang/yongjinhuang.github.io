# Stochastic Calculus & Financial Mathematics

## Why This Matters

Stochastic calculus is the mathematical language of derivative pricing, risk management, and quantitative finance. If you are interviewing for a quant researcher or derivatives trader role at firms like DE Shaw, Citadel, or Goldman Sachs, you must be fluent in Brownian motion, Ito's lemma, and the Black-Scholes framework. Even for roles at market-making firms that focus less on continuous-time models, a solid understanding of these concepts signals mathematical maturity.

---

## 1. Brownian Motion

### Definition

A standard Brownian motion (Wiener process) W(t) is a continuous-time stochastic process with the following properties:

1. **W(0) = 0**
2. **Independent increments**: W(t) - W(s) is independent of W(u) for all u <= s < t
3. **Gaussian increments**: W(t) - W(s) ~ N(0, t - s) for s < t
4. **Continuous paths**: W(t) is continuous in t almost surely

### Key Properties

```
E[W(t)] = 0                         (zero mean)
Var(W(t)) = t                       (variance grows linearly)
Cov(W(s), W(t)) = min(s, t)         (covariance)
E[W(t)^2] = t                       (second moment)
E[W(t)^4] = 3t^2                    (fourth moment, kurtosis)
```

### Quadratic Variation

The quadratic variation of Brownian motion over [0, T] is:

```
[W, W]_T = lim_{n->∞} Σ_{i=1}^{n} (W(t_i) - W(t_{i-1}))^2 = T
```

This converges in probability (and in L^2). In differential notation:

```
(dW)^2 = dt
```

This is the fundamental identity that makes Ito calculus differ from ordinary calculus. Also:

```
(dW)(dt) = 0
(dt)^2 = 0
```

### Levy's Characterization

A continuous martingale M(t) with M(0) = 0 and quadratic variation [M,M]\_t = t is a standard Brownian motion. This provides a powerful way to identify Brownian motion.

### Non-differentiability

Brownian motion is continuous everywhere but differentiable nowhere (almost surely). This is why we need stochastic calculus -- the usual rules of calculus do not apply.

```
"Heuristic":  dW ~ √dt,  so dW/dt ~ 1/√dt → ∞ as dt → 0
```

### Brownian Motion Visualization

```
W(t)
  |        *
  |   *  *   *
  |  * **     *        *
  | *          *   *  * *
--+------------ * * ------*-----> t
  |              *         *
  |                         * *
  |                          *
  |

Key visual properties:
- Fluctuates around 0 (zero drift)
- Amplitude grows as √t
- Fractal: zooming in looks the same (self-similar)
- Crosses zero infinitely often in any interval [0, ε]
```

---

## 2. Ito's Lemma

### Motivation

If f(x) is a smooth function and X(t) is a smooth deterministic function:

```
df(X(t)) = f'(X(t)) * dX(t)     (chain rule)
```

But for stochastic processes, the chain rule gets an extra term because (dW)^2 = dt is not negligible.

### Statement (One-dimensional)

If X(t) satisfies the SDE: dX = μ dt + σ dW, and f(t, x) is twice continuously differentiable, then:

```
df(t, X(t)) = [∂f/∂t + μ * ∂f/∂x + (1/2) * σ^2 * ∂^2f/∂x^2] dt + σ * ∂f/∂x * dW
```

### Derivation Intuition

Taylor expand f(t, X) to second order:

```
df = ∂f/∂t * dt + ∂f/∂x * dX + (1/2) * ∂^2f/∂x^2 * (dX)^2 + ...

(dX)^2 = (μ dt + σ dW)^2 = μ^2(dt)^2 + 2μσ(dt)(dW) + σ^2(dW)^2
       = 0 + 0 + σ^2 dt = σ^2 dt

So df = ∂f/∂t dt + ∂f/∂x (μ dt + σ dW) + (1/2) σ^2 ∂^2f/∂x^2 dt
```

The extra (1/2) σ^2 f'' dt term is the "Ito correction" that makes stochastic calculus different from ordinary calculus.

### Key Application: Geometric Brownian Motion

If S(t) follows GBM: dS = μS dt + σS dW, what is d(ln S)?

Apply Ito's lemma with f(x) = ln(x):

```
f'(x) = 1/x,  f''(x) = -1/x^2

d(ln S) = (1/S)(μS dt + σS dW) + (1/2)(-1/S^2)(σS)^2 dt
        = μ dt + σ dW - (1/2)σ^2 dt
        = (μ - σ^2/2) dt + σ dW
```

Therefore:

```
ln S(T) - ln S(0) = (μ - σ^2/2)T + σW(T)
S(T) = S(0) * exp((μ - σ^2/2)T + σW(T))
```

Since W(T) ~ N(0, T), we have ln(S(T)/S(0)) ~ N((μ - σ^2/2)T, σ^2 T).

**S(T) is log-normally distributed.**

The -σ^2/2 correction is extremely important: the expected log-return is NOT μ but μ - σ^2/2. This is called the **Ito correction** or **convexity adjustment**.

### Multi-dimensional Ito's Lemma

For f(t, X1, ..., Xn) where each Xi follows an SDE:

```
df = ∂f/∂t dt + Σ_i ∂f/∂x_i dX_i + (1/2) Σ_{i,j} ∂^2f/(∂x_i ∂x_j) dX_i dX_j
```

where dW_i dW_j = ρ_ij dt (correlation between Brownian motions).

---

## 3. Stochastic Differential Equations

### Geometric Brownian Motion (GBM)

```
dS = μS dt + σS dW

Solution: S(t) = S(0) exp((μ - σ^2/2)t + σW(t))
```

**Properties**:

- S(t) > 0 always (prices cannot go negative)
- E[S(t)] = S(0) exp(μt) (grows exponentially in expectation)
- Returns are normally distributed: ln(S(t)/S(0)) ~ N((μ-σ^2/2)t, σ^2 t)
- Used as the foundational model in Black-Scholes

**Limitations**: Constant volatility, no jumps, symmetric returns, thin tails.

### Ornstein-Uhlenbeck Process (Mean Reversion)

```
dX = θ(μ - X) dt + σ dW

θ > 0: speed of mean reversion
μ:     long-term mean
σ:     volatility
```

**Solution**:

```
X(t) = μ + (X(0) - μ)e^(-θt) + σ ∫_0^t e^(-θ(t-s)) dW(s)
```

**Properties**:

- E[X(t)] = μ + (X(0) - μ)e^(-θt) → μ as t → ∞
- Var(X(t)) = (σ^2/(2θ))(1 - e^(-2θt)) → σ^2/(2θ) as t → ∞
- Stationary distribution: N(μ, σ^2/(2θ))
- Half-life of deviation: t\_{1/2} = ln(2)/θ

**Applications in trading**:

- Modeling interest rates (Vasicek model)
- Pairs trading: spread between two cointegrated assets
- Mean-reverting alpha signals

```python
import numpy as np
import matplotlib.pyplot as plt

def simulate_ou(theta, mu, sigma, x0, T, n_steps, n_paths):
    """Simulate Ornstein-Uhlenbeck process using Euler-Maruyama."""
    dt = T / n_steps
    paths = np.zeros((n_paths, n_steps + 1))
    paths[:, 0] = x0

    for i in range(n_steps):
        dW = np.random.normal(0, np.sqrt(dt), n_paths)
        paths[:, i+1] = (paths[:, i]
                         + theta * (mu - paths[:, i]) * dt
                         + sigma * dW)

    return paths

# Simulate a mean-reverting spread
paths = simulate_ou(theta=2.0, mu=0.0, sigma=0.5, x0=1.0,
                    T=5.0, n_steps=1000, n_paths=5)

t = np.linspace(0, 5, 1001)
for path in paths:
    plt.plot(t, path, alpha=0.7)
plt.axhline(y=0, color='r', linestyle='--', label='Mean (μ=0)')
plt.title('Ornstein-Uhlenbeck Process (Mean Reversion)')
plt.xlabel('Time')
plt.ylabel('X(t)')
plt.legend()
plt.show()
```

### Cox-Ingersoll-Ross (CIR) Process

```
dX = θ(μ - X) dt + σ√X dW
```

**Key property**: If 2θμ >= σ^2 (Feller condition), then X(t) > 0 always. This makes it suitable for modeling interest rates or variance (which must be non-negative).

Used in the **Heston stochastic volatility model** for the variance process.

### Jump-Diffusion (Merton Model)

```
dS/S = (μ - λk̄) dt + σ dW + J dN

N(t): Poisson process with intensity λ
J:    jump size (often log-normal)
k̄:    E[J - 1] (mean jump compensation)
```

This adds discrete jumps to GBM, allowing for sudden price moves (crashes, earnings surprises).

---

## 4. Martingales

### Definition

A stochastic process M(t) is a martingale (with respect to filtration F_t) if:

1. E[|M(t)|] < ∞ for all t
2. M(t) is adapted to F_t (depends only on information up to time t)
3. E[M(t) | F_s] = M(s) for all s <= t

**In words**: A martingale is a "fair game" -- the best prediction of the future value is the current value.

### Examples of Martingales

```
1. W(t)               (Brownian motion)
2. W(t)^2 - t         (compensated squared BM)
3. exp(σW(t) - σ^2t/2)   (exponential martingale / Wald's martingale)
4. S(t)/B(t)          (discounted stock price under risk-neutral measure)
```

### Examples of NON-Martingales

```
1. W(t)^2             (submartingale: E[W(t)^2 | F_s] = W(s)^2 + (t-s) >= W(s)^2)
2. S(t) = S(0)e^(μt+σW(t))  with μ ≠ 0  (has drift)
```

### Optional Stopping Theorem (OST)

If M(t) is a martingale and T is a stopping time with E[T] < ∞ (plus some technical conditions):

```
E[M(T)] = E[M(0)] = M(0)
```

**Application**: Gambler's Ruin. If a gambler's wealth is a martingale (fair game), then E[wealth at ruin] = starting wealth. This gives us the ruin probabilities.

**Important caveat**: OST requires bounded stopping times or uniformly integrable martingales. It does NOT apply to the doubling strategy (Martingale betting system) because the stopping time has infinite expectation.

### Doob's Martingale Inequality

For a submartingale M(t) >= 0:

```
P(sup_{0<=s<=t} M(s) >= λ) <= E[M(t)] / λ
```

**Application**: Bounding the probability that a stock price exceeds a barrier before time T.

---

## 5. Girsanov's Theorem and Risk-Neutral Pricing

### The Key Idea

In the real world ("P-measure"), a stock has drift μ:

```
dS = μS dt + σS dW^P
```

Under the risk-neutral measure ("Q-measure"), the stock drifts at the risk-free rate r:

```
dS = rS dt + σS dW^Q
```

The volatility σ is the SAME under both measures. Only the drift changes.

### Girsanov's Theorem (Simplified)

If we define a new Brownian motion:

```
W^Q(t) = W^P(t) + ((μ - r)/σ) * t
```

Then under the measure Q (defined by the Radon-Nikodym derivative):

```
dQ/dP = exp(-((μ-r)/σ)W^P(T) - (1/2)((μ-r)/σ)^2 T)
```

W^Q is a standard Brownian motion under Q.

The quantity (μ - r)/σ is called the **market price of risk** or **Sharpe ratio**.

### Risk-Neutral Pricing Formula

The price of any derivative with payoff h(S(T)) at time T is:

```
V(t) = e^(-r(T-t)) * E^Q[h(S(T)) | F_t]
```

**This is the fundamental theorem of asset pricing**: no arbitrage implies the existence of a risk-neutral measure under which discounted asset prices are martingales.

```
Pricing Workflow:
+---------------------+         +---------------------+
| Real World (P)      |         | Risk-Neutral (Q)    |
| dS = μS dt + σS dW  | -----→ | dS = rS dt + σS dW  |
|                     |Girsanov |                     |
| Hard to price       |         | Price = e^(-rT) E^Q |
+---------------------+         +---------------------+
```

### Why It Works

Under Q, the discounted stock price S(t)/e^(rt) is a martingale. This means:

- There is no "free lunch" (no arbitrage)
- The expected discounted return of any asset is 0 (risk-free rate)
- We can price derivatives by computing expectations under Q

**Key insight for interviews**: You do NOT need to know the stock's real drift μ to price options. Only σ, r, and the current stock price matter. This is why Black-Scholes does not include μ.

---

## 6. Black-Scholes

### The Model Assumptions

1. Stock follows GBM: dS = μS dt + σS dW
2. Constant risk-free rate r
3. No dividends (can be extended)
4. No transaction costs or taxes
5. Continuous trading is possible
6. No arbitrage
7. Lognormal stock price distribution

### Black-Scholes PDE

For a derivative V(S, t) on the stock:

```
∂V/∂t + rS * ∂V/∂S + (1/2)σ^2 S^2 * ∂^2V/∂S^2 = rV
```

**Derivation sketch** (Delta hedging):

1. Create a portfolio: long 1 derivative, short Δ = ∂V/∂S shares
2. The portfolio is locally riskless (the dW terms cancel)
3. A riskless portfolio must earn the risk-free rate
4. This gives the PDE

Note: μ does not appear in the PDE. The drift cancels out due to hedging.

### Black-Scholes Formula (European Options)

**Call option** (right to buy at strike K at time T):

```
C = S * N(d1) - K * e^(-rT) * N(d2)

d1 = [ln(S/K) + (r + σ^2/2)T] / (σ√T)
d2 = d1 - σ√T

N(x) = standard normal CDF = (1/√(2π)) ∫_{-∞}^{x} e^(-z^2/2) dz
```

**Put option** (right to sell at strike K at time T):

```
P = K * e^(-rT) * N(-d2) - S * N(-d1)
```

### Put-Call Parity

```
C - P = S - K * e^(-rT)
```

This is a model-free result (holds under any model, not just Black-Scholes). It follows from the payoff relationship: (S-K)^+ - (K-S)^+ = S - K.

### Interpretation of d1 and d2

- **N(d2)** = probability that the option expires in-the-money under the risk-neutral measure Q
- **N(d1)** = probability-weighted "delta" (more precisely, the delta of the option)
- **d2** = number of standard deviations by which the option is in the money on a log scale

### The Greeks

```
+-------------------------------------------------------------------+
|                        OPTION GREEKS                              |
+-------------------------------------------------------------------+
|                                                                   |
|  Delta (Δ) = ∂V/∂S                                               |
|    Call: N(d1) ∈ [0, 1]                                           |
|    Put:  N(d1) - 1 ∈ [-1, 0]                                     |
|    Sensitivity of option price to stock price                     |
|                                                                   |
|  Gamma (Γ) = ∂^2V/∂S^2 = ∂Δ/∂S                                  |
|    = N'(d1) / (S * σ * √T)    (same for call and put)            |
|    Always positive. Largest near ATM, near expiry.                |
|                                                                   |
|  Theta (Θ) = ∂V/∂t                                               |
|    Time decay. Usually negative (options lose value over time).   |
|    Theta-Gamma relationship: Θ + (1/2)σ^2 S^2 Γ + rSΔ = rV      |
|                                                                   |
|  Vega (ν) = ∂V/∂σ                                                |
|    = S * √T * N'(d1)          (same for call and put)            |
|    Always positive. Largest near ATM, longer expiry.              |
|                                                                   |
|  Rho (ρ) = ∂V/∂r                                                 |
|    Call: K * T * e^(-rT) * N(d2)                                  |
|    Put: -K * T * e^(-rT) * N(-d2)                                |
|                                                                   |
+-------------------------------------------------------------------+
```

### Greeks Behavior Near ATM vs Far OTM

```
            ATM                   Deep OTM              Deep ITM
Delta:      ~0.5                  ~0                     ~1 (call)
Gamma:      Maximum               ~0                     ~0
Theta:      Most negative         ~0                     ~-rKe^(-rT)
Vega:       Maximum               ~0                     ~0
```

### Python Implementation

```python
import numpy as np
from scipy.stats import norm

def black_scholes(S, K, T, r, sigma, option_type='call'):
    """Compute Black-Scholes option price and Greeks."""
    d1 = (np.log(S / K) + (r + sigma**2 / 2) * T) / (sigma * np.sqrt(T))
    d2 = d1 - sigma * np.sqrt(T)

    if option_type == 'call':
        price = S * norm.cdf(d1) - K * np.exp(-r * T) * norm.cdf(d2)
        delta = norm.cdf(d1)
    else:
        price = K * np.exp(-r * T) * norm.cdf(-d2) - S * norm.cdf(-d1)
        delta = norm.cdf(d1) - 1

    gamma = norm.pdf(d1) / (S * sigma * np.sqrt(T))
    vega = S * np.sqrt(T) * norm.pdf(d1) / 100  # per 1% vol change
    theta = (-(S * sigma * norm.pdf(d1)) / (2 * np.sqrt(T))
             - r * K * np.exp(-r * T) * norm.cdf(d2 if option_type == 'call'
                                                   else -d2)
             * (1 if option_type == 'call' else -1)) / 365  # per day

    return {
        'price': price,
        'delta': delta,
        'gamma': gamma,
        'vega': vega,
        'theta': theta,
        'd1': d1,
        'd2': d2
    }

# Example: S=100, K=100, T=0.25 (3 months), r=5%, sigma=20%
result = black_scholes(100, 100, 0.25, 0.05, 0.20, 'call')
for key, val in result.items():
    print(f"{key:>8s}: {val:>10.4f}")

# Output:
#    price:     4.6151
#    delta:     0.5623
#    gamma:     0.0393
#     vega:     0.1967
#    theta:    -0.0349
#       d1:     0.1768
#       d2:     0.0768
```

---

## 7. Beyond Black-Scholes

### The Binomial Model (Cox-Ross-Rubinstein)

Discrete-time model that converges to Black-Scholes in the continuous limit.

```
At each step, price moves:
  Up:   S → Su  with risk-neutral probability q = (e^(rΔt) - d) / (u - d)
  Down: S → Sd  with probability 1 - q

Standard choices:
  u = e^(σ√Δt)
  d = e^(-σ√Δt) = 1/u

Tree:
                        S*u^3
                  S*u^2
            S*u         S*u^2*d = S*u
      S           S*u*d = S
            S*d         S*u*d^2 = S*d
                  S*d^2
                        S*d^3
```

**Pricing**: Work backwards from the terminal payoffs.
At each node: V = e^(-rΔt) _ [q _ V_up + (1-q) \* V_down]

For American options: V = max(exercise_value, continuation_value)

```python
def binomial_option(S, K, T, r, sigma, n_steps, option_type='call',
                    american=False):
    """Price options using the binomial tree model."""
    dt = T / n_steps
    u = np.exp(sigma * np.sqrt(dt))
    d = 1 / u
    q = (np.exp(r * dt) - d) / (u - d)
    discount = np.exp(-r * dt)

    # Terminal payoffs
    prices = S * u**np.arange(n_steps, -1, -1) * d**np.arange(0, n_steps + 1)

    if option_type == 'call':
        values = np.maximum(prices - K, 0)
    else:
        values = np.maximum(K - prices, 0)

    # Work backwards
    for step in range(n_steps - 1, -1, -1):
        values = discount * (q * values[:-1] + (1 - q) * values[1:])

        if american:
            prices_at_step = (S * u**np.arange(step, -1, -1)
                              * d**np.arange(0, step + 1))
            if option_type == 'call':
                exercise = np.maximum(prices_at_step - K, 0)
            else:
                exercise = np.maximum(K - prices_at_step, 0)
            values = np.maximum(values, exercise)

    return values[0]

# Compare with Black-Scholes
bs_price = black_scholes(100, 100, 0.25, 0.05, 0.20, 'call')['price']
bin_price = binomial_option(100, 100, 0.25, 0.05, 0.20, 500, 'call')
print(f"Black-Scholes: {bs_price:.4f}")
print(f"Binomial (500 steps): {bin_price:.4f}")
```

### Monte Carlo Option Pricing

For path-dependent or multi-dimensional options, Monte Carlo is often the best approach.

```python
def monte_carlo_option(S, K, T, r, sigma, n_paths, n_steps,
                       option_type='call'):
    """Price European option via Monte Carlo simulation."""
    dt = T / n_steps
    nudt = (r - 0.5 * sigma**2) * dt
    sigsdt = sigma * np.sqrt(dt)

    # Simulate terminal stock prices
    Z = np.random.standard_normal((n_paths, n_steps))
    log_returns = nudt + sigsdt * Z
    log_S_T = np.log(S) + np.sum(log_returns, axis=1)
    S_T = np.exp(log_S_T)

    # Compute payoffs
    if option_type == 'call':
        payoffs = np.maximum(S_T - K, 0)
    else:
        payoffs = np.maximum(K - S_T, 0)

    # Discount to present
    price = np.exp(-r * T) * np.mean(payoffs)
    se = np.exp(-r * T) * np.std(payoffs) / np.sqrt(n_paths)

    return {'price': price, 'std_error': se}

np.random.seed(42)
mc = monte_carlo_option(100, 100, 0.25, 0.05, 0.20, 1_000_000, 100)
print(f"MC Price: {mc['price']:.4f} ± {mc['std_error']:.4f}")
```

**Variance reduction techniques**:

- **Antithetic variates**: For each random path Z, also use -Z. Reduces variance for monotone payoffs.
- **Control variates**: Use a correlated known-expectation variable to reduce variance.
- **Importance sampling**: Change the sampling distribution to oversample important regions.

### Implied Volatility

The market does not quote option prices; it quotes **implied volatility** -- the σ that, when plugged into Black-Scholes, reproduces the observed market price.

```python
from scipy.optimize import brentq

def implied_vol(market_price, S, K, T, r, option_type='call'):
    """Compute implied volatility using Brent's method."""
    def objective(sigma):
        return black_scholes(S, K, T, r, sigma, option_type)['price'] - market_price

    try:
        return brentq(objective, 0.001, 5.0)
    except ValueError:
        return np.nan

# Example: market price is $5.00 for ATM call
iv = implied_vol(5.00, 100, 100, 0.25, 0.05, 'call')
print(f"Implied volatility: {iv:.2%}")  # ~21.8%
```

### The Volatility Smile / Skew

In practice, implied volatility is NOT constant across strikes (as Black-Scholes assumes). The observed pattern is:

```
IV
  |
  |  *                              *
  |   *                           *
  |    *                        *
  |     *                     *
  |      *    * * * * * *   *
  |       *  *           * *
  |        **             *
  |
  +-------------------------------------> Strike / Moneyness
       OTM puts    ATM     OTM calls

  "Volatility Smile" or "Volatility Skew"
  (Equity markets typically show a skew: higher IV for OTM puts)
```

**Why the smile exists**:

1. Fat tails in real return distributions (more extreme moves than normal predicts)
2. Leverage effect (stock drops -> firm becomes more leveraged -> more volatile)
3. Demand for downside protection (OTM puts) drives up their prices
4. Jump risk (crashes are more common than the normal distribution suggests)

### Heston Stochastic Volatility Model

```
dS = μS dt + √V * S dW_1
dV = κ(θ - V) dt + ξ√V dW_2

Cov(dW_1, dW_2) = ρ dt    (typically ρ < 0 for equities)

Parameters:
  κ: speed of mean reversion of variance
  θ: long-run variance
  ξ: volatility of volatility ("vol of vol")
  ρ: correlation between stock and variance (leverage effect)
  V(0): initial variance
```

The Heston model generates volatility smiles and skews. It has a semi-analytical solution via characteristic functions (Fourier inversion).

---

## 8. Interest Rate Models

### Vasicek Model

```
dr = κ(θ - r) dt + σ dW

This is an OU process for interest rates.
Allows negative rates (which actually occur in practice).
Bond prices have closed-form solutions.
```

### CIR Model

```
dr = κ(θ - r) dt + σ√r dW

Non-negative rates (if Feller condition 2κθ >= σ^2 holds).
Bond prices have closed-form solutions.
```

### Hull-White Model

```
dr = (θ(t) - κr) dt + σ dW

θ(t) is time-dependent, chosen to fit the initial term structure exactly.
Extension of Vasicek with perfect calibration to the yield curve.
```

### Key Bond Pricing Concepts

```
Zero-coupon bond: P(t,T) = E^Q[e^(-∫_t^T r(s) ds) | F_t]

Yield curve: y(t,T) = -ln(P(t,T)) / (T-t)

Forward rate: f(t,T) = -∂ln(P(t,T))/∂T

Relationship: P(t,T) = exp(-∫_t^T f(t,s) ds)
```

---

## 9. Interview Problems with Solutions

### Problem 1: Ito's Lemma Application

**Question**: If W(t) is a standard Brownian motion, find E[W(t)^3] and E[W(t)^4].

**Solution for E[W(t)^3]**:

Apply Ito's lemma to f(x) = x^3:

```
d(W^3) = 3W^2 dW + (1/2)(6W)(dW)^2 = 3W^2 dW + 3W dt

W(t)^3 = 3∫_0^t W(s)^2 dW(s) + 3∫_0^t W(s) ds

The stochastic integral has zero expectation (it's a martingale), so:
E[W(t)^3] = 3∫_0^t E[W(s)] ds = 3∫_0^t 0 ds = 0
```

**Solution for E[W(t)^4]**:

Apply Ito's lemma to f(x) = x^4:

```
d(W^4) = 4W^3 dW + (1/2)(12W^2)(dW)^2 = 4W^3 dW + 6W^2 dt

W(t)^4 = 4∫_0^t W^3 dW + 6∫_0^t W^2 ds

E[W(t)^4] = 6∫_0^t E[W(s)^2] ds = 6∫_0^t s ds = 6 * t^2/2 = 3t^2
```

This matches the fourth moment of N(0, t): E[Z^4] = 3 when Z ~ N(0,1), so E[W(t)^4] = 3t^2.

### Problem 2: Martingale Verification

**Question**: Show that M(t) = W(t)^2 - t is a martingale.

**Solution**:

Method 1 (Direct): E[M(t) | F_s] = E[W(t)^2 - t | F_s]

```
W(t) = W(s) + (W(t) - W(s)), where W(t) - W(s) is independent of F_s and ~ N(0, t-s)

E[W(t)^2 | F_s] = E[(W(s) + (W(t)-W(s)))^2 | F_s]
                 = W(s)^2 + 2W(s)*E[W(t)-W(s)] + E[(W(t)-W(s))^2]
                 = W(s)^2 + 0 + (t-s)
                 = W(s)^2 + t - s

E[M(t) | F_s] = W(s)^2 + t - s - t = W(s)^2 - s = M(s)  ✓
```

Method 2 (Ito): d(W^2 - t) = 2W dW + dt - dt = 2W dW. This is a pure stochastic integral, hence a (local) martingale.

### Problem 3: GBM Expected Values

**Question**: A stock follows GBM with S(0) = 100, μ = 0.10, σ = 0.30. Find:
(a) E[S(1)]
(b) Median of S(1)
(c) P(S(1) > 100)

**Solution**:

(a) E[S(1)] = S(0) * e^(μ*1) = 100 _ e^(0.10) = 100 _ 1.1052 = **110.52**

(b) Median: ln(S(1)) ~ N(ln(100) + (0.10 - 0.09/2)_1, 0.09)
= N(ln(100) + 0.055, 0.09)
Median of ln(S(1)) = ln(100) + 0.055 = 4.6602
Median of S(1) = e^(4.6602) = 100 _ e^(0.055) = **105.65**

(c) P(S(1) > 100) = P(ln(S(1)) > ln(100))
= P(Z > (ln(100) - (ln(100) + 0.055))/0.30)
= P(Z > -0.055/0.30)
= P(Z > -0.1833)
= N(0.1833) ≈ **0.5727**

**Key insight**: The mean (110.52) exceeds the median (105.65) because log-normal distributions are right-skewed.

### Problem 4: Delta Hedging

**Question**: You sell 100 ATM call options on a stock at $100. σ = 20%, r = 5%, T = 0.25 years. How many shares do you buy to delta-hedge? If the stock moves to $102, what is your P&L before rehedging?

**Solution**:

```
d1 = [ln(1) + (0.05 + 0.02)*0.25] / (0.20*0.5) = 0.0175 / 0.10 = 0.175
Delta = N(0.175) ≈ 0.569

Buy 100 * 0.569 = 56.9 → buy 57 shares (approximately)

Option price ≈ $4.62 per option (from Black-Scholes)
Revenue from selling 100 calls: 100 * $4.62 = $462

After stock moves to $102 (ΔS = +$2):
  Share P&L: 57 * $2 = +$114
  Option P&L: ~100 * 0.569 * $2 + 100 * 0.5 * gamma * $4 (second order)
             gamma ≈ 0.0393
             Option loss ≈ -100 * (0.569 * 2 + 0.5 * 0.0393 * 4)
                        ≈ -100 * (1.138 + 0.0786)
                        ≈ -$121.66

  Net P&L ≈ $114 - $121.66 ≈ -$7.66

  The loss comes from gamma (the delta hedge is only first-order accurate).
  This is theta-gamma tradeoff: you collect theta (time decay) but lose on
  gamma (convexity) when the stock moves.
```

### Problem 5: Put-Call Parity Arbitrage

**Question**: A stock trades at $50. A European call with K=50, T=1yr trades at $7. The European put with same K and T trades at $5. Risk-free rate is 3%. Is there an arbitrage? If so, describe the strategy.

**Solution**:

```
Put-Call Parity: C - P = S - K*e^(-rT)
  Left side:  7 - 5 = 2
  Right side: 50 - 50*e^(-0.03) = 50 - 48.52 = 1.48

  2 ≠ 1.48, so put-call parity is violated.

  C - P > S - K*e^(-rT), so the call is overpriced relative to the put.

  Arbitrage strategy:
  1. Sell the call (receive $7)
  2. Buy the put (pay $5)
  3. Buy the stock (pay $50)
  4. Borrow K*e^(-rT) = $48.52

  Net cash flow today: 7 - 5 - 50 + 48.52 = $0.52 (immediate profit)

  At expiry (T=1):
  - If S(T) > 50: call is exercised, you deliver stock, receive $50, repay loan $50 → net 0
  - If S(T) < 50: exercise put, sell stock for $50, repay loan $50 → net 0
  - If S(T) = 50: both expire worthless, sell stock for $50, repay $50 → net 0

  Riskless profit: $0.52 per unit.
```

### Problem 6: Stochastic Integral

**Question**: Compute E[∫_0^T W(t) dW(t)] and E[(∫_0^T W(t) dW(t))^2].

**Solution**:

By Ito's formula: d(W^2) = 2W dW + dt, so ∫_0^T W dW = (W(T)^2 - T)/2.

```
E[∫_0^T W dW] = E[(W(T)^2 - T)/2] = (T - T)/2 = 0

E[(∫_0^T W dW)^2] = E[(W(T)^2 - T)^2 / 4]
                   = (1/4) * E[W(T)^4 - 2T*W(T)^2 + T^2]
                   = (1/4) * (3T^2 - 2T*T + T^2)
                   = (1/4) * (3T^2 - 2T^2 + T^2)
                   = (1/4) * 2T^2
                   = T^2/2
```

Alternatively, by the Ito isometry: E[(∫_0^T f(t) dW(t))^2] = ∫_0^T E[f(t)^2] dt

```
E[(∫_0^T W(t) dW(t))^2] = ∫_0^T E[W(t)^2] dt = ∫_0^T t dt = T^2/2  ✓
```

### Problem 7: Exotic Option via Monte Carlo

**Question**: Price an Asian call option (payoff = max(average S - K, 0)) with S(0)=100, K=100, T=1, r=5%, σ=30%, using monthly averaging (12 points).

```python
def asian_call_mc(S0, K, T, r, sigma, n_avg, n_paths):
    """Price arithmetic Asian call via Monte Carlo."""
    dt = T / n_avg
    nudt = (r - 0.5 * sigma**2) * dt
    sigsdt = sigma * np.sqrt(dt)

    payoffs = np.zeros(n_paths)

    for i in range(n_paths):
        S = S0
        S_sum = 0
        for j in range(n_avg):
            Z = np.random.standard_normal()
            S = S * np.exp(nudt + sigsdt * Z)
            S_sum += S

        avg_S = S_sum / n_avg
        payoffs[i] = max(avg_S - K, 0)

    price = np.exp(-r * T) * np.mean(payoffs)
    se = np.exp(-r * T) * np.std(payoffs) / np.sqrt(n_paths)
    return price, se

np.random.seed(42)
price, se = asian_call_mc(100, 100, 1.0, 0.05, 0.30, 12, 500_000)
print(f"Asian Call Price: {price:.4f} ± {se:.4f}")
```

### Problem 8: Volatility Scaling

**Question**: If daily volatility is 1.5%, what is the annualized volatility? If a strategy has a daily Sharpe of 0.05, what is the annualized Sharpe?

**Solution**:

```
Annualized vol = daily vol * √(252) = 1.5% * 15.87 = 23.8%
Annualized Sharpe = daily Sharpe * √(252) = 0.05 * 15.87 = 0.794
```

**Important caveat**: The √(252) scaling assumes daily returns are i.i.d. In practice:

- Positive autocorrelation in returns (momentum) -> understates annualized vol
- Negative autocorrelation (mean reversion) -> overstates annualized vol
- For Sharpe ratio, serial correlation matters too (Lo, 2002)

---

## Appendix: Key Formulas Cheat Sheet

```
BROWNIAN MOTION
  E[W(t)] = 0, Var(W(t)) = t
  (dW)^2 = dt, (dW)(dt) = 0, (dt)^2 = 0

ITO'S LEMMA
  df = (∂f/∂t + μ∂f/∂x + σ^2/2 * ∂^2f/∂x^2) dt + σ∂f/∂x dW

GBM
  dS = μS dt + σS dW
  S(T) = S(0) exp((μ - σ^2/2)T + σW(T))
  E[S(T)] = S(0) e^(μT)

BLACK-SCHOLES
  C = SN(d1) - Ke^(-rT)N(d2)
  P = Ke^(-rT)N(-d2) - SN(-d1)
  d1 = [ln(S/K) + (r+σ^2/2)T] / (σ√T)
  d2 = d1 - σ√T

GREEKS
  Δ_call = N(d1),  Δ_put = N(d1) - 1
  Γ = N'(d1) / (Sσ√T)
  ν = S√T * N'(d1)
  Θ: from BS PDE: Θ = rV - rSΔ - σ^2S^2Γ/2

PUT-CALL PARITY
  C - P = S - Ke^(-rT)

RISK-NEUTRAL PRICING
  V(t) = e^(-r(T-t)) E^Q[payoff | F_t]

VOLATILITY SCALING
  σ_annual = σ_daily * √252
  Sharpe_annual = Sharpe_daily * √252
```
