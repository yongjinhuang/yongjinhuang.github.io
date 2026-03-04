# Probability & Statistics for Quant Interviews

## Why This Matters

Probability and statistics form the backbone of every quant interview. Whether you are interviewing for a trader role at Jane Street or a researcher position at Two Sigma, you will face probability questions. These are not textbook exercises -- they are designed to test whether you can reason under uncertainty, a skill that directly translates to trading.

---

## 1. Combinatorics

### Fundamental Counting Principle

If task A can be done in m ways and task B in n ways, then A followed by B can be done in m * n ways.

### Permutations

The number of ways to arrange k items from n distinct items (order matters):

```
P(n, k) = n! / (n - k)!
```

**Example**: How many 3-letter "words" can be formed from {A, B, C, D, E}?
P(5, 3) = 5! / 2! = 60

### Combinations

The number of ways to choose k items from n distinct items (order does not matter):

```
C(n, k) = n! / (k! * (n - k)!)
```

**Key identities**:
- C(n, k) = C(n, n-k)                    (symmetry)
- C(n, k) = C(n-1, k-1) + C(n-1, k)     (Pascal's identity)
- Sum of C(n, k) for k=0..n = 2^n        (binomial theorem at x=1)

### Stars and Bars

The number of ways to put n identical balls into k distinct bins:

```
C(n + k - 1, k - 1)
```

**Example**: How many non-negative integer solutions to x1 + x2 + x3 = 10?
C(10 + 3 - 1, 3 - 1) = C(12, 2) = 66

For strictly positive solutions (each xi >= 1), substitute yi = xi - 1:
y1 + y2 + y3 = 7, so C(9, 2) = 36

### Inclusion-Exclusion Principle

```
|A1 ∪ A2 ∪ ... ∪ An| = Σ|Ai| - Σ|Ai ∩ Aj| + Σ|Ai ∩ Aj ∩ Ak| - ... + (-1)^(n+1)|A1 ∩ ... ∩ An|
```

**Classic application -- Derangements**: How many permutations of n items have NO item in its original position?

```
D(n) = n! * Σ_{k=0}^{n} (-1)^k / k!   ≈   n! / e
```

For large n, the probability that a random permutation is a derangement approaches 1/e ≈ 0.3679.

### Pigeonhole Principle

If n items are placed into m containers with n > m, at least one container has more than one item.

**Generalized**: If n items in m containers, some container has at least ceil(n/m) items.

**Example**: Prove that among any 5 integers, at least two have the same remainder mod 4.
*Proof*: There are only 4 possible remainders (0, 1, 2, 3). By pigeonhole, 5 integers in 4 "bins" means at least two share a remainder.

---

## 2. Probability Fundamentals

### Sample Space and Events

A **probability space** is a triple (Omega, F, P) where:
- Omega is the sample space (set of all outcomes)
- F is a sigma-algebra of events (subsets of Omega)
- P is a probability measure with P(Omega) = 1

### Axioms of Probability (Kolmogorov)
1. P(A) >= 0 for all events A
2. P(Omega) = 1
3. For mutually exclusive events A1, A2, ...: P(union) = sum of P(Ai)

### Conditional Probability

```
P(A | B) = P(A ∩ B) / P(B),    provided P(B) > 0
```

**Multiplication rule**: P(A ∩ B) = P(A | B) * P(B) = P(B | A) * P(A)

### Bayes' Theorem

```
P(A | B) = P(B | A) * P(A) / P(B)
```

More usefully, with partition {A1, ..., An}:

```
P(Ai | B) = P(B | Ai) * P(Ai) / Σ_j P(B | Aj) * P(Aj)
```

**Interview Example**: A drug test is 99% accurate (both sensitivity and specificity). If 0.5% of the population uses drugs, what is the probability a person who tests positive actually uses drugs?

```
P(user | +) = P(+ | user) * P(user) / P(+)
            = 0.99 * 0.005 / (0.99 * 0.005 + 0.01 * 0.995)
            = 0.00495 / (0.00495 + 0.00995)
            = 0.00495 / 0.01490
            ≈ 0.332
```

Only about 33.2% -- a classic illustration of the base rate fallacy.

### Law of Total Probability

If {B1, B2, ..., Bn} partitions Omega:

```
P(A) = Σ_i P(A | Bi) * P(Bi)
```

### Independence

Events A and B are independent iff P(A ∩ B) = P(A) * P(B).

Equivalently: P(A | B) = P(A).

**Warning**: Pairwise independence does NOT imply mutual independence.

---

## 3. Expected Value

### Definition

For discrete random variable X:
```
E[X] = Σ_x x * P(X = x)
```

For continuous random variable X with density f:
```
E[X] = ∫ x * f(x) dx
```

### Linearity of Expectation (CRITICAL)

For ANY random variables X1, ..., Xn (not necessarily independent):

```
E[X1 + X2 + ... + Xn] = E[X1] + E[X2] + ... + E[Xn]
```

This is the single most powerful tool in probability. It works even when the Xi are dependent.

### Indicator Random Variables

Define I_A = 1 if event A occurs, 0 otherwise. Then E[I_A] = P(A).

**Example**: Expected number of fixed points in a random permutation of n items.

Let Xi = 1 if item i is in position i. Then E[Xi] = 1/n.

```
E[total fixed points] = E[X1 + X2 + ... + Xn] = n * (1/n) = 1
```

Beautifully, this is 1 regardless of n.

### Conditional Expectation (Adam's Law / Tower Property)

```
E[X] = E[E[X | Y]]
```

This means: E[X] = Σ_y E[X | Y = y] * P(Y = y)

**Example**: You roll a fair die. If you get k, you then flip k coins. What is the expected number of heads?

Let X = number of heads, Y = die roll.
E[X | Y = k] = k/2 (each coin has 1/2 chance of heads)
E[X] = E[E[X | Y]] = E[Y/2] = E[Y]/2 = 3.5/2 = 1.75

### LOTUS (Law of the Unconscious Statistician)

```
E[g(X)] = Σ_x g(x) * P(X = x)     (discrete)
E[g(X)] = ∫ g(x) * f(x) dx         (continuous)
```

You do NOT need the distribution of g(X), only the distribution of X.

---

## 4. Variance and Covariance

### Variance

```
Var(X) = E[(X - E[X])^2] = E[X^2] - (E[X])^2
```

Properties:
- Var(aX + b) = a^2 * Var(X)
- Var(X) >= 0, with equality iff X is constant a.s.

### Covariance and Correlation

```
Cov(X, Y) = E[XY] - E[X]*E[Y]
Corr(X, Y) = Cov(X, Y) / (SD(X) * SD(Y))     ∈ [-1, 1]
```

If X, Y are independent then Cov(X, Y) = 0 (converse is FALSE in general).

### Variance of Sums

```
Var(X + Y) = Var(X) + Var(Y) + 2*Cov(X, Y)
```

For independent X, Y: Var(X + Y) = Var(X) + Var(Y)

For n independent Xi: Var(Σ Xi) = Σ Var(Xi)

### Eve's Law (Law of Total Variance)

```
Var(X) = E[Var(X | Y)] + Var(E[X | Y])
```

"The total variance = mean of conditional variances + variance of conditional means"

**Example**: Using the die-then-coins example above.
- E[X | Y] = Y/2, so Var(E[X | Y]) = Var(Y/2) = Var(Y)/4 = (35/12)/4 = 35/48
- Var(X | Y) = Y * (1/4) (variance of Y Bernoulli trials), so E[Var(X | Y)] = E[Y]/4 = 3.5/4 = 7/8
- Var(X) = 7/8 + 35/48 = 42/48 + 35/48 = 77/48 ≈ 1.604

---

## 5. Common Distributions

### Discrete Distributions

| Distribution | PMF / Parameters | E[X] | Var(X) | MGF M(t) |
|-------------|-----------------|------|--------|-----------|
| Bernoulli(p) | P(X=1) = p | p | p(1-p) | (1-p) + pe^t |
| Binomial(n,p) | C(n,k)p^k(1-p)^(n-k) | np | np(1-p) | ((1-p) + pe^t)^n |
| Geometric(p) | p(1-p)^(k-1), k=1,2,... | 1/p | (1-p)/p^2 | pe^t / (1-(1-p)e^t) |
| Poisson(lambda) | e^(-λ)λ^k / k! | λ | λ | e^(λ(e^t - 1)) |
| Negative Binomial(r,p) | C(k-1,r-1)p^r(1-p)^(k-r) | r/p | r(1-p)/p^2 | (pe^t / (1-(1-p)e^t))^r |

**When each arises in trading**:
- **Bernoulli**: A single trade is profitable (1) or not (0)
- **Binomial**: Number of profitable trades out of n
- **Geometric**: Number of trades until first profit
- **Poisson**: Number of order arrivals in a time interval (if arrivals are independent and rate is constant)

### Continuous Distributions

| Distribution | PDF | E[X] | Var(X) |
|-------------|-----|------|--------|
| Uniform(a,b) | 1/(b-a) | (a+b)/2 | (b-a)^2/12 |
| Exponential(λ) | λe^(-λx), x >= 0 | 1/λ | 1/λ^2 |
| Normal(μ,σ^2) | (1/√(2πσ^2)) exp(-(x-μ)^2/(2σ^2)) | μ | σ^2 |
| Log-Normal(μ,σ^2) | (1/(x√(2πσ^2))) exp(-(ln x - μ)^2/(2σ^2)) | e^(μ+σ^2/2) | (e^(σ^2)-1)e^(2μ+σ^2) |

**When each arises in trading**:
- **Uniform**: Prior on an unknown parameter, random starting times
- **Exponential**: Time between order arrivals (memoryless property), time to next market event
- **Normal**: Daily returns (approximately), sum of many small independent shocks (CLT)
- **Log-Normal**: Stock prices under GBM model (since log-returns are normal)

### The Exponential-Poisson Connection

If events arrive according to a Poisson process with rate λ:
- Number of events in time t is Poisson(λt)
- Time between consecutive events is Exponential(λ)
- Time until the r-th event is Gamma(r, λ)

### Memoryless Property

The exponential (continuous) and geometric (discrete) are the ONLY memoryless distributions:

```
P(X > s + t | X > s) = P(X > t)
```

**Interview application**: "You've been waiting 10 minutes for a bus that arrives according to a Poisson process with rate 1 per 15 minutes. What is your expected additional wait time?" Answer: 15 minutes (memoryless -- the past does not matter).

---

## 6. Central Limit Theorem

### Statement

If X1, X2, ..., Xn are i.i.d. with mean μ and finite variance σ^2, then:

```
√n * (X̄ - μ) / σ  →  N(0, 1)   as n → ∞
```

where X̄ = (1/n) Σ Xi is the sample mean.

### Practical Form

For large n:

```
X̄ ~ approximately N(μ, σ^2 / n)
Σ Xi ~ approximately N(nμ, nσ^2)
```

### Rate of Convergence (Berry-Esseen)

The CLT approximation error is O(1/√n). Specifically:

```
sup_x |P((X̄ - μ)/(σ/√n) <= x) - Φ(x)| <= C * E[|X1 - μ|^3] / (σ^3 * √n)
```

where C ≈ 0.4748 and Phi is the standard normal CDF.

### Application in Trading: Sharpe Ratio Estimation

If daily returns have mean μ and standard deviation σ:
- Annualized Sharpe Ratio = (μ / σ) * √252
- Standard error of estimated Sharpe = approximately 1/√n for n days of data
- You need about 4 years of daily data to distinguish a Sharpe of 1.0 from 0 at 95% confidence

```python
import numpy as np

def sharpe_confidence_interval(returns, confidence=0.95):
    """Compute Sharpe ratio with confidence interval using CLT."""
    n = len(returns)
    mu = np.mean(returns)
    sigma = np.std(returns, ddof=1)
    sharpe_daily = mu / sigma
    sharpe_annual = sharpe_daily * np.sqrt(252)

    # Standard error of Sharpe (Lo, 2002 approximation)
    se = np.sqrt((1 + 0.5 * sharpe_daily**2) / n) * np.sqrt(252)

    from scipy import stats
    z = stats.norm.ppf((1 + confidence) / 2)
    return {
        'sharpe': sharpe_annual,
        'ci_lower': sharpe_annual - z * se,
        'ci_upper': sharpe_annual + z * se
    }
```

---

## 7. Order Statistics

### Setup

Given n i.i.d. random variables X1, ..., Xn, the order statistics are X_(1) <= X_(2) <= ... <= X_(n).

### Uniform Order Statistics

If X1, ..., Xn are i.i.d. Uniform(0, 1):

```
E[X_(k)] = k / (n + 1)
Var(X_(k)) = k(n - k + 1) / ((n + 1)^2 (n + 2))
```

**Spacing**: The gaps between consecutive order statistics:
D_k = X_(k) - X_(k-1) are exchangeable with E[D_k] = 1/(n+1).

### Min and Max

For i.i.d. variables with CDF F:

```
P(X_(n) <= x) = [F(x)]^n          (CDF of maximum)
P(X_(1) <= x) = 1 - [1 - F(x)]^n  (CDF of minimum)
```

**Expected maximum of n Uniform(0,1)**: E[X_(n)] = n/(n+1)
**Expected minimum of n Uniform(0,1)**: E[X_(1)] = 1/(n+1)

### Interview Example

"What is the expected value of the maximum of 3 rolls of a fair die?"

Let M = max(X1, X2, X3) where Xi are uniform on {1, 2, 3, 4, 5, 6}.

```
P(M <= k) = (k/6)^3

E[M] = Σ_{k=1}^{6} P(M >= k) = Σ_{k=1}^{6} [1 - ((k-1)/6)^3]
     = 1 - 0 + 1 - 1/216 + 1 - 8/216 + 1 - 27/216 + 1 - 64/216 + 1 - 125/216
     = 6 - (0 + 1 + 8 + 27 + 64 + 125)/216
     = 6 - 225/216
     = 6 - 1.0417
     = 4.9583 ≈ 119/24
```

Alternative using P(M = k) = (k/6)^3 - ((k-1)/6)^3:

```python
expected_max = sum(k * ((k/6)**3 - ((k-1)/6)**3) for k in range(1, 7))
print(f"E[max of 3 dice] = {expected_max:.4f}")  # 4.9583
```

---

## 8. Classic Probability Puzzles

### Puzzle 1: Coupon Collector Problem

**Problem**: A cereal box contains one of n different toys, each equally likely. How many boxes must you buy to collect all n toys?

**Solution**: Let Ti be the number of boxes needed to get a new toy when you already have i distinct toys.

After collecting i toys, the probability the next box has a new one is (n - i)/n.
So Ti is Geometric with parameter p_i = (n - i)/n, giving E[Ti] = n/(n - i).

```
E[total] = Σ_{i=0}^{n-1} n/(n - i) = n * Σ_{j=1}^{n} 1/j = n * H_n
```

where H_n = 1 + 1/2 + 1/3 + ... + 1/n is the n-th harmonic number.

For n = 6 (die faces): E = 6 * (1 + 1/2 + 1/3 + 1/4 + 1/5 + 1/6) = 6 * 2.45 = 14.7

For n = 52 (deck of cards): E = 52 * H_52 ≈ 52 * 4.559 ≈ 236

### Puzzle 2: Gambler's Ruin

**Problem**: Player A starts with $a, Player B with $b. Each round, A wins $1 from B with probability p, or loses $1 to B with probability q = 1 - p. What is the probability A goes bankrupt?

**Solution**: Let P_i = probability of ruin starting with $i.

Boundary conditions: P_0 = 1 (already ruined), P_{a+b} = 0 (B is ruined).

Recurrence: P_i = p * P_{i+1} + q * P_{i-1}

If p != q (biased coin):
```
P_i = ((q/p)^i - (q/p)^(a+b)) / (1 - (q/p)^(a+b))

For A's ruin probability: P_a = ((q/p)^a - (q/p)^(a+b)) / (1 - (q/p)^(a+b))
```

If p = q = 1/2 (fair coin):
```
P_i = 1 - i/(a+b)

For A's ruin probability: P_a = b / (a + b)
```

**Key insight for trading**: Even with a slight edge, if your bankroll is small relative to the market, ruin is likely. This is why position sizing and risk management matter.

### Puzzle 3: Birthday Problem

**Problem**: In a room of k people, what is the probability at least two share a birthday (n = 365 days)?

```
P(at least one match) = 1 - P(all different)
                      = 1 - 365/365 * 364/365 * 363/365 * ... * (365-k+1)/365
                      = 1 - 365! / (365^k * (365-k)!)
```

**Key values**: P > 0.5 when k >= 23, P > 0.99 when k >= 57.

**Approximation**: For small k relative to n:
```
P ≈ 1 - e^(-k(k-1)/(2n))
```

### Puzzle 4: Derangements (Matching Problem)

**Problem**: A group of n people each put their hat in a pile. If hats are randomly redistributed, what is the probability nobody gets their own hat?

```
P(derangement) = Σ_{k=0}^{n} (-1)^k / k! → 1/e ≈ 0.3679 as n → ∞
```

This converges extremely fast. For n >= 5, the probability is already within 0.003 of 1/e.

**Follow-up**: What is the expected number of people who get their own hat back?
By linearity of expectation: E[fixed points] = n * (1/n) = 1, regardless of n.

### Puzzle 5: Broken Stick Problem

**Problem**: A stick of length 1 is broken at two uniformly random points. What is the probability the three pieces form a triangle?

**Solution**: Let the break points be U and V, uniform on [0, 1]. The three pieces have lengths:
min(U,V), |U-V|, 1-max(U,V).

A triangle is formed iff no piece exceeds 1/2, which means:
min(U,V) < 1/2 AND |U-V| < 1/2 AND 1-max(U,V) < 1/2

Equivalently: all three pieces < 1/2.

By geometric probability (computing the area of the valid region in the unit square):

```
P(triangle) = 1/4
```

### Puzzle 6: Expected Number of Dice Rolls to See All Six Faces

This is the coupon collector problem with n = 6:
```
E = 6(1 + 1/2 + 1/3 + 1/4 + 1/5 + 1/6) = 6 + 3 + 2 + 1.5 + 1.2 + 1 = 14.7
```

### Puzzle 7: Two Envelopes Problem

**Problem**: Two envelopes contain amounts X and 2X. You pick one randomly and see $100. Should you switch?

**Key insight**: The paradox arises from incorrect application of conditional expectation. If you see $100, the other envelope contains either $50 or $200 with equal probability, so the expected value of switching is (50 + 200)/2 = $125. But the same argument says you should ALWAYS switch, which is paradoxical.

**Resolution**: The paradox assumes an improper prior on X. With any proper prior, the argument breaks down.

---

## 9. Markov Chains

### Definition

A stochastic process {Xn} is a Markov chain if:

```
P(Xn+1 = j | Xn = i, Xn-1 = in-1, ..., X0 = i0) = P(Xn+1 = j | Xn = i) = P_ij
```

The future depends on the present, not the past.

### Transition Matrix

```
P = [P_ij] where P_ij = P(go from state i to state j)
```

Each row sums to 1. The n-step transition probability is given by P^n.

### Stationary Distribution

A distribution pi is stationary if pi * P = pi, i.e., it is a left eigenvector of P with eigenvalue 1.

For an irreducible, aperiodic chain on a finite state space:
- A unique stationary distribution exists
- The chain converges to it from any starting state

### Absorption Probabilities

For chains with absorbing states, key questions are:
- Probability of being absorbed in each absorbing state
- Expected time to absorption

**Method**: Set up a system of linear equations using first-step analysis.

### Random Walk Example

A particle starts at position 0 on {0, 1, 2, ..., N}. At each step it moves right with probability p and left with probability q = 1 - p. States 0 and N are absorbing. What is E[T], the expected number of steps to absorption?

Using first-step analysis, let t_i = E[T | start at i]:
```
t_i = 1 + p * t_{i+1} + q * t_{i-1},    1 <= i <= N-1
t_0 = t_N = 0
```

For p = q = 1/2: t_i = i * (N - i)
For p != q: t_i = (i/(q-p)) - (N/(q-p)) * ((q/p)^i - 1) / ((q/p)^N - 1)

```python
import numpy as np

def random_walk_absorption_time(N, p, start):
    """Compute expected absorption time via linear system."""
    q = 1 - p
    # Set up system: t_i = 1 + p*t_{i+1} + q*t_{i-1}
    # Rearranged: -q*t_{i-1} + t_i - p*t_{i+1} = 1
    A = np.zeros((N-1, N-1))
    b = np.ones(N-1)

    for i in range(N-1):
        A[i, i] = 1
        if i > 0:
            A[i, i-1] = -q
        if i < N-2:
            A[i, i+1] = -p

    t = np.linalg.solve(A, b)
    return t[start - 1]

# Expected steps from position 3 with N=10, p=0.5
print(random_walk_absorption_time(10, 0.5, 3))  # 21.0 = 3*7
```

### Application: Gambler's Ruin as Markov Chain

The gambler's ruin problem is exactly a random walk on {0, 1, ..., N} with absorbing barriers. The transition matrix has:
- P(i, i+1) = p for 1 <= i <= N-1
- P(i, i-1) = q for 1 <= i <= N-1
- P(0, 0) = P(N, N) = 1 (absorbing)

---

## 10. Detailed Interview Problems

### Problem 1: Card Drawing

**Question**: You draw cards from a standard 52-card deck without replacement. What is the expected number of cards drawn until you get the first Ace?

**Solution**: Think of the 4 Aces as dividers. They divide the remaining 48 cards into 5 groups (before first Ace, between 1st and 2nd, ..., after 4th Ace). By symmetry, each group has the same expected size: 48/5 = 9.6 cards.

The expected number of cards before the first Ace is 48/5 = 9.6, so the expected number of draws to get the first Ace is 48/5 + 1 = **53/5 = 10.6**.

**Alternative (using indicator variables)**: For each non-Ace card i (i = 1..48), let Xi = 1 if card i appears before all 4 Aces. Among the 5 items {card i, Ace1, Ace2, Ace3, Ace4}, card i is first with probability 1/5. So E[Xi] = 1/5.

E[cards before first Ace] = Σ E[Xi] = 48 * (1/5) = 48/5.

### Problem 2: Dice Game

**Question**: You roll two fair dice repeatedly. What is the probability you roll a sum of 7 before you roll a sum of 8?

**Solution**:
- P(sum = 7) = 6/36 = 1/6
- P(sum = 8) = 5/36
- P(neither) = 25/36

Since we condition on the game ending (rolling 7 or 8):

```
P(7 first) = P(7) / (P(7) + P(8)) = (1/6) / (1/6 + 5/36) = (6/36) / (11/36) = 6/11
```

### Problem 3: Expected Value of a Trading Game

**Question**: I flip a fair coin. Heads, I pay you $1. Tails, you pay me $1. We play until one of us is up $5. What is your expected profit? What if the coin has P(H) = 0.6?

**Solution (fair coin)**: This is Gambler's Ruin with a = b = 5, p = q = 0.5.
P(you win) = P(you reach +5 before -5) = 5/10 = 1/2.
Your expected profit = (1/2)(5) + (1/2)(-5) = 0.

**Solution (biased coin, p = 0.6)**:
P(you win) = (1 - (q/p)^5) / (1 - (q/p)^10) where q/p = 0.4/0.6 = 2/3.

```python
q_over_p = 2/3
prob_win = (1 - (q_over_p)**5) / (1 - (q_over_p)**10)
ev = prob_win * 5 + (1 - prob_win) * (-5)
print(f"P(win) = {prob_win:.4f}, E[profit] = {ev:.4f}")
# P(win) = 0.8685, E[profit] = 3.6848
```

### Problem 4: Conditional Probability with Bayesian Update

**Question**: A bag has 3 red balls and 2 blue balls. You draw two balls without replacement. Given that the second ball is red, what is the probability the first was also red?

**Solution**:
```
P(1st red | 2nd red) = P(2nd red | 1st red) * P(1st red) / P(2nd red)
                     = (2/4) * (3/5) / (3/5)
                     = 2/4 = 1/2
```

Wait -- let's compute P(2nd red) more carefully:
P(2nd red) = P(2nd red | 1st red)*P(1st red) + P(2nd red | 1st blue)*P(1st blue)
           = (2/4)(3/5) + (3/4)(2/5) = 6/20 + 6/20 = 12/20 = 3/5

So P(1st red | 2nd red) = (2/4)(3/5) / (3/5) = 2/4 = **1/2**

### Problem 5: Geometric Distribution Application

**Question**: A trader places orders that get filled with probability 0.1 independently. What is the probability the first fill comes on exactly the 5th order? What is the expected number of orders until the first fill?

**Solution**: X ~ Geometric(0.1).
P(X = 5) = (0.9)^4 * (0.1) = 0.6561 * 0.1 = **0.0656**
E[X] = 1/0.1 = **10 orders**

### Problem 6: Random Walk with Drift

**Question**: A stock starts at $100. Each day it goes up $1 with probability 0.55 or down $1 with probability 0.45. What is the probability it reaches $110 before $90?

**Solution**: This is Gambler's Ruin with a = 10 (distance to 90) and b = 10 (distance to 110), p = 0.55.

```
P(reach 110) = (1 - (q/p)^10) / (1 - (q/p)^20)
where q/p = 0.45/0.55 = 9/11

(9/11)^10 ≈ 0.1486
(9/11)^20 ≈ 0.0221

P(reach 110) = (1 - 0.1486) / (1 - 0.0221) = 0.8514 / 0.9779 ≈ 0.8707
```

### Problem 7: Poisson Process

**Question**: Customers arrive at a trading desk according to a Poisson process at a rate of 3 per hour. What is the probability of exactly 5 arrivals in a 2-hour window? What is the expected time between the 3rd and 4th arrivals?

**Solution**:
In 2 hours, arrivals ~ Poisson(6).
P(X = 5) = e^(-6) * 6^5 / 5! = e^(-6) * 7776 / 120 = e^(-6) * 64.8 ≈ 0.00248 * 64.8 ≈ **0.1606**

Time between any two consecutive arrivals is Exponential(3) (rate 3/hour), so:
E[time between 3rd and 4th] = 1/3 hour = **20 minutes**

(The answer does not depend on which consecutive arrivals we ask about -- memoryless property.)

### Problem 8: Inclusion-Exclusion Application

**Question**: What is the probability that a random permutation of {1, 2, ..., 8} has no element in its natural position (derangement)?

**Solution**:
```
D(8) / 8! = Σ_{k=0}^{8} (-1)^k / k!
           = 1 - 1 + 1/2 - 1/6 + 1/24 - 1/120 + 1/720 - 1/5040 + 1/40320
           = 0.367879...

So P(derangement) ≈ 1/e ≈ 0.3679
```

### Problem 9: Moment Generating Functions

**Question**: If X ~ Poisson(λ) and Y ~ Poisson(μ) are independent, what is the distribution of X + Y?

**Solution using MGFs**:
```
M_X(t) = e^(λ(e^t - 1))
M_Y(t) = e^(μ(e^t - 1))
M_{X+Y}(t) = M_X(t) * M_Y(t) = e^((λ+μ)(e^t - 1))
```

This is the MGF of Poisson(λ + μ). Since the MGF uniquely determines the distribution:
**X + Y ~ Poisson(λ + μ)**.

### Problem 10: Conditional Expectation in a Trading Context

**Question**: A stock's daily return R has a 60% probability of being +1% and a 40% probability of being -1.5%. You can choose to invest each day or not. If you must invest for exactly k out of n = 100 days (chosen randomly in advance), what is the expected total return as a function of k?

**Solution**:
E[return per invested day] = 0.6 * (0.01) + 0.4 * (-0.015) = 0.006 - 0.006 = 0.

The expected return for each invested day is exactly 0, so E[total return] = k * 0 = **0 for any k**.

This illustrates that a zero-expected-return game remains zero-expected regardless of how many days you participate -- you cannot create edge from a fair game by varying position size (a consequence of the optional stopping theorem for martingales).

### Problem 11: Peter and Paul's Coin Flipping

**Question**: Peter and Paul each flip a fair coin n times. What is the expected number of flips where they get the same result?

**Solution**: Let Xi = 1 if flip i matches. P(match) = P(HH) + P(TT) = 1/4 + 1/4 = 1/2.

By linearity of expectation:
E[matches] = n * (1/2) = **n/2**

**Follow-up**: What is the variance?
Var(Xi) = 1/2 * 1/2 = 1/4. The Xi are independent, so:
Var(total) = n * (1/4) = n/4.

---

## Appendix: Key Formulas Cheat Sheet

```
COMBINATORICS
  P(n,k) = n!/(n-k)!
  C(n,k) = n!/(k!(n-k)!)
  Stars & Bars: C(n+k-1, k-1) for n balls in k bins
  Derangements: D(n) = n! * Σ (-1)^k / k! ≈ n!/e

PROBABILITY
  Bayes: P(A|B) = P(B|A)*P(A) / P(B)
  Total Prob: P(A) = Σ P(A|Bi)*P(Bi)
  Independence: P(A∩B) = P(A)*P(B)

EXPECTATION
  Linearity: E[aX+bY] = aE[X]+bE[Y] (ALWAYS)
  Tower: E[X] = E[E[X|Y]]
  Indicator: E[I_A] = P(A)
  LOTUS: E[g(X)] = Σ g(x)*P(X=x)

VARIANCE
  Var(X) = E[X^2] - (E[X])^2
  Var(aX+b) = a^2*Var(X)
  Independent: Var(X+Y) = Var(X)+Var(Y)
  Eve's Law: Var(X) = E[Var(X|Y)] + Var(E[X|Y])

DISTRIBUTIONS
  Geometric(p): E=1/p, Var=(1-p)/p^2
  Poisson(λ): E=λ, Var=λ
  Exponential(λ): E=1/λ, Var=1/λ^2
  Normal(μ,σ^2): 68-95-99.7 rule

CLT
  X̄ ≈ N(μ, σ^2/n) for large n

RANDOM WALKS / GAMBLER'S RUIN
  Fair: P(ruin) = b/(a+b), E[duration] = a*b
  Unfair: P(ruin) = ((q/p)^a - (q/p)^(a+b)) / (1 - (q/p)^(a+b))
```
