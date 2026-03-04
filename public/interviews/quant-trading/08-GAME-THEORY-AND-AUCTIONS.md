# Chapter 8: Game Theory, Auctions & Strategic Thinking

## Why Game Theory in Quant Trading?

Game theory pervades quantitative finance. Markets are not physics experiments where you observe a fixed system; they are strategic environments where your actions affect others and theirs affect you. Every bid you place in an auction, every limit order you post, every market-making decision is a game against other participants.

Jane Street is famous for its game theory and trading game interviews. Citadel, HRT, and Jump also test strategic thinking extensively. This chapter covers the mathematical foundations and their direct applications to trading.

```
+------------------------------------------------------------------------+
|              GAME THEORY IN TRADING - CONCEPT MAP                       |
+------------------------------------------------------------------------+
|                                                                        |
|  FOUNDATIONS               AUCTIONS              TRADING GAMES         |
|  +------------------+    +------------------+   +------------------+   |
|  | Nash Equilibrium  |    | First-Price      |   | Market Making    |   |
|  | Dominant Strategy |    | Second-Price     |   | Price Discovery  |   |
|  | Mixed Strategies  |--->| Common Value     |-->| Information      |   |
|  | Minimax           |    | Winner's Curse   |   | Poker Math       |   |
|  | Repeated Games    |    | Revenue Equiv.   |   | Bluffing Theory  |   |
|  +------------------+    +------------------+   +------------------+   |
|           |                       |                      |             |
|           v                       v                      v             |
|  +--------------------------------------------------------------+     |
|  |  MARKET MICROSTRUCTURE AS GAME THEORY                         |     |
|  |  Adverse selection | Glosten-Milgrom | Kyle's model           |     |
|  +--------------------------------------------------------------+     |
|                                                                        |
+------------------------------------------------------------------------+
```

---

## 1. Game Theory Fundamentals

### 1.1 Normal Form Games

A game in normal (strategic) form consists of:
- A set of **players**: N = {1, 2, ..., n}
- For each player i, a set of **strategies**: S_i
- For each player i, a **payoff function**: u_i(s_1, s_2, ..., s_n)

```
PAYOFF MATRIX (2-player game)
==============================

                  Player 2
                  Left    Right
Player 1  Up   | (3,1)  | (0,0) |
          Down | (1,1)  | (2,3) |

Reading: (Player 1's payoff, Player 2's payoff)

If P1 plays Up and P2 plays Left: P1 gets 3, P2 gets 1
```

### 1.2 Dominant Strategies

A strategy s_i **strictly dominates** strategy s_i' if:

```
u_i(s_i, s_{-i}) > u_i(s_i', s_{-i}) for ALL s_{-i}

That is, s_i is better than s_i' regardless of what others do.

Example: Prisoner's Dilemma

                  Player 2
                  Cooperate  Defect
Player 1  Coop  | (-1,-1)  | (-3, 0) |
          Defect| (0, -3)  | (-2,-2) |

Defect dominates Cooperate for both players:
  For P1: Defect gives 0 > -1 (if P2 Coops) and -2 > -3 (if P2 Defects)

Dominant strategy equilibrium: (Defect, Defect) -> (-2, -2)
But (Cooperate, Cooperate) -> (-1, -1) is BETTER for both!
This is the central tension of the prisoner's dilemma.
```

### 1.3 Nash Equilibrium

A strategy profile (s_1*, s_2*, ..., s_n*) is a **Nash Equilibrium** if no player can improve their payoff by unilaterally changing their strategy:

```
u_i(s_i*, s_{-i}*) >= u_i(s_i, s_{-i}*) for all s_i in S_i, for all i

In words: everyone is playing a best response to everyone else.

Finding Nash Equilibrium (2x2 game):

                  Player 2
                  Left    Right
Player 1  Up   | (2,1)  | (0,0) |
          Down | (0,0)  | (1,2) |

Check each cell:
  (Up, Left): P1 deviates to Down? 0 < 2, no. P2 deviates to Right? 0 < 1, no.
  -> (Up, Left) is NE with payoffs (2,1)

  (Down, Right): P1 deviates to Up? 0 < 1, no. P2 deviates to Left? 0 < 2, no.
  -> (Down, Right) is NE with payoffs (1,2)

This game has TWO pure strategy Nash equilibria plus one mixed.
```

### 1.4 Mixed Strategy Nash Equilibrium

When no pure strategy NE exists, or as an additional equilibrium, players randomize:

