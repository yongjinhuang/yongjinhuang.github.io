# Chapter 2: Mathematical Foundations for Quantitative Finance

## Why Math Matters in Quant Trading

Every trading strategy is, at its core, a mathematical statement about the world. When you say "this stock is cheap relative to its sector," you are making a statistical claim. When you hedge a portfolio of options, you are solving a partial differential equation. When you build an execution algorithm, you are running an optimization.

This chapter covers the mathematical toolkit that separates quantitative traders from everyone else. We start with probability and statistics (the language of uncertainty), move through linear algebra and calculus (the language of structure and change), ascend to stochastic calculus (the crown jewel of quant finance math), and finish with numerical methods and information theory.

```
+------------------------------------------------------------------------+
|              MATHEMATICAL FOUNDATIONS - DEPENDENCY MAP                   |
+------------------------------------------------------------------------+
|                                                                        |
|  PROBABILITY & STATISTICS                                              |
|  +-----------------------+                                             |
|  | Random Variables       |                                             |
|  | Distributions          | ----+                                      |
|  | Hypothesis Testing     |     |                                      |
|  | Regression             |     |                                      |
|  +-----------------------+     |                                      |
|           |                     |                                      |
|           v                     v                                      |
|  LINEAR ALGEBRA           CALCULUS & OPTIMIZATION                      |
|  +-----------------------+  +------------------------+                 |
|  | Matrices & Vectors     |  | Derivatives & Integrals |                 |
|  | Eigendecomposition     |  | Gradients & Hessians    |                 |
|  | Covariance Matrices    |  | Lagrange Multipliers    |                 |
|  +-----------------------+  +------------------------+                 |
|           |                     |                                      |
|           +----------+----------+                                      |
|                      |                                                 |
|                      v                                                 |
|           STOCHASTIC CALCULUS                                          |
|           +--------------------------+                                 |
|           | Brownian Motion           |                                 |
|           | Ito's Lemma               |                                 |
|           | SDEs & Risk-Neutral       |                                 |
|           | Pricing                   |                                 |
|           +--------------------------+                                 |
|                      |                                                 |
|           +----------+----------+                                      |
|           |                     |                                      |
|           v                     v                                      |
|  NUMERICAL METHODS      INFORMATION THEORY                             |
|  +-------------------+  +--------------------+                         |
|  | Monte Carlo        |  | Entropy             |                         |
|  | Finite Differences  |  | KL Divergence       |                         |
|  | Root Finding       |  | Feature Selection   |                         |
|  +-------------------+  +--------------------+                         |
|                                                                        |
+------------------------------------------------------------------------+
```

---

## 1. Probability Theory

Probability is the mathematical language of uncertainty. Since financial markets are inherently uncertain, probability theory is the single most important mathematical tool in quantitative finance.

### 1.1 Sample Spaces, Events, and Axioms

A **sample space** (denoted $\Omega$) is the set of all possible outcomes of a random experiment.

**Example**: Flip a coin twice.

```
Sample Space: Omega = {HH, HT, TH, TT}

Each outcome:
  HH  -->  Both heads
  HT  -->  First heads, second tails
  TH  -->  First tails, second heads
  TT  -->  Both tails
```

An **event** is any subset of the sample space. For example, "at least one head" = {HH, HT, TH}.

**Financial Example**: Consider a stock that can go up (+1%), stay flat (0%), or go down (-1%) tomorrow.

```
Omega = { up, flat, down }

Events:
  A = { up }            "Stock goes up"
  B = { up, flat }      "Stock doesn't go down"
  C = { down }          "Stock goes down"
```

#### Kolmogorov's Axioms of Probability

For any probability measure $P$:

1. **Non-negativity**: $P(A) \geq 0$ for every event $A$
2. **Normalization**: $P(\Omega) = 1$ (something must happen)
3. **Countable Additivity**: For mutually exclusive events $A_1, A_2, \ldots$:

$$P(A_1 \cup A_2 \cup \ldots) = P(A_1) + P(A_2) + \ldots$$

These three axioms generate everything else in probability theory. Every formula we use in quant finance ultimately traces back to these.

### 1.2 Conditional Probability and Bayes' Theorem

**Conditional probability** answers: "Given that B has occurred, what is the probability of A?"

$$P(A|B) = \frac{P(A \cap B)}{P(B)}, \quad P(B) > 0$$

**Worked Example**: A trading signal fires on 10% of days. When it fires, the market goes up 70% of the time. When it does not fire, the market goes up 45% of the time.

```
Given:
  P(Signal)     = 0.10
  P(Up|Signal)  = 0.70
  P(Up|~Signal) = 0.45

What is P(Up)?

P(Up) = P(Up|Signal) * P(Signal) + P(Up|~Signal) * P(~Signal)
      = 0.70 * 0.10 + 0.45 * 0.90
      = 0.07 + 0.405
      = 0.475
```

#### Bayes' Theorem

$$P(A|B) = \frac{P(B|A) \cdot P(A)}{P(B)}$$

This is the foundation of Bayesian inference: updating beliefs with new evidence.

**Worked Example**: A quant model classifies days as "trending" or "mean-reverting." Historically:
- 30% of days are trending: $P(T) = 0.30$
- On trending days, the model correctly says "trending" 80% of the time: $P(\text{Signal}_T | T) = 0.80$
- On mean-reverting days, the model incorrectly says "trending" 15% of the time: $P(\text{Signal}_T | MR) = 0.15$

If the model says "trending" today, what is the actual probability the day is trending?

```
P(T | Signal_T) = P(Signal_T | T) * P(T) / P(Signal_T)

P(Signal_T) = P(Signal_T | T) * P(T) + P(Signal_T | MR) * P(MR)
            = 0.80 * 0.30 + 0.15 * 0.70
            = 0.24 + 0.105
            = 0.345

P(T | Signal_T) = 0.24 / 0.345 = 0.6957

Result: ~69.6% chance the day is truly trending
```

This matters because naive traders treat model signals as ground truth. Bayesian reasoning gives you calibrated confidence.

### 1.3 Random Variables

A **random variable** $X$ is a function that maps outcomes in a sample space to real numbers.

**Discrete random variable**: Takes countable values. Defined by a probability mass function (PMF).

$$P(X = x_i) = p_i, \quad \sum_i p_i = 1$$

**Continuous random variable**: Takes values in an interval. Defined by a probability density function (PDF).

$$P(a \leq X \leq b) = \int_a^b f(x) \, dx, \quad \int_{-\infty}^{\infty} f(x) \, dx = 1$$

The **cumulative distribution function** (CDF) works for both:

$$F(x) = P(X \leq x)$$

```
Discrete PMF (e.g., Poisson)        Continuous PDF (e.g., Normal)

P(X=k)                               f(x)
  |                                     |
0.25 |   *                               |        ***
  |   * *                             |      **   **
0.20 |   * * *                           |    **       **
  |   * * * *                         |   *           *
0.15 |   * * * * *                       |  *             *
  | * * * * * *                       | *               *
0.10 | * * * * * * *                     |*                 *
  | * * * * * * * *                   *                   *
0.05 | * * * * * * * * *               **                     **
  | * * * * * * * * * * *         ***                         ***
0.00 +----+--+--+--+--+--+--+--+--+   +------+------+------+------+
     0  1  2  3  4  5  6  7  8  9      -3    -1.5     0     1.5    3
```

### 1.4 Common Distributions in Finance

#### Normal (Gaussian) Distribution

$$f(x) = \frac{1}{\sigma\sqrt{2\pi}} \exp\left(-\frac{(x-\mu)^2}{2\sigma^2}\right)$$

Parameters: mean $\mu$, standard deviation $\sigma$.

```
Normal Distribution: mu = 0, sigma = 1

                         *****
                      ***     ***
                    **           **
                  **               **
                **                   **
              **                       **
           ***                           ***
        ***                                 ***
    ****                                       ****
****                                               ****
+----+----+----+----+----+----+----+----+----+----+----+
-3   -2.5 -2  -1.5  -1  -0.5   0   0.5   1   1.5   2   3

68.2% of data within 1 sigma:   [-1, +1]
95.4% of data within 2 sigma:   [-2, +2]
99.7% of data within 3 sigma:   [-3, +3]
```

**In finance**: Daily stock returns are often approximated as normal for simple models. However, this is a dangerous assumption (see Section 1.6 on fat tails).

**Worked Example**: A stock has daily returns with mean $\mu = 0.05\%$ and standard deviation $\sigma = 1.5\%$.

```
P(daily return > 3%) = P(Z > (3 - 0.05) / 1.5) = P(Z > 1.967)

Using standard normal table: P(Z > 1.967) ~ 0.0246

Under the normal model: ~2.5% of days have returns > 3%
Reality: This significantly underestimates extreme moves.
```

#### Log-Normal Distribution

If $\ln(X) \sim N(\mu, \sigma^2)$, then $X$ has a log-normal distribution.

$$f(x) = \frac{1}{x\sigma\sqrt{2\pi}} \exp\left(-\frac{(\ln x - \mu)^2}{2\sigma^2}\right), \quad x > 0$$

**In finance**: Stock prices are modeled as log-normal (prices cannot be negative). If returns are normally distributed, then prices are log-normally distributed. This is the foundation of the Black-Scholes model.

```
Log-Normal Distribution

f(x)
  |
  |  *
  | * *
  |*   **
  *      ***
 *|         ****
* |             *****
  |                  ********
  |                          **************
--+----+----+----+----+----+----+----+----+---->
  0    1    2    3    4    5    6    7    8   x

Key property: Skewed right, bounded below by zero
              Perfect for modeling asset prices
```

#### Poisson Distribution

$$P(X = k) = \frac{\lambda^k e^{-\lambda}}{k!}, \quad k = 0, 1, 2, \ldots$$

Parameter: rate $\lambda$ (average number of events per interval).

**In finance**: Models the number of trades arriving per time interval, the number of limit order cancellations, or the number of extreme events in a period.

**Worked Example**: On average, a stock experiences 3 large price jumps per month ($\lambda = 3$). What is the probability of seeing 5 or more jumps?

```
P(X >= 5) = 1 - P(X <= 4)
          = 1 - [P(X=0) + P(X=1) + P(X=2) + P(X=3) + P(X=4)]

P(X=0) = e^(-3) * 3^0 / 0! = 0.0498
P(X=1) = e^(-3) * 3^1 / 1! = 0.1494
P(X=2) = e^(-3) * 3^2 / 2! = 0.2240
P(X=3) = e^(-3) * 3^3 / 3! = 0.2240
P(X=4) = e^(-3) * 3^4 / 4! = 0.1680

P(X <= 4) = 0.8153
P(X >= 5) = 1 - 0.8153 = 0.1847

Result: ~18.5% chance of 5+ large jumps in a month
```

#### Exponential Distribution

$$f(x) = \lambda e^{-\lambda x}, \quad x \geq 0$$

**In finance**: Models the time between events (inter-arrival times of trades, time between jumps). It is the continuous counterpart to the Poisson distribution. If the number of events follows a Poisson process, the time between events is exponential.

**Memoryless property**: $P(X > s + t \,|\, X > s) = P(X > t)$. The probability of waiting another $t$ units does not depend on how long you have already waited.

#### Student's t-Distribution

$$f(x) = \frac{\Gamma\left(\frac{\nu+1}{2}\right)}{\sqrt{\nu\pi}\,\Gamma\left(\frac{\nu}{2}\right)} \left(1 + \frac{x^2}{\nu}\right)^{-\frac{\nu+1}{2}}$$

Parameter: degrees of freedom $\nu$.

```
Comparison: Normal vs Student's t (nu=3)

                    Normal (thin tails)
                    t-distribution (fat tails)

        N: .         *****         . :N
        t: .      ***     ***      . :t
        N: .    **           **    . :N
        t: .  ***             ***  . :t     <-- t has more mass here
        N: . **                 ** . :N
        t: .**                   **. :t
        N:.**                     **.:N
        t:**                       **:t
        N**                         **N
        t*                           *t     <-- and here (the tails)
   -----+----+----+----+----+----+----+-----
        -4   -2    -1    0    1    2    4

As nu -> infinity, t -> Normal
For small nu: MUCH heavier tails than Normal
```

