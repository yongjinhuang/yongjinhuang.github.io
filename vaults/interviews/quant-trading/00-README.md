# Quantitative Trading Interview Preparation Guide

## Overview

Quantitative trading interviews in 2026 remain among the most demanding in the finance and technology industries. Firms like Jane Street, Citadel Securities, Two Sigma, DE Shaw, Hudson River Trading, Jump Trading, Optiver, SIG (Susquehanna), and Virtu Financial are competing aggressively for top talent. The bar is extraordinarily high: candidates must demonstrate deep mathematical reasoning, fast mental computation, genuine market intuition, and strong programming skills -- often all within a single interview loop.

This guide provides rigorous, interview-ready material across the core domains tested at elite quantitative trading firms. Every section includes detailed theory, worked examples, Python code, and real interview-style problems with solutions.

---

## Types of Quant Roles

```
+-----------------------------------------------------------------------+
|                     QUANTITATIVE TRADING ROLES                        |
+-----------------------------------------------------------------------+
|                                                                       |
|  QUANT TRADER                        QUANT RESEARCHER                 |
|  +-----------------------------+    +-----------------------------+   |
|  | Manages live risk/PnL       |    | Develops alpha signals      |   |
|  | Makes markets or takes      |    | Backtests strategies        |   |
|  |   directional positions     |    | Statistical modeling        |   |
|  | Fast mental math required   |    | ML / deep learning          |   |
|  | Game theory / EV thinking   |    | Publishes internal research |   |
|  | Firms: Jane Street, Optiver |    | Firms: Two Sigma, DE Shaw   |   |
|  +-----------------------------+    +-----------------------------+   |
|                                                                       |
|  QUANT DEVELOPER                     SYSTEMATIC TRADER                |
|  +-----------------------------+    +-----------------------------+   |
|  | Builds trading systems      |    | End-to-end strategy owner   |   |
|  | Ultra-low-latency C++       |    | Signal generation + exec    |   |
|  | Exchange connectivity       |    | Portfolio construction      |   |
|  | Market data infrastructure  |    | Risk management             |   |
|  | Firms: HRT, Jump Trading    |    | Firms: Citadel, AQR, Man   |   |
|  +-----------------------------+    +-----------------------------+   |
|                                                                       |
+-----------------------------------------------------------------------+
```

| Role              | Math Intensity | Coding Intensity | Market Knowledge | Typical Backgrounds       |
| ----------------- | -------------- | ---------------- | ---------------- | ------------------------- |
| Quant Trader      | Very High      | Medium           | Very High        | Math, Physics, CS         |
| Quant Researcher  | Very High      | High             | High             | PhD Math/Stats/Physics/CS |
| Quant Developer   | Medium         | Very High        | Medium           | CS, CE, Physics           |
| Systematic Trader | High           | High             | Very High        | Math, Physics, Finance    |

---

## Interview Formats

### 1. Mental Math Round (10-30 minutes)

Rapid-fire arithmetic, estimation, and quick probability calculations. Firms like Optiver and SIG are famous for timed mental math tests. You may be given 80 questions in 8 minutes.

### 2. Probability & Statistics (30-60 minutes)

Open-ended probability puzzles, conditional expectation problems, and distribution questions. Expect to derive results on a whiteboard.

### 3. Brain Teasers & Logic Puzzles (20-45 minutes)

Classic puzzles testing logical reasoning, creative problem solving, and ability to think under pressure. Jane Street and SIG favor these heavily.

### 4. Market Making Games (30-60 minutes)

Simulated trading games where you quote bid/ask spreads on an unknown quantity. Tests EV calculation, risk management, and Bayesian updating in real time.

### 5. Coding Challenges (45-90 minutes)

Algorithm and data structure problems, often with a quantitative flavor. May include implementing a pricing model, backtesting engine, or order book simulator.

### 6. Strategy / Research Presentation (30-60 minutes)

Present a trading strategy or research finding. Tests depth of quantitative thinking, awareness of market realities, and communication skills.

### 7. Fit / Behavioral (20-30 minutes)

Teamwork, intellectual curiosity, competitive drive. Quant firms value people who are genuinely passionate about markets and puzzles.