```
MATCHING PENNIES (no pure NE)
===============================

                  Player 2
                  Heads   Tails
Player 1  Heads | (+1,-1) | (-1,+1) |
          Tails | (-1,+1) | (+1,-1) |

This is a zero-sum game. No pure NE exists.

Mixed NE: Each player plays Heads with probability p.

For P1 to be indifferent (P2 must make P1 indifferent):
  E[P1 | Heads] = E[P1 | Tails]
  q * (+1) + (1-q) * (-1) = q * (-1) + (1-q) * (+1)
  2q - 1 = 1 - 2q
  4q = 2
  q = 1/2

Symmetrically, p = 1/2.
Mixed NE: Both play 50/50. Expected payoff = 0 for both.

TRADING ANALOGY: A market maker who always quotes the same
spread can be exploited. By randomizing quote placement,
they prevent adversarial strategies from profiting.
```

### 1.5 Minimax Theorem (von Neumann)

For two-player zero-sum games:

```
max_{p} min_{q} p' * A * q = min_{q} max_{p} p' * A * q = V

where:
  A = payoff matrix for Player 1
  p = P1's mixed strategy (probability vector)
  q = P2's mixed strategy (probability vector)
  V = value of the game

The minimax strategy is optimal: it guarantees at least V
regardless of the opponent's strategy.

This is the foundation of optimal play in zero-sum settings.
In trading: if you model your interaction with the market as
zero-sum (you vs. informed traders), minimax gives the
worst-case optimal strategy.
```

---

## 2. Classic Games Relevant to Trading

### 2.1 Prisoner's Dilemma (Repeated)

```
REPEATED PRISONER'S DILEMMA
=============================

In a one-shot PD, defection is dominant.
In a repeated PD with unknown horizon, cooperation can emerge.

Tit-for-Tat strategy:
  Round 1: Cooperate
  Round n: Do whatever opponent did in round n-1

This is the SIMPLEST strategy that achieves cooperation.

Trading analogy:
  - Market makers who repeatedly interact with the same brokers
  - If a broker always sends toxic flow, the MM widens spreads
  - If a broker sends balanced flow, the MM provides tight quotes
  - This is informal "tit-for-tat" in market making

Grim Trigger strategy:
  Cooperate until opponent defects, then defect forever.
  Cooperates as long as discount factor delta is high enough:
  Cooperation is sustainable if delta >= (T - R) / (T - P)

  where T = temptation, R = reward, P = punishment, S = sucker
  In standard PD: delta >= (0 - (-1)) / (0 - (-2)) = 0.5
```

### 2.2 Chicken Game (Market Competition)

```
CHICKEN GAME
=============

                  Player 2
                  Swerve    Straight
Player 1  Swerve  | (0, 0)  | (-1, +1) |
          Straight| (+1,-1) | (-5, -5) |

Two pure NE: (Swerve, Straight) and (Straight, Swerve)
One mixed NE: each plays Straight with probability 1/5

Trading analogy:
  Two market makers competing for order flow
  "Straight" = aggressive pricing (narrow spreads)
  "Swerve"   = passive pricing (wide spreads)

  If both go aggressive: price war, both lose (adverse selection)
  If one aggressive, one passive: aggressive one wins flow
  Nash outcome: mixed strategy = sometimes aggressive, sometimes passive
```

### 2.3 Colonel Blotto Game (Resource Allocation)

```
COLONEL BLOTTO GAME
=====================

Each player has N units of resource to allocate across K battlefields.
The player who allocates more to a battlefield wins it.
The player who wins more battlefields wins the game.

Example: N=6 resources, K=3 battlefields

Player 1: (2, 2, 2)  vs  Player 2: (3, 3, 0)
  BF1: 2 < 3 -> P2 wins
  BF2: 2 < 3 -> P2 wins
  BF3: 2 > 0 -> P1 wins
  Result: P2 wins 2-1

Player 1: (5, 1, 0)  vs  Player 2: (3, 3, 0)
  BF1: 5 > 3 -> P1 wins
  BF2: 1 < 3 -> P2 wins
  BF3: 0 = 0 -> tie
  Result: P1 wins 1-1 (with BF1 margin)

Trading analogy:
  Allocating capital/attention across N strategies or markets.
  Competitors are doing the same.
  Over-concentrating on one area leaves others exposed.
  The optimal allocation is NOT uniform.
  NE in Blotto involves randomization over allocations.
```

### 2.4 Ultimatum Game

```
ULTIMATUM GAME
===============

Player 1 (Proposer): Offers split of $100
Player 2 (Responder): Accept or Reject

If Accept: both get their shares
If Reject: both get $0

Game theory prediction (subgame perfect NE):
  P1 offers $0.01, P2 accepts (better than $0)

Experimental result:
  Offers below 20% are usually rejected!
  Modal offer is ~40-50% (fairness concerns)

Trading analogy:
  - Negotiating OTC derivative prices
  - Making/taking offers in dark pools
  - The "fair" market price includes a fairness premium
  - Offering a "bad" price gets you no fills (like rejection)
```