**In finance**: The t-distribution better captures the fat tails observed in financial returns. Fitting a t-distribution with $\nu \approx 3\text{--}5$ to daily stock returns typically fits much better than a normal distribution.

#### Chi-Squared Distribution

$$f(x) = \frac{1}{2^{k/2}\Gamma(k/2)} x^{k/2-1} e^{-x/2}, \quad x \geq 0$$

Parameter: degrees of freedom $k$.

**In finance**: Used in hypothesis testing (chi-squared test for model fit), variance estimation, and appears in risk management (the sum of squared standard normal variables follows chi-squared).

If $Z_1, Z_2, \ldots, Z_k$ are independent standard normal variables, then:

$$\chi^2_k = Z_1^2 + Z_2^2 + \ldots + Z_k^2$$

### 1.5 Moments: Expected Value, Variance, Skewness, Kurtosis

The moments of a distribution characterize its shape.

#### Expected Value (First Moment)

$$E[X] = \int_{-\infty}^{\infty} x \, f(x) \, dx \quad \text{(continuous)}$$

$$E[X] = \sum_i x_i \, P(X = x_i) \quad \text{(discrete)}$$

Properties:
- $E[aX + b] = aE[X] + b$ (linearity)
- $E[X + Y] = E[X] + E[Y]$ (always true, even if dependent)

#### Variance (Second Central Moment)

$$\text{Var}(X) = E[(X - \mu)^2] = E[X^2] - (E[X])^2$$

Properties:
- $\text{Var}(aX + b) = a^2 \text{Var}(X)$
- $\text{Var}(X + Y) = \text{Var}(X) + \text{Var}(Y) + 2\text{Cov}(X, Y)$

Standard deviation: $\sigma = \sqrt{\text{Var}(X)}$

**Worked Example**: A portfolio holds two assets. Asset A has expected return 8% with standard deviation 15%. Asset B has expected return 12% with standard deviation 25%. Correlation is 0.3. Portfolio is 60% A, 40% B.

```
Portfolio Return:
  E[R_p] = 0.60 * 8% + 0.40 * 12% = 4.8% + 4.8% = 9.6%

Portfolio Variance:
  Var(R_p) = w_A^2 * sigma_A^2 + w_B^2 * sigma_B^2
             + 2 * w_A * w_B * rho * sigma_A * sigma_B

  = (0.60)^2 * (0.15)^2 + (0.40)^2 * (0.25)^2
    + 2 * 0.60 * 0.40 * 0.30 * 0.15 * 0.25

  = 0.36 * 0.0225 + 0.16 * 0.0625 + 2 * 0.60 * 0.40 * 0.30 * 0.0375

  = 0.0081 + 0.0100 + 0.0054

  = 0.0235

Portfolio Std Dev:
  sigma_p = sqrt(0.0235) = 15.33%

Note: 15.33% < 0.60 * 15% + 0.40 * 25% = 19%
Diversification reduces risk!
```

#### Skewness (Third Standardized Moment)

$$\text{Skew}(X) = E\left[\left(\frac{X - \mu}{\sigma}\right)^3\right]$$

```
Negative Skew              Zero Skew (Normal)          Positive Skew
(left tail heavy)          (symmetric)                 (right tail heavy)

       ****                     ****                         ****
      *    ***                **    **                    ***    *
    **       ***            **        **                ***       **
  **            ***       **            **            ***            **
**                 ****  *                *       ****                 **
                       **                  **
+---------+---------+  +---------+---------+  +---------+---------+
    mean < median          mean = median          mean > median

Finance: equity returns     Theory ideal        Insurance losses
often have negative skew                        Lottery payoffs
(crash risk)
```

**In finance**: Stock returns typically exhibit negative skewness (large drops more common than large gains of the same magnitude). This makes risk management critical: the downside is bigger than symmetric models predict.

#### Kurtosis (Fourth Standardized Moment)

$$\text{Kurt}(X) = E\left[\left(\frac{X - \mu}{\sigma}\right)^4\right]$$

**Excess kurtosis** = Kurt$(X) - 3$ (where 3 is the kurtosis of a normal distribution).

```
Kurtosis Comparison:

                Leptokurtic (excess kurtosis > 0)
                "Fat tails, sharp peak"

           |       .
           |      . .         Leptokurtic (e.g., t-dist, financial returns)
           |     .   .
           |    .     .       - - - Normal (mesokurtic, kurtosis = 3)
           |   .  ---  .
           |  . --     -- .   ..... Platykurtic (e.g., uniform-like)
           | ..-  .....  -..
           |.  ...     ...  .
      .....|...           ...|.....
      -----+--------+--------+-----
                     0

Leptokurtic: MORE mass in center AND tails (less in "shoulders")
Result: More "normal" days and more "extreme" days than normal predicts
```

**In finance**: Financial returns have excess kurtosis of 5-50+ depending on the asset and frequency. This means extreme events happen FAR more often than a normal distribution predicts. A "6-sigma event" under the normal model might actually be a "3-sigma event" under the true distribution.

### 1.6 Fat Tails in Finance: Why the Normal Distribution Fails

This is one of the most important practical insights in all of quantitative finance.

```
Probability of extreme events: Normal vs Reality

Event Size          Normal Model        Actual (empirical)     Ratio
(in sigma)          Probability         Probability
------------------------------------------------------------------------
3-sigma             0.270%              ~1.0%                  ~4x
4-sigma             0.0063%             ~0.1%                  ~16x
5-sigma             0.000057%           ~0.01%                 ~175x
6-sigma             0.0000002%          ~0.002%                ~10,000x
7-sigma             ~0.0000000003%      ~0.0005%               ~1,500,000x

The normal model says a 7-sigma event happens once every
3 BILLION days (8 million years).

In reality, 7-sigma moves happen roughly once per decade.

This is not an academic curiosity.
This is why LTCM blew up.
This is why banks fail in crises.
This is why risk models based on normality are dangerous.
```

**Key examples**:
- **Black Monday (1987)**: The S&P 500 dropped 20.5% in one day. Under a normal model with daily sigma of ~1%, this was a 20+ sigma event. The probability under normal assumptions: essentially zero. It happened.
- **2008 Financial Crisis**: Multiple "impossible" daily moves occurred in succession.
- **COVID Crash (2020)**: Several days with 10%+ moves in the S&P 500.

#### Why Do Fat Tails Exist?

1. **Feedback loops**: Panic selling causes more selling (positive feedback)
2. **Leverage**: Forced liquidation amplifies moves
3. **Information cascades**: Herding behavior
4. **Liquidity evaporation**: Market makers withdraw during stress
5. **Regime changes**: Structural breaks in the data-generating process

#### Better Models for Fat Tails

| Model | Description | Use Case |
|-------|-------------|----------|
| Student's t | Heavier tails parameterized by $\nu$ | General-purpose |
| Stable distributions | Generalize CLT for infinite variance | Extreme tail modeling |
| GARCH | Time-varying volatility | Volatility clustering |
| Jump-diffusion | Normal + Poisson jumps | Options pricing |
| Extreme Value Theory | Models only the tail | VaR, stress testing |

### 1.7 The Central Limit Theorem and Its Limits

**Central Limit Theorem (CLT)**: If $X_1, X_2, \ldots, X_n$ are i.i.d. random variables with mean $\mu$ and finite variance $\sigma^2$, then as $n \to \infty$:

$$\frac{\bar{X}_n - \mu}{\sigma / \sqrt{n}} \xrightarrow{d} N(0, 1)$$

The sample mean converges to a normal distribution regardless of the original distribution.

**Worked Example**: Daily returns have mean 0.04% and std 1.2%. After 252 trading days (one year):

```
Annual return distribution (by CLT):
  Mean  = 252 * 0.04% = 10.08%
  Std   = sqrt(252) * 1.2% = 19.04%

95% confidence interval for annual return:
  10.08% +/- 1.96 * 19.04%
  = 10.08% +/- 37.32%
  = [-27.24%, +47.40%]

This is a HUGE range! Even with positive expected returns,
you could easily lose 27% in a year.
```

#### Where CLT Fails in Finance

1. **Non-i.i.d. returns**: Returns exhibit autocorrelation and volatility clustering (GARCH effects). Today's volatility predicts tomorrow's volatility.
2. **Infinite variance**: If the underlying distribution has infinite variance (e.g., Cauchy or some stable distributions), the CLT does not apply at all.
3. **Dependence**: During market crises, correlations spike and returns become highly dependent.
4. **Slow convergence**: For heavy-tailed distributions, convergence to normal can require enormous sample sizes.

### 1.8 Joint Distributions, Marginal Distributions, and Copulas

#### Joint Distributions

For two random variables $X$ and $Y$, the joint PDF $f_{X,Y}(x, y)$ describes their simultaneous behavior.

$$P(a \leq X \leq b, \; c \leq Y \leq d) = \int_a^b \int_c^d f_{X,Y}(x, y) \, dy \, dx$$

#### Marginal Distributions

The marginal distribution of $X$ is obtained by "integrating out" $Y$:

$$f_X(x) = \int_{-\infty}^{\infty} f_{X,Y}(x, y) \, dy$$

#### Independence

$X$ and $Y$ are independent if and only if $f_{X,Y}(x, y) = f_X(x) \cdot f_Y(y)$.

**In finance**: Asset returns are almost never independent. During crises, correlations increase dramatically (a phenomenon called "correlation breakdown" or "contagion").

#### Covariance and Correlation

$$\text{Cov}(X, Y) = E[(X - \mu_X)(Y - \mu_Y)] = E[XY] - E[X]E[Y]$$

$$\rho_{X,Y} = \frac{\text{Cov}(X, Y)}{\sigma_X \sigma_Y}, \quad -1 \leq \rho \leq 1$$

```
Correlation Visualization:

rho = +1.0        rho = +0.5        rho = 0.0         rho = -0.7
(perfect +)        (moderate +)      (uncorrelated)     (strong -)

  Y |     /         Y |    ..         Y |  . . .        Y | .
    |    /             |   . .           |  .. .. .        | .  .
    |   /              |  .. .           | . .  . ..       |  .  .
    |  /               | .  ..           |.  .. .  .       |   .  .
    | /                |.   .            | .  .  . .       |    .  .
    |/                 |  ..             |. ..  .  .       |     .  .
    +-------> X        +-------> X       +-------> X       +--------> X

Warning: Correlation measures LINEAR dependence only.
         Two variables can have rho=0 and still be strongly dependent!
```

#### Copulas

A **copula** captures the dependence structure between random variables, separate from their marginal distributions. By Sklar's theorem, any joint distribution can be decomposed:

$$F_{X,Y}(x, y) = C(F_X(x), F_Y(y))$$

where $C$ is the copula function and $F_X, F_Y$ are the marginal CDFs.

**Key copula families**:

| Copula | Tail Dependence | Use Case |
|--------|----------------|----------|
| Gaussian | None | Default (but dangerous in crises) |
| Student's t | Symmetric tail | Better for financial data |
| Clayton | Lower tail | Crash modeling (joint downside) |
| Gumbel | Upper tail | Joint booms |
| Frank | None (symmetric) | Moderate dependence |

