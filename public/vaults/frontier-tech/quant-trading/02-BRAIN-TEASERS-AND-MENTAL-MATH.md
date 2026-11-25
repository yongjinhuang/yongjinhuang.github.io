# Brain Teasers & Mental Math

## Why This Matters

Mental math and brain teasers are the gatekeepers of quant trading interviews. At firms like Optiver, SIG, and Jane Street, you will face timed arithmetic tests where speed and accuracy are non-negotiable. A candidate who cannot compute 37 x 43 in their head within a few seconds will not advance, regardless of their PhD or coding skills. Brain teasers test your ability to decompose unfamiliar problems under pressure -- exactly the skill you need when markets move fast and you must make split-second decisions.

---

## 1. Mental Math Techniques

### 1.1 Multiplication Shortcuts

**Multiplying by 11**:
Split the digits and place their sum in the middle.

```
23 x 11: 2_(2+3)_3 = 253
45 x 11: 4_(4+5)_5 = 495
67 x 11: 6_(6+7)_7 = 6_(13)_7 = 737  (carry the 1)
```

**Multiplying by 25**:
Divide by 4, multiply by 100.

```
48 x 25 = 48/4 x 100 = 12 x 100 = 1200
76 x 25 = 76/4 x 100 = 19 x 100 = 1900
```

**Multiplying by 99 or 999**:
Multiply by 100 (or 1000) and subtract the original.

```
47 x 99 = 47 x 100 - 47 = 4700 - 47 = 4653
23 x 999 = 23 x 1000 - 23 = 23000 - 23 = 22977
```

**Multiplying near-100 numbers** (Vedic math, "base method"):
For numbers near 100, use: (a)(b) where a and b are distances from 100.

```
96 x 97:
  96 is -4 from 100, 97 is -3 from 100
  Left part:  96 - 3 = 93 (or equivalently 97 - 4 = 93)
  Right part: (-4) x (-3) = 12
  Answer: 9312

104 x 107:
  Left:  104 + 7 = 111
  Right: 4 x 7 = 28
  Answer: 11128

98 x 103:
  Left:  98 + 3 = 101 (or 103 - 2 = 101)
  Right: (-2)(3) = -06 -> need to borrow: 100_(-06) = 10094
  Answer: 10094
```

**General two-digit multiplication** (cross method):
For ab x cd:

```
Step 1: a*c (hundreds)
Step 2: a*d + b*c (tens, with carry)
Step 3: b*d (units, with carry)

Example: 37 x 43
  Step 1: 3*4 = 12
  Step 2: 3*3 + 7*4 = 9 + 28 = 37
  Step 3: 7*3 = 21
  Combine: 12 | 37 | 21
           12 | 37+2 | 1
           12 | 39 | 1
           12+3 | 9 | 1
           15 | 9 | 1
  Answer: 1591
```

**Multiplying by 5**: Divide by 2, multiply by 10.

```
84 x 5 = 84/2 x 10 = 42 x 10 = 420
```

### 1.2 Squaring Tricks

**Squaring numbers near 50**:
n^2 where n = 50 + d: answer is (25 + d) \* 100 + d^2

```
53^2: 25 + 3 = 28, 3^2 = 9 -> 2809
47^2: 25 - 3 = 22, (-3)^2 = 9 -> 2209
56^2: 25 + 6 = 31, 6^2 = 36 -> 3136
44^2: 25 - 6 = 19, 6^2 = 36 -> 1936
```

**Squaring numbers near 100**:
n^2 where n = 100 + d: answer is (n + d) \* 100 + d^2

```
103^2: (103+3)*100 + 9 = 10600 + 9 = 10609
97^2:  (97-3)*100 + 9 = 9400 + 9 = 9409
```

**General squaring using (a+b)(a-b) = a^2 - b^2**:
n^2 = (n+d)(n-d) + d^2, choose d to make one factor easy.

```
67^2 = (67+3)(67-3) + 9 = 70 x 64 + 9 = 4480 + 9 = 4489
38^2 = (38+2)(38-2) + 4 = 40 x 36 + 4 = 1440 + 4 = 1444
```

### 1.3 Division and Estimation

**Key fractions to memorize**:

```
1/3  = 0.3333    1/7  = 0.142857 (repeating)    1/11 = 0.0909
1/4  = 0.25      1/8  = 0.125                     1/12 = 0.0833
1/5  = 0.20      1/9  = 0.1111                    1/13 ≈ 0.0769
1/6  = 0.1667    1/10 = 0.10                      1/16 = 0.0625
```

**Division by decomposition**:

```
847 / 23:
  23 x 30 = 690
  847 - 690 = 157
  23 x 6 = 138
  157 - 138 = 19
  Answer: 36 remainder 19, or approximately 36.8
```