---

## 3. Auction Theory

### 3.1 First-Price Sealed Bid Auction

```
FIRST-PRICE SEALED BID
========================

Rules:
  - Each bidder submits a sealed bid
  - Highest bid wins
  - Winner pays their own bid

Strategy with N bidders, values drawn from Uniform[0,1]:

Optimal bid (Bayesian Nash Equilibrium):
  b(v) = v * (N-1)/N

Intuition:
  - You shade your bid below your value (bid less than you'd pay)
  - With 2 bidders: bid half your value   b(v) = v/2
  - With 3 bidders: bid 2/3 of your value b(v) = 2v/3
  - As N -> infinity: bid approaches value (Bertrand competition)

Expected revenue to seller:
  E[Revenue] = (N-1)/(N+1)

  2 bidders: 1/3  ~= 0.333
  3 bidders: 2/4  = 0.500
  10 bidders: 9/11 ~= 0.818

Derivation of optimal bid (2 bidders, Uniform[0,1]):
  Expected payoff of bidder with value v, bidding b:
    U(b) = (v - b) * Prob(win | bid b)
         = (v - b) * Prob(opponent bids < b)

  If opponent bids optimally at b(v') = v'/2:
    Prob(opponent bids < b) = Prob(v'/2 < b) = Prob(v' < 2b) = 2b

  So U(b) = (v - b) * 2b
  dU/db = 2v - 4b = 0
  b* = v/2
```

### 3.2 Second-Price (Vickrey) Auction

```
SECOND-PRICE SEALED BID (VICKREY)
====================================

Rules:
  - Each bidder submits a sealed bid
  - Highest bid wins
  - Winner pays the SECOND-highest bid

Dominant strategy: BID YOUR TRUE VALUE

Proof:
  Case 1: Your value v > highest other bid B
    - Bidding v: You win, pay B. Profit = v - B > 0.
    - Bidding < v: Risk losing a profitable auction.
    - Bidding > v: Win with same payment B. No benefit.

  Case 2: Your value v < highest other bid B
    - Bidding v: You lose. Profit = 0.
    - Bidding > v: Risk winning and paying > v (loss).
    - Bidding < v: Still lose. No difference.

  In all cases, bidding v weakly dominates all other strategies.
  This is true regardless of other bidders' strategies!

Expected revenue = (N-1)/(N+1) = same as first-price!
(This is the Revenue Equivalence Theorem)

Trading analogy:
  - Treasury auctions use a version of uniform-price auction
  - Many electronic exchanges use second-price-like mechanisms
  - The incentive compatibility (truthful bidding) is powerful
```

### 3.3 Revenue Equivalence Theorem

```
REVENUE EQUIVALENCE THEOREM (Myerson, 1981)
=============================================

Under the following conditions:
  1. Risk-neutral bidders
  2. Independent private values (IPV)
  3. Values drawn from same distribution
  4. Lowest value bidder gets zero surplus

ALL standard auctions yield the same expected revenue.

  E[Revenue_first_price] = E[Revenue_second_price]
                         = E[Revenue_Dutch] = E[Revenue_English]

This is remarkable: the FORMAT doesn't matter, only the
allocation (highest value wins) and the boundary condition.

When revenue equivalence BREAKS DOWN:
  - Risk-averse bidders: First-price > Second-price
    (Risk-averse bidders bid closer to value in first-price)
  - Correlated values: English > Second-price > First-price
    (English reveals information, reduces winner's curse)
  - Asymmetric bidders: Revenue ranking is ambiguous
  - Budget constraints: Rankings change
```

### 3.4 Common Value Auctions and Winner's Curse

```
WINNER'S CURSE
===============

In a common-value auction (the item has the same value to all
bidders, but each bidder has a private ESTIMATE of that value):

The winner tends to be the bidder who OVERESTIMATED the value.

Conditional on winning:
  E[value | I won] < E[value]

Because: I won means my estimate was the highest, which means
I probably overestimated.

Example:
  Oil lease auction. True value = $100M.
  10 bidders each estimate value with noise ~ N(100, 20).
  Expected max of 10 draws from N(100, 20):
    E[max] = 100 + 20 * E[max of 10 standard normals]
           ~= 100 + 20 * 1.54
           = 130.8

  If you bid your estimate and win, you likely bid ~$131M
  for something worth $100M. LOSS of $31M.

Rational response:
  Shade your bid down by the expected winner's curse:
    Bid = Estimate - E[curse]

Trading analogy:
  - Winning a large block trade (you bought because you
    were willing to pay the most -> likely overpaid)
  - IPO allocations: getting 100% fill is BAD signal
  - Dark pool fills: adverse selection is the winner's curse
```