---

## Table of Contents

| #   | File                                                                       | Topic                       | Key Concepts                                          |
| --- | -------------------------------------------------------------------------- | --------------------------- | ----------------------------------------------------- |
| 0   | [00-README.md](00-README.md)                                               | This guide                  | Overview, study plan, firm profiles                   |
| 0   | [00-ROADMAP.md](00-ROADMAP.md)                                             | Complete learning roadmap   | Zero-to-expert progression                            |
| 1   | [01-PROBABILITY-AND-STATISTICS.md](01-PROBABILITY-AND-STATISTICS.md)       | Probability & Statistics    | Combinatorics, distributions, Markov chains, puzzles  |
| 2   | [02-BRAIN-TEASERS-AND-MENTAL-MATH.md](02-BRAIN-TEASERS-AND-MENTAL-MATH.md) | Brain Teasers & Mental Math | Arithmetic shortcuts, Fermi estimation, logic puzzles |
| 2   | [02-MATHEMATICAL-FOUNDATIONS.md](02-MATHEMATICAL-FOUNDATIONS.md)           | Mathematical Foundations    | Linear algebra, calculus, optimization                |
| 3   | [03-STOCHASTIC-CALCULUS.md](03-STOCHASTIC-CALCULUS.md)                     | Stochastic Calculus         | Brownian motion, Ito's lemma, Black-Scholes, Greeks   |
| 4   | [04-MARKET-MICROSTRUCTURE.md](04-MARKET-MICROSTRUCTURE.md)                 | Market Microstructure       | Order books, spreads, market making, HFT              |
| 12  | [12-HFT-LOW-LATENCY.md](12-HFT-LOW-LATENCY.md)                             | HFT & Low Latency           | Systems architecture, co-location                     |
| 16  | [16-REGULATORY-ETHICS.md](16-REGULATORY-ETHICS.md)                         | Regulation & Ethics         | Reg NMS, MiFID II, compliance                         |

---

## Quick Reference: What Each Firm Tests

| Firm               | Mental Math | Probability | Brain Teasers |  Coding  | Market Making | Stochastic Calc |
| ------------------ | :---------: | :---------: | :-----------: | :------: | :-----------: | :-------------: |
| Jane Street        |   \*\*\*    |  \*\*\*\*   |   \*\*\*\*    |  \*\*\*  |    **\***     |      \*\*       |
| Citadel Securities |   \*\*\*    |  \*\*\*\*   |    \*\*\*     | \*\*\*\* |   \*\*\*\*    |     \*\*\*      |
| Two Sigma          |    \*\*     |  \*\*\*\*   |     \*\*      |  **\***  |     \*\*      |     \*\*\*      |
| DE Shaw            |    \*\*     |  \*\*\*\*   |    \*\*\*     |  **\***  |     \*\*      |    \*\*\*\*     |
| HRT                |  \*\*\*\*   |   \*\*\*    |     \*\*      |  **\***  |    \*\*\*     |      \*\*       |
| Jump Trading       |  \*\*\*\*   |   \*\*\*    |     \*\*      |  **\***  |    \*\*\*     |      \*\*       |
| Optiver            |   **\***    |  \*\*\*\*   |   \*\*\*\*    |   \*\*   |    **\***     |       \*        |
| SIG                |   **\***    |  \*\*\*\*   |    **\***     |   \*\*   |    **\***     |       \*        |
| Virtu              |   \*\*\*    |   \*\*\*    |     \*\*      |  **\***  |   \*\*\*\*    |      \*\*       |
| AQR                |     \*      |   **\***    |      \*       | \*\*\*\* |      \*       |    \*\*\*\*     |

_Scale: _ = light, **\*** = extremely heavy\*

---

## 4-Week Study Plan

### Week 1: Foundations

- **Days 1-2**: Probability fundamentals (01-PROBABILITY-AND-STATISTICS.md sections 1-4)
- **Days 3-4**: Distributions, CLT, order statistics (01 sections 5-7)
- **Days 5-6**: Classic probability puzzles (01 sections 8-9)
- **Day 7**: Review and practice problems