**Percentage estimation**:

```
What is 17% of 340?
  10% = 34
  5%  = 17
  2%  = 6.8
  17% = 34 + 17 - 6.8... wait, 17% = 10% + 7% = 34 + 23.8 = 57.8
  Or: 17% of 340 = 340 x 0.17 = 340 x 17/100 = 5780/100 = 57.80
```

### 1.4 Powers and Logarithms to Memorize

**Powers of 2**:

```
2^1  = 2          2^8  = 256        2^15 = 32768
2^2  = 4          2^9  = 512        2^16 = 65536
2^3  = 8          2^10 = 1024       2^17 = 131072
2^4  = 16         2^11 = 2048       2^18 = 262144
2^5  = 32         2^12 = 4096       2^19 = 524288
2^6  = 64         2^13 = 8192       2^20 = 1048576
2^7  = 128        2^14 = 16384
```

**Key factorials**:

```
0! = 1      5! = 120       9!  = 362880
1! = 1      6! = 720       10! = 3628800
2! = 2      7! = 5040      11! = 39916800
3! = 6      8! = 40320     12! = 479001600
4! = 24
```

**Common logarithms (base 10)**:

```
log(2) ≈ 0.301      log(5) ≈ 0.699      log(8) ≈ 0.903
log(3) ≈ 0.477      log(6) ≈ 0.778      log(9) ≈ 0.954
log(4) ≈ 0.602      log(7) ≈ 0.845
```

**Natural logarithms**:

```
ln(2) ≈ 0.693       ln(5) ≈ 1.609       e ≈ 2.71828
ln(3) ≈ 1.099       ln(10) ≈ 2.303      1/e ≈ 0.3679
ln(4) ≈ 1.386       e^2 ≈ 7.389         sqrt(2) ≈ 1.414
```

### 1.5 Fermi Estimation Framework

The systematic approach to estimation problems:

```
+-------------------------------------------------------------------+
|                  FERMI ESTIMATION FRAMEWORK                       |
+-------------------------------------------------------------------+
|                                                                   |
|  1. DECOMPOSE: Break the question into estimable sub-problems     |
|     "How many X?" = Factor1 x Factor2 x Factor3 x ...            |
|                                                                   |
|  2. ESTIMATE: Assign reasonable values to each factor             |
|     Use round numbers. Aim for order-of-magnitude accuracy.       |
|     State assumptions explicitly.                                 |
|                                                                   |
|  3. COMPUTE: Multiply through, keep track of units               |
|     Errors in factors tend to cancel (some too high, some low)    |
|                                                                   |
|  4. SANITY CHECK: Does the answer make sense?                     |
|     Compare against known benchmarks.                             |
|     Check: Is this the right order of magnitude?                  |
|                                                                   |
+-------------------------------------------------------------------+
```

---

## 2. Classic Brain Teasers

### Teaser 1: The 12 Balls Problem

**Problem**: You have 12 balls, one of which is either heavier or lighter than the rest (you do not know which). Using a balance scale exactly 3 times, identify the odd ball and determine whether it is heavier or lighter.

**Solution Strategy**:

```
Weighing 1: Compare {1,2,3,4} vs {5,6,7,8}
            Leave {9,10,11,12} aside

Case A: They balance
  -> Odd ball is in {9,10,11,12}
  Weighing 2: Compare {9,10,11} vs {1,2,3} (known good)
    Case A1: They balance -> Ball 12 is odd
      Weighing 3: Compare 12 vs 1 -> determine heavy/light
    Case A2: {9,10,11} is heavy
      Weighing 3: Compare 9 vs 10
        If balance -> 11 is heavy
        If not -> heavier one is odd (heavy)
    Case A3: {9,10,11} is light -> symmetric to A2

Case B: {1,2,3,4} is heavy
  -> Odd ball is in {1,2,3,4} (possibly heavy) or {5,6,7,8} (possibly light)
  Weighing 2: Compare {1,2,5} vs {3,6,9}
    Case B1: Balance -> odd is in {4,7,8}
      Weighing 3: Compare 7 vs 8
        Balance -> 4 is heavy
        7 heavy -> 7 is... wait, 7 must be light (from Case B)
        Actually: compare 7 vs 8. If balance, 4 is odd (heavy).
        If not, lighter one is odd (light).
    Case B2: {1,2,5} heavy -> odd is 1 or 2 (heavy) or 6 (light)
      Weighing 3: Compare 1 vs 2
        Balance -> 6 is light
        One heavier -> that one is odd (heavy)
    Case B3: {3,6,9} heavy -> 3 is heavy or 5 is light
      Weighing 3: Compare 3 vs 9 (known good)
        Balance -> 5 is light
        3 heavy -> 3 is heavy

Case C: {5,6,7,8} is heavy -> symmetric to Case B
```