### 3.5 Python Implementation: Auction Simulation

```python
import numpy as np
from dataclasses import dataclass


@dataclass(frozen=True)
class AuctionResult:
    winner: int
    winning_bid: float
    price_paid: float
    winner_value: float
    profit: float


def simulate_first_price_auction(
    values: np.ndarray
) -> AuctionResult:
    """
    Simulate first-price sealed bid with optimal bidding.
    Assumes values are from Uniform[0,1].
    """
    n = len(values)
    # Optimal bids under symmetric IPV with Uniform[0,1]
    bids = values * (n - 1) / n

    winner = np.argmax(bids)
    return AuctionResult(
        winner=winner,
        winning_bid=bids[winner],
        price_paid=bids[winner],
        winner_value=values[winner],
        profit=values[winner] - bids[winner],
    )


def simulate_second_price_auction(
    values: np.ndarray
) -> AuctionResult:
    """
    Simulate second-price (Vickrey) auction.
    Dominant strategy: bid true value.
    """
    bids = values.copy()  # Truthful bidding

    sorted_indices = np.argsort(bids)[::-1]
    winner = sorted_indices[0]
    second_highest = bids[sorted_indices[1]]

    return AuctionResult(
        winner=winner,
        winning_bid=bids[winner],
        price_paid=second_highest,
        winner_value=values[winner],
        profit=values[winner] - second_highest,
    )


def simulate_common_value_auction(
    true_value: float,
    noise_std: float,
    n_bidders: int,
    shading: float = 0.0  # How much to shade bids
) -> dict:
    """
    Simulate common value auction with winner's curse.
    """
    estimates = true_value + np.random.randn(n_bidders) * noise_std
    bids = estimates - shading

    winner = np.argmax(bids)
    return {
        'true_value': true_value,
        'winning_bid': bids[winner],
        'winner_estimate': estimates[winner],
        'profit': true_value - bids[winner],
        'curse': estimates[winner] - true_value,
    }


# Demonstrate Revenue Equivalence
np.random.seed(42)
n_simulations = 100000
n_bidders = 5
revenues_fp = []
revenues_sp = []

for _ in range(n_simulations):
    values = np.random.uniform(0, 1, n_bidders)
    fp = simulate_first_price_auction(values)
    sp = simulate_second_price_auction(values)
    revenues_fp.append(fp.price_paid)
    revenues_sp.append(sp.price_paid)

print(f"First-price avg revenue:  {np.mean(revenues_fp):.4f}")
print(f"Second-price avg revenue: {np.mean(revenues_sp):.4f}")
print(f"Theoretical (N-1)/(N+1):  {(n_bidders-1)/(n_bidders+1):.4f}")

# Demonstrate Winner's Curse
print("\nWinner's Curse Demonstration:")
profits = []
for _ in range(10000):
    result = simulate_common_value_auction(
        true_value=100, noise_std=20, n_bidders=10, shading=0
    )
    profits.append(result['profit'])

print(f"Avg profit (no shading):    {np.mean(profits):.2f}")
print(f"Win rate with loss:         {np.mean([p < 0 for p in profits]):.2%}")

profits_shaded = []
for _ in range(10000):
    result = simulate_common_value_auction(
        true_value=100, noise_std=20, n_bidders=10, shading=30
    )
    profits_shaded.append(result['profit'])

print(f"Avg profit (shade by 30):   {np.mean(profits_shaded):.2f}")
```

---

## 4. Market Making as a Game

### 4.1 Glosten-Milgrom Model

```
GLOSTEN-MILGROM (1985): Adverse Selection in Market Making
=============================================================

Setup:
  - Asset value V is either V_H (high) or V_L (low)
  - P(V = V_H) = delta (market maker's prior)
  - Fraction mu of traders are INFORMED (know V)
  - Fraction (1-mu) are UNINFORMED (trade randomly)

  If informed trader arrives:
    - Buys if V = V_H
    - Sells if V = V_L

  If uninformed trader arrives:
    - Buys or sells with equal probability

Bayesian updating after a BUY order:

  P(V=V_H | Buy) = P(Buy | V_H) * P(V_H) / P(Buy)

  P(Buy | V_H) = mu * 1 + (1-mu) * 0.5 = mu + (1-mu)/2 = (1+mu)/2
  P(Buy | V_L) = mu * 0 + (1-mu) * 0.5 = (1-mu)/2
  P(Buy) = delta * (1+mu)/2 + (1-delta) * (1-mu)/2

  P(V_H | Buy) = delta * (1+mu) / [delta * (1+mu) + (1-delta) * (1-mu)]

Ask price (fair value after buy):
  Ask = P(V_H | Buy) * V_H + P(V_L | Buy) * V_L

Bid price (fair value after sell):
  Bid = P(V_H | Sell) * V_H + P(V_L | Sell) * V_L

Spread = Ask - Bid > 0 (always positive when mu > 0)

KEY INSIGHT: The bid-ask spread exists because of
adverse selection, NOT because of inventory costs.
Even a risk-neutral market maker must quote a spread.
```