**Why copulas matter in finance**: The 2008 financial crisis was partly caused by the widespread use of the Gaussian copula (David Li's model) to price CDOs. The Gaussian copula underestimates the probability that many assets default simultaneously. When the housing market crashed, correlated defaults were far more common than the model predicted.

```
Gaussian Copula             Clayton Copula
(no tail dependence)        (lower tail dependence)

  Y |   . . .                 Y |   . . .
    | .  . .  .                 | .  .  . .
    |. .  . .  .                |.  .  .  ..
    | .  .  .  .                | . .  .    .
    |.  .  .  .                 |. .  .      .
    | .  .  .                   |..  .
    |. .  .                     |. .           <-- Dense cluster in
    |  .                        |..                lower-left = joint
    +----------> X              +----------> X     crashes more likely
```

---

## 2. Statistics

Statistics is the science of learning from data. While probability tells you what to expect given a model, statistics helps you build and validate the model from observations.

### 2.1 Descriptive Statistics

Given a sample of $n$ observations $x_1, x_2, \ldots, x_n$:

**Sample Mean**:
$$\bar{x} = \frac{1}{n}\sum_{i=1}^n x_i$$

**Sample Median**: The middle value when sorted (robust to outliers).

**Sample Variance**:
$$s^2 = \frac{1}{n-1}\sum_{i=1}^n (x_i - \bar{x})^2$$

(We divide by $n-1$ instead of $n$ for an unbiased estimate -- this is **Bessel's correction**.)

**Percentiles**: The $p$-th percentile is the value below which $p\%$ of the data falls.

```
Descriptive Statistics Example: 20 days of returns (%)

Data: -3.2, -2.1, -1.8, -1.5, -1.0, -0.7, -0.3, -0.1, 0.1, 0.2,
       0.3,  0.5,  0.6,  0.8,  1.0,  1.2,  1.5,  1.8,  2.3, 3.5

Mean:    0.105%
Median:  0.25%      (average of 10th and 11th sorted values)
Std Dev: 1.597%
Skewness: 0.15      (slightly positive skew)
Kurtosis: 2.38      (excess kurtosis ~ -0.62, slightly platykurtic)
Min:     -3.2%
Max:      3.5%
Q1 (25th percentile): -1.0%
Q3 (75th percentile):  1.2%
IQR:      2.2%
```

### 2.2 Estimation: MLE and Method of Moments

#### Maximum Likelihood Estimation (MLE)

Given data $x_1, \ldots, x_n$ and a parametric model $f(x|\theta)$, MLE finds the parameter $\hat{\theta}$ that maximizes the likelihood:

$$L(\theta) = \prod_{i=1}^n f(x_i | \theta)$$

In practice, we maximize the log-likelihood (easier to work with):

$$\ell(\theta) = \sum_{i=1}^n \ln f(x_i | \theta)$$

**Worked Example**: Estimate the parameters of a normal distribution from return data.

```
Given returns: r_1, r_2, ..., r_n

Log-likelihood for Normal(mu, sigma^2):
  l(mu, sigma^2) = -n/2 * ln(2*pi) - n/2 * ln(sigma^2)
                   - 1/(2*sigma^2) * sum((r_i - mu)^2)

Take derivatives and set to zero:

  d(l)/d(mu)     = 0  ==>  mu_hat    = (1/n) * sum(r_i)  = sample mean
  d(l)/d(sigma^2) = 0  ==>  sigma^2_hat = (1/n) * sum((r_i - mu_hat)^2)

Note: MLE gives sigma^2_hat with 1/n (biased), not 1/(n-1) (unbiased).
For large n, the difference is negligible.
```

**Properties of MLE**:
- **Consistent**: Converges to true parameter as $n \to \infty$
- **Asymptotically efficient**: Achieves the Cramer-Rao lower bound
- **Asymptotically normal**: $\hat{\theta} \xrightarrow{d} N(\theta_0, I(\theta_0)^{-1}/n)$
- **Invariant**: If $\hat{\theta}$ is MLE of $\theta$, then $g(\hat{\theta})$ is MLE of $g(\theta)$

#### Method of Moments (MoM)

Set sample moments equal to theoretical moments and solve.

**Worked Example**: Fit a gamma distribution $\text{Gamma}(\alpha, \beta)$ to data.

```
Theoretical moments:
  E[X]   = alpha * beta
  E[X^2] = alpha * beta^2 + (alpha * beta)^2

Sample moments:
  m_1 = sample mean
  m_2 = sample second moment = (1/n) * sum(x_i^2)

Set equal:
  alpha * beta = m_1
  alpha * beta^2 = m_2 - m_1^2  (this is the variance)

Solve:
  beta_hat  = (m_2 - m_1^2) / m_1
  alpha_hat = m_1 / beta_hat = m_1^2 / (m_2 - m_1^2)
```

MoM is simpler than MLE but generally less efficient (higher variance estimates).

### 2.3 Hypothesis Testing

#### Framework

1. State null hypothesis $H_0$ and alternative $H_1$
2. Choose a test statistic $T$
3. Determine the distribution of $T$ under $H_0$
4. Compute $p$-value: $P(T \geq t_{\text{obs}} | H_0)$
5. Reject $H_0$ if $p < \alpha$ (significance level)

```
Hypothesis Testing Visualization:

       Distribution of test statistic under H_0:

                      *****
                   ***     ***
                 **           **
               **               **
             **                   **
           **                       **
        ***                           ***
     ***              |                  ***
 ****                 |     Rejection        ****
-+----+----+----+----+----+||||+||||+||||+||||+---->
                      0         t_crit    t_obs

                              |<-- alpha -->|
                              Rejection region

If t_obs falls in rejection region: Reject H_0
p-value = area to the right of t_obs
```

#### t-Test

Tests whether a mean equals a hypothesized value or whether two means are equal.

**One-sample t-test**: $H_0: \mu = \mu_0$

$$t = \frac{\bar{x} - \mu_0}{s / \sqrt{n}}$$

with $n-1$ degrees of freedom.

**Worked Example**: A trading strategy claims average daily return of 0.1%. Over 60 days, the observed mean is 0.08% with standard deviation 0.5%.

```
H_0: mu = 0.10%   (strategy achieves claimed return)
H_1: mu != 0.10%  (two-sided test)

t = (0.08 - 0.10) / (0.50 / sqrt(60))
  = -0.02 / 0.0645
  = -0.310

Degrees of freedom = 59
Critical value at alpha = 0.05 (two-sided): t_crit = +/- 2.001

|t| = 0.310 < 2.001 --> FAIL TO REJECT H_0

We cannot conclude the strategy's mean return differs from 0.10%.
Note: This does NOT prove the strategy works; it says we lack
evidence to disprove the claimed mean.

More practically: Is the mean DIFFERENT FROM ZERO?
t = 0.08 / 0.0645 = 1.240
Still not significant at 5%. The strategy has not proven itself.
```

#### Chi-Squared Test for Goodness of Fit

Tests whether observed frequencies match expected frequencies.

$$\chi^2 = \sum_i \frac{(O_i - E_i)^2}{E_i}$$

**Worked Example**: Do daily returns follow a normal distribution? Bin returns into 5 categories.

```
Bin              Observed    Expected (Normal)    (O-E)^2/E
-----------------------------------------------------------------
< -2%                 18          12.5              2.42
-2% to -0.5%         55          53.2              0.06
-0.5% to +0.5%       82          68.6              2.62
+0.5% to +2%         48          53.2              0.51
> +2%                 47          12.5             95.22
-----------------------------------------------------------------
Total               250         250.0             100.83

chi^2 = 100.83, df = 5 - 1 - 2 = 2 (5 bins minus 1 minus 2 estimated params)
Critical value at alpha = 0.01: 9.21

100.83 >> 9.21 --> REJECT normality

The returns are NOT normally distributed (too many extreme observations).
```

#### Kolmogorov-Smirnov Test

Compares the empirical CDF to a theoretical CDF. The test statistic is:

$$D = \sup_x |F_n(x) - F(x)|$$

where $F_n$ is the empirical CDF and $F$ is the theoretical CDF. This test is distribution-free and makes no binning assumptions (unlike chi-squared).

### 2.4 Confidence Intervals

A **95% confidence interval** for a parameter means: if we repeated the sampling process many times, 95% of the constructed intervals would contain the true parameter.

$$\text{CI}_{1-\alpha} = \bar{x} \pm z_{\alpha/2} \cdot \frac{s}{\sqrt{n}}$$

For small samples, replace $z$ with $t_{n-1}$.

**Worked Example**: Estimate the Sharpe ratio confidence interval.

```
A strategy has:
  Annualized return:  15%
  Annualized std:     20%
  Sharpe ratio:       0.75
  Observed over:      3 years (756 daily observations)

Standard error of Sharpe ratio (Lo, 2002):
  SE(SR) ~ sqrt((1 + SR^2/2) / n) * sqrt(252)  [annualized]
         ~ sqrt((1 + 0.75^2/2) / 756) * sqrt(252)
         ~ sqrt(1.28125 / 756) * 15.875
         ~ sqrt(0.001695) * 15.875
         ~ 0.04117 * 15.875
         ~ 0.654

95% CI: 0.75 +/- 1.96 * 0.654 = [-0.53, 2.03]

This interval CONTAINS ZERO!
Even with a Sharpe of 0.75 over 3 years,
we cannot statistically distinguish the strategy from randomness.

This is a humbling result that every quant should internalize.
```

### 2.5 Regression Analysis

#### Ordinary Least Squares (OLS)

Given data $(x_i, y_i)$, the simple linear regression model is:

$$y_i = \beta_0 + \beta_1 x_i + \epsilon_i$$

OLS minimizes the sum of squared residuals:

$$\hat{\beta}_1 = \frac{\sum_i (x_i - \bar{x})(y_i - \bar{y})}{\sum_i (x_i - \bar{x})^2}, \quad \hat{\beta}_0 = \bar{y} - \hat{\beta}_1 \bar{x}$$

**Worked Example**: CAPM regression. The Capital Asset Pricing Model says:

$$R_i - R_f = \alpha + \beta (R_m - R_f) + \epsilon$$

```
Regressing Apple excess returns on S&P 500 excess returns (hypothetical):

               y = alpha + beta * x + epsilon

Estimated:     y = 0.02% + 1.15 * x

Interpretation:
  alpha = 0.02% per day (~5% annualized)
    --> Apple earns 5% above what CAPM predicts (positive alpha!)
  beta = 1.15
    --> Apple is 15% more volatile than the market
    --> When S&P goes up 1%, Apple goes up ~1.15%

R-squared = 0.45
    --> 45% of Apple's return variation is explained by market moves
    --> 55% is "idiosyncratic" (firm-specific)

Residuals Plot:
         e
  2.0 |        .
  1.5 |    .       .
  1.0 |  .     .     .     .
  0.5 |     .     .     .
  0.0 |---.-----.-----.-----.--->  x (market return)
 -0.5 |  .     .     .     .
 -1.0 |    .       .     .
 -1.5 |        .       .
 -2.0 |              .

If residuals show a pattern --> model misspecification
If residuals are random scatter --> good fit
```

#### Multiple Regression

$$y = \beta_0 + \beta_1 x_1 + \beta_2 x_2 + \ldots + \beta_p x_p + \epsilon$$

In matrix form: $\mathbf{y} = \mathbf{X}\boldsymbol{\beta} + \boldsymbol{\epsilon}$

OLS solution: $\hat{\boldsymbol{\beta}} = (\mathbf{X}^T\mathbf{X})^{-1}\mathbf{X}^T\mathbf{y}$

#### OLS Assumptions (Gauss-Markov)

1. **Linearity**: $y = X\beta + \epsilon$
2. **Exogeneity**: $E[\epsilon | X] = 0$
3. **No multicollinearity**: $X^TX$ is invertible (columns of $X$ are not perfectly correlated)
4. **Homoscedasticity**: $\text{Var}(\epsilon | X) = \sigma^2 I$ (constant variance)
5. **No autocorrelation**: $\text{Cov}(\epsilon_i, \epsilon_j) = 0$ for $i \neq j$

**In finance, ALL of these are frequently violated**:
- Returns exhibit **heteroscedasticity** (GARCH effects): use robust standard errors (White, Newey-West)
- Returns exhibit **autocorrelation**: use Newey-West standard errors or GLS
- Factor returns are often **correlated**: use regularization (Ridge, LASSO) or PCA

#### Regression Diagnostics

| Diagnostic | Tests For | Method |
|-----------|-----------|--------|
| Durbin-Watson | Autocorrelation in residuals | DW statistic near 2 = good |
| Breusch-Pagan | Heteroscedasticity | Regress squared residuals on X |
| VIF | Multicollinearity | $\text{VIF}_j > 10$ is concerning |
| Cook's Distance | Influential observations | Points that shift regression |
| Jarque-Bera | Normality of residuals | Tests skewness + kurtosis |

### 2.6 Correlation vs. Causation

This is perhaps the most important statistical concept for traders.

```
CORRELATION DOES NOT IMPLY CAUSATION

Scenario 1: Spurious Correlation
  Ice cream sales and drowning deaths are correlated.
  Cause: Both are driven by a third variable (summer heat).

  Ice Cream Sales  <--  Summer Heat  -->  Drowning Deaths

Scenario 2: Reverse Causation
  "Higher stock prices cause higher earnings."
  Reality: Higher expected earnings cause higher stock prices.

  Stock Prices  <--  Expected Earnings

Scenario 3: Data Mining / p-Hacking
  With enough variables, you WILL find spurious correlations.

  "The S&P 500 is correlated with butter production in Bangladesh."
  If you test 1000 variable pairs at alpha = 0.05,
  you expect ~50 false positives.

  The Bonferroni Correction:
    Adjusted alpha = 0.05 / (number of tests)
    For 1000 tests: use alpha = 0.00005 instead of 0.05
```

**In quant finance**: This is the core of the overfitting problem. A backtest that finds a profitable strategy may have simply found a spurious correlation in historical data. Out-of-sample testing, walk-forward analysis, and economic reasoning are the defenses.

### 2.7 Bootstrap Methods

The bootstrap is a resampling technique for estimating the sampling distribution of a statistic when theoretical formulas are unavailable or unreliable.

**Algorithm**:

```
Bootstrap Algorithm:

1. Have original sample: X = {x_1, x_2, ..., x_n}
2. For b = 1 to B (typically B = 10,000):
   a. Draw n observations from X WITH REPLACEMENT --> X*_b
   b. Compute statistic of interest: theta*_b = T(X*_b)
3. The distribution of {theta*_1, ..., theta*_B} approximates
   the sampling distribution of the statistic.

Example: Bootstrap CI for Sharpe Ratio

Original data: 252 daily returns
B = 10,000 bootstrap samples
For each sample, compute Sharpe ratio

Sort the 10,000 Sharpe ratios:
  2.5th percentile = 0.21
  97.5th percentile = 1.42

95% Bootstrap CI for Sharpe: [0.21, 1.42]
```

**Block Bootstrap**: For time series data where observations are dependent, resample in blocks to preserve autocorrelation structure.

### 2.8 Bayesian Statistics Basics

Classical (frequentist) statistics treats parameters as fixed unknowns. Bayesian statistics treats parameters as random variables with distributions that update with data.

$$\underbrace{P(\theta | \text{data})}_{\text{posterior}} = \frac{\underbrace{P(\text{data} | \theta)}_{\text{likelihood}} \cdot \underbrace{P(\theta)}_{\text{prior}}}{\underbrace{P(\text{data})}_{\text{evidence}}}$$

```
Bayesian Updating Visualization:

        Prior                    Likelihood                 Posterior
  (belief before data)       (what data says)          (updated belief)

        ***                        **                        ****
      **   **                    ** **                     ***  ***
    **       **                 **    **                  **      **
  **           **              **      **                **        **
 **             **            **        **               **        **
**               **          **          **              **        **
                            **            **
+---------+--------+   +--------+--------+   +---------+--------+
        theta              theta                    theta

        Prior      x      Likelihood       =      Posterior
    (wide, uncertain)  (data-concentrated)   (narrower, more certain)
```

**Worked Example**: Estimating the probability of a strategy being profitable.

```
Prior: We believe the probability p of a daily profit follows
       Beta(2, 2) -- mildly peaked around 0.5 (uncertain).

Data:  Out of 30 trading days, 22 were profitable.

Likelihood: Binomial(30, p) with 22 successes

Posterior: Beta(2 + 22, 2 + 8) = Beta(24, 10)

Prior mean:     2/(2+2) = 0.50
Posterior mean: 24/(24+10) = 0.706

95% credible interval: [0.543, 0.841]

The data has shifted our belief from "50-50" to "likely profitable"
but there is still meaningful uncertainty.
```

**Bayesian vs. Frequentist in Quant Finance**:
- Bayesian is natural for combining prior market knowledge with new data
- Bayesian shrinkage estimators improve covariance matrix estimation
- Bayesian model averaging handles model uncertainty
- MCMC (Markov Chain Monte Carlo) enables complex posterior computation

---

## 3. Linear Algebra

Linear algebra is the mathematics of vectors and matrices. In quant finance, it is essential for portfolio theory, risk management, factor models, PCA, and machine learning.

### 3.1 Vectors and Matrices

A **vector** $\mathbf{w} \in \mathbb{R}^n$ represents portfolio weights, returns, or factor exposures.

$$\mathbf{w} = \begin{pmatrix} w_1 \\ w_2 \\ \vdots \\ w_n \end{pmatrix}$$

A **matrix** $\mathbf{A} \in \mathbb{R}^{m \times n}$ represents return data, covariance structures, or transformations.

```
Portfolio Weights Vector (5 assets):

          w = [ 0.25 ]    Asset 1: 25%
              [ 0.20 ]    Asset 2: 20%
              [ 0.15 ]    Asset 3: 15%
              [ 0.30 ]    Asset 4: 30%
              [ 0.10 ]    Asset 5: 10%
                           Total: 100%

Return Matrix (3 days, 4 assets):

              Asset1  Asset2  Asset3  Asset4
         R = [  0.01   0.02  -0.01   0.03 ]   Day 1
             [ -0.02   0.01   0.02  -0.01 ]   Day 2
             [  0.03  -0.01   0.01   0.02 ]   Day 3
```

### 3.2 Matrix Operations

#### Matrix Multiplication

If $\mathbf{A}$ is $m \times n$ and $\mathbf{B}$ is $n \times p$, then $\mathbf{C} = \mathbf{AB}$ is $m \times p$.

$$C_{ij} = \sum_{k=1}^n A_{ik} B_{kj}$$

**Financial Application**: Portfolio return as a dot product.

```
Portfolio return = w^T * r  (weights transpose times returns)

w = [0.4, 0.3, 0.3]     (weights)
r = [0.02, -0.01, 0.03]  (returns)

R_p = 0.4 * 0.02 + 0.3 * (-0.01) + 0.3 * 0.03
    = 0.008 - 0.003 + 0.009
    = 0.014 = 1.4%
```

#### Matrix Transpose

$(\mathbf{A}^T)_{ij} = A_{ji}$

Swap rows and columns. Key property: $(\mathbf{AB})^T = \mathbf{B}^T\mathbf{A}^T$.

#### Matrix Inverse

$\mathbf{A}^{-1}$ exists if and only if $\det(\mathbf{A}) \neq 0$ ($\mathbf{A}$ is non-singular).

$$\mathbf{A}\mathbf{A}^{-1} = \mathbf{A}^{-1}\mathbf{A} = \mathbf{I}$$

**Financial Application**: OLS formula requires inverting $\mathbf{X}^T\mathbf{X}$.

**Warning**: Covariance matrices estimated from data with more assets than observations are singular and cannot be inverted directly. This is a common problem in portfolio optimization with many assets.

### 3.3 Eigenvalues and Eigenvectors

For a square matrix $\mathbf{A}$, an eigenvector $\mathbf{v}$ and eigenvalue $\lambda$ satisfy:

$$\mathbf{A}\mathbf{v} = \lambda\mathbf{v}$$

The matrix stretches the eigenvector by a factor of $\lambda$ without changing its direction.

```
Eigenvector Interpretation:

   Original vector v          After A*v

         ^                       ^
         |  v                    |  lambda * v
         | /                     | /
         |/                      |/
   ------+------>          ------+------>

   A * v = lambda * v

   The matrix A ONLY SCALES v, does not rotate it.
   lambda > 1: stretch
   0 < lambda < 1: shrink
   lambda < 0: flip and scale
```

**Worked Example**: 2x2 covariance matrix.

```
Covariance matrix of two assets:

  Sigma = [ 0.04   0.01 ]    (sigma_1^2 = 4%, sigma_2^2 = 2.25%)
          [ 0.01   0.0225]    (cov = 1%)

Eigenvalues:
  lambda_1 = 0.0475   (larger: direction of maximum variance)
  lambda_2 = 0.015    (smaller: direction of minimum variance)

Eigenvectors:
  v_1 = [0.894, 0.447]  (roughly 2:1 ratio, tilted toward Asset 1)
  v_2 = [-0.447, 0.894] (perpendicular to v_1)

Interpretation:
  The first eigenvector points in the direction of maximum portfolio variance.
  The second eigenvector points in the direction of minimum portfolio variance.
  This is the foundation of PCA for portfolio construction.

  Variance Ellipse:
          Asset 2
           ^
           |     . .  .
           |   .   v1  .     v1 = direction of max variance
           |  .   /     .
           | .   /       .
           |. . / . . . . .
           +--------/-------> Asset 1
           |. . . . . . . .
           |  .         .
           |   .       .
           |     . . .
```

### 3.4 Singular Value Decomposition (SVD)

Any $m \times n$ matrix $\mathbf{A}$ can be decomposed as:

$$\mathbf{A} = \mathbf{U}\boldsymbol{\Sigma}\mathbf{V}^T$$

where:
- $\mathbf{U}$ is $m \times m$ orthogonal (left singular vectors)
- $\boldsymbol{\Sigma}$ is $m \times n$ diagonal (singular values)
- $\mathbf{V}$ is $n \times n$ orthogonal (right singular vectors)

**In finance**: SVD is used for:
- Dimensionality reduction of return data
- Stable computation of pseudo-inverses (when covariance matrices are near-singular)
- Factor extraction from return matrices
- Data compression and noise filtering

```
SVD Decomposition:

  A (m x n)    =    U (m x m)   *   Sigma (m x n)   *   V^T (n x n)

  [         ]      [         ]     [ s1  0  0 ]     [         ]
  [  Return  ]  =  [ Left     ]  * [ 0  s2  0 ]  *  [ Right   ]
  [  Matrix  ]     [ Singular ]    [ 0   0 s3 ]     [ Singular ]
  [         ]      [ Vectors  ]    [ 0   0  0 ]     [ Vectors  ]
  [         ]      [         ]     [         ]     [         ]

  s1 >= s2 >= s3 >= ... >= 0    (singular values in decreasing order)

  Truncated SVD (keep top k singular values):
  A ~ U_k * Sigma_k * V_k^T    (rank-k approximation, best in Frobenius norm)
```

### 3.5 Applications: Portfolio Variance and PCA

#### Portfolio Variance Calculation

For a portfolio with weight vector $\mathbf{w}$ and covariance matrix $\boldsymbol{\Sigma}$:

$$\sigma_p^2 = \mathbf{w}^T \boldsymbol{\Sigma} \mathbf{w}$$

**Worked Example**: Three-asset portfolio.

```
Weights: w = [0.5, 0.3, 0.2]

Covariance Matrix (annualized):
         Asset1   Asset2   Asset3
Sigma = [ 0.0400   0.0060   0.0020 ]    Asset1 (sigma=20%)
        [ 0.0060   0.0225   0.0045 ]    Asset2 (sigma=15%)
        [ 0.0020   0.0045   0.0100 ]    Asset3 (sigma=10%)

Step 1: Sigma * w
  [0.04*0.5 + 0.006*0.3 + 0.002*0.2]   [0.0222]
  [0.006*0.5 + 0.0225*0.3 + 0.0045*0.2] = [0.0098]
  [0.002*0.5 + 0.0045*0.3 + 0.01*0.2]  [0.0034]

Step 2: w^T * (Sigma * w)
  = 0.5*0.0222 + 0.3*0.0098 + 0.2*0.0034
  = 0.0111 + 0.00294 + 0.00068
  = 0.01472

Portfolio std dev = sqrt(0.01472) = 12.13%

Compare to weighted average of stds:
  0.5*20% + 0.3*15% + 0.2*10% = 16.5%

Diversification benefit: 16.5% - 12.13% = 4.37% risk reduction
```

#### Principal Component Analysis (PCA)

PCA finds orthogonal directions of maximum variance in data. It is the eigen-decomposition of the covariance matrix.

```
PCA Process:

1. Compute covariance matrix Sigma of asset returns
2. Find eigenvalues and eigenvectors of Sigma
3. Sort by eigenvalue (largest first)
4. First few eigenvectors = "principal components" = "statistical factors"

Example: PCA on 500-stock returns

  PC1 (explains 40% of variance): Roughly equal weights on all stocks
       --> "Market factor" (looks like S&P 500)

  PC2 (explains 12% of variance): Long growth, short value
       --> "Growth vs Value factor"

  PC3 (explains 8% of variance): Long small-cap, short large-cap
       --> "Size factor"

  PCs 4-500: Each explains <5%, mostly noise

  Variance Explained:
  100%|_________________________________________
      |****
   80%|    ****
      |        ***
   60%|           ***
      |              ***
   40%|*                **
      |                   ****
   20%|                       ******
      |                             **************
    0%+----+----+----+----+----+----+----+----+--->
      PC1  PC2  PC3  PC4  PC5  ...  PC10      PC500

  Often 3-5 PCs explain 60-80% of total variance in equity returns.
  This is the basis of factor models.
```

### 3.6 Covariance Matrix Estimation

Estimating a covariance matrix from data is harder than it seems.

**Sample Covariance Matrix**:

$$\hat{\Sigma} = \frac{1}{n-1} \sum_{i=1}^n (\mathbf{r}_i - \bar{\mathbf{r}})(\mathbf{r}_i - \bar{\mathbf{r}})^T$$

**The Curse of Dimensionality**: For $p$ assets, the covariance matrix has $p(p+1)/2$ unique entries. With 500 stocks, that is 125,250 parameters. If you have only 252 trading days of data, your estimates are extremely noisy.

**Solutions**:

| Method | Description | When to Use |
|--------|-------------|-------------|
| Shrinkage (Ledoit-Wolf) | Shrink sample covariance toward a structured target | Default choice |
| Factor Models | $\Sigma = B F B^T + D$ (few factors + diagonal) | When factors are known |
| EWMA | Exponentially weighted (recent data matters more) | Fast-moving markets |
| DCC-GARCH | Dynamic Conditional Correlation | Time-varying correlations |
| Random Matrix Theory | Filter eigenvalues using Marcenko-Pastur law | Noise filtering |

**Ledoit-Wolf Shrinkage**:

$$\hat{\Sigma}_{\text{shrunk}} = \alpha \cdot \mathbf{F} + (1 - \alpha) \cdot \hat{\Sigma}_{\text{sample}}$$

where $\mathbf{F}$ is a structured target (e.g., diagonal or single-factor model) and $\alpha$ is the optimal shrinkage intensity determined analytically.

---

## 4. Calculus and Optimization

### 4.1 Derivatives and Integrals (Review)

The **derivative** measures the instantaneous rate of change:

$$f'(x) = \lim_{h \to 0} \frac{f(x+h) - f(x)}{h}$$

Key rules:
- Power rule: $(x^n)' = nx^{n-1}$
- Chain rule: $(f(g(x)))' = f'(g(x)) \cdot g'(x)$
- Product rule: $(fg)' = f'g + fg'$
- Exponential: $(e^x)' = e^x$
- Logarithm: $(\ln x)' = 1/x$

The **integral** is the antiderivative / area under the curve:

$$\int_a^b f(x) \, dx = F(b) - F(a) \quad \text{where } F'(x) = f(x)$$

**Financial Application**: Continuous compounding.

```
If interest rate r is continuously compounded:

  Future Value = PV * e^(r*t)

Derivative with respect to t:
  d(FV)/dt = PV * r * e^(r*t)

  This tells us how fast value grows.

Integral: Total return over [0, T] with time-varying rate r(t):

  FV = PV * exp( integral from 0 to T of r(t) dt )
```

### 4.2 Multivariable Calculus

#### Gradient

For $f: \mathbb{R}^n \to \mathbb{R}$, the gradient is the vector of partial derivatives:

$$\nabla f = \begin{pmatrix} \partial f / \partial x_1 \\ \partial f / \partial x_2 \\ \vdots \\ \partial f / \partial x_n \end{pmatrix}$$

The gradient points in the direction of steepest ascent.

#### Hessian

The Hessian is the matrix of second partial derivatives:

$$\mathbf{H}_{ij} = \frac{\partial^2 f}{\partial x_i \partial x_j}$$

**Key properties**:
- If $\mathbf{H}$ is positive definite at a point where $\nabla f = 0$: **local minimum**
- If $\mathbf{H}$ is negative definite: **local maximum**
- If $\mathbf{H}$ is indefinite: **saddle point**

```
Optimization Landscape Visualization (2D):

  Local Max              Saddle Point           Local Min (Global)

     /\                     /\                     --------
    /  \                   /  \  /                 \      /
   /    \                 /    \/                    \    /
  /      \               /                           \  /
 /        \             /                             \/

H neg def            H indefinite               H pos def
gradient = 0         gradient = 0               gradient = 0
```

### 4.3 Convex Optimization

A function $f$ is **convex** if for all $x, y$ and $\lambda \in [0, 1]$:

$$f(\lambda x + (1-\lambda)y) \leq \lambda f(x) + (1-\lambda) f(y)$$

Geometrically: the line segment between any two points on the graph lies above the graph.

```
Convex Function:                  Non-Convex Function:

f(x)                              f(x)
  |                                 |       .
  |  \                  /           |  .   . .
  |   \                /            | . . .   .   .
  |    \              /             |.         . .
  |     \            /              |           .     .
  |      \          /               |                . .
  |       \        /                |                   .
  |        \      /                 |
  |         \    /                  |
  |          \  /                   |
  |           \/                    |
  +-----------+--------> x         +-------------------> x

  One minimum (global = local)     Multiple local minima!
  Gradient descent finds it.       Gradient descent may get stuck.
```

**Why convexity matters in finance**: Mean-variance portfolio optimization is a convex quadratic program. This means the global optimum can be found efficiently and reliably. Many other problems in finance (risk parity, certain regularized regressions) are also convex.

### 4.4 Gradient Descent

An iterative algorithm for finding the minimum of a function:

$$\mathbf{x}_{k+1} = \mathbf{x}_k - \eta \nabla f(\mathbf{x}_k)$$

where $\eta$ is the learning rate (step size).

```
Gradient Descent Path on a Contour Plot:

  x2
   ^
   |  . . . . . . . . . . .
   | .                       .
   |.   (start)                .
   |    *                       .
   |     \                      .
   |      \                     .
   |       *                   .
   |        \                 .
   |         *               .
   |          \             .
   |           *           .
   |            \         .
   |             * (min) .
   |           . . . . .
   +----------------------------> x1

   Each * is one iteration
   Step size (eta) too large: oscillates or diverges
   Step size too small: very slow convergence
```

**Variants**:
- **Stochastic Gradient Descent (SGD)**: Uses random subsets of data per iteration (for ML)
- **Adam**: Adaptive learning rate (most popular for deep learning)
- **L-BFGS**: Quasi-Newton method (uses approximate Hessian, fast for smooth problems)

### 4.5 Lagrange Multipliers

For constrained optimization:

$$\min f(x) \quad \text{subject to} \quad g(x) = 0$$

Form the Lagrangian:

$$\mathcal{L}(x, \lambda) = f(x) + \lambda g(x)$$

At the optimum, $\nabla_x \mathcal{L} = 0$ and $g(x) = 0$.

**Worked Example**: Mean-Variance Portfolio Optimization.

```
Problem: Minimize portfolio variance subject to target return and weights summing to 1.

  min   w^T * Sigma * w
  s.t.  w^T * mu = r_target
        w^T * 1 = 1

Lagrangian:
  L = w^T * Sigma * w + lambda_1 * (r_target - w^T * mu)
                       + lambda_2 * (1 - w^T * 1)

First-order conditions:
  dL/dw = 2 * Sigma * w - lambda_1 * mu - lambda_2 * 1 = 0

Solving:
  w* = (1/2) * Sigma^(-1) * (lambda_1 * mu + lambda_2 * 1)

Substitute back into constraints to find lambda_1, lambda_2.

Numerical Example (2 assets):
  mu = [0.10, 0.05]
  Sigma = [ 0.04  0.01 ]
          [ 0.01  0.0225 ]
  r_target = 0.08

  Sigma^(-1) = [ 28.125   -12.5  ]
               [ -12.5    50.0   ]

  Solving the system of equations:
  w* = [0.667, 0.333]

  Portfolio return: 0.667*10% + 0.333*5% = 8.33% ~ 8%
  Portfolio std:    sqrt(w^T * Sigma * w) = 15.8%
```

### 4.6 Newton's Method

Newton's method uses second-order information (the Hessian) for faster convergence:

$$\mathbf{x}_{k+1} = \mathbf{x}_k - \mathbf{H}^{-1}(\mathbf{x}_k) \nabla f(\mathbf{x}_k)$$

**Advantages**: Quadratic convergence rate (much faster than gradient descent near the optimum).

**Disadvantages**: Requires computing and inverting the Hessian (expensive for high dimensions). Quasi-Newton methods (BFGS, L-BFGS) approximate the Hessian to avoid this cost.

**For root finding** (Newton-Raphson): Find $x$ such that $f(x) = 0$:

$$x_{k+1} = x_k - \frac{f(x_k)}{f'(x_k)}$$

**Financial Application**: Finding implied volatility from option prices (see Numerical Methods section).

### 4.7 Constrained Optimization

Real portfolio optimization has many constraints:

```
Typical Portfolio Optimization Constraints:

min  w^T * Sigma * w              (minimize risk)

subject to:
  w^T * mu >= r_target            (minimum return)
  w^T * 1 = 1                    (fully invested)
  w_i >= 0   for all i           (no short selling)
  w_i <= 0.10 for all i          (max 10% per position)
  sum(|w_i - w_i_prev|) <= 0.20  (max 20% turnover)
  w^T * beta <= 0.5              (max market beta)
  sum(w_i for i in sector) <= 0.30  (max 30% per sector)

This is a Quadratic Program (QP):
  Quadratic objective + linear constraints
  Solved efficiently by interior-point or active-set methods.

  Common solvers: CVXPY (Python), Gurobi, MOSEK, CPLEX
```

**KKT Conditions** (Karush-Kuhn-Tucker): Generalize Lagrange multipliers to inequality constraints. At the optimum:

1. Stationarity: $\nabla f + \sum \lambda_i \nabla g_i + \sum \mu_j \nabla h_j = 0$
2. Primal feasibility: $g_i(x) = 0$, $h_j(x) \leq 0$
3. Dual feasibility: $\mu_j \geq 0$
4. Complementary slackness: $\mu_j h_j(x) = 0$ (either constraint is active or multiplier is zero)

---

## 5. Stochastic Calculus

Stochastic calculus is the mathematical framework for modeling systems driven by randomness. It is the crown jewel of quantitative finance mathematics, providing the foundation for option pricing, risk management, and derivative modeling.

### 5.1 Brownian Motion (Wiener Process)

A **standard Brownian motion** $W(t)$ satisfies:

1. $W(0) = 0$
2. $W(t)$ has independent increments: $W(t) - W(s)$ is independent of $W(u)$ for $u \leq s < t$
3. $W(t) - W(s) \sim N(0, t - s)$ for $s < t$
4. $W(t)$ has continuous paths (no jumps)

```
Three Sample Paths of Brownian Motion:

  W(t)
   3 |                                              .
     |                                        . . .
   2 |                                  . .  .
     |              . .           . . .
   1 |         . .     .     . .           Path 1
     |     . .          . .
   0 |. .                                            t
     |                                               |
  -1 |   . .          . .                             |
     |       . . . .      . .   . .        Path 2    |
  -2 |                        .     . . .             |
     |                                   . .         |
  -3 |                                      . .  .   |
     |                                           .   |
  -4 |   . .    . .                        Path 3    |
     |       . .    .  . .                           |
  -5 |                  .  .  . . .  .               |
     +----+----+----+----+----+----+----+----+----+->
     0   0.1  0.2  0.3  0.4  0.5  0.6  0.7  0.8  1.0

  Key Properties:
  - E[W(t)] = 0           (no drift)
  - Var[W(t)] = t         (variance grows linearly with time)
  - W(t) is continuous but NOWHERE differentiable
  - Fractal-like: "jagged" at every scale
  - sqrt(t) scaling: std dev at time t is sqrt(t)
```

**Why Brownian Motion for finance?**

Stock prices are driven by the continuous arrival of unpredictable information. Brownian motion captures:
- Continuous paths (prices do not teleport)
- Random fluctuations (information is unpredictable)
- Independent increments (new information is unrelated to old)
- Normal increments (many small effects aggregate to Gaussian)

The last property is only approximately true (fat tails), but it is a powerful starting point.

### 5.2 Geometric Brownian Motion (GBM)

The standard model for stock prices:

$$dS = \mu S \, dt + \sigma S \, dW$$

or equivalently:

$$\frac{dS}{S} = \mu \, dt + \sigma \, dW$$

This says: the **return** (percentage change) on the stock has a drift component ($\mu \, dt$) and a random component ($\sigma \, dW$).

**Solution** (using Ito's lemma, which we derive next):

$$S(t) = S(0) \exp\left[\left(\mu - \frac{\sigma^2}{2}\right)t + \sigma W(t)\right]$$

```
Geometric Brownian Motion: S(0) = 100, mu = 0.10, sigma = 0.20

  S(t)
  180 |                                                    .
      |                                              . .  .
  160 |                                         . .
      |                              . .   . .
  140 |                         . .     . .
      |                    . .                         Path 1
  120 |              . . .
      |         . .
  100 |. . . .                                               t
      |                                                      |
   90 |  . .       . .                                       |
      |     . . .      . .                                   |
   80 |                    . .     . .              Path 2    |
      |                        . .    . . .  .               |
   70 |                                    .  . .            |
      |                                          .           |
   60 |  .  .  .                                   . .       |
      |          . .                                   .     |
   50 |             .  . . .  . .                  Path 3    |
      |                        . . .  . .  .  .  .           |
   40 +----+----+----+----+----+----+----+----+----+----+--->
      0   0.1  0.2  0.3  0.4  0.5  0.6  0.7  0.8  0.9  1.0

  Key: Prices are log-normally distributed
       They can go up without bound but cannot go below zero
       The sigma^2/2 correction: E[S(t)] = S(0)*e^(mu*t)
         but the median of S(t) < E[S(t)] due to log-normal skew
```

**Worked Example**: A stock is at $100, with drift $\mu = 8\%$ per year and volatility $\sigma = 25\%$.

```
After 1 year:
  E[S(1)] = 100 * e^(0.08*1) = $108.33

  S(1) = 100 * exp((0.08 - 0.25^2/2)*1 + 0.25*W(1))
       = 100 * exp(0.04875 + 0.25*W(1))

  Since W(1) ~ N(0,1):
    ln(S(1)) ~ N(ln(100) + 0.04875, 0.0625)
    ln(S(1)) ~ N(4.6539, 0.0625)

  95% range for ln(S(1)):
    4.6539 +/- 1.96*0.25 = [4.1639, 5.1439]

  95% range for S(1):
    [e^4.1639, e^5.1439] = [$64.31, $171.07]

  Huge range! Even with 8% expected growth,
  the stock could plausibly be anywhere from $64 to $171.
```

### 5.3 Ito's Lemma: The Chain Rule of Stochastic Calculus

This is the single most important result in quantitative finance mathematics.

In ordinary calculus, if $y = f(x(t))$, then $dy = f'(x) \, dx$.

In stochastic calculus, this needs correction because $dW^2 = dt$ (not zero).

**Ito's Lemma**: If $f(S, t)$ is twice differentiable and $dS = \mu S \, dt + \sigma S \, dW$, then:

$$df = \frac{\partial f}{\partial t} dt + \frac{\partial f}{\partial S} dS + \frac{1}{2}\frac{\partial^2 f}{\partial S^2}(dS)^2$$

Using $(dS)^2 = \sigma^2 S^2 dt$ (since $dW^2 = dt$, $dt \cdot dW = 0$, $dt^2 = 0$):

$$df = \left(\frac{\partial f}{\partial t} + \mu S \frac{\partial f}{\partial S} + \frac{1}{2}\sigma^2 S^2 \frac{\partial^2 f}{\partial S^2}\right)dt + \sigma S \frac{\partial f}{\partial S} dW$$

```
Ito's Lemma: Why the Extra Term?

In ordinary calculus:    df = f'(x) dx

In stochastic calculus:  df = f'(x) dx + (1/2) f''(x) (dx)^2
                                          ^^^^^^^^^^^^^^^^^
                                          THE ITO CORRECTION

This extra term exists because:
  (dW)^2 = dt  (not zero!)

In regular calculus:
  (dx)^2 ~ 0  for small dx  (second-order term, negligible)

In stochastic calculus:
  (dW)^2 ~ dt  (first-order! NOT negligible!)

This is because Brownian motion is so "rough" that its
quadratic variation is non-zero. Informally, the path
is so jagged that second-order effects matter.
```

**Worked Example**: Derive the GBM solution using Ito's lemma.

```
Let f(S) = ln(S).  We know dS = mu*S*dt + sigma*S*dW.

Partial derivatives:
  df/dS = 1/S
  d^2f/dS^2 = -1/S^2
  df/dt = 0

Apply Ito's Lemma:
  d(ln S) = (1/S)*dS + (1/2)*(-1/S^2)*(dS)^2
          = (1/S)*(mu*S*dt + sigma*S*dW) + (1/2)*(-1/S^2)*(sigma^2*S^2*dt)
          = mu*dt + sigma*dW - (1/2)*sigma^2*dt
          = (mu - sigma^2/2)*dt + sigma*dW

Integrate from 0 to t:
  ln(S(t)) - ln(S(0)) = (mu - sigma^2/2)*t + sigma*W(t)

Therefore:
  S(t) = S(0) * exp((mu - sigma^2/2)*t + sigma*W(t))

This is the famous GBM solution!

The term -sigma^2/2 is the "Ito correction" or "convexity adjustment."
It explains why the geometric mean return is lower than the
arithmetic mean return: volatility "drags" on compounded returns.
```

### 5.4 Stochastic Differential Equations (SDEs)

An SDE has the general form:

$$dX(t) = \mu(X, t) \, dt + \sigma(X, t) \, dW(t)$$

- $\mu(X, t)$: **drift** (deterministic trend)
- $\sigma(X, t)$: **diffusion** (random volatility)

**Common SDEs in Finance**:

| Model | SDE | Use |
|-------|-----|-----|
| GBM | $dS = \mu S \, dt + \sigma S \, dW$ | Stock prices |
| Ornstein-Uhlenbeck | $dX = \theta(\mu - X) \, dt + \sigma \, dW$ | Mean-reverting rates |
| CIR (Cox-Ingersoll-Ross) | $dr = \kappa(\theta - r) \, dt + \sigma\sqrt{r} \, dW$ | Interest rates |
| Heston | $dv = \kappa(\theta - v) \, dt + \xi\sqrt{v} \, dW_v$ | Stochastic volatility |
| SABR | $dF = \sigma F^\beta \, dW_1$, $d\sigma = \alpha\sigma \, dW_2$ | Vol smile modeling |

```
Mean-Reverting Process (Ornstein-Uhlenbeck):

  dX = theta*(mu - X)*dt + sigma*dW

  X(t)
   |
  mu + 2*sigma  |. .
                |    .       . .
  mu + sigma    |      . .       . .
                |               .    . .
  mu -----------|------.--------------.------.------   <-- Long-run mean
                |                           .    .
  mu - sigma    |                                  .
                |                                   .
  mu - 2*sigma  |
                +-------------------------------------------> t

  When X > mu: drift pulls DOWN (theta*(mu - X) < 0)
  When X < mu: drift pulls UP   (theta*(mu - X) > 0)

  theta = speed of mean reversion
  Large theta: snaps back quickly
  Small theta: wanders far from mean before reverting

  Applications: Interest rates, volatility, pairs trading spreads
```

### 5.5 The Ito Integral

The Ito integral $\int_0^T f(t) \, dW(t)$ extends ordinary integration to stochastic processes.

**Key properties**:
- $E\left[\int_0^T f(t) \, dW(t)\right] = 0$ (the integral is a martingale)
- $E\left[\left(\int_0^T f(t) \, dW(t)\right)^2\right] = \int_0^T E[f(t)^2] \, dt$ (Ito isometry)

**Important**: The Ito integral uses the LEFT endpoint of each interval (non-anticipating). This is crucial: you cannot use future information.

```
Ito vs Stratonovich Integral:

Ito (LEFT endpoint):           Stratonovich (MIDPOINT):

  f(t_0)*[W(t_1)-W(t_0)]        f((t_0+t_1)/2)*[W(t_1)-W(t_0)]
+ f(t_1)*[W(t_2)-W(t_1)]      + f((t_1+t_2)/2)*[W(t_2)-W(t_1)]
+ ...                          + ...

Ito integral:                  Stratonovich integral:
  E[integral] = 0               May have non-zero expectation
  Natural for finance            Natural for physics
  (non-anticipating)             (symmetric)

Finance uses Ito because:
  Traders make decisions based on CURRENT information,
  not future information. The left-endpoint convention
  enforces this "no look-ahead" requirement.
```

### 5.6 Girsanov's Theorem and Change of Measure

This is the mathematical foundation for risk-neutral pricing.

**Girsanov's Theorem**: Under certain conditions, we can change the probability measure from $P$ (real-world) to $Q$ (risk-neutral) such that a process with drift under $P$ becomes driftless under $Q$.

Under the real-world measure $P$:

$$dS = \mu S \, dt + \sigma S \, dW^P$$

Under the risk-neutral measure $Q$:

$$dS = r S \, dt + \sigma S \, dW^Q$$

where $r$ is the risk-free rate and $W^Q = W^P + \frac{\mu - r}{\sigma} t$ is a Brownian motion under $Q$.

```
Change of Measure: Real World (P) vs Risk-Neutral (Q)

Under P (real world):             Under Q (risk-neutral):
  Drift = mu (e.g., 10%)           Drift = r (e.g., 3%)
  Volatility = sigma (unchanged)   Volatility = sigma (unchanged)

  S(t) distribution (P):           S(t) distribution (Q):

         ***                              ***
       **   **                          **   **
      **     **                        **     **
     **       **                      **       **
    **         **                    **         **
   **           **                 **           **
  **             **               **             **
  +---------+-----+-->            +----+---------+-->
            |                          |
            E^P[S(T)]                  E^Q[S(T)] = S(0)*e^(rT)
            = S(0)*e^(muT)            (discounted: = S(0))

  The risk-neutral measure is NOT the "true" distribution.
  It is a mathematical convenience that allows us to price
  derivatives as discounted expected values:

  Option Price = e^(-rT) * E^Q[Payoff]

  We do NOT need to estimate mu (the stock's expected return)!
  This is remarkable and is the key insight of Black-Scholes.
```

### 5.7 Risk-Neutral Pricing

Under the risk-neutral measure $Q$, the price of any derivative is:

$$V(0) = e^{-rT} E^Q[\text{Payoff}(S(T))]$$

**Why does this work?** In a complete market with no arbitrage, there exists a unique risk-neutral measure $Q$ such that all discounted asset prices are martingales. The price of any derivative must equal its discounted expected payoff under $Q$ (otherwise, there would be an arbitrage opportunity).

**Worked Example**: Price a European call option.

```
European Call: Payoff = max(S(T) - K, 0)

Under Q: S(T) = S(0) * exp((r - sigma^2/2)*T + sigma*sqrt(T)*Z)
         where Z ~ N(0,1)

Call Price = e^(-rT) * E^Q[max(S(T) - K, 0)]

This expectation can be computed analytically:

  C = S(0)*N(d1) - K*e^(-rT)*N(d2)

where:
  d1 = [ln(S/K) + (r + sigma^2/2)*T] / (sigma*sqrt(T))
  d2 = d1 - sigma*sqrt(T)
  N(.) = standard normal CDF

This is the BLACK-SCHOLES FORMULA.

Numerical Example:
  S(0) = $100, K = $105, T = 0.5, r = 0.05, sigma = 0.20

  d1 = [ln(100/105) + (0.05 + 0.02)*0.5] / (0.20*sqrt(0.5))
     = [-0.04879 + 0.035] / 0.14142
     = -0.01379 / 0.14142
     = -0.09751

  d2 = -0.09751 - 0.14142 = -0.23893

  N(d1) = N(-0.09751) = 0.4612
  N(d2) = N(-0.23893) = 0.4056

  C = 100 * 0.4612 - 105 * e^(-0.025) * 0.4056
    = 46.12 - 105 * 0.97531 * 0.4056
    = 46.12 - 41.54
    = $4.58

  The European call is worth $4.58
```

### 5.8 Connection to Black-Scholes PDE

Ito's lemma applied to the option value $V(S, t)$ gives:

$$dV = \left(\frac{\partial V}{\partial t} + \mu S \frac{\partial V}{\partial S} + \frac{1}{2}\sigma^2 S^2 \frac{\partial^2 V}{\partial S^2}\right)dt + \sigma S \frac{\partial V}{\partial S} dW$$

Constructing a hedged portfolio (long option, short $\Delta = \partial V / \partial S$ shares) and requiring it to earn the risk-free rate leads to the **Black-Scholes PDE**:

$$\frac{\partial V}{\partial t} + rS\frac{\partial V}{\partial S} + \frac{1}{2}\sigma^2 S^2 \frac{\partial^2 V}{\partial S^2} = rV$$

```
Black-Scholes PDE Derivation (Summary):

1. Stock follows GBM: dS = mu*S*dt + sigma*S*dW

2. Option value V(S,t). By Ito's lemma:
   dV = (V_t + mu*S*V_S + 0.5*sigma^2*S^2*V_SS)*dt + sigma*S*V_S*dW

3. Hedged portfolio: Pi = V - Delta*S, where Delta = V_S
   dPi = dV - V_S*dS
       = (V_t + 0.5*sigma^2*S^2*V_SS)*dt

   The dW terms CANCEL! (This is delta hedging)
   The portfolio is instantaneously risk-free.

4. No-arbitrage: risk-free portfolio earns risk-free rate
   dPi = r*Pi*dt
   (V_t + 0.5*sigma^2*S^2*V_SS)*dt = r*(V - S*V_S)*dt

5. Rearranging:
   V_t + r*S*V_S + 0.5*sigma^2*S^2*V_SS = r*V

   This is the Black-Scholes PDE!
   Note: mu (the stock's drift) does NOT appear.
   Only r (risk-free rate) and sigma (volatility) matter.
```

---

## 6. Numerical Methods

Many problems in quantitative finance have no closed-form solution. Numerical methods provide approximate solutions with controlled accuracy.

### 6.1 Monte Carlo Simulation

Monte Carlo estimates expectations by averaging over random samples:

$$E[f(X)] \approx \frac{1}{N}\sum_{i=1}^N f(X_i)$$

where $X_1, \ldots, X_N$ are random samples.

**Error**: Standard error $\approx \sigma_f / \sqrt{N}$. To halve the error, you need 4 times as many samples.

```
Monte Carlo for Option Pricing:

Algorithm:
  1. For i = 1 to N:
     a. Generate Z_i ~ N(0,1)
     b. Simulate S_i(T) = S(0) * exp((r - sigma^2/2)*T + sigma*sqrt(T)*Z_i)
     c. Compute payoff_i = max(S_i(T) - K, 0)
  2. Option price = e^(-rT) * (1/N) * sum(payoff_i)

Worked Example:
  S(0) = $100, K = $105, T = 0.5, r = 0.05, sigma = 0.20

  N = 100,000 simulations

  Sample of simulated terminal prices:
  S_1(T) = 100 * exp((0.05 - 0.02)*0.5 + 0.2*sqrt(0.5)*(-0.52)) = $95.60
  S_2(T) = 100 * exp((0.05 - 0.02)*0.5 + 0.2*sqrt(0.5)*(1.31))  = $122.06
  S_3(T) = 100 * exp((0.05 - 0.02)*0.5 + 0.2*sqrt(0.5)*(-1.84)) = $76.83
  ...

  Payoffs: max(95.60-105, 0) = 0
           max(122.06-105, 0) = 17.06
           max(76.83-105, 0) = 0
           ...

  Average payoff across 100,000 sims: ~4.70
  Option price = e^(-0.025) * 4.70 = $4.58

  Compare to Black-Scholes analytical: $4.58  (agrees!)
  Monte Carlo std error: ~$0.05 (with 100K sims)

Convergence:

  Estimated Price
   $5.50 |*
         |
   $5.00 | *  *
         |      *
   $4.75 |        * *
         |            * *
   $4.58 |..............*..*..*..*..*..*..*..*..*  <-- True value
         |
   $4.40 |
         |
   $4.00 |
         +----+----+----+----+----+----+----+----+
         10  100  1K   5K  10K  50K 100K 500K  1M
                      Number of Simulations
```

**When to use Monte Carlo**:
- Path-dependent options (Asian, barrier, lookback)
- Multi-asset derivatives (basket options, rainbow options)
- Complex payoff structures
- When PDE methods are impractical (high dimensions)

### 6.2 Variance Reduction Techniques

Monte Carlo convergence at $O(1/\sqrt{N})$ is slow. Variance reduction makes it faster.

#### Antithetic Variates

For each random draw $Z$, also use $-Z$. This reduces variance because the errors from $Z$ and $-Z$ tend to cancel.

```
Antithetic Variates:

Standard MC:               Antithetic MC:
  Z_1 = 0.52                Z_1 = 0.52,  Z_1' = -0.52
  Z_2 = -1.31               Z_2 = -1.31, Z_2' = 1.31
  Z_3 = 0.87                Z_3 = 0.87,  Z_3' = -0.87
  ...                        ...
  N simulations              N simulations, 2N paths

  For each pair, average the payoffs:
  payoff_i = [f(Z_i) + f(-Z_i)] / 2

  Variance reduction: typically 50-80% for smooth payoffs
```

#### Control Variates

Use a correlated variable with known expectation to reduce variance.

$$\hat{C}_{\text{CV}} = \hat{C}_{\text{MC}} - \beta(\hat{X} - E[X])$$

where $X$ is the control variate and $\beta$ is chosen to minimize variance.

**Example**: When pricing an Asian option via MC, use the geometric average Asian option (which has a closed-form solution) as a control variate.

#### Importance Sampling

Change the sampling distribution to focus on regions that contribute most to the expectation. Especially useful for pricing deep out-of-the-money options where most standard MC paths contribute zero to the payoff.

### 6.3 Finite Difference Methods

Solve PDEs numerically by discretizing derivatives on a grid.

The Black-Scholes PDE:

$$\frac{\partial V}{\partial t} + rS\frac{\partial V}{\partial S} + \frac{1}{2}\sigma^2 S^2 \frac{\partial^2 V}{\partial S^2} = rV$$

```
Finite Difference Grid:

  V(S,t)
  ^
  | V(S_max,t_0) ... V(S_max,t_M)     Boundary: V(S_max,T) ~ S_max - K
  |     .               .
  |     .               .
  | V(S_i, t_j-1)  V(S_i, t_j)  V(S_i, t_j+1)
  |     .               .
  |     .               .
  | V(0, t_0)   ...  V(0, t_M)        Boundary: V(0,t) = 0 (for calls)
  +-----------------------------------------> t
  t_0=0                t_M=T

  At maturity (t=T): V(S,T) = max(S-K, 0)  (known payoff)
  Work BACKWARDS in time from T to 0.

  Discretize derivatives:
  dV/dt ~ [V(i,j+1) - V(i,j)] / dt                  (forward)
  dV/dS ~ [V(i+1,j) - V(i-1,j)] / (2*dS)            (central)
  d^2V/dS^2 ~ [V(i+1,j) - 2*V(i,j) + V(i-1,j)] / dS^2  (central)
```

**Methods**:

| Method | Stability | Accuracy | Complexity |
|--------|-----------|----------|------------|
| Explicit | Conditional ($\Delta t < \Delta S^2 / \sigma^2 S^2$) | $O(\Delta t, \Delta S^2)$ | Simple |
| Implicit | Unconditional | $O(\Delta t, \Delta S^2)$ | Tridiagonal solve |
| Crank-Nicolson | Unconditional | $O(\Delta t^2, \Delta S^2)$ | Tridiagonal solve |

**Advantages over Monte Carlo**: Gives option values for all $S$ at once (the entire "option value surface"), handles American options naturally (free boundary problem), and can be very fast for low-dimensional problems.

### 6.4 Root Finding

#### Newton-Raphson Method

Find $x$ such that $f(x) = 0$:

$$x_{n+1} = x_n - \frac{f(x_n)}{f'(x_n)}$$

**Financial Application**: Implied volatility.

```
Finding Implied Volatility:

Given: Market price of a call option C_market = $7.50
       S = $100, K = $100, T = 0.25, r = 0.05

Find sigma such that: BS_Call(S, K, T, r, sigma) = C_market

Define f(sigma) = BS_Call(sigma) - C_market

Newton-Raphson iteration:
  sigma_{n+1} = sigma_n - [BS_Call(sigma_n) - C_market] / Vega(sigma_n)

  where Vega = dBS/d(sigma) = S*sqrt(T)*N'(d1)

Iteration:
  sigma_0 = 0.20  (initial guess)
  f(0.20) = BS(0.20) - 7.50 = 5.23 - 7.50 = -2.27
  Vega(0.20) = 19.95
  sigma_1 = 0.20 - (-2.27)/19.95 = 0.3138

  f(0.3138) = BS(0.3138) - 7.50 = 7.67 - 7.50 = 0.17
  Vega(0.3138) = 19.48
  sigma_2 = 0.3138 - 0.17/19.48 = 0.3051

  f(0.3051) = BS(0.3051) - 7.50 = 7.501 - 7.50 = 0.001
  Converged! sigma_implied ~ 30.5%

  Typically converges in 3-5 iterations (quadratic convergence).
```

#### Bisection Method

Slower but guaranteed to converge (no derivative needed).

```
Bisection: Find root of f(x) in [a, b] where f(a)*f(b) < 0

  Step 1: mid = (a+b)/2
  Step 2: If f(mid)*f(a) < 0: root is in [a, mid], set b = mid
          Else: root is in [mid, b], set a = mid
  Step 3: Repeat until |b-a| < tolerance

  Convergence: linear, gains one bit of accuracy per iteration.
  After 50 iterations: accuracy ~ 2^(-50) ~ 10^(-15)
```

### 6.5 Numerical Integration

#### Trapezoidal Rule

$$\int_a^b f(x) \, dx \approx \frac{h}{2}\left[f(a) + 2f(x_1) + 2f(x_2) + \ldots + 2f(x_{n-1}) + f(b)\right]$$

where $h = (b - a) / n$.

#### Simpson's Rule

$$\int_a^b f(x) \, dx \approx \frac{h}{3}\left[f(a) + 4f(x_1) + 2f(x_2) + 4f(x_3) + \ldots + f(b)\right]$$

Error: $O(h^4)$ (much better than trapezoidal's $O(h^2)$).

#### Gaussian Quadrature

Uses optimally chosen nodes and weights:

$$\int_a^b f(x) \, dx \approx \sum_{i=1}^n w_i f(x_i)$$

Achieves $O(h^{2n})$ accuracy with $n$ nodes for smooth functions.

**Financial Application**: Pricing options by numerically integrating the risk-neutral density:

$$C = e^{-rT} \int_K^{\infty} (S - K) f_Q(S) \, dS$$

### 6.6 Random Number Generation

All Monte Carlo methods depend on high-quality random number generators (RNGs).

**Pseudo-random number generators (PRNGs)**:
- Mersenne Twister (MT19937): Standard in most programming languages, period $2^{19937} - 1$
- PCG family: More modern, better statistical properties

**Quasi-random sequences** (low-discrepancy sequences):
- Sobol sequences: Fill the space more uniformly than pseudo-random
- Halton sequences: Simple to implement

```
Pseudo-Random vs Quasi-Random (2D):

Pseudo-Random (1000 points):       Sobol Sequence (1000 points):

  1 |. .  .  . . .   .  . . .       1 |. . . . . . . . . . . . .
    | . .   .  . . .  . .  ..         |. . . . . . . . . . . . .
    |.  . .  .   .  . .  . .          |. . . . . . . . . . . . .
    |  .  .  . .  .  .  .. .           |. . . . . . . . . . . . .
    |.  . .   .  . . .  . .           |. . . . . . . . . . . . .
    | . .  . .  .  . . .  .           |. . . . . . . . . . . . .
    |.   . . .  .  . .  . .           |. . . . . . . . . . . . .
    | .  .   .  . . .  .  .           |. . . . . . . . . . . . .
    |  . .  .   .  . .  . .           |. . . . . . . . . . . . .
  0 +------------------------+       0 +------------------------+
    0                        1         0                        1

  Random: clusters and gaps            Sobol: fills space uniformly
  Convergence: O(1/sqrt(N))            Convergence: O(log(N)^d / N)
                                       (much faster for smooth integrands)
```

**In practice**: Quasi-random methods can achieve the same accuracy as pseudo-random methods with 10x-100x fewer samples for smooth problems. This translates directly to faster pricing.

---

## 7. Information Theory

Information theory, developed by Claude Shannon, provides tools for quantifying uncertainty and information content. It has become increasingly important for ML-oriented quants.

### 7.1 Entropy

**Shannon entropy** measures the uncertainty of a random variable:

$$H(X) = -\sum_i P(x_i) \log_2 P(x_i) \quad \text{(discrete)}$$

$$H(X) = -\int f(x) \ln f(x) \, dx \quad \text{(continuous, differential entropy)}$$

```
Entropy Examples:

Fair Coin (p=0.5):                   Biased Coin (p=0.9):
  H = -0.5*log2(0.5) - 0.5*log2(0.5)   H = -0.9*log2(0.9) - 0.1*log2(0.1)
    = -0.5*(-1) - 0.5*(-1)                = -0.9*(-0.152) - 0.1*(-3.322)
    = 1.0 bit                              = 0.137 + 0.332
                                           = 0.469 bits

Fair coin: Maximum uncertainty (1 bit)
Biased coin: Less uncertainty (you can "guess" heads)

Entropy vs. Probability (Binary):

  H(p)
  1.0 |         *****
      |       **     **
      |     **         **
  0.8 |    *             *
      |   *               *
  0.6 |  *                 *
      | *                   *
  0.4 |*                     *
      |*                     *
  0.2 |*                      *
      *                        *
  0.0 *                         *
      +----+----+----+----+----+
      0   0.2  0.4  0.6  0.8  1.0
                  p

  Maximum entropy at p = 0.5 (maximum uncertainty)
  Entropy = 0 at p = 0 or p = 1 (no uncertainty)
```

**In finance**: High entropy in return distributions means high uncertainty (wide range of possible outcomes). Low entropy means more predictable behavior.

### 7.2 Mutual Information

**Mutual information** measures how much knowing one variable tells you about another:

$$I(X; Y) = H(X) + H(Y) - H(X, Y) = \sum_{x,y} P(x,y) \log \frac{P(x,y)}{P(x)P(y)}$$

Properties:
- $I(X; Y) \geq 0$ (knowing $Y$ never hurts)
- $I(X; Y) = 0$ if and only if $X$ and $Y$ are independent
- $I(X; Y) = I(Y; X)$ (symmetric)
- $I(X; X) = H(X)$ (a variable carries full information about itself)

```
Mutual Information vs Correlation:

Correlation captures LINEAR dependence.
Mutual Information captures ANY dependence.

Example: Y = X^2, X ~ Uniform(-1, 1)

  Y
  1 |  *                 *
    |   *               *
    |    *             *
    |     *           *
    |      **       **
    |        *     *
    |         ** **
  0 |           *
    +-----+-----+-----+--->  X
         -1     0     1

Correlation:  rho(X, Y) = 0   (no LINEAR relationship)
Mutual Info:  I(X; Y) > 0     (strong NONLINEAR relationship)

Mutual information detects what correlation misses!
```

**In finance**: Use mutual information for:
- Feature selection: Which features carry genuine information about future returns?
- Non-linear dependencies: Detect relationships that correlation misses
- Signal quality assessment: How much information does a trading signal contain?

### 7.3 Kullback-Leibler (KL) Divergence

KL divergence measures how much one distribution $Q$ differs from a reference distribution $P$:

$$D_{KL}(P \| Q) = \sum_i P(x_i) \log \frac{P(x_i)}{Q(x_i)} \quad \text{(discrete)}$$

$$D_{KL}(P \| Q) = \int p(x) \ln \frac{p(x)}{q(x)} \, dx \quad \text{(continuous)}$$

**Properties**:
- $D_{KL}(P \| Q) \geq 0$ (Gibbs' inequality)
- $D_{KL}(P \| Q) = 0$ if and only if $P = Q$
- **NOT symmetric**: $D_{KL}(P \| Q) \neq D_{KL}(Q \| P)$ in general
- Not a true "distance" (violates triangle inequality)

**Worked Example**: Compare the true return distribution $P$ to a normal model $Q$.

```
Suppose true daily return distribution (binned):

  Return Bin    P(true)    Q(normal)    P*log(P/Q)
  -------------------------------------------------------
  < -3%         0.020      0.005        0.020 * ln(4.0) = 0.0277
  -3% to -1%   0.150      0.160        0.150 * ln(0.9375) = -0.0097
  -1% to +1%   0.580      0.670        0.580 * ln(0.8657) = -0.0836
  +1% to +3%   0.180      0.160        0.180 * ln(1.125) = 0.0212
  > +3%         0.070      0.005        0.070 * ln(14.0) = 0.1847
  -------------------------------------------------------
  D_KL(P || Q) = 0.0277 - 0.0097 - 0.0836 + 0.0212 + 0.1847
               = 0.1403 nats

This positive KL divergence quantifies how much the normal model
misrepresents the true distribution. The largest contribution comes
from the right tail (>+3%) where the normal model severely
underestimates the probability.
```

**Applications in Finance**:
- **Model validation**: How well does a fitted model match the empirical distribution?
- **Relative entropy pricing**: Pricing derivatives by minimizing KL divergence from a prior
- **Information-theoretic feature selection**: Features that minimize KL divergence between conditional and unconditional return distributions
- **ML training**: Cross-entropy loss (used in classification) is closely related to KL divergence

### 7.4 Application: Information-Theoretic Feature Selection

When building a trading model with many candidate features (technical indicators, fundamental ratios, alternative data), mutual information helps select the most informative ones.

```
Feature Selection Pipeline:

1. Compute I(Feature_i; Future_Return) for each candidate feature
2. Rank features by mutual information
3. Remove redundant features (those with high I(Feature_i; Feature_j))
4. Select top-k features with high signal and low redundancy

Example Results:

  Feature                    I(Feature; Return)    Rank
  ----------------------------------------------------------
  5-day momentum             0.043                 1
  30-day vol                 0.038                 2
  Bid-ask spread             0.031                 3
  RSI(14)                    0.028                 4
  Volume ratio               0.022                 5
  50-day MA crossover        0.019                 6
  Lunar phase                0.001                 20   <-- noise

  Advantage over correlation-based selection:
  - Captures non-linear predictive relationships
  - Does not assume Gaussian distributions
  - Works with categorical features

  Disadvantage:
  - Requires binning or density estimation for continuous variables
  - Computationally more expensive than correlation
  - Sensitive to bin size / bandwidth choice
```

---

## Summary: The Mathematical Toolbox

```
+------------------------------------------------------------------------+
|                    MATH TOOLS BY APPLICATION                             |
+------------------------------------------------------------------------+
|                                                                        |
|  OPTION PRICING                    PORTFOLIO CONSTRUCTION               |
|  +---------------------------+    +----------------------------+        |
|  | Stochastic calculus        |    | Linear algebra (cov matrix) |        |
|  | Ito's lemma               |    | Quadratic optimization      |        |
|  | Risk-neutral pricing       |    | Lagrange multipliers        |        |
|  | Monte Carlo simulation     |    | Eigendecomposition / PCA    |        |
|  | Finite differences         |    | Shrinkage estimation        |        |
|  | Root finding (implied vol) |    | Convex programming          |        |
|  +---------------------------+    +----------------------------+        |
|                                                                        |
|  RISK MANAGEMENT                   STATISTICAL MODELING                 |
|  +---------------------------+    +----------------------------+        |
|  | Extreme value theory       |    | Regression (OLS, robust)    |        |
|  | Fat-tailed distributions   |    | MLE / Bayesian estimation   |        |
|  | Copulas (joint tail risk)  |    | Hypothesis testing          |        |
|  | Monte Carlo (VaR, CVaR)    |    | Bootstrap methods           |        |
|  | Covariance estimation      |    | Time series analysis        |        |
|  +---------------------------+    +----------------------------+        |
|                                                                        |
|  ML / SIGNAL RESEARCH              EXECUTION / MARKET MAKING            |
|  +---------------------------+    +----------------------------+        |
|  | Information theory          |    | Stochastic optimization     |        |
|  | Gradient descent / Adam     |    | Dynamic programming         |        |
|  | SVD / dimensionality red.   |    | Queuing theory              |        |
|  | Bayesian inference          |    | Optimal control             |        |
|  | Cross-validation            |    | Numerical integration       |        |
|  +---------------------------+    +----------------------------+        |
|                                                                        |
+------------------------------------------------------------------------+
```

### Key Formulas to Memorize

| Formula | Expression | Use |
|---------|-----------|-----|
| Bayes' Theorem | $P(A|B) = P(B|A)P(A)/P(B)$ | Updating beliefs |
| Portfolio Variance | $\sigma_p^2 = w^T \Sigma w$ | Risk calculation |
| OLS Estimator | $\hat{\beta} = (X^TX)^{-1}X^Ty$ | Regression |
| Ito's Lemma | $df = f_t dt + f_S dS + \frac{1}{2}f_{SS}(dS)^2$ | Stochastic chain rule |
| Black-Scholes | $C = SN(d_1) - Ke^{-rT}N(d_2)$ | European call pricing |
| GBM Solution | $S(t) = S(0)e^{(\mu-\sigma^2/2)t + \sigma W(t)}$ | Stock price model |
| KL Divergence | $D_{KL}(P\|Q) = \sum P \log(P/Q)$ | Distribution comparison |
| Sharpe Ratio SE | $\text{SE} \approx \sqrt{(1+SR^2/2)/n}$ | Statistical significance |

### Study Recommendations

1. **Start with probability and statistics**. You cannot do anything in quant finance without them. Work through problems by hand.

2. **Linear algebra is the language of portfolio theory**. Practice matrix multiplication, eigendecomposition, and covariance estimation until they are second nature.

3. **Stochastic calculus is hard but essential**. Start with discrete models (binomial trees), then take the continuous limit. Shreve's "Stochastic Calculus for Finance" is the standard reference.

4. **Implement everything in code**. Reading about Monte Carlo is different from coding it yourself and seeing convergence. Build your own Black-Scholes calculator. Simulate GBM paths. Estimate covariance matrices.

5. **Focus on intuition, not just formulas**. Why does the Ito correction exist? Why does diversification reduce risk? Why do fat tails matter for risk management? The formulas are tools; understanding when and why to use them is what makes a quant.

---

**Next Chapter**: [Chapter 3 - Python for Quantitative Finance](./03-PYTHON-FOR-QUANT.md) -- where we implement all of these mathematical concepts in code.