**Key insight**: 3 weighings can produce 3^3 = 27 outcomes. We need 24 outcomes (12 balls x 2 heavy/light), so 3 weighings are just barely enough.

### Teaser 2: Pirates Dividing Gold

**Problem**: 5 pirates (A, B, C, D, E) divide 100 gold coins. Pirate A proposes a distribution. All vote (including A). If a majority accepts, the distribution stands. Otherwise, A is thrown overboard and B proposes, and so on. Each pirate is perfectly rational and prefers (in order): survival, more gold, seeing others thrown overboard. What does A propose?

**Solution (work backwards)**:

```
2 pirates (D, E): D proposes 100-0. D votes yes (majority of 1). D gets all.

3 pirates (C, D, E): E would get 0 with 2 pirates.
  C offers E just 1 coin to buy E's vote.
  C proposes: C=99, D=0, E=1. C+E vote yes.

4 pirates (B, C, D, E): D would get 0 with 3 pirates.
  B offers D just 1 coin to buy D's vote.
  B proposes: B=99, C=0, D=1, E=0. B+D vote yes.

5 pirates (A, B, C, D, E): C gets 0 and E gets 0 with 4 pirates.
  A needs 2 more votes (plus own = majority of 3/5).
  A offers C=1, E=1 to buy their votes.
  A proposes: A=98, B=0, C=1, D=0, E=1.
```

**Answer**: A proposes (98, 0, 1, 0, 1).

### Teaser 3: Hats in a Line

**Problem**: 100 prisoners stand in a line, each wearing a red or blue hat. Each can see all hats in front of them but not their own or those behind. Starting from the back, each must guess their hat color. They can hear all previous guesses. With a strategy agreed in advance, what is the maximum number of prisoners guaranteed to be saved?

**Solution**: The last person (prisoner 100) sacrifices by announcing the PARITY of all hats they see. For example, they say "red" if they see an even number of red hats, "blue" if odd.

Every subsequent prisoner can deduce their own hat color:

- They heard the parity announcement
- They heard all subsequent guesses (which are correct)
- They can see all hats in front of them
- They can compute their own hat to maintain consistency with the announced parity

**Result**: 99 prisoners are guaranteed to be saved. Prisoner 100 has a 50/50 chance.

### Teaser 4: 100 Prisoners and a Lightbulb

**Problem**: 100 prisoners are in solitary confinement. There is one room with a lightbulb (initially off). Each day, a random prisoner is sent to the room. They can toggle the light or leave it. At any point, any prisoner can declare "all 100 prisoners have visited." If correct, all are freed. If wrong, all are executed. Find a strategy.

**Solution**: Designate one prisoner as the "counter."

Rules:

- Non-counters: The FIRST time they enter and find the light OFF, they turn it ON. Otherwise, they do nothing.
- Counter: Every time they enter and find the light ON, they turn it OFF and increment their count. When count reaches 99, they declare.

**Expected time**: Very long. Each non-counter must visit when the light is off and before the counter visits. Expected time is approximately 100 _ 100 _ ln(99) ≈ 10,000 \* 4.6 ≈ 46,000 days.

### Teaser 5: Ant on a Cube

**Problem**: An ant starts at one vertex of a cube and walks randomly along edges (choosing uniformly among the 3 edges at each vertex). What is the expected number of steps to reach the diagonally opposite vertex?

**Solution**: By symmetry, there are 4 types of vertices based on distance from the target:

```
        d=3 (start) -------- d=2 (3 vertices)
                              |
                            d=1 (3 vertices)
                              |
                            d=0 (target)
```

Let E_i = expected steps from a vertex at distance i.

```
E_0 = 0
E_1 = 1 + (2/3)*E_2 + (1/3)*E_0
E_2 = 1 + (1/3)*E_3 + (2/3)*E_1    (wait, need to think about this carefully)
E_3 = 1 + E_2                       (all 3 neighbors are at distance 2)
```

From distance 3 (the start): all 3 edges lead to distance-2 vertices.
E_3 = 1 + E_2

From distance 2: 1 edge leads to distance 3, 2 edges lead to distance 1.
E_2 = 1 + (1/3)*E_3 + (2/3)*E_1

From distance 1: 2 edges lead to distance 2, 1 edge leads to distance 0.
E_1 = 1 + (2/3)*E_2 + (1/3)*E_0 = 1 + (2/3)\*E_2

Substituting:
E_3 = 1 + E_2
E_2 = 1 + (1/3)(1 + E_2) + (2/3)*E_1 = 4/3 + (1/3)*E_2 + (2/3)*E_1
(2/3)*E_2 = 4/3 + (2/3)\*E_1
E_2 = 2 + E_1