### 4.2 Kyle's Lambda Model

```
KYLE MODEL (1985): Price Impact and Market Depth
===================================================

Setup:
  - Informed trader knows V, submits order x
  - Noise traders submit random order u ~ N(0, sigma_u^2)
  - Market maker sees total order flow y = x + u
  - Market maker sets price P = mu + lambda * y

Kyle's Lambda:
  lambda = sigma_V / (2 * sigma_u)

  lambda = price impact per unit of order flow (market depth)

Informed trader's optimal strategy:
  x = (sigma_u / sigma_V) * (V - mu) = (V - mu) / (2 * lambda)

  The informed trader:
  - Trades more aggressively when noise trading is heavy (camouflage)
  - Trades proportionally to their information edge (V - mu)
  - Does NOT trade all at once (gradual revelation)

Market efficiency:
  Informed trader's profit = sigma_V * sigma_u / 2
  Half of the information is impounded into price each period.

TRADING IMPLICATION:
  When you observe large order flow, the price should move
  proportionally. The coefficient lambda depends on:
  - How much information exists (sigma_V)
  - How much noise exists (sigma_u)
  - More noise -> lower lambda -> more depth -> better for informed
```

---

## 5. Mechanism Design

### 5.1 The Revelation Principle

```
REVELATION PRINCIPLE
=====================

Any mechanism that implements a social choice function can
be replaced by a DIRECT mechanism where agents truthfully
report their types.

In English: If a complex auction achieves some outcome,
there exists a simpler "just tell me your value" mechanism
that achieves the same outcome with truthful reporting.

This is powerful because it means we only need to search
over DIRECT, INCENTIVE-COMPATIBLE mechanisms.

Application to market design:
  - Exchange matching engines should incentivize truthful
    limit order submission
  - A well-designed market structure makes honest reporting
    a dominant strategy (like Vickrey auctions)
```

### 5.2 VCG Mechanism

```
VICKREY-CLARKE-GROVES (VCG) MECHANISM
========================================

The VCG mechanism achieves:
  1. Efficiency (maximizes total welfare)
  2. Incentive compatibility (truth-telling is dominant)

Payment rule for player i:
  p_i = max_{a in A} sum_{j != i} v_j(a)  -  sum_{j != i} v_j(a*)

  In words: You pay the externality you impose on others.

For single-item auction: VCG = Vickrey (second-price)
  Your payment = highest bid among others = second price
  Externality = winner takes item away from second-highest bidder

For combinatorial auctions: VCG generalizes naturally
  But can have issues: non-monotonicity, low revenue, complexity

TRADING APPLICATION:
  Some dark pools use VCG-like mechanisms for block trading
  where the price is not the submitted price but adjusted
  for market impact externalities.
```

---

## 6. Poker Mathematics and Bluffing Theory

### 6.1 Pot Odds and Expected Value

```
POT ODDS
=========

Pot odds = Current pot / Cost to call

Example: Pot = $100, opponent bets $50
  Cost to call = $50
  Pot odds = ($100 + $50) / $50 = 3:1
  You need > 1/(3+1) = 25% chance of winning to call profitably

EXPECTED VALUE OF A BET
========================

EV = P(win) * Amount_Won - P(lose) * Amount_Lost

Example:
  You have a flush draw (9 outs, ~19% chance by river)
  Pot = $200, opponent bets $50
  EV(call) = 0.19 * $250 - 0.81 * $50 = $47.50 - $40.50 = +$7.00

  Positive EV -> CALL
```

### 6.2 Optimal Bluffing Frequency

```
OPTIMAL BLUFFING IN SIMPLIFIED POKER
======================================

One-street game: You either have a strong hand or a weak hand.
You can bet or check. Opponent can call or fold.

If you NEVER bluff:
  Opponent always folds to your bets (since you only bet strong)
  You win small pots, never get paid off

If you ALWAYS bluff:
  Opponent always calls (since you bet with everything)
  You lose a lot with weak hands

Optimal bluffing frequency (makes opponent indifferent to calling):

  bluff_freq = bet_size / (pot + bet_size)

Example: Pot = $100, bet size = $100 (pot-size bet)
  bluff_freq = 100 / (100 + 100) = 50%
  For every 2 value bets, make 1 bluff

  Then opponent's EV of calling = 0 regardless of strategy:
    If they call: 50% win $200 (bluff), 50% lose $100 (value)
    EV = 0.5 * 200 - 0.5 * 100... wait, let me recalculate:

  Correct: If you value bet 2/3 of the time and bluff 1/3:
    Opponent calls:
      2/3 of the time you have it -> opponent loses $100
      1/3 of the time you're bluffing -> opponent wins $200
    EV(call) = (2/3)*(-100) + (1/3)*(200) = -66.7 + 66.7 = $0

  This makes the opponent indifferent to calling or folding.

TRADING ANALOGY:
  "Bluffing" = placing orders you intend to cancel (spoofing)
  Note: Spoofing is ILLEGAL in financial markets
  But the game-theoretic concept applies to:
  - Posting aggressive limit orders to probe for liquidity
  - Showing interest in one market to trade in another
  - Using hidden order types strategically
```