### Week 2: Speed & Puzzles

- **Days 1-2**: Mental math drills -- practice 30 minutes daily (02-BRAIN-TEASERS sections 1-2)
- **Days 3-4**: Brain teasers and logic puzzles (02 sections 3-4)
- **Days 5-6**: Fermi estimation and market puzzles (02 sections 5-6)
- **Day 7**: Timed practice -- simulate interview conditions

### Week 3: Financial Mathematics

- **Days 1-2**: Brownian motion and Ito's lemma (03-STOCHASTIC-CALCULUS sections 1-3)
- **Days 3-4**: Black-Scholes, Greeks, option pricing (03 sections 4-6)
- **Days 5-6**: Monte Carlo methods and advanced models (03 sections 7-8)
- **Day 7**: Coding implementations in Python

### Week 4: Markets & Integration

- **Days 1-2**: Order book mechanics, bid-ask spread (04-MARKET-MICROSTRUCTURE sections 1-3)
- **Days 3-4**: Market making, price impact, execution algorithms (04 sections 4-6)
- **Days 5-6**: HFT, exchange architecture, regulation (04 sections 7-9)
- **Day 7**: Full mock interview simulation

### Daily Routine

```
Morning (30 min):  Mental math speed drills
Midday (2 hours):  Deep study of scheduled topic
Evening (1 hour):  Practice problems under timed conditions
Before bed (15 min): Review flashcards of key formulas
```

---

## Common Mistakes to Avoid

1. **Memorizing without understanding** -- Interviewers will twist standard problems. You must understand the underlying principles to adapt.

2. **Ignoring mental math** -- Many candidates with PhDs fail because they cannot do 17 x 23 in their head within 5 seconds. Practice daily.

3. **Not communicating your thought process** -- Quant interviews heavily weight how you think, not just the final answer. Talk through your reasoning.

4. **Neglecting market intuition** -- Even for pure math roles, firms want people who care about markets. Read financial news, understand basic market mechanics.

5. **Over-engineering coding solutions** -- In quant coding rounds, clean and correct beats clever and complex. Use numpy/pandas fluently.

6. **Forgetting edge cases in probability** -- Always check: Does my answer make sense? Is it between 0 and 1? Does it satisfy boundary conditions?

7. **Not practicing under time pressure** -- The real interview is timed and stressful. Practice with a clock running.

8. **Skipping the "why"** -- When asked "how would you trade X?", always explain why the strategy works, what assumptions it relies on, and when it would fail.

---

## Recommended Resources

| Resource                                                              | Type    | Best For                    |
| --------------------------------------------------------------------- | ------- | --------------------------- |
| _A Practical Guide to Quantitative Finance Interviews_ (Xinfeng Zhou) | Book    | Probability, brain teasers  |
| _Heard on the Street_ (Timothy Crack)                                 | Book    | Classic interview questions |
| _Fifty Challenging Problems in Probability_ (Mosteller)               | Book    | Deep probability practice   |
| _Options, Futures, and Other Derivatives_ (Hull)                      | Book    | Derivatives theory          |
| _Stochastic Calculus for Finance I & II_ (Shreve)                     | Book    | Rigorous stochastic calc    |
| _Trading and Exchanges_ (Harris)                                      | Book    | Market microstructure       |
| _Algorithmic Trading and DMA_ (Johnson)                               | Book    | Execution algorithms        |
| Quantitative Research and Trading (blog by E. Chan)                   | Blog    | Practical strategies        |
| Brainstellar.com                                                      | Website | Brain teaser practice       |
| QuantGuide.io                                                         | Website | Interview prep platform     |
| Project Euler                                                         | Website | Math + coding problems      |

---

## Final Advice

The best quant traders combine three things: mathematical depth, computational speed, and market intuition. You need all three. A PhD in math who cannot estimate 847/23 quickly will struggle. A fast mental calculator who does not understand conditional expectation will fail probability rounds. A brilliant coder who has never thought about bid-ask spreads will bomb market making games.

Start with your weakest area. Practice daily. Simulate interview conditions. The firms listed above are hiring people who are genuinely exceptional -- your preparation must be exceptional too.

Good luck.