E*1 = 1 + (2/3)\_E_2 = 1 + (2/3)*(2 + E_1) = 1 + 4/3 + (2/3)*E_1
(1/3)*E_1 = 7/3
E_1 = 7

E_2 = 2 + 7 = 9
E_3 = 1 + 9 = **10**

### Teaser 6: Rope Around the Earth

**Problem**: A rope is wrapped tightly around the Earth's equator (circumference ~40,000 km). If you add just 1 meter of rope, how high above the surface can you lift the rope uniformly?

**Solution**:
Original circumference: C = 2 _ pi _ R
New circumference: C + 1 = 2 _ pi _ (R + h)

```
2*pi*h = 1 meter
h = 1 / (2*pi) ≈ 0.159 meters ≈ 16 cm
```

**Surprising result**: The answer does not depend on the radius of the Earth at all. Whether wrapped around a basketball or Jupiter, adding 1 meter of rope always raises it by 1/(2\*pi) meters.

---

## 3. Fermi Estimation Problems

### Problem 1: Piano Tuners in Chicago

**Estimate the number of piano tuners in Chicago.**

```
Decomposition:
  Chicago population:             ~2.7 million (call it 3M)
  People per household:           ~2.5
  Number of households:           3M / 2.5 = 1.2M
  Fraction with pianos:           ~5% (relatively affluent city)
  Number of pianos:               1.2M x 0.05 = 60,000
  Tunings per year per piano:     ~1-2, say 1.5
  Total tunings per year:         60,000 x 1.5 = 90,000
  Tunings per tuner per day:      ~4-5 (travel time)
  Working days per year:          ~250
  Tunings per tuner per year:     4.5 x 250 = 1,125
  Number of tuners:               90,000 / 1,125 ≈ 80

Answer: approximately 80-100 piano tuners in Chicago.
(Actual: estimated 100-200, so this is in the right ballpark.)
```

### Problem 2: Golf Balls in a School Bus

**How many golf balls fit in a school bus?**

```
School bus interior volume:
  Length: ~8 meters (interior)
  Width:  ~2 meters (interior)
  Height: ~1.8 meters (interior)
  Volume: 8 x 2 x 1.8 = 28.8 m^3

  Account for seats, etc: roughly 75% usable → 21.6 m^3
  Convert: 21.6 m^3 = 21,600,000 cm^3

Golf ball:
  Diameter: ~4.3 cm
  Volume of sphere: (4/3)*pi*(2.15)^3 ≈ 41.6 cm^3

Random packing efficiency: ~64% (between random ~64% and FCC ~74%)

Usable volume for balls: 21,600,000 x 0.64 = 13,824,000 cm^3
Number of balls: 13,824,000 / 41.6 ≈ 332,000

Answer: approximately 300,000-350,000 golf balls.
```

### Problem 3: Times Square McDonald's Daily Revenue

**What is the daily revenue of a McDonald's in Times Square?**

```
Operating hours: ~18 hours (6am to midnight)

Peak hours (lunch 11-2, dinner 5-8): 5 hours
  Customers per hour (peak): ~300 (extremely busy, multiple registers)
  Peak customers: 5 x 300 = 1,500

Off-peak hours: 13 hours
  Customers per hour: ~100
  Off-peak customers: 13 x 100 = 1,300

Total customers per day: ~2,800
Average transaction: $9-12 (NYC prices are higher), say $10

Daily revenue: 2,800 x $10 = $28,000

This is Times Square, so tourists drive it higher. Adjust up ~30%.
Estimated: ~$35,000-$40,000 per day.

Sanity check: $35K/day x 365 = ~$12.8M/year.
Top McDonald's locations do $5-15M/year, so this is reasonable for a
prime Times Square location.
```

---

## 4. Market-Related Puzzles

### Puzzle 1: Expected Value of a Trading Game

**Problem**: I have a bag with 4 red balls and 6 blue balls. You draw balls one at a time without replacement. You get $1 for each red ball drawn. You can stop at any time. What is the optimal strategy and expected payout?

**Solution**: This is an optimal stopping problem. At each point, compare the expected value of continuing vs stopping (which gives $0 for remaining balls).

Work backwards. Let V(r, b) = value of the game when r red and b blue balls remain.

```
V(0, b) = 0 for all b (no red balls left, stop)
V(r, 0) = r (all remaining are red, draw them all for $r)

V(r, b) = max(0, (r/(r+b)) * (1 + V(r-1, b)) + (b/(r+b)) * (-0 + V(r, b-1)))

Wait -- you don't lose for blue. Let me re-read... You get $1 per red.
Actually, the payoff is just the count of reds drawn. So the question is
when to stop to maximize expected number of reds minus...

Re-reading: "You get $1 for each red ball drawn. You can stop at any time."
If there's no cost, you should always draw all balls and collect $4.

Let me re-formulate: You get +$1 for red, -$1 for blue.
```