### 6.3 Nash Equilibrium in Simplified Poker

```
KUHN POKER (simplest non-trivial poker game)
==============================================

Setup:
  - 3 cards: Jack, Queen, King
  - Each player gets 1 card, 1 card unused
  - 1 unit ante each. Bet size = 1 unit.
  - Player 1 acts first: Check or Bet
  - If Check: Player 2 can Check or Bet
    - If P2 Checks: Showdown
    - If P2 Bets: P1 can Call or Fold
  - If Bet: Player 2 can Call or Fold

Nash Equilibrium (Player 1):
  Jack:  Bet with probability alpha (bluff), Check with 1-alpha
         If checked, fold to P2's bet
  Queen: Always check
         If P2 bets, call with probability 1/3
  King:  Bet with probability 3*alpha (value bet)
         If checked, always bet

  alpha = 1/3 in the Nash equilibrium

  So P1 with King: bets 100% of the time (1/3 initially, rest on check)
     P1 with Queen: always checks, calls 1/3 of the time
     P1 with Jack: bluffs 1/3 of the time

This is a fully solved game with a known Nash equilibrium.
The solution involves BOTH value-betting AND bluffing.
```

---

## 7. Trading Games (Practice Problems)

### 7.1 Market Making Game

```
MARKET MAKING GAME (Jane Street style)
========================================

Setup: You are a market maker for Widget futures.

You know:
  - A Widget is worth somewhere between $0 and $100
  - An informant tells you the value is between $40 and $70
  - Your competitor also has information

You must quote a bid and ask price.

Thinking process:

1. Your expected value: E[V] = ($40 + $70) / 2 = $55
2. Your uncertainty: Uniform on [40, 70], std = (70-40)/sqrt(12) = $8.66
3. You should quote: Bid = 55 - spread/2, Ask = 55 + spread/2

How wide should your spread be?
  - Wider = less adverse selection risk, but fewer fills
  - Narrower = more fills, but more risk of informed traders

Key considerations:
  - If someone eagerly buys at your ask, they likely know V > 55
  - After an adverse fill, update your estimate of V
  - Position limits: don't accumulate too much inventory
  - Compete with other market makers for flow

Optimal spread depends on:
  - How informed your counterparties are
  - Your risk tolerance
  - The bid-ask spread of competitors
```

### 7.2 Information Aggregation Game

```
THE HAT GAME (frequently asked at Jane Street)
================================================

Problem: N people each randomly receive a red or blue hat.
Each person can see everyone else's hat but not their own.
They must simultaneously guess their own hat color (or pass).
If at least one person guesses correctly and nobody guesses
incorrectly, the team wins.

Strategy (for N=3):
  If you see 2 same-colored hats: guess the OPPOSITE color
  If you see 2 different-colored hats: PASS

Win probability: 75% (vs. 50% with random guessing)

Why it works:
  - You lose only when all 3 hats are the same color: P = 2/8 = 25%
  - You win in all other cases: P = 6/8 = 75%
  - By correlating guesses with observed information, the team
    exploits the structure of the problem

TRADING INSIGHT:
  In markets, information is distributed across participants.
  By observing others' actions (their "hats"), you can infer
  information about your own situation. This is the basis of
  price discovery and herding.
```

### 7.3 Dice Trading Game