**Revised Problem**: +$1 for red, -$1.50 for blue. When to stop?

```python
from functools import lru_cache

@lru_cache(maxsize=None)
def value(red, blue):
    """Expected value of optimal play with red reds and blue blues remaining."""
    if red == 0 and blue == 0:
        return 0
    if red + blue == 0:
        return 0

    total = red + blue
    ev_continue = 0
    if red > 0:
        ev_continue += (red / total) * (1 + value(red - 1, blue))
    if blue > 0:
        ev_continue += (blue / total) * (-1.5 + value(red, blue - 1))

    return max(0, ev_continue)  # 0 = stop (get nothing more)

print(f"V(4,6) = ${value(4, 6):.4f}")
```

### Puzzle 2: The Secretary Problem (Optimal Stopping)

**Problem**: You interview n candidates sequentially. After each interview, you must immediately accept or reject (no callbacks). You want to maximize the probability of selecting the best candidate.

**Solution**: The optimal strategy is to reject the first n/e candidates (about 37%), then accept the first candidate who is better than all previously seen.

```
Strategy: Reject first k candidates. Then accept the first one better than all k.

P(best is selected) = (k/n) * Σ_{i=k+1}^{n} (1/(i-1))

For large n, the optimal k ≈ n/e, giving P(success) ≈ 1/e ≈ 0.3679.
```

```python
import math

def secretary_problem(n):
    """Find optimal cutoff and success probability."""
    best_prob = 0
    best_k = 0

    for k in range(1, n):
        prob = sum(1 / (i - 1) for i in range(k + 1, n + 1)) * (k / n)
        if prob > best_prob:
            best_prob = prob
            best_k = k

    return best_k, best_prob

for n in [10, 50, 100, 1000]:
    k, p = secretary_problem(n)
    print(f"n={n:4d}: reject first {k:3d} ({k/n:.2%}), P(best)={p:.4f}")

# n=  10: reject first   3 (30.00%), P(best)=0.3987
# n=  50: reject first  18 (36.00%), P(best)=0.3742
# n= 100: reject first  37 (37.00%), P(best)=0.3710
# n=1000: reject first 368 (36.80%), P(best)=0.3681
```

**Trading application**: This is relevant to optimal entry timing -- when you see a sequence of prices and must decide when to buy, knowing you cannot go back.

### Puzzle 3: Auction Theory Basics

**First-price sealed-bid auction**: Each bidder submits a sealed bid. Highest bid wins, pays their bid.

**Optimal strategy (independent private values, n bidders, values uniform on [0,1])**:
Bid (n-1)/n times your value.

```
With value v and n bidders:
  Optimal bid: b = v * (n-1)/n

Intuition: You shade your bid below your value. More competition = less shading.
  n=2: bid half your value
  n=10: bid 90% of your value
  n=100: bid 99% of your value
```

**Second-price (Vickrey) auction**: Highest bid wins but pays the second-highest bid.

**Optimal strategy**: Bid your true value. This is a dominant strategy.

```
Why truthful bidding is optimal:
  - Bidding above your value: risk winning at a price above your value (loss!)
  - Bidding below your value: risk losing when you could have profited
  - Bidding your value: you win iff you can profit, and you never overpay
```

**Revenue Equivalence Theorem**: Under standard assumptions, all auction formats yield the same expected revenue to the seller.

### Puzzle 4: Monty Hall Problem (with Bayesian Update)

**Problem**: Three doors. One has a car (prize), two have goats. You pick door 1. The host (who knows) opens door 3, showing a goat. Should you switch to door 2?

**Bayesian solution**:

```
Prior: P(car at 1) = P(car at 2) = P(car at 3) = 1/3

P(host opens 3 | car at 1) = 1/2 (host chooses randomly between 2 and 3)
P(host opens 3 | car at 2) = 1   (host must open 3)
P(host opens 3 | car at 3) = 0   (host would never reveal the car)

By Bayes:
P(car at 2 | host opens 3) = P(opens 3 | at 2) * P(at 2) / P(opens 3)
                            = 1 * (1/3) / (1/2 * 1/3 + 1 * 1/3 + 0)
                            = (1/3) / (1/2)
                            = 2/3
```

**Always switch.** P(win by switching) = 2/3.

**Trading analogy**: This is Bayesian updating with new information. When you see a market event (the "door opening"), you must update your beliefs accordingly. Many traders fail to update sufficiently -- they exhibit the "base rate neglect" bias.

---

## 5. Infinite Series and Summation Puzzles

### Puzzle 1: Sum of 1/2^n

What is 1/2 + 1/4 + 1/8 + ...?

```
S = Σ_{n=1}^{∞} (1/2)^n = (1/2)/(1 - 1/2) = 1
```

Geometric series: Σ ar^n = a/(1-r) for |r| < 1.

### Puzzle 2: Sum of n/2^n

What is 1/2 + 2/4 + 3/8 + 4/16 + ...?

```
S = Σ_{n=1}^{∞} n * (1/2)^n

Method: Differentiate the geometric series.
Σ x^n = 1/(1-x)
Σ n*x^(n-1) = 1/(1-x)^2
Σ n*x^n = x/(1-x)^2

At x = 1/2: S = (1/2) / (1/2)^2 = (1/2) / (1/4) = 2
```

### Puzzle 3: Expected Payout of a Doubling Game

**Problem**: You start with $1. You flip a fair coin. Heads: your money doubles. Tails: you lose everything. What is the expected value if you play n rounds?

```
After n rounds, you have $2^n with probability (1/2)^n, or $0 otherwise.
E[payout] = 2^n * (1/2)^n = $1

The expected value is always $1, regardless of n.
```

**Follow-up**: What if you get to keep your money if you stop? When should you stop?

This connects to the St. Petersburg paradox and logarithmic utility.

Under log utility U(x) = ln(x):

```
E[U(continue)] = (1/2)*ln(2*current) + (1/2)*ln(0) = -∞

You should never play even once if U(0) = -∞!
With a modified game where tails gives you $0.01:
E[U] = (1/2)*ln(2*x) + (1/2)*ln(0.01)
```

This illustrates the difference between expected value and expected utility -- a crucial concept in trading and risk management.

---

## 6. Strategy and Optimization Puzzles

### Puzzle 1: The Egg Drop Problem

**Problem**: You have 2 eggs and a 100-floor building. You need to find the highest floor from which an egg can be dropped without breaking. What is the minimum number of drops needed in the worst case?

**Solution**: Let the answer be n drops. After the first egg breaks at floor k, you have n-1 remaining drops and 1 egg, so you can check at most n-1 more floors.

```
Optimal strategy: Drop first egg at floors k, k + (k-1), k + (k-1) + (k-2), ...

We need: k + (k-1) + (k-2) + ... + 1 >= 100
         k(k+1)/2 >= 100
         k >= 13.65

So n = 14 drops suffice.

Drop sequence: 14, 27, 39, 50, 60, 69, 77, 84, 90, 95, 99, 100...
(Each gap decreases by 1 to equalize worst-case across all scenarios)
```

**Generalization**: With e eggs and n floors, the answer is approximately (e \* n^(1/e)).

### Puzzle 2: The 100 Lockers Problem

**Problem**: There are 100 lockers, all closed. Person 1 opens all lockers. Person 2 closes every 2nd locker. Person 3 toggles every 3rd locker. ... Person k toggles every k-th locker, up to person 100. Which lockers are open at the end?

**Solution**: Locker j is toggled once for each divisor of j.

```
Locker j is open iff it was toggled an ODD number of times.
Number of toggles = number of divisors of j.

A number has an odd number of divisors iff it is a perfect square.
(Because divisors pair up d <-> j/d, except when d = sqrt(j).)

Open lockers: 1, 4, 9, 16, 25, 36, 49, 64, 81, 100
That is: 1^2, 2^2, 3^2, ..., 10^2
```

### Puzzle 3: Bridge and Torch Problem

**Problem**: Four people must cross a bridge at night with one torch. The bridge holds 2 people max. They walk at different speeds: A=1min, B=2min, C=5min, D=10min. The pair walks at the slower person's speed. The torch must be carried back. What is the fastest time?

**Naive approach**: Always send the fastest person back.
A+B (2) + A back (1) + A+C (5) + A back (1) + A+D (10) = 19 minutes.

**Optimal**:

```
Step 1: A + B cross        (2 min)   Total: 2
Step 2: A returns           (1 min)   Total: 3
Step 3: C + D cross         (10 min)  Total: 13
Step 4: B returns           (2 min)   Total: 15
Step 5: A + B cross         (2 min)   Total: 17
```

**Answer**: 17 minutes. The key insight is to send the two slowest together.

---

## 7. Advanced Mental Math Drills

### Drill 1: Rapid Addition/Subtraction (Practice Set)

```
Compute mentally. Target: < 3 seconds each.

1) 347 + 856 = ?         Answer: 1203
2) 1024 - 768 = ?        Answer: 256
3) 999 + 888 + 777 = ?   Answer: 2664
4) 4321 - 1234 = ?       Answer: 3087
5) 250 + 750 + 340 = ?   Answer: 1340
```