```
DICE TRADING GAME
==================

Setup: Fair 6-sided die. The payout is the face value shown.
You are the market maker. I want to trade 1 unit.

Your fair value: E[die] = 3.5

A: "I'll buy at your ask price."
You: "My market is 3.0 bid / 4.0 ask"
A: "I buy 1 unit at 4.0"

Now what?

Update: Given that they bought (suggests high value):
  If they see the die and it's 4, 5, or 6: they want to buy
  If they see 1, 2, 3: they wouldn't buy at 4.0
  So: P(V=k | they buy at 4) propto P(buy | V=k) for k = 4,5,6

  E[V | they buy at 4.0] = (4 + 5 + 6) / 3 = 5.0
  You expected to sell at 4.0, but item is worth 5.0 on average.
  ADVERSE SELECTION LOSS = 5.0 - 4.0 = $1.0 per trade

This is exactly the Glosten-Milgrom model in action!

Correct market (accounting for adverse selection):
  If counterparty is always informed:
    Your ask should be E[V | V > ask]
    Only values 5 and 6 are above 4: E = 5.5
    Only values 6 above 5: E = 6
    The ask that satisfies ask = E[V | V >= ask] is tricky.

  Solution: ask = 5, then E[V | V >= 5] = 5.5 > 5 (still lose)
            ask = 5.5, then E[V | V >= 5.5] = 6 > 5.5
            ask = 6, then E[V | V >= 6] = 6 = 6. This works.

  Similarly: bid = 1.
  Market: 1 bid / 6 ask (5-wide!)

  If only 50% of traders are informed:
    P(buy from informed | V=k) = I(k >= ask)
    P(buy from uninformed) = 0.5
    Narrower spread is possible.
```

---

## 8. Interview Problems

### Problem 1: Mixed Strategy Equilibrium

**Q: In the following game, find all Nash equilibria (pure and mixed).**

```
                  Player 2
                  L       R
Player 1  U   | (2,1)  | (0,3) |
          D   | (3,0)  | (1,2) |
```

**A:**
```
Pure strategy NE check:
  (U,L): P1 deviates to D? 3 > 2, yes. NOT NE.
  (U,R): P1 deviates to D? 1 > 0, yes. NOT NE.
  (D,L): P2 deviates to R? 0 < 3... P2 switches to R? 0 < 2... wait.
    P2's payoff at (D,L) = 0. If P2 switches to R: payoff = 2. Yes.
    NOT NE.
  (D,R): P1 deviates to U? 0 < 1. P1 switches to U? 0 < 1... wait.
    P1's payoff at (D,R) = 1. If P1 switches to U: payoff = 0. No.
    P2's payoff at (D,R) = 2. If P2 switches to L: payoff = 0. No.
    (D,R) IS a NE with payoffs (1,2).

Wait, let me recheck (U,L): P1 gets 2, switches to D gets 3. Yes deviates.
  (D,L): P2 gets 0, switches to R gets 2. Yes deviates.
  (U,R): P1 gets 0, switches to D gets 1. Yes deviates.
  (D,R): P1 gets 1, switches to U gets 0. No. P2 gets 2, switches to L gets 0. No.

Pure NE: (D, R) with payoffs (1, 2).

Mixed NE: Let P1 play U with prob p, P2 play L with prob q.

P2 indifferent: E[L] = E[R]
  p*1 + (1-p)*0 = p*3 + (1-p)*2
  p = 3p + 2 - 2p
  p = p + 2
  0 = 2 -> No solution!

This means P2 is NEVER indifferent -> no interior mixed NE.
P2 always prefers R (dominant), so only NE is (D, R).

Actually: P2's payoff from L = p*1 + (1-p)*0 = p
          P2's payoff from R = p*3 + (1-p)*2 = p+2
          R dominates L for P2 (p+2 > p always).

So R is dominant for P2. Given P2 plays R, P1 chooses D (1 > 0).
Unique NE: (D, R).
```

### Problem 2: Bidding Strategy

**Q: You and 4 others are bidding on a painting. Your value is $800. Each bidder draws their value uniformly from $[0, 1000]. It is a first-price sealed-bid auction. What should you bid?**

**A:**
```
With 5 bidders and values from Uniform[0, 1000]:

Optimal bid = v * (N-1)/N = 800 * 4/5 = $640

If instead this were a common-value auction where the
painting's true value is uncertain and each bidder gets
a noisy signal, you would need to shade further to
avoid the winner's curse.

Expected surplus if you win = 800 - 640 = $160
Probability of winning = (640/1000)^4 = 0.168 (only win if
all others bid less, and their values are likely < 800
since their optimal bids would be < value*(4/5))

More precisely: You win when all other values produce bids < 640.
Other bids = v_j * 4/5 < 640 -> v_j < 800.
P(v_j < 800) = 0.8 for each of 4 others.
P(win) = 0.8^4 = 0.4096

Expected profit = 0.4096 * 160 = $65.54
```

### Problem 3: Adverse Selection

**Q: You are a market maker. 30% of incoming orders are from informed traders who know the true value. The asset is worth either $10 or $20 with equal probability. What bid-ask spread should you quote?**