### Drill 2: Rapid Multiplication (Practice Set)

```
Compute mentally. Target: < 5 seconds each.

1)  13 x 17 = ?    Answer: 221    (method: 13x17 = (15-2)(15+2) = 225-4 = 221)
2)  24 x 25 = ?    Answer: 600    (method: 24/4 x 100 = 600)
3)  36 x 11 = ?    Answer: 396    (method: 3_9_6)
4)  45 x 45 = ?    Answer: 2025   (method: near 50: 25-5=20, 5^2=25 -> 2025)
5)  98 x 97 = ?    Answer: 9506   (method: near 100: 98-3=95, 2x3=06 -> 9506)
6)  64 x 125 = ?   Answer: 8000   (method: 64x125 = 8x8x125 = 8x1000 = 8000)
7)  37 x 43 = ?    Answer: 1591   (method: (40-3)(40+3) = 1600-9 = 1591)
8)  55 x 55 = ?    Answer: 3025   (method: near 50: 25+5=30, 5^2=25 -> 3025)
9)  72 x 68 = ?    Answer: 4896   (method: (70+2)(70-2) = 4900-4 = 4896)
10) 83 x 99 = ?    Answer: 8217   (method: 83x100 - 83 = 8300-83 = 8217)
```

### Drill 3: Fraction and Percentage (Practice Set)

```
Compute mentally. Target: < 5 seconds each.

1) What is 15% of 240?     Answer: 36  (10%=24, 5%=12, total 36)
2) 7/8 as a decimal?       Answer: 0.875
3) 3/7 as a decimal?       Answer: ~0.4286  (accept 0.43)
4) What is 240 / 16?       Answer: 15
5) 5/6 - 2/3 = ?           Answer: 1/6
6) 12.5% of 800?           Answer: 100 (1/8 of 800)
7) sqrt(1764)?             Answer: 42 (42^2 = 1764)
8) 2^15?                   Answer: 32768
9) 17 x 19?                Answer: 323  (18^2 - 1 = 324 - 1 = 323)
10) What is 1/7 + 2/7 + 3/7?  Answer: 6/7 ≈ 0.857
```

---

## 8. Probability Speed Round

These are the types of quick-fire probability questions that come up in phone screens and first-round interviews. You should be able to answer each in under 60 seconds.

```
Q1: You flip 3 fair coins. P(at least 2 heads)?
A1: P(2H) + P(3H) = 3/8 + 1/8 = 4/8 = 1/2

Q2: Two dice. P(sum = 7)?
A2: 6/36 = 1/6  (pairs: 1+6,2+5,3+4,4+3,5+2,6+1)

Q3: Draw 2 cards from a deck. P(both aces)?
A3: C(4,2)/C(52,2) = 6/1326 = 1/221

Q4: P(a random 3-digit number is divisible by 5)?
A4: Last digit is 0 or 5, so 2/10 = 1/5

Q5: Roll a die until you get a 6. E[rolls]?
A5: Geometric(1/6), E = 6

Q6: You pick a random point in a unit square. P(distance to center < 0.5)?
A6: Area of circle / area of square = pi*(0.5)^2 / 1 = pi/4 ≈ 0.785

Q7: A and B flip coins. A flips n+1, B flips n. P(A gets more heads)?
A7: 1/2 (by symmetry -- the extra coin breaks all ties, each direction equally likely)

Q8: E[max(X,Y)] where X,Y independent Uniform(0,1)?
A8: 2/3 (formula: E[max] = n/(n+1) for n i.i.d. Uniform, here n=2)

Q9: 10 people in a room. P(no birthday match)? (approximate)
A9: ≈ 1 - 10*9/(2*365) ≈ 1 - 0.123 = 0.877  (exact: 0.883)

Q10: Variance of a Bernoulli(0.3)?
A10: p(1-p) = 0.3 * 0.7 = 0.21
```

---

## 9. Mixed Problem Set (Interview Simulation)

### Problem 1: The Drunk Walk

A drunk person starts at position 0 on a number line. Each second, they move +1 or -1 with equal probability. What is the expected number of steps to return to 0?

**Answer**: Infinite. The expected return time for a symmetric random walk on Z is infinite. (The walk is recurrent -- it returns with probability 1 -- but the expected time is infinite.)

This is a classic result that surprises most candidates.

### Problem 2: Unfair Coin to Fair Decision

**Problem**: You have a biased coin with P(H) = p (unknown, 0 < p < 1). How do you use it to make a fair 50/50 decision?