**A:**
```
Prior: P(V=10) = P(V=20) = 0.5
Fair value: E[V] = 15

After a BUY order:
  P(V=20 | Buy) = P(Buy|V=20) * P(V=20) / P(Buy)

  P(Buy | V=20) = 0.3*1 + 0.7*0.5 = 0.65
    (informed buy + uninformed buy randomly)
  P(Buy | V=10) = 0.3*0 + 0.7*0.5 = 0.35
    (informed don't buy + uninformed buy randomly)
  P(Buy) = 0.5 * 0.65 + 0.5 * 0.35 = 0.50

  P(V=20 | Buy) = 0.5 * 0.65 / 0.50 = 0.65

  Ask = 0.65 * 20 + 0.35 * 10 = 16.50

After a SELL order:
  P(V=10 | Sell) = P(Sell|V=10) * P(V=10) / P(Sell)

  P(Sell | V=10) = 0.3*1 + 0.7*0.5 = 0.65
  P(Sell | V=20) = 0.3*0 + 0.7*0.5 = 0.35
  P(Sell) = 0.50

  P(V=10 | Sell) = 0.65

  Bid = 0.35 * 20 + 0.65 * 10 = 13.50

Optimal quotes: Bid = $13.50, Ask = $16.50
Spread = $3.00

Profit per trade from uninformed: $1.50 (half-spread)
Loss per trade from informed: varies, but the spread
compensates on average.
```

### Problem 4: Penny Auction

**Q: In a dollar auction (two players bid for $1, both pay their bids, highest bid wins the dollar), what happens?**

**A:**
```
THE DOLLAR AUCTION (Shubik, 1971)
===================================

This is a famous pathological auction:
  - Two players alternately bid for a $1 bill
  - Bids must increase (minimum increment: $0.01)
  - BOTH players pay their final bid
  - Highest bidder gets the $1

What happens:
  - Rational escalation: Once you've bid $0.50 and opponent bids
    $0.51, you've already "spent" $0.50 (sunk cost).
  - If you stop: lose $0.50
  - If you bid $0.52: might win $1 for $0.52 (net gain $0.48)
  - This logic continues past $1.00!

  At bids of $0.99 (you) vs $1.00 (opponent):
  - If you stop: lose $0.99
  - If you bid $1.01: might win $1 for $1.01 (net loss $0.01)
    But losing costs $0.99, which is worse!

  Bids can escalate far above $1.00!

Nash equilibrium analysis:
  In the subgame perfect equilibrium, Player 1 bids $1.00
  immediately and Player 2 drops out.
  P1 profit: $1 - $1 = $0. P2 profit: $0.

  But this requires backward induction from a finite game.
  With no upper bound, the game has no finite NE.

TRADING LESSON:
  Beware of "sunk cost" thinking in trading.
  The decision to hold or add to a losing position should
  be based on FUTURE expected value, not past losses.
  Escalation of commitment is a common behavioral bias.
```

### Problem 5: Three-Envelope Problem (Modified)

**Q: There are three envelopes with money. You know one has $10, one has $20, one has $30. You pick an envelope and see $20. You are offered to switch to another random envelope. Should you?**

**A:**
```
You see $20. The other two envelopes contain {$10, $30}.

If you switch (randomly pick one of the other two):
  P(get $10) = 0.5, P(get $30) = 0.5
  E[switch] = 0.5 * $10 + 0.5 * $30 = $20

If you keep:
  E[keep] = $20

E[switch] = E[keep] = $20. It doesn't matter.

But what if you saw $10?
  Other envelopes: {$20, $30}
  E[switch] = $25 > $10. SWITCH.

If you saw $30?
  Other envelopes: {$10, $20}
  E[switch] = $15 < $30. KEEP.

Optimal strategy: Switch if low, keep if high, indifferent if middle.

TRADING ANALOGY:
  This is about the value of information and option exercise.
  Seeing the middle outcome provides no information advantage.
  Seeing extreme outcomes gives you a clear decision.
```

---

## 9. Key Concepts Reference

```
+------------------------------------------------------------+
| GAME THEORY CHEAT SHEET                                     |
+------------------------------------------------------------+
| Nash Equilibrium: No player benefits from unilateral change |
| Dominant Strategy: Best regardless of others' actions       |
| Mixed NE: Make opponent indifferent between strategies      |
| Minimax: Maximize minimum payoff (zero-sum games)           |
| Revenue Equivalence: All standard auctions same revenue     |
| Winner's Curse: Conditional on winning, likely overpaid     |
| Vickrey: Truth-telling is dominant in second-price          |
| Optimal FP bid: v * (N-1)/N for Uniform[0,1]              |
| Optimal bluff freq: bet / (pot + bet)                      |
| Glosten-Milgrom: Spread from adverse selection              |
| Kyle's lambda: sigma_V / (2 * sigma_u)                     |
+------------------------------------------------------------+
```

---

*Next Chapter: [Chapter 9 - Quantitative System Design](09-QUANT-SYSTEM-DESIGN.md)*