**Solution (Von Neumann's trick)**: Flip twice.

- HT -> output "heads" (probability p(1-p))
- TH -> output "tails" (probability (1-p)p = p(1-p))
- HH or TT -> discard and repeat

Both outcomes have equal probability, so the decision is fair.

Expected number of flips: 2 / (2p(1-p)). Worst case (p near 0 or 1) is very large.

### Problem 3: Bernoulli Factory Problem

**Problem**: Given a coin with P(H) = p, how do you simulate a coin with P(H) = p^2?

**Solution**: Flip twice independently. Output "heads" iff both flips are heads.
P(HH) = p \* p = p^2.

**Harder variant**: Simulate P(H) = 1/3 from a fair coin.

Use binary expansion: flip coins to generate a binary number in [0, 1).
If the number falls in [0, 1/3), output heads. Use a streaming algorithm:

```
Flip coins b1, b2, b3, ...
Maintain interval [lo, hi) starting at [0, 1)
After flip bi:
  If bi = H: [lo, (lo+hi)/2)
  If bi = T: [(lo+hi)/2, hi)
If hi <= 1/3: output heads
If lo >= 1/3: output tails
Otherwise: continue flipping
```

### Problem 4: Stick Breaking

**Problem**: Break a stick of length 1 at a uniformly random point. Take the left piece and break it again at a uniformly random point (of that piece). What is the expected length of the shortest of the three final pieces?

**Solution**: Let U ~ Uniform(0,1) be the first break, V ~ Uniform(0,U) be the second break.

Three pieces have lengths: V, U-V, 1-U.

E[V] = E[E[V|U]] = E[U/2] = 1/4
E[U-V] = E[U] - E[V] = 1/2 - 1/4 = 1/4
E[1-U] = 1/2

But E[min] is harder. You need to compute E[min(V, U-V, 1-U)].

Given U, V is uniform on (0, U), so V and U-V are symmetric around U/2.
Also, 1-U is constant given U.

```python
import numpy as np

np.random.seed(42)
N = 10_000_000
U = np.random.uniform(0, 1, N)
V = np.random.uniform(0, U)
pieces = np.column_stack([V, U - V, 1 - U])
mins = pieces.min(axis=1)
print(f"E[min piece] ≈ {mins.mean():.4f}")
# E[min piece] ≈ 0.0903 (approximately 11/122 ≈ 0.0902)
```

### Problem 5: Card Game EV

**Problem**: A deck of 52 cards is shuffled. You flip cards one at a time. Before each flip, you can guess "red" or "black." You win $1 for each correct guess. What is the optimal strategy and expected winnings?

**Solution**: At any point, if there are r red and b black cards remaining, you should guess whichever color has more remaining cards (if tied, it does not matter).

**Remarkable result**: Your expected winnings are 26 + (1/2) \* E[|R_i - B_i|] summed up... Actually, by a beautiful symmetry argument:

```
E[correct guesses with optimal play] = 26 + E[number of cards where one color
                                              strictly dominates] / 2

By a theorem: E[correct with optimal play] = 26 + E[max(r,b)/(r+b)] summed...

Actually the exact answer is:
E = Σ_{i=1}^{52} E[max(r_i, b_i) / (r_i + b_i)]

Numerically: E ≈ 29.08
```

You can do about 3 better than random guessing (26). This is connected to the theory of optimal prediction and Doob decomposition.

---

## 10. Tips for Interview Day

### Mental Math Test Strategy

```
+--------------------------------------------------+
|           MENTAL MATH TEST TIPS                  |
+--------------------------------------------------+
| 1. Do NOT try to be perfectly accurate on every  |
|    question. Skip hard ones and come back.       |
|                                                  |
| 2. The scoring is usually:                       |
|    +1 for correct, 0 for blank, -0.25 for wrong  |
|    So guess only if you can eliminate options.    |
|                                                  |
| 3. Practice the specific format beforehand.      |
|    Optiver: 80 questions in 8 minutes            |
|    SIG: 50 questions in 10 minutes               |
|                                                  |
| 4. Easy ones first. Your goal is to maximize     |
|    total correct, not solve them in order.        |
|                                                  |
| 5. Practice daily for 2+ weeks before interview. |
|    Use zetamac.com or arithmetic.zetamac.com     |
+--------------------------------------------------+
```

### Brain Teaser Strategy

1. **Restate the problem** to confirm understanding.
2. **Start with a small case** (n = 2, 3, 4) to build intuition.
3. **Look for symmetry** -- it often dramatically simplifies the problem.
4. **Consider extreme cases** -- what happens as n approaches 0 or infinity?
5. **Think about what answer "should" be** before computing -- develop intuition.
6. **Communicate your thought process** -- partial credit exists and interviewers want to see how you think.
7. **Check your answer** -- does it satisfy boundary conditions? Is it between 0 and 1 for a probability?
