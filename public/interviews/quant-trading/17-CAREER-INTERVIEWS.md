# Chapter 17: Career Paths and Interview Preparation

## Introduction

Breaking into quantitative trading is one of the most competitive career pursuits in finance and technology. The firms are small, the compensation is extraordinary, and the intellectual bar is among the highest in any industry. This chapter is your comprehensive guide to understanding the landscape, preparing for every interview stage, and ultimately landing and succeeding in a quant role.

Whether you are a physics PhD pivoting from academia, a software engineer seeking more intellectually stimulating work, or a finance professional looking to move to the quantitative side, this chapter provides the roadmap.

```
+------------------------------------------------------------------------+
|                    CHAPTER 17 OVERVIEW                                  |
+------------------------------------------------------------------------+
|                                                                        |
|  UNDERSTAND          PREPARE            EXECUTE          NEGOTIATE     |
|  +----------------+  +----------------+  +--------------+  +----------+|
|  | Career Paths   |  | Math & Prob    |  | Phone Screen |  | Base     ||
|  | Top Firms      |  | Coding Prep    |  | Super Day    |  | Bonus    ||
|  | Culture Fit    |  | Strategy Q&A   |  | Take-Home    |  | Equity   ||
|  | Compensation   |  | Brain Teasers  |  | Behavioral   |  | Non-Comp ||
|  +----------------+  +----------------+  +--------------+  +----------+|
|                                                                        |
|  Timeline: 3-12 months preparation, 2-8 weeks interview process        |
+------------------------------------------------------------------------+
```

---

## 17.1 Quant Career Paths

### The Role Taxonomy

Quantitative finance is not a single career -- it is a family of roles that require different combinations of mathematics, programming, and market intuition. Understanding the distinctions is critical for targeting your preparation.

```
+------------------------------------------------------------------------+
|                     QUANT ROLE HIERARCHY                                |
+------------------------------------------------------------------------+
|                                                                        |
|                    +-------------------------+                         |
|                    |   Portfolio Manager /    |                         |
|                    |   Partner / CIO          |                         |
|                    +------------+------------+                         |
|                                 |                                      |
|              +------------------+------------------+                   |
|              |                  |                  |                    |
|    +---------v-------+ +-------v--------+ +-------v--------+          |
|    | Senior Quant     | | Senior Quant    | | Senior Quant    |          |
|    | Researcher       | | Developer       | | Trader          |          |
|    +---------+-------+ +-------+--------+ +-------+--------+          |
|              |                  |                  |                    |
|    +---------v-------+ +-------v--------+ +-------v--------+          |
|    | Quant            | | Quant           | | Quant           |          |
|    | Researcher       | | Developer       | | Trader          |          |
|    +---------+-------+ +-------+--------+ +-------+--------+          |
|              |                  |                  |                    |
|    +---------v-------+ +-------v--------+ +-------v--------+          |
|    | Junior Quant     | | Junior Quant    | | Junior Quant    |          |
|    | Researcher       | | Developer       | | Trader          |          |
|    +----------------+ +----------------+ +----------------+          |
|                                                                        |
|  SUPPORT ROLES:                                                        |
|  +------------------+  +------------------+  +------------------+      |
|  | Risk Quant /      |  | Data Scientist / |  | Quant Analyst    |      |
|  | Quant Analyst     |  | Data Engineer    |  | (Sell-Side)      |      |
|  +------------------+  +------------------+  +------------------+      |
|                                                                        |
+------------------------------------------------------------------------+
```

### 17.1.1 Quantitative Researcher

**What they do**: Discover alpha signals, develop predictive models, and design trading strategies.

**Day-to-day**:

- Analyze large datasets (price, volume, fundamental, alternative data)
- Form hypotheses about market inefficiencies
- Build and test statistical/ML models
- Backtest strategies with rigorous out-of-sample validation
- Collaborate with developers to deploy models to production
- Monitor live strategy performance and iterate

**Required skills**:

- Advanced statistics and probability
- Machine learning (both classical and deep learning)
- Python (pandas, numpy, scikit-learn, PyTorch)
- Financial theory and market intuition
- Strong communication (explaining model results to PMs)

**Typical backgrounds**: PhD in statistics, mathematics, physics, computer science, economics, or electrical engineering. Some firms hire exceptional MS graduates.

### 17.1.2 Quantitative Developer / Engineer

**What they do**: Build the technology infrastructure that powers trading operations.

**Day-to-day**:

- Design and implement low-latency execution systems
- Build data pipelines for market data ingestion
- Develop backtesting frameworks and research tools
- Optimize performance-critical code paths
- Maintain order management and risk systems
- Implement exchange connectivity (FIX protocol, binary protocols)

**Required skills**:

- C++ (modern C++17/20/23), Python
- Systems programming (Linux, networking, memory management)
- Data structures and algorithms
- Distributed systems and message queues
- Database design (SQL and time-series databases)

**Typical backgrounds**: BS/MS in computer science or electrical engineering, with strong systems programming skills.

### 17.1.3 Quantitative Trader

**What they do**: Execute strategies, manage risk in real-time, and own P&L.

**Day-to-day**:

- Monitor live trading positions across multiple strategies
- Make real-time risk management decisions
- Adjust strategy parameters based on market conditions
- Analyze execution quality and slippage
- Communicate with researchers about strategy performance
- Interface with brokers and counterparties

**Required skills**:

- Strong quantitative foundation (probability, statistics)
- Market microstructure knowledge
- Risk management frameworks
- Quick mental math and decision-making under pressure
- Programming ability (Python at minimum, often C++)

**Typical backgrounds**: Quantitative finance MS, physics/math PhD, or promoted from researcher/developer roles.

### 17.1.4 Quantitative Analyst / Risk Quant

**What they do**: Price complex financial products, model risk, and ensure regulatory compliance.

**Day-to-day**:

- Develop and validate pricing models for derivatives
- Calculate risk metrics (VaR, CVA, Greeks)
- Perform stress testing and scenario analysis
- Validate models from front office quants
- Ensure compliance with Basel III/IV requirements
- Build Monte Carlo simulation frameworks

**Required skills**:

- Stochastic calculus and PDE methods
- Derivatives pricing theory
- Monte Carlo methods
- C++ and Python
- Regulatory knowledge (Basel, Dodd-Frank)

**Typical backgrounds**: PhD or MS in financial engineering, mathematics, physics. More common at banks (sell-side) than hedge funds.

### 17.1.5 Data Scientist / Data Engineer

**What they do**: Source, process, and extract signals from traditional and alternative data.

**Day-to-day**:

- Build and maintain data pipelines (market data, alternative data)
- Process satellite imagery, web scraping, NLP on news/filings
- Feature engineering for alpha models
- Data quality monitoring and anomaly detection
- Build tools for researchers to access and analyze data
- Evaluate new data vendors and sources

**Required skills**:

- Python, SQL, Spark/Dask
- Cloud infrastructure (AWS, GCP)
- NLP, computer vision (for alternative data)
- Data modeling and ETL design
- Statistical analysis

**Typical backgrounds**: MS/PhD in computer science, statistics, or related fields. Strong engineering background with data focus.

### 17.1.6 Portfolio Manager

**What they do**: Allocate capital across strategies, manage overall fund risk, and drive P&L.

**Day-to-day**:

- Oversee multiple strategies and their researchers
- Make capital allocation decisions
- Set risk limits and monitor aggregate exposure
- Interface with investors and leadership
- Evaluate new strategy proposals
- Manage team of researchers and developers

**This is the senior role** -- most PMs were previously successful researchers or traders who demonstrated the ability to manage risk at scale.

### Compensation Ranges

Compensation in quantitative finance is among the highest in any industry. The following ranges are approximate for US-based roles (2024-2025) at top-tier firms.

```
+------------------------------------------------------------------------+
|                  COMPENSATION RANGES (USD, Total Comp)                  |
+------------------------------------------------------------------------+
|                                                                        |
|  Role / Level          | Base Salary  | Total Comp (Base + Bonus)      |
|  ----------------------+-------------+-------------------------------  |
|  Junior Researcher     | $150-200K    | $250-450K                      |
|  Mid Researcher        | $200-300K    | $400-800K                      |
|  Senior Researcher     | $250-400K    | $600K-2M+                      |
|  ----------------------+-------------+-------------------------------  |
|  Junior Developer      | $150-200K    | $200-400K                      |
|  Mid Developer         | $200-300K    | $350-700K                      |
|  Senior Developer      | $250-400K    | $500K-1.5M+                    |
|  ----------------------+-------------+-------------------------------  |
|  Junior Trader         | $150-200K    | $300-600K                      |
|  Mid Trader            | $200-300K    | $500K-1.5M                     |
|  Senior Trader         | $250-400K    | $1M-5M+                        |
|  ----------------------+-------------+-------------------------------  |
|  Risk Quant (Bank)     | $120-200K    | $180-500K                      |
|  Data Scientist        | $150-250K    | $250-600K                      |
|  Portfolio Manager     | $300-500K    | $1M-20M+ (P&L dependent)       |
|  ----------------------+-------------+-------------------------------  |
|                                                                        |
|  Notes:                                                                |
|  - Top firms (RenTech, Citadel, JS) pay at the high end               |
|  - Bonus is highly variable and performance-dependent                  |
|  - PM comp can exceed $50M+ at top pod shops                           |
|  - Sign-on bonuses: $50-300K common, $1M+ for senior hires            |
|                                                                        |
+------------------------------------------------------------------------+
```

### Career Progression

```
TYPICAL CAREER TIMELINE (Quant Researcher Path)

Year 0-2:   Junior Researcher
            - Learn firm's infrastructure and data
            - Assist senior researchers
            - Develop first independent signals
            - Total comp: $250-450K

Year 2-5:   Researcher
            - Own independent research streams
            - Deploy strategies to production
            - Mentor juniors
            - Total comp: $400-800K

Year 5-8:   Senior Researcher
            - Lead research team or pod
            - Multiple live strategies
            - Significant capital allocation
            - Total comp: $600K-2M+

Year 8-12:  Lead / Principal Researcher
            - Set research direction for group
            - Large capital responsibility
            - May begin PM track
            - Total comp: $1-5M+

Year 10+:   Portfolio Manager
            - Full P&L ownership
            - Capital allocation authority
            - Team management
            - Total comp: $2-20M+ (uncapped)
```

---

## 17.2 Top Firms and Their Culture

Understanding firm culture is essential for targeting your applications and interview preparation. Each firm has a distinct personality, technology stack, and research philosophy.

### 17.2.1 Renaissance Technologies

```
+----------------------------------------------+
|  RENAISSANCE TECHNOLOGIES                     |
+----------------------------------------------+
|  Founded: 1982 by Jim Simons                 |
|  AUM: ~$130B (Medallion: ~$10B internal)     |
|  HQ: East Setauket, Long Island, NY          |
|  Style: Systematic, multi-asset              |
+----------------------------------------------+
|  CULTURE:                                    |
|  - Extremely secretive                       |
|  - Academic research environment             |
|  - Collaborative within, zero leaks outside  |
|  - Lifetime NDAs for all employees           |
|  - Medallion Fund: ~66% annual return        |
|    (before fees) since 1988                  |
+----------------------------------------------+
|  HIRES: Math/physics/CS PhDs almost          |
|  exclusively. Prior finance experience       |
|  is NOT required or even preferred.          |
|  Strong publication record matters.          |
+----------------------------------------------+
|  TECH: Proprietary everything. Rumored       |
|  to use custom languages and systems.        |
+----------------------------------------------+
```

**Key facts**:

- The Medallion Fund is the most successful hedge fund in history
- External funds (RIEF, RIDA) have more modest returns
- Employees invest their own money in Medallion
- Extremely low turnover -- people rarely leave

### 17.2.2 Two Sigma

```
+----------------------------------------------+
|  TWO SIGMA                                   |
+----------------------------------------------+
|  Founded: 2001 by David Siegel & John        |
|           Overdeck                            |
|  AUM: ~$60B                                  |
|  HQ: New York City (SoHo)                    |
|  Style: Technology-driven systematic          |
+----------------------------------------------+
|  CULTURE:                                    |
|  - Tech company culture in finance           |
|  - Strong engineering focus                  |
|  - Open-plan offices, casual dress           |
|  - Internal tech talks and research days     |
|  - Work-life balance better than most funds  |
+----------------------------------------------+
|  HIRES: CS, math, physics, stats PhDs.       |
|  Also strong MS and BS engineers.            |
|  Values software engineering skills highly.  |
+----------------------------------------------+
|  TECH: Python, Spark, Hadoop, custom infra.  |
|  Heavy cloud usage. Internal platform team.  |
+----------------------------------------------+
```

### 17.2.3 Citadel / Citadel Securities

```
+----------------------------------------------+
|  CITADEL / CITADEL SECURITIES                |
+----------------------------------------------+
|  Founded: 1990 by Ken Griffin                |
|  AUM: ~$65B (Citadel LLC)                    |
|  HQ: Miami, FL (moved from Chicago 2022)     |
|  Style: Multi-strategy (pod structure)       |
+----------------------------------------------+
|  CULTURE:                                    |
|  - Extremely intense and demanding           |
|  - Performance-driven meritocracy            |
|  - Long hours expected                       |
|  - High turnover relative to peers           |
|  - Very high compensation to match intensity |
+----------------------------------------------+
|  STRUCTURE:                                  |
|  Citadel LLC: Multi-strategy hedge fund      |
|    - Global Equities, Surveyor, Tactical     |
|      Trading, Global Fixed Income            |
|  Citadel Securities: Market maker            |
|    - Equities, options, fixed income MM      |
|    - ~25% of US equity volume                |
+----------------------------------------------+
|  HIRES: Top of class from target schools.    |
|  Competitive programming winners.            |
|  PhDs and experienced PMs from other funds.  |
+----------------------------------------------+
|  TECH: C++, Python, KDB+/q. Cutting-edge    |
|  infrastructure investment.                  |
+----------------------------------------------+
```

### 17.2.4 DE Shaw

```
+----------------------------------------------+
|  DE SHAW & CO                                |
+----------------------------------------------+
|  Founded: 1988 by David E. Shaw             |
|  AUM: ~$60B                                  |
|  HQ: New York City                           |
|  Style: Systematic + discretionary macro     |
+----------------------------------------------+
|  CULTURE:                                    |
|  - Intellectual, academic-feeling            |
|  - "The firm" -- formal but not stuffy       |
|  - Strong mentorship for juniors             |
|  - Long-term thinking                        |
|  - Structured promotion process              |
+----------------------------------------------+
|  HIRES: Ivy League and top-tier PhDs.        |
|  Strong emphasis on raw intellectual         |
|  ability. Famous for difficult interviews.   |
+----------------------------------------------+
|  TECH: Proprietary systems, Python, C++.     |
|  Known for strong internal tools.            |
+----------------------------------------------+
```

### 17.2.5 Jane Street

```
+----------------------------------------------+
|  JANE STREET                                 |
+----------------------------------------------+
|  Founded: 2000                               |
|  Revenue: Multi-billion (private)             |
|  HQ: New York City                           |
|  Style: Market making, ETF arbitrage         |
+----------------------------------------------+
|  CULTURE:                                    |
|  - Collaborative, not competitive internally |
|  - "Classes" of new hires trained together   |
|  - Trading game culture (mock trading)       |
|  - Intellectual curiosity highly valued       |
|  - Flat hierarchy                            |
|  - One of the best cultures in the industry  |
+----------------------------------------------+
|  HIRES: Math olympiad winners, competitive   |
|  programmers, puzzle enthusiasts.            |
|  BS/MS welcome -- no PhD required.           |
|  Values thinking speed and clarity.          |
+----------------------------------------------+
|  TECH: OCaml (unique in industry), Python.   |
|  Custom everything. Strong FP culture.       |
+----------------------------------------------+
```

### 17.2.6 Jump Trading

```
+----------------------------------------------+
|  JUMP TRADING                                |
+----------------------------------------------+
|  Founded: 1999                               |
|  HQ: Chicago, IL                             |
|  Style: HFT, market making, crypto          |
+----------------------------------------------+
|  CULTURE:                                    |
|  - Engineering-heavy, startup-like           |
|  - Fast-paced, ship quickly                  |
|  - Strong C++ engineering culture            |
|  - Significant crypto presence (Wormhole)    |
|  - Chicago roots, midwestern work ethic      |
+----------------------------------------------+
|  HIRES: Top C++ engineers, FPGA experts,     |
|  networking specialists. Research hires      |
|  tend toward physics and EE PhDs.            |
+----------------------------------------------+
|  TECH: C++, FPGA, kernel bypass networking.  |
|  Nanosecond-level optimization.              |
+----------------------------------------------+
```

### 17.2.7 Other Notable Firms

```
+------------------------------------------------------------------------+
|  FIRM                  | STYLE           | NOTABLE FOR                  |
+------------------------------------------------------------------------+
|  HRT (Hudson River)    | HFT / MM        | Engineering + research       |
|                        |                 | balance, great culture       |
|  Virtu Financial       | Market Making   | Public company, tech-driven  |
|  AQR Capital           | Factor Investing| Academic, Cliff Asness       |
|  Point72 / Cubist      | Multi-PM Pod    | Steve Cohen, aggressive hire |
|  Tower Research         | HFT             | Quantitative, Chicago/NYC   |
|  Five Rings Capital    | MM / HFT        | Spin-off culture, puzzles   |
|  SIG (Susquehanna)     | Options MM      | Game theory, poker culture  |
|  Optiver              | Options MM      | Amsterdam roots, collaborative|
|  IMC Trading           | MM              | Dutch, strong training       |
|  DRW                   | Multi-strategy  | Chicago, Don Wilson          |
|  Millennium            | Multi-PM Pod    | Izzy Englander, massive AUM  |
|  Balyasny              | Multi-PM Pod    | Growing rapidly              |
|  Man Group / AHL       | CTA / Systematic| London, longest-running CTA  |
|  WorldQuant            | Alpha factory   | Igor Tulchinsky, 101 Alphas  |
+------------------------------------------------------------------------+
```

### Buy-Side vs Sell-Side

```
+----------------------------------+----------------------------------+
|          BUY SIDE                |          SELL SIDE               |
+----------------------------------+----------------------------------+
| Hedge funds, prop shops          | Investment banks                 |
| Generate alpha, trade P&L        | Service clients, market making   |
|                                  |                                  |
| PROS:                            | PROS:                            |
| + Much higher compensation       | + More structured career path    |
| + Direct impact on P&L           | + Broader exposure to products   |
| + Intellectual freedom           | + Larger teams, more mentorship  |
| + Smaller teams, more ownership  | + More stable employment         |
|                                  |                                  |
| CONS:                            | CONS:                            |
| - Performance pressure intense   | - Lower compensation ceiling     |
| - Job security is lower          | - More bureaucracy               |
| - Can be isolating               | - Less intellectual freedom      |
| - Hours can be extreme           | - Regulatory overhead            |
|                                  |                                  |
| COMP (mid-level):                | COMP (mid-level):                |
| $400K - $1.5M+                   | $200K - $500K                    |
+----------------------------------+----------------------------------+
```

---

## 17.3 Resume and Background

### 17.3.1 Typical Academic Backgrounds

The most common educational backgrounds at top quant firms:

```
MOST COMMON (Tier 1):
+------------------+------------------------------------------+
| Mathematics      | Pure math, applied math, combinatorics    |
| Physics          | Theoretical, experimental, astrophysics  |
| Computer Science | Algorithms, ML, systems                  |
| Statistics       | Mathematical statistics, biostatistics    |
+------------------+------------------------------------------+

COMMON (Tier 2):
+------------------+------------------------------------------+
| Electrical Eng.  | Signal processing, control theory        |
| Operations Res.  | Optimization, stochastic processes       |
| Financial Eng.   | MFE programs (Columbia, CMU, Baruch)     |
| Economics        | Econometrics, quantitative focus         |
+------------------+------------------------------------------+

LESS COMMON BUT SEEN:
+------------------+------------------------------------------+
| Biology          | Computational biology, bioinformatics    |
| Chemistry        | Computational chemistry                  |
| Philosophy       | Logic and formal methods                 |
+------------------+------------------------------------------+
```

### 17.3.2 The Self-Taught Path

If you do not have a traditional quantitative background, you need to demonstrate equivalent competence through concrete evidence:

**What to show on your resume / portfolio**:

1. **GitHub Portfolio Projects**

   - Backtesting framework with proper walk-forward validation
   - Alpha signal research with documented methodology
   - Low-latency order book implementation in C++
   - Time series forecasting models with real data
   - Options pricing library

2. **Kaggle Competitions**

   - Top finishes in tabular data competitions
   - Financial forecasting competitions (Jane Street, Two Sigma, Optiver)
   - Demonstrates practical ML ability
   - Gold/silver medals carry significant weight

3. **Personal Trading Track Record**

   - Auditable results (broker statements)
   - Sharpe ratio, max drawdown, alpha vs benchmark
   - Systematic, not discretionary gambling
   - Shows you can apply theory to practice

4. **Academic Publications or Preprints**

   - Even one quantitative paper on arXiv shows research ability
   - Blog posts with rigorous analysis (not clickbait)
   - Contributions to quantitative finance literature

5. **Open Source Contributions**
   - Contributions to QuantLib, Zipline, or similar projects
   - Shows you can write production-quality code
   - Demonstrates collaboration and code review skills

### 17.3.3 What Firms Look For at Each Level

```
ENTRY LEVEL (0-2 years):
+------------------------------------------------------------------------+
| - Raw intellectual horsepower (test scores, competitions, GPA)          |
| - Programming fluency (can you code quickly and correctly?)             |
| - Mathematical maturity (comfortable with proofs and abstraction)       |
| - Curiosity and passion for markets                                    |
| - Coachability and cultural fit                                         |
+------------------------------------------------------------------------+

MID LEVEL (2-5 years):
+------------------------------------------------------------------------+
| - Track record of alpha generation or system delivery                   |
| - Deep domain expertise in a specific area                              |
| - Independent research or engineering ability                           |
| - Published strategies or significant technical contributions           |
| - Ability to mentor juniors                                            |
+------------------------------------------------------------------------+

SENIOR LEVEL (5+ years):
+------------------------------------------------------------------------+
| - Demonstrated P&L attribution                                          |
| - Leadership and team-building ability                                  |
| - Strategic vision for research or technology direction                 |
| - Industry relationships and reputation                                 |
| - Capital allocation judgment                                           |
+------------------------------------------------------------------------+
```

---

## 17.4 Interview Process Overview

### The Typical Pipeline

```
+------------------------------------------------------------------------+
|                    QUANT INTERVIEW PIPELINE                             |
+------------------------------------------------------------------------+
|                                                                        |
|  STAGE 1: APPLICATION                                                  |
|  +-------------------+                                                 |
|  | Resume Screen     |  1-2 weeks                                      |
|  | Recruiter Call     |  15-30 min, logistics and motivation           |
|  +--------+----------+                                                 |
|           |                                                            |
|  STAGE 2: INITIAL ASSESSMENT                                           |
|  +--------v----------+                                                 |
|  | Online Assessment  |  1-3 hours, math/coding/probability            |
|  | OR Phone Screen   |  45-60 min, technical questions                 |
|  +--------+----------+                                                 |
|           |                                                            |
|  STAGE 3: DEEP TECHNICAL                                               |
|  +--------v----------+                                                 |
|  | Technical Phone    |  1-2 rounds, 45-60 min each                   |
|  | Screens            |  Math, coding, strategy questions              |
|  +--------+----------+                                                 |
|           |                                                            |
|  STAGE 4: SUPER DAY (On-site or Virtual)                               |
|  +--------v----------+                                                 |
|  | 4-6 back-to-back   |  Full day (4-8 hours)                         |
|  | interviews          |  Mixed: math, coding, market, behavioral     |
|  +--------+----------+                                                 |
|           |                                                            |
|  STAGE 5 (sometimes): TAKE-HOME PROJECT                                |
|  +--------v----------+                                                 |
|  | Research project   |  2-7 days, alpha research or system design     |
|  | or coding challenge|  Followed by presentation/defense              |
|  +--------+----------+                                                 |
|           |                                                            |
|  STAGE 6: OFFER                                                        |
|  +--------v----------+                                                 |
|  | Team match / offer |  1-2 weeks for decision                        |
|  | Negotiation        |  Base, bonus, sign-on, start date              |
|  +-------------------+                                                 |
|                                                                        |
|  TOTAL TIMELINE: 2-8 weeks (can be faster for experienced hires)       |
+------------------------------------------------------------------------+
```

### What Each Stage Tests

| Stage             | Tests For                         | How to Prepare                          |
| ----------------- | --------------------------------- | --------------------------------------- |
| Resume Screen     | Credentials, relevance            | Tailor resume to quant focus            |
| Online Assessment | Speed + accuracy in math/code     | Practice HackerRank, LeetCode           |
| Phone Screen      | Communication + technical depth   | Practice explaining solutions aloud     |
| Super Day         | Breadth of knowledge, culture fit | Full mock interview days                |
| Take-Home         | Independent research ability      | Practice end-to-end projects            |
| Offer Stage       | Negotiation skill                 | Research comp ranges, have alternatives |

### Firm-Specific Variations

- **Jane Street**: Heavy emphasis on probability and trading games. May include mock trading sessions where you trade a simulated market.
- **Citadel/Citadel Securities**: Often starts with a HackerRank. Super day includes intense math and market questions.
- **Two Sigma**: More software engineering focused. System design questions common.
- **DE Shaw**: Known for extremely difficult math problems. Multiple rounds of increasingly hard questions.
- **Jump Trading**: C++ focused for dev roles. Low-latency system design.
- **HRT**: Balanced research + engineering. Collaborative interview style.
- **SIG**: Game theory and options questions. Known for "trading interview" with estimation.

---

## 17.5 Probability and Brain Teasers

This is the most distinctive category of quant interview questions. Firms test your ability to think clearly under pressure about uncertain outcomes.

### Framework for Approaching Problems

```
PROBLEM-SOLVING FRAMEWORK:
+------------------------------------------------------------------------+
|                                                                        |
|  1. CLARIFY                                                            |
|     - Restate the problem in your own words                            |
|     - Ask about edge cases and assumptions                             |
|     - Make sure you and the interviewer agree on the setup             |
|                                                                        |
|  2. SIMPLIFY                                                           |
|     - Start with a smaller version of the problem                      |
|     - Try specific numbers before generalizing                         |
|     - Draw a picture or diagram if helpful                             |
|                                                                        |
|  3. STRUCTURE                                                          |
|     - Identify the type: counting, expectation, conditional prob       |
|     - Choose a technique: recursion, indicator variables, symmetry     |
|     - Write down the mathematical formulation                          |
|                                                                        |
|  4. SOLVE                                                              |
|     - Work through the math carefully                                  |
|     - Check with small cases or boundary conditions                    |
|     - Verify the answer makes intuitive sense                          |
|                                                                        |
|  5. EXTEND                                                             |
|     - Can you generalize?                                              |
|     - What if the parameters changed?                                  |
|     - Is there a more elegant solution?                                |
|                                                                        |
+------------------------------------------------------------------------+
```

### Problem 1: The Unfair Coin

**Question**: You have a coin that lands heads with probability p (unknown). How can you use this coin to simulate a fair 50/50 outcome?

**Solution**: Use the von Neumann trick.

1. Flip the coin twice
2. If HT, call it "Heads" (outcome A)
3. If TH, call it "Tails" (outcome B)
4. If HH or TT, discard and repeat

**Why this works**: P(HT) = p(1-p) = P(TH). Since these two outcomes have equal probability regardless of p, we get a fair coin.

**Expected flips**: The probability of a useful pair is 2p(1-p). Expected pairs needed = 1/(2p(1-p)). For p = 0.5, expected flips = 4. For p = 0.9, expected flips = about 11.1.

---

### Problem 2: Expected Value of a Dice Game

**Question**: You roll a fair 6-sided die. You can either take the value shown (in dollars) or pay $0.50 to re-roll (as many times as you want). What is your optimal strategy and expected payoff?

**Solution**: Work backwards with optimal stopping.

If you would never re-roll, expected value = 3.5. With re-rolling, you should re-roll whenever the shown value is less than the expected value of continuing.

Let E be the expected payoff with optimal strategy.

If we re-roll on values 1, 2, 3 and keep 4, 5, 6:

- E = (1/6)(4 + 5 + 6) + (3/6)(E - 0.50)
- E = 15/6 + E/2 - 0.25
- E/2 = 2.5 - 0.25 = 2.25
- E = 4.50

Check: Should we also keep 4? Value of keeping 4 = 4. Value of re-rolling = E - 0.50 = 4.00. We are indifferent at 4 (keeping or re-rolling gives the same expected value). Our strategy is correct.

**Optimal strategy**: Re-roll on 1, 2, 3. Keep 4, 5, or 6. Expected payoff = $4.50.

---

### Problem 3: The Monty Hall Problem (Variant)

**Question**: There are 100 doors. Behind one door is a car, behind the other 99 are goats. You pick door 1. The host (who knows what is behind each door) opens 98 doors, all showing goats, leaving your door and door 67. Should you switch?

**Solution**: Yes, switch. Your initial choice had a 1/100 chance. The remaining door has a 99/100 chance. The host's action concentrates all the probability of the other 99 doors onto the single remaining door.

**General principle**: With n doors, switching gives you (n-1)/n probability of winning, staying gives 1/n.

---

### Problem 4: The Gambler's Ruin

**Question**: You start with $k. On each round, you win $1 with probability p or lose $1 with probability q = 1-p. What is the probability you reach $N before going broke ($0)?

**Solution**:

Case 1: p != q (unfair coin)
P(reach N | start at k) = (1 - (q/p)^k) / (1 - (q/p)^N)

Case 2: p = q = 0.5 (fair coin)
P(reach N | start at k) = k/N

**Example**: Starting with $20, trying to reach $100, fair coin:
P(success) = 20/100 = 0.20 = 20%

Starting with $20, trying to reach $100, p = 0.51:
P(success) = (1 - (0.49/0.51)^20) / (1 - (0.49/0.51)^100) = approximately 0.337

Even a slight edge dramatically improves your odds.

---

### Problem 5: Card Counting Expected Value

**Question**: A standard 52-card deck has 26 red and 26 black cards. You can look at cards one at a time and stop whenever you want. You are paid $1 for each red card revealed and pay $1 for each black card. What is the optimal strategy and expected value?

**Solution**: By symmetry, the expected value is $0 if you must go through the entire deck. But you can stop early.

The key insight: by optional stopping, the expected value is actually the expected number of red cards you see minus the expected number of black cards, under optimal stopping.

This is a classic result: the expected value with optimal stopping from a deck of r red and b black cards is:

E(r, b) = max(0, r/(r+b) - b/(r+b) + E(r-1, b) _ r/(r+b) + E(r, b-1) _ b/(r+b))

The answer for a standard deck is approximately $2.62.

**Intuition**: You keep drawing as long as the remaining deck is "red-heavy" and stop when it becomes balanced or black-heavy.

---

### Problem 6: The Birthday Problem (Extended)

**Question**: How many people do you need in a room for a >50% chance that at least two share a birthday?

**Solution**: Classic answer is 23.

P(no shared birthday among n people) = 365/365 _ 364/365 _ 363/365 _ ... _ (365-n+1)/365

P(no match) = Product\_{i=0}^{n-1} (365-i)/365

For n=22: P(no match) ~ 0.524, so P(match) ~ 0.476
For n=23: P(no match) ~ 0.493, so P(match) ~ 0.507

**Follow-up**: How many people for a >50% chance that someone shares YOUR birthday? Answer: 253 (very different from 23, because we fixed a specific date).

P(no one shares your birthday among n others) = (364/365)^n
Solve (364/365)^n < 0.5: n > ln(0.5) / ln(364/365) ~ 252.6, so n = 253.

---

### Problem 7: The Coupon Collector

**Question**: There are n types of coupons. Each time you buy a cereal box, you get one coupon uniformly at random. How many boxes must you buy to collect all n types (in expectation)?

**Solution**: Use linearity of expectation.

Let X_i = number of boxes needed to get a new coupon when you already have i distinct coupons.

When you have i coupons, the probability of getting a new one is (n-i)/n.
So X_i ~ Geometric((n-i)/n), and E[X_i] = n/(n-i).

E[total boxes] = Sum*{i=0}^{n-1} n/(n-i) = n \* Sum*{j=1}^{n} 1/j = n \* H_n

where H_n is the n-th harmonic number.

**Example**: For n = 10 types: E = 10 _ H_10 = 10 _ 2.9290 ~ 29.3 boxes.
For n = 50 types: E = 50 _ H_50 = 50 _ 4.499 ~ 225 boxes.

---

### Problem 8: Two Envelopes Problem

**Question**: You are given two envelopes. One contains twice the money of the other. You pick envelope A and find $100. Should you switch to envelope B?

**Solution**: The naive argument says: B contains either $50 or $200 with equal probability, so E[B] = $125 > $100, so switch. But this argument is flawed because it applies symmetrically to both envelopes, creating a paradox.

The resolution: the correct analysis depends on your prior over the possible amounts. If the amounts are (x, 2x) with equal probability of which is in which envelope, and you see $100 in A, then:

- Either x = 100 (so B has $200) or x = 50 (so B has $50)
- Without a prior over x, you cannot determine the probability of each case
- With a uniform prior, the expected value of switching depends on the prior distribution

**Key insight for interviews**: This problem tests whether you can identify flawed reasoning. The error in the naive argument is conditioning on a specific value while simultaneously treating the probability as unconditional.

---

### Problem 9: Conditional Probability -- Drug Testing

**Question**: A drug test is 99% accurate (99% true positive rate, 99% true negative rate). If 0.5% of the population uses the drug, what is the probability that a person who tests positive actually uses the drug?

**Solution**: Apply Bayes' theorem.

P(user) = 0.005
P(positive | user) = 0.99
P(positive | non-user) = 0.01

P(positive) = P(pos|user)*P(user) + P(pos|non-user)*P(non-user)
= 0.99 _ 0.005 + 0.01 _ 0.995
= 0.00495 + 0.00995
= 0.01490

P(user | positive) = P(pos|user) \* P(user) / P(positive)
= 0.00495 / 0.01490
= 0.3322

**Answer**: Only about 33.2% of people who test positive are actually users, despite the 99% accuracy. This is the base rate fallacy -- when the condition is rare, even accurate tests produce many false positives.

---

### Problem 10: The Drunk Walk

**Question**: A drunk person stands at position 0 on an integer number line. Each step, they move +1 or -1 with equal probability. What is the expected number of steps to return to 0?

**Solution**: This is a classic result from random walk theory. The probability of returning to 0 is 1 (the walk is recurrent in 1D). However, the expected time to return is infinite.

P(return to 0 at step 2n) = C(2n, n) / 4^n ~ 1/sqrt(pi \* n) by Stirling's approximation.

E[return time] = Sum\_{n=1}^{infinity} 2n \* P(first return at step 2n)

This sum diverges. So while the drunk will certainly return to 0, the expected time to do so is infinite.

**Follow-up**: In 2D (random walk on a grid), the walk is still recurrent (returns to origin with probability 1). In 3D and higher, the walk is transient (probability of return < 1). In 3D, the return probability is approximately 0.3405.

---

### Problem 11: Minimum of Uniform Random Variables

**Question**: Let X_1, X_2, ..., X_n be iid Uniform(0,1). What is E[min(X_1, ..., X_n)]?

**Solution**:
P(min > x) = P(X_1 > x, X_2 > x, ..., X_n > x) = (1-x)^n

E[min] = integral from 0 to 1 of P(min > x) dx = integral of (1-x)^n dx = 1/(n+1)

For n=1: E[min] = 1/2 (just the expected value of one uniform)
For n=2: E[min] = 1/3
For n=10: E[min] = 1/11
For n=100: E[min] = 1/101

**Insight**: This explains why, in competitive markets, the "best price" (minimum ask) gets very tight as the number of market makers (n) increases.

---

### Problem 12: Expected Number of Rolls to See All Faces

**Question**: How many times must you roll a fair 6-sided die to see all 6 faces? (This is the coupon collector for n=6.)

**Solution**: E = 6 _ H_6 = 6 _ (1 + 1/2 + 1/3 + 1/4 + 1/5 + 1/6) = 6 \* 2.45 = 14.7

---

### Problem 13: The Hat Problem

**Question**: N people each place their hat in a pile. The hats are randomly returned. What is the expected number of people who get their own hat back?

**Solution**: Use indicator random variables.

Let X_i = 1 if person i gets their own hat. E[X_i] = 1/N.

E[total matches] = Sum E[X_i] = N \* (1/N) = 1.

Regardless of N, the expected number of fixed points in a random permutation is exactly 1.

**Follow-up**: The number of fixed points follows approximately a Poisson(1) distribution for large N. So P(nobody gets their hat) ~ e^{-1} ~ 0.368.

---

### Problem 14: Dice Sum Probability

**Question**: You roll two fair 6-sided dice. What is the probability the sum is 7? What is the most likely sum?

**Solution**:
Ways to get sum 7: (1,6), (2,5), (3,4), (4,3), (5,2), (6,1) = 6 ways out of 36.
P(sum = 7) = 6/36 = 1/6.

The most likely sum is 7 (with 6 ways). The distribution is symmetric and triangular:
Sum 2: 1 way, Sum 3: 2 ways, ..., Sum 7: 6 ways, ..., Sum 12: 1 way.

---

### Problem 15: The Secretary Problem

**Question**: You interview N candidates sequentially. After each interview, you must immediately accept or reject. You cannot recall rejected candidates. What strategy maximizes the probability of selecting the best candidate?

**Solution**: The optimal strategy is:

1. Interview and reject the first N/e candidates (~37% of them)
2. After that, accept the first candidate who is better than all previously seen

This gives a probability of approximately 1/e ~ 36.8% of selecting the best candidate, regardless of N.

**Derivation**: Reject the first k candidates, then pick the next one better than all k.
P(success) = (k/N) _ Sum\_{i=k+1}^{N} (1/i) _ (1/(i-1)) ... simplifies to:
Optimal k ~ N/e, giving P(success) -> 1/e as N -> infinity.

**Relevance to trading**: This is an optimal stopping problem, directly analogous to deciding when to enter a trade based on observed prices.

---

### Problem 16: Coin Flip Sequences

**Question**: On average, how many fair coin flips does it take to see the sequence HH (two heads in a row)? What about HT?

**Solution for HH**:
Let E be the expected flips to see HH. Define states:

- State 0: No progress (start)
- State 1: Just flipped H
- State 2: HH (done)

E_0 = 1 + (1/2)E_1 + (1/2)E_0
E_1 = 1 + (1/2)(0) + (1/2)E_0 [if H, done; if T, restart]

Wait, let me be more careful:
E_1 = 1 + (1/2)*0 + (1/2)*E_0 <-- This is wrong. If we are in state 1 (just saw H) and flip H, we reach HH (state 2), so we add 1 flip and are done. If we flip T, we go back to state 0.

Actually: E_1 = 1 + (1/2)(0) + (1/2)(E_0) means after one flip from state 1, with prob 1/2 we are done (add 0 more), with prob 1/2 we restart.

From state 0: E_0 = 1 + (1/2)E_1 + (1/2)E_0

From E_1: E_1 = 1 + (1/2)E_0
Substitute: E_0 = 1 + (1/2)(1 + (1/2)E_0) + (1/2)E_0
E_0 = 1 + 1/2 + (1/4)E_0 + (1/2)E_0
E_0 = 3/2 + (3/4)E_0
(1/4)E_0 = 3/2
E_0 = 6

**Expected flips for HH = 6.**

**Solution for HT**:

- State 0: No progress
- State 1: Just flipped H

E_0 = 1 + (1/2)E_1 + (1/2)E_0
E_1 = 1 + (1/2)E_1 + (1/2)(0) [if H, stay in state 1; if T, done]

From E_1: E_1 = 1 + (1/2)E_1 -> E_1/2 = 1 -> E_1 = 2
From E_0: E_0 = 1 + (1/2)(2) + (1/2)E_0 = 2 + (1/2)E_0 -> E_0 = 4

**Expected flips for HT = 4.**

**Key insight**: HH takes longer than HT because after seeing HT-fail (seeing HH when wanting HT... no, rather: after failing to complete HH by getting a T, you lose all progress. After failing to complete HT by getting another H, you still have the H and can try again). This asymmetry is counterintuitive and a favorite interview question.

---

### Problem 17: Geometric Expected Value

**Question**: I flip a fair coin until I get heads. If it takes n flips, you pay me $2^n. What is the expected amount you pay? Would you play this game?

**Solution**: This is the St. Petersburg paradox.

E[payment] = Sum*{n=1}^{infinity} 2^n \* (1/2)^n = Sum*{n=1}^{infinity} 1 = infinity

The expected value is infinite, but no rational person would pay more than about $20-30 to play this game. This illustrates the difference between expected value and expected utility.

**Resolution via utility theory**: If utility is logarithmic (U = log(wealth)), a person with wealth W would pay at most about $2 \* log2(W) to play.

---

### Problem 18: The Prisoner Puzzle

**Question**: 100 prisoners are numbered 1-100. 100 boxes each contain a random prisoner number. Each prisoner can open 50 boxes. If ALL prisoners find their own number, they all go free. They can strategize beforehand but cannot communicate during. What strategy maximizes their chance of freedom?

**Solution**: The optimal strategy is to follow the cycle.

1. Prisoner k starts by opening box k
2. If box k contains number j, they open box j next
3. Continue following the chain until finding their number or running out of opens

This works because the random permutation decomposes into cycles. A prisoner succeeds if and only if their cycle has length <= 50.

P(all succeed) = P(no cycle longer than 50 in a random permutation of 100)

P(all succeed) ~ 1 - ln(2) ~ 0.3069 (approximately 31%)

Without this strategy, each prisoner succeeds with probability 50/100 = 0.5, and the joint probability would be 0.5^100 ~ 10^{-30}. The cycle strategy improves the odds by a factor of about 10^{29}.

---

### Problem 19: Broken Stick Problem

**Question**: A stick of length 1 is broken at two random points. What is the probability the three pieces form a triangle?

**Solution**: For three lengths to form a triangle, each must be less than the sum of the other two. Equivalently, no piece can be >= 1/2.

Let the break points be U and V, uniform on (0,1). The three pieces have lengths: min(U,V), |U-V|, and 1-max(U,V).

The triangle inequality requires all three pieces < 1/2.

By geometric probability (drawing the unit square and shading the valid region):

P(triangle) = 1/4.

---

### Problem 20: Ant on a Triangle

**Question**: Three ants sit at the three corners of an equilateral triangle. Each ant randomly picks a direction (clockwise or counterclockwise) and walks along the edge. What is the probability that no two ants collide?

**Solution**: There are 2^3 = 8 equally likely combinations of directions. Ants avoid collision only if ALL go clockwise or ALL go counterclockwise.

P(no collision) = 2/8 = 1/4.

**Generalization**: For n ants on an n-gon: P(no collision) = 2/2^n = 2^{1-n}.

---

### Problem 21: Estimating Pi with Random Points

**Question**: Describe how to estimate pi using random numbers. (Fermi estimation / Monte Carlo)

**Solution**: Inscribe a circle of radius 1 in a square of side length 2.

1. Generate random points (x, y) uniformly in [-1, 1] x [-1, 1]
2. Check if x^2 + y^2 <= 1 (inside the circle)
3. pi/4 = (area of circle)/(area of square) ~ (points inside)/(total points)
4. pi ~ 4 \* (points inside) / (total points)

With N points, the error is O(1/sqrt(N)). For 4 significant digits, you need ~10^8 points.

---

### Problem 22: The 100-Sided Die

**Question**: You roll a fair 100-sided die repeatedly and sum the results. What is the probability the running sum ever equals exactly 100?

**Solution**: This is related to renewal theory. The probability that a random walk with Uniform(1, 100) steps ever hits exactly 100 is:

For a die with faces 1 through n, the probability of ever hitting exactly n is:

P = (2^{n-1})/n! ... actually this is more complex.

For practical purposes: think about it recursively. Let p(k) = probability of ever hitting exactly k.

p(k) = (1/100) \* Sum\_{j=1}^{min(k,100)} p(k-j), with p(0) = 1.

For k = 100, the answer can be computed numerically and is approximately 1/50.5 ~ 0.0198 (roughly 2%).

**Interview tip**: It is perfectly acceptable to set up the recursion and explain the approach without computing the exact numerical answer.

---

### Additional Quick Problems

**Problem 23**: What is P(max of two standard normal random variables > 0)?
Answer: 3/4. P(max > 0) = 1 - P(both <= 0) = 1 - (1/2)(1/2) = 3/4 (by independence).

**Problem 24**: You have 12 balls, one is heavier or lighter. Using a balance scale at most 3 times, find the odd ball and determine if it is heavier or lighter.
This is a classic information theory puzzle. With 3 weighings, you get 3^3 = 27 outcomes. You need to distinguish among 24 possibilities (12 balls \* 2 states), which fits within 27.

**Problem 25**: A fair coin is flipped 1000 times. What is the expected number of runs (consecutive sequences of the same side)?
Answer: 500.5. Each position 2 through 1000 starts a new run with probability 1/2 (when it differs from the previous flip). Expected runs = 1 + 999 \* (1/2) = 500.5.

---

## 17.6 Statistics and Math Questions

These questions test your understanding of the mathematical foundations that underpin quantitative trading.

### Problem S1: Distribution Identification

**Question**: Daily returns of a stock have the following properties: mean = 0.05%, standard deviation = 1.5%, skewness = -0.3, kurtosis = 5.2. What distribution would you use to model these returns and why?

**Solution**: The normal distribution has skewness = 0 and kurtosis = 3. Our data shows negative skewness (left tail is heavier) and excess kurtosis of 2.2 (fat tails). Good candidates:

1. **Student's t-distribution**: Captures fat tails via degrees-of-freedom parameter. A t-distribution with ~5-7 df would approximate kurtosis ~5. However, the standard t is symmetric, so it does not capture skewness.

2. **Skewed t-distribution** (Hansen's): Adds a skewness parameter to the t-distribution. Best choice for this data.

3. **Generalized Hyperbolic distribution**: Very flexible, used in practice at many funds.

4. **Normal-Inverse Gaussian (NIG)**: A subclass of generalized hyperbolic, popular in quantitative finance.

**Key points to mention**: Financial returns universally show fat tails and negative skewness (crashes are more extreme than rallies). Using a normal distribution underestimates tail risk and leads to VaR violations.

---

### Problem S2: Hypothesis Testing in Trading

**Question**: You run a backtest that produces a Sharpe ratio of 1.5 over 5 years of daily data. Is this statistically significant?

**Solution**:

The standard error of the Sharpe ratio is approximately 1/sqrt(T) where T is the number of years (under IID assumption).

SE(SR) ~ 1/sqrt(5) ~ 0.447

Test statistic: z = SR / SE(SR) = 1.5 / 0.447 ~ 3.35

p-value ~ 0.0004 (two-sided), which is highly significant.

**But there are critical caveats**:

1. **Multiple testing**: If you tested 100 strategies and picked the best one, the threshold should be adjusted. Using Bonferroni: alpha/100 = 0.0005. Our p-value of 0.0004 barely passes.

2. **Non-IID returns**: Autocorrelated returns inflate the effective Sharpe ratio. The adjusted SE under autocorrelation is:
   SE_adj = sqrt((1 + 2\*sum(rho_k))/T), which can be much larger.

3. **Overfitting**: Backtesting involves implicit data snooping. Marcos Lopez de Prado suggests requiring a minimum backtest length (MBTL) or using the deflated Sharpe ratio.

4. **Rule of thumb**: In practice, many quants require a backtest Sharpe > 2.0 before considering a strategy for live deployment, accounting for degradation between backtest and live.

---

### Problem S3: Regression Interpretation

**Question**: You regress daily stock returns (Y) on market returns (X) and get:
Y = 0.001 + 1.3X + epsilon, R^2 = 0.65, t-stat for beta = 45.2

Interpret each component.

**Solution**:

- **Alpha (0.001)**: The stock earns 0.1% per day (about 25% annualized) after controlling for market exposure. This seems very high and likely reflects either survivorship bias, data error, or a specific time period.

- **Beta (1.3)**: The stock moves 1.3% for every 1% market move. This is an aggressive stock -- more volatile than the market. It amplifies both up and down moves.

- **R^2 (0.65)**: 65% of the stock's variance is explained by market movements. The remaining 35% is idiosyncratic risk (firm-specific factors).

- **t-stat (45.2)**: Beta is extremely statistically significant. With ~1,260 observations (5 years daily), this is expected for a liquid stock.

**Follow-up questions**:

- "Is this alpha exploitable?" Probably not -- after transaction costs, market impact, and adjusting for risk factors (Fama-French), the alpha likely disappears.
- "What would you do next?" Add more factors (SMB, HML, momentum, quality) and check if the alpha persists. Test out-of-sample.

---

### Problem S4: Time Series Stationarity

**Question**: How do you test whether a time series is stationary? Why does it matter for trading?

**Solution**:

**Tests for stationarity**:

1. **Augmented Dickey-Fuller (ADF) test**: H0: unit root (non-stationary). Reject if test statistic < critical value (more negative). Most common test.
2. **KPSS test**: H0: stationary. Reject if test statistic > critical value. Useful as a complement to ADF.
3. **Phillips-Perron test**: Robust version of ADF, handles serial correlation and heteroskedasticity.

**Why it matters**:

- Most statistical models (linear regression, ARMA) assume stationarity
- Non-stationary series produce spurious correlations (Granger and Newbold, 1974)
- Price series are typically non-stationary (unit root), but returns are usually stationary
- For pairs trading: you need the spread to be stationary (cointegrated)
- A trading strategy built on non-stationary relationships will likely fail out-of-sample

**Making series stationary**:

- Differencing: returns = diff(log(prices))
- Detrending: subtract rolling mean or fitted trend
- Seasonal adjustment: remove seasonal components
- For cointegration: find a linear combination of non-stationary series that is stationary

---

### Problem S5: Autocorrelation in Returns

**Question**: You compute the autocorrelation function (ACF) of daily stock returns and find significant positive autocorrelation at lag 1 (rho_1 = 0.08, p < 0.01). How would you exploit this?

**Solution**:

**Interpretation**: Positive lag-1 autocorrelation means today's return predicts tomorrow's return in the same direction (momentum at the daily level).

**Strategy**: Simple momentum rule -- if today's return is positive, go long tomorrow; if negative, go short.

**Expected Sharpe ratio**:

- If rho*1 = 0.08 and daily vol = 1.5%, the daily expected return from this strategy is approximately rho_1 * sigma ~ 0.08 \_ 1.5% = 0.12%.
- Annualized return ~ 0.12% \* 252 ~ 30%.
- Annualized Sharpe ~ 0.08 \* sqrt(252) ~ 1.27.

**Reality checks**:

1. Transaction costs will eat significantly into this return
2. The autocorrelation may not be stable over time
3. For liquid large-cap stocks, autocorrelation is usually near zero (efficient markets). Significant autocorrelation is more likely in illiquid or small-cap stocks.
4. Autocorrelation in absolute returns (volatility clustering) is much more persistent and exploitable (GARCH models).

---

### Problem S6: PCA and Dimensionality Reduction

**Question**: You have daily returns for 500 stocks over 10 years. How would you use PCA, and what would you expect to find?

**Solution**:

**Procedure**:

1. Compute the 500x500 correlation matrix of daily returns
2. Eigendecompose: find eigenvalues and eigenvectors
3. Sort by eigenvalue magnitude (descending)

**Expected findings**:

- **PC1** (largest eigenvalue, ~25-40% of variance): The market factor. All stocks load positively on this component. It is essentially the broad market return.
- **PC2-PC5** (~5-15% combined): Sector/industry factors. These capture sector-level correlations (tech vs. financials vs. energy).
- **PC6-PC20** (~10-20% combined): Style factors (value, momentum, size, quality).
- **Remaining PCs**: Mostly noise.

**Application to trading**:

- Use top k PCs as risk factors in a factor model
- Project returns onto PCs to construct factor-neutral portfolios
- Statistical arbitrage: find stocks with residual returns (alpha) after removing factor exposure
- Dimensionality reduction for ML models: use PC scores instead of raw returns

**Key formula**: If lambda_i is the i-th eigenvalue, the proportion of variance explained = lambda_i / sum(all lambda_j).

---

### Problem S7: Maximum Likelihood Estimation

**Question**: You observe n data points from an exponential distribution with unknown parameter lambda. Derive the MLE for lambda.

**Solution**:

The exponential PDF: f(x|lambda) = lambda _ exp(-lambda _ x) for x >= 0.

Log-likelihood:
l(lambda) = Sum\_{i=1}^{n} log(lambda _ exp(-lambda _ x*i))
= n * log(lambda) - lambda \_ Sum(x_i)

Take derivative and set to zero:
dl/dlambda = n/lambda - Sum(x_i) = 0
lambda_MLE = n / Sum(x_i) = 1 / x_bar

**Properties of this MLE**:

- Consistent: converges to true lambda as n -> infinity
- Asymptotically efficient: achieves the Cramer-Rao lower bound
- But biased in finite samples: E[1/x_bar] != lambda in general

**Fisher Information**: I(lambda) = n/lambda^2. Cramer-Rao bound: Var(lambda_hat) >= lambda^2/n.

---

### Problem S8: Cointegration vs Correlation

**Question**: Explain the difference between correlation and cointegration. Give an example relevant to trading.

**Solution**:

**Correlation**: Measures the linear relationship between returns (stationary series). Two stocks can be highly correlated in returns but drift apart in price levels.

**Cointegration**: A long-term equilibrium relationship between price levels (non-stationary series). If prices X_t and Y_t are cointegrated, there exists a linear combination beta such that X_t - beta\*Y_t is stationary (mean-reverting).

```
CORRELATION vs COINTEGRATION:

Correlated but NOT cointegrated:
Price     Stock A       Stock B
  ^       /              /
  |     /             /
  |   /            /         Returns move together,
  | /           /            but prices can diverge
  +---------------> Time     permanently

Cointegrated:
Price     Stock A       Stock B
  ^       /\   /\        /\ /\
  |     /  \ /  \      /  X  \     Prices may diverge
  |   /    X    \   /  / \  \    temporarily but
  | /   /  \    \/   /    \  \   always revert
  +----------------------------> Time
```

**Trading example**: Coca-Cola (KO) and PepsiCo (PEP) may be cointegrated. Their stock prices share a long-term equilibrium because they operate in the same industry with similar fundamentals. When the spread widens beyond its historical range, you go long the underperformer and short the outperformer, expecting mean reversion.

**Testing for cointegration**: Engle-Granger two-step procedure or Johansen test.

---

### Problem S9: Ito's Lemma Application

**Question**: Stock price follows geometric Brownian motion: dS = mu*S*dt + sigma*S*dW. What is the process followed by log(S)?

**Solution**: Apply Ito's lemma with f(S) = log(S).

df/dS = 1/S
d^2f/dS^2 = -1/S^2

Ito's lemma: df = (df/dS)_dS + (1/2)_(d^2f/dS^2)\*(dS)^2

Since (dS)^2 = sigma^2 _ S^2 _ dt (keeping only the dt term):

d(log S) = (1/S)(mu*S*dt + sigma*S*dW) + (1/2)(-1/S^2)(sigma^2*S^2*dt)
= (mu - sigma^2/2)*dt + sigma*dW

**Key result**: log(S_t) ~ Normal(log(S_0) + (mu - sigma^2/2)*t, sigma^2*t)

This is why stock prices are log-normally distributed under GBM. The term -sigma^2/2 is the "Ito correction" or "convexity adjustment" -- it reflects the difference between arithmetic and geometric average returns.

---

### Problem S10: Central Limit Theorem Application

**Question**: A portfolio holds 100 independent positions, each with daily P&L that has mean $1,000 and standard deviation $10,000. What is the distribution of total daily P&L? What is P(total loss > $50,000)?

**Solution**:

By CLT, the sum of 100 independent random variables is approximately normal.

Total mean = 100 _ $1,000 = $100,000
Total std dev = $10,000 _ sqrt(100) = $100,000

P&L ~ Normal($100,000, $100,000^2)

P(loss > $50,000) = P(P&L < -$50,000)
z = (-50,000 - 100,000) / 100,000 = -1.5
P(z < -1.5) = 0.0668 (about 6.7%)

**Caveats**:

- Independence assumption is unrealistic (positions are often correlated, especially during market stress)
- With correlation rho between all pairs: Total variance = 100 _ sigma^2 _ (1 + 99\*rho)
- If rho = 0.3: Total std = $10,000 _ sqrt(100 _ (1 + 99*0.3)) = $10,000 * sqrt(3070) ~ $554,000. Much larger.

---

### Problem S11: Bayesian Updating

**Question**: You believe a stock has a 60% chance of going up tomorrow. You observe that the CEO just bought $10M of stock. Given a CEO buy, stocks go up 70% of the time. If the CEO does NOT buy, stocks go up 55% of the time. Update your probability.

**Solution**: This is a straightforward application of Bayes' theorem.

Wait -- we need to be careful. We need more information about the prior probability of a CEO buy. Let us assume CEO buys happen with probability 5% on any given day.

P(up) = 0.60 (our prior)
P(CEO buy | up) = ?
P(CEO buy | down) = ?

Actually, the problem gives us: P(up | CEO buy) = 0.70 and P(up | no CEO buy) = 0.55. We also need P(CEO buy).

Using the law of total probability:
P(up) = P(up | CEO buy)*P(CEO buy) + P(up | no CEO buy)*P(no CEO buy)
0.60 = 0.70*P(CEO buy) + 0.55*(1 - P(CEO buy))
0.60 = 0.55 + 0.15\*P(CEO buy)
P(CEO buy) = 0.05/0.15 = 1/3

Given that we observe a CEO buy:
**P(up | CEO buy) = 0.70**

Our updated probability should be 70%.

**Interview insight**: This problem tests whether you can correctly apply Bayes' theorem and notice when the problem is over-determined or under-determined.

---

### Problem S12: Law of Large Numbers in Trading

**Question**: Your strategy has a win rate of 52% with equal-sized wins and losses. How many trades do you need to be 95% confident you are profitable overall?

**Solution**:

Each trade is a Bernoulli trial with p = 0.52. After n trades, profit = (#wins - #losses) \* size.

Expected profit per trade = 0.52 - 0.48 = 0.04 (in units of trade size)
Std dev per trade = sqrt(p*(1-p)) = sqrt(0.52*0.48) = 0.4998

After n trades:
Expected total = 0.04n
Std dev total = 0.4998 \* sqrt(n)

For 95% confidence of profit (i.e., P(total > 0) > 0.95):
z = 0.04n / (0.4998 _ sqrt(n)) = 0.04 _ sqrt(n) / 0.4998

Need z > 1.645 (one-sided 95%):
0.04 \* sqrt(n) / 0.4998 > 1.645
sqrt(n) > 20.56
n > 422.7

**Answer**: You need approximately 423 trades to be 95% confident of profitability.

**Practical insight**: This shows why even with a genuine edge, you need significant sample size to distinguish skill from luck. A 52% win rate is hard to distinguish from 50% with fewer than ~400 trades.

---

### Problem S13: Monte Carlo for Options Pricing

**Question**: Describe how to price a European call option using Monte Carlo simulation.

**Solution**:

```
MONTE CARLO PRICING ALGORITHM:

1. Set parameters:
   S0 = current stock price
   K  = strike price
   r  = risk-free rate
   T  = time to expiration
   sigma = volatility
   N  = number of simulations

2. For each simulation i = 1 to N:
   a. Generate Z ~ N(0,1)
   b. Simulate terminal price:
      S_T = S0 * exp((r - sigma^2/2)*T + sigma*sqrt(T)*Z)
   c. Compute payoff:
      payoff_i = max(S_T - K, 0)

3. Estimate option price:
   C = exp(-r*T) * (1/N) * Sum(payoff_i)

4. Standard error:
   SE = std(payoffs) / sqrt(N) * exp(-r*T)
```

**Variance reduction techniques**:

- Antithetic variates: for each Z, also use -Z
- Control variates: use a correlated variable with known expectation
- Importance sampling: change the probability measure to sample important regions more
- Stratified sampling: divide Z into strata and sample from each

**Convergence**: Monte Carlo error = O(1/sqrt(N)), regardless of dimensionality. This makes it especially useful for multi-dimensional problems (basket options, path-dependent options) where PDE methods become impractical.

---

### Problem S14: Eigenvalue Interpretation

**Question**: You compute the eigenvalues of a 3x3 covariance matrix of stock returns and get: 0.05, 0.02, 0.001. Interpret these values.

**Solution**:

Each eigenvalue represents the variance explained by the corresponding principal component (eigenvector).

Total variance = 0.05 + 0.02 + 0.001 = 0.071

- **PC1**: 0.05/0.071 = 70.4% of total variance. This is the dominant risk factor (likely the market factor).
- **PC2**: 0.02/0.071 = 28.2% of total variance. A secondary factor (perhaps sector rotation).
- **PC3**: 0.001/0.071 = 1.4% of total variance. Essentially noise -- this dimension carries almost no risk.

**Condition number**: max_eigenvalue / min_eigenvalue = 0.05/0.001 = 50. This indicates moderate ill-conditioning. If the condition number exceeds 100-1000, the covariance matrix is poorly conditioned and portfolio optimization will be unstable (small estimation errors lead to extreme portfolio weights).

**Application**: Use the eigenvectors to construct uncorrelated risk factors. Position the portfolio to be neutral to PC1 (market neutral) and trade the spread defined by PC3 (the stable, low-variance component).

---

### Problem S15: Order Statistics

**Question**: You observe daily returns for 252 trading days. What is the expected value of the maximum daily return if returns are N(0, 0.015)?

**Solution**:

For the maximum of n iid standard normal variables:
E[max(Z_1, ..., Z_n)] ~ sqrt(2*ln(n)) - ln(ln(n)) + ln(4*pi) / (2*sqrt(2*ln(n)))

For n = 252:
E[max(Z)] ~ sqrt(2*ln(252)) ~ sqrt(2*5.53) ~ sqrt(11.06) ~ 3.33

Since our returns have mean 0 and std 0.015:
E[max return] ~ 0 + 0.015 \* 3.33 ~ 0.050 = 5.0%

**Practical meaning**: Even with zero expected return, you should expect the best day in a year to be about a +5% return (and the worst day about -5%). This is important for calibrating expectations about extreme events -- they are expected, not anomalous.

---

## 17.7 Coding Interviews

### 17.7.1 Data Structures and Algorithms

Standard software engineering interview preparation applies. The most frequently tested topics in quant coding interviews:

```
+------------------------------------------------------------------------+
|              QUANT CODING INTERVIEW TOPIC FREQUENCY                    |
+------------------------------------------------------------------------+
|                                                                        |
|  VERY COMMON:                                                          |
|  - Arrays and strings (sliding window, two pointers)                   |
|  - Hash maps (frequency counting, lookup)                              |
|  - Binary search (on sorted data, on answer space)                     |
|  - Sorting (custom comparators)                                        |
|  - Dynamic programming (optimal strategy problems)                     |
|  - Trees and heaps (priority queues for order books)                   |
|                                                                        |
|  COMMON:                                                               |
|  - Graphs (BFS/DFS, shortest path)                                    |
|  - Stacks and queues (monotonic stack for price problems)              |
|  - Linked lists (LRU cache)                                           |
|  - Bit manipulation (for HFT/systems roles)                           |
|                                                                        |
|  LESS COMMON BUT TESTED:                                               |
|  - Segment trees / Fenwick trees (range queries on order book)         |
|  - Union-Find (connected components in correlation graphs)             |
|  - Tries (ticker symbol lookup)                                       |
|                                                                        |
+------------------------------------------------------------------------+
```

### 17.7.2 Python-Specific Tasks

**Task P1: Rolling Statistics with Pandas**

```python
"""
Given a DataFrame of daily stock prices, compute:
1. 20-day rolling mean
2. 20-day rolling std
3. Bollinger Bands (mean +/- 2*std)
4. Z-score of current price relative to rolling window
"""
import pandas as pd
import numpy as np

def compute_bollinger(prices: pd.Series, window: int = 20) -> pd.DataFrame:
    rolling_mean = prices.rolling(window=window).mean()
    rolling_std = prices.rolling(window=window).std()

    return pd.DataFrame({
        'price': prices,
        'rolling_mean': rolling_mean,
        'upper_band': rolling_mean + 2 * rolling_std,
        'lower_band': rolling_mean - 2 * rolling_std,
        'z_score': (prices - rolling_mean) / rolling_std
    })
```

**Task P2: Vectorized Return Calculation**

```python
"""
Given a DataFrame with columns: 'timestamp', 'open', 'high', 'low', 'close', 'volume'
Compute various return measures efficiently (no loops).
"""
import pandas as pd
import numpy as np

def compute_returns(df: pd.DataFrame) -> pd.DataFrame:
    result = df.copy()

    # Simple returns
    result['simple_return'] = df['close'].pct_change()

    # Log returns
    result['log_return'] = np.log(df['close'] / df['close'].shift(1))

    # Intraday return (open to close)
    result['intraday_return'] = (df['close'] - df['open']) / df['open']

    # Overnight return (previous close to open)
    result['overnight_return'] = (df['open'] - df['close'].shift(1)) / df['close'].shift(1)

    # Cumulative return
    result['cumulative_return'] = (1 + result['simple_return']).cumprod() - 1

    return result
```

### 17.7.3 Implement an Order Book

This is one of the most common quant-specific coding questions.

```python
"""
Implement a Limit Order Book that supports:
- Add order (buy or sell, price, quantity)
- Cancel order (by order ID)
- Get best bid/ask
- Match orders (price-time priority)
"""
from collections import defaultdict
from typing import Optional
import heapq

class Order:
    __slots__ = ['order_id', 'side', 'price', 'quantity', 'timestamp']

    def __init__(self, order_id: int, side: str, price: float,
                 quantity: int, timestamp: int):
        self.order_id = order_id
        self.side = side
        self.price = price
        self.quantity = quantity
        self.timestamp = timestamp


class OrderBook:
    def __init__(self):
        # Max heap for bids (negate price for max-heap behavior)
        self._bids: list[tuple[float, int, Order]] = []
        # Min heap for asks
        self._asks: list[tuple[float, int, Order]] = []
        # Quick lookup by order_id
        self._orders: dict[int, Order] = {}
        # Track cancelled orders
        self._cancelled: set[int] = set()
        self._timestamp = 0

    def add_order(self, order_id: int, side: str, price: float,
                  quantity: int) -> list[tuple[int, int, float, int]]:
        """Add an order and return list of fills:
           [(buy_id, sell_id, fill_price, fill_qty), ...]"""
        self._timestamp += 1
        order = Order(order_id, side, price, quantity, self._timestamp)
        fills = []

        if side == 'buy':
            fills = self._match_buy(order)
        else:
            fills = self._match_sell(order)

        # If order still has remaining quantity, add to book
        if order.quantity > 0:
            self._orders[order_id] = order
            if side == 'buy':
                heapq.heappush(self._bids,
                               (-price, order.timestamp, order))
            else:
                heapq.heappush(self._asks,
                               (price, order.timestamp, order))

        return fills

    def _match_buy(self, buy_order: Order) -> list[tuple]:
        fills = []
        while (buy_order.quantity > 0 and self._asks and
               self._asks[0][0] <= buy_order.price):
            # Clean up cancelled orders
            while self._asks and self._asks[0][2].order_id in self._cancelled:
                heapq.heappop(self._asks)

            if not self._asks or self._asks[0][0] > buy_order.price:
                break

            ask_price, _, ask_order = self._asks[0]
            fill_qty = min(buy_order.quantity, ask_order.quantity)
            fill_price = ask_price  # Price-time priority: fill at resting order price

            fills.append((buy_order.order_id, ask_order.order_id,
                         fill_price, fill_qty))

            buy_order.quantity -= fill_qty
            ask_order.quantity -= fill_qty

            if ask_order.quantity == 0:
                heapq.heappop(self._asks)
                self._orders.pop(ask_order.order_id, None)

        return fills

    def _match_sell(self, sell_order: Order) -> list[tuple]:
        fills = []
        while (sell_order.quantity > 0 and self._bids and
               -self._bids[0][0] >= sell_order.price):
            while self._bids and self._bids[0][2].order_id in self._cancelled:
                heapq.heappop(self._bids)

            if not self._bids or -self._bids[0][0] < sell_order.price:
                break

            neg_bid_price, _, bid_order = self._bids[0]
            bid_price = -neg_bid_price
            fill_qty = min(sell_order.quantity, bid_order.quantity)

            fills.append((bid_order.order_id, sell_order.order_id,
                         bid_price, fill_qty))

            sell_order.quantity -= fill_qty
            bid_order.quantity -= fill_qty

            if bid_order.quantity == 0:
                heapq.heappop(self._bids)
                self._orders.pop(bid_order.order_id, None)

        return fills

    def cancel_order(self, order_id: int) -> bool:
        if order_id in self._orders:
            self._cancelled.add(order_id)
            del self._orders[order_id]
            return True
        return False

    def best_bid(self) -> Optional[float]:
        while self._bids and self._bids[0][2].order_id in self._cancelled:
            heapq.heappop(self._bids)
        return -self._bids[0][0] if self._bids else None

    def best_ask(self) -> Optional[float]:
        while self._asks and self._asks[0][2].order_id in self._cancelled:
            heapq.heappop(self._asks)
        return self._asks[0][0] if self._asks else None

    def spread(self) -> Optional[float]:
        bid, ask = self.best_bid(), self.best_ask()
        if bid is not None and ask is not None:
            return ask - bid
        return None
```

### 17.7.4 Streaming VWAP Calculator

```python
"""
Implement a Volume-Weighted Average Price (VWAP) calculator
that processes streaming trade data.

VWAP = Sum(price_i * volume_i) / Sum(volume_i)
"""
from collections import deque
from typing import Optional

class StreamingVWAP:
    """Calculates VWAP over a sliding time window."""

    def __init__(self, window_seconds: int = 3600):
        self._window = window_seconds
        self._trades: deque[tuple[float, float, float]] = deque()
        self._cumulative_pv = 0.0  # price * volume
        self._cumulative_vol = 0.0

    def add_trade(self, timestamp: float, price: float,
                  volume: float) -> float:
        """Add a trade and return the current VWAP."""
        # Add new trade
        pv = price * volume
        self._trades.append((timestamp, pv, volume))
        self._cumulative_pv += pv
        self._cumulative_vol += volume

        # Remove expired trades
        cutoff = timestamp - self._window
        while self._trades and self._trades[0][0] < cutoff:
            _, old_pv, old_vol = self._trades.popleft()
            self._cumulative_pv -= old_pv
            self._cumulative_vol -= old_vol

        return self.vwap()

    def vwap(self) -> Optional[float]:
        if self._cumulative_vol == 0:
            return None
        return self._cumulative_pv / self._cumulative_vol

    def volume(self) -> float:
        return self._cumulative_vol
```

### 17.7.5 Moving Average Calculator

```python
"""
Implement efficient moving average calculators for streaming data.
"""

class SimpleMovingAverage:
    """O(1) update, O(1) query SMA."""

    def __init__(self, window: int):
        self._window = window
        self._values: deque[float] = deque()
        self._sum = 0.0

    def update(self, value: float) -> float:
        self._values.append(value)
        self._sum += value

        if len(self._values) > self._window:
            self._sum -= self._values.popleft()

        return self._sum / len(self._values)


class ExponentialMovingAverage:
    """O(1) update, O(1) query EMA. No storage needed."""

    def __init__(self, span: int):
        self._alpha = 2.0 / (span + 1)
        self._ema: Optional[float] = None

    def update(self, value: float) -> float:
        if self._ema is None:
            self._ema = value
        else:
            self._ema = self._alpha * value + (1 - self._alpha) * self._ema
        return self._ema
```

### 17.7.6 Black-Scholes Implementation

```python
"""
Implement Black-Scholes option pricing for European options.
"""
import math
from scipy.stats import norm

def black_scholes(S: float, K: float, T: float, r: float,
                  sigma: float, option_type: str = 'call') -> dict:
    """
    S:     Current stock price
    K:     Strike price
    T:     Time to expiration (years)
    r:     Risk-free rate (annualized)
    sigma: Volatility (annualized)

    Returns: dict with price, delta, gamma, theta, vega, rho
    """
    if T <= 0:
        if option_type == 'call':
            return {'price': max(S - K, 0), 'delta': 1.0 if S > K else 0.0,
                    'gamma': 0.0, 'theta': 0.0, 'vega': 0.0, 'rho': 0.0}
        else:
            return {'price': max(K - S, 0), 'delta': -1.0 if S < K else 0.0,
                    'gamma': 0.0, 'theta': 0.0, 'vega': 0.0, 'rho': 0.0}

    sqrt_T = math.sqrt(T)
    d1 = (math.log(S / K) + (r + sigma**2 / 2) * T) / (sigma * sqrt_T)
    d2 = d1 - sigma * sqrt_T

    # Standard normal PDF and CDF
    N_d1 = norm.cdf(d1)
    N_d2 = norm.cdf(d2)
    n_d1 = norm.pdf(d1)

    if option_type == 'call':
        price = S * N_d1 - K * math.exp(-r * T) * N_d2
        delta = N_d1
        theta = (-(S * n_d1 * sigma) / (2 * sqrt_T)
                 - r * K * math.exp(-r * T) * N_d2)
        rho = K * T * math.exp(-r * T) * N_d2
    else:  # put
        N_neg_d1 = norm.cdf(-d1)
        N_neg_d2 = norm.cdf(-d2)
        price = K * math.exp(-r * T) * N_neg_d2 - S * N_neg_d1
        delta = N_d1 - 1
        theta = (-(S * n_d1 * sigma) / (2 * sqrt_T)
                 + r * K * math.exp(-r * T) * N_neg_d2)
        rho = -K * T * math.exp(-r * T) * N_neg_d2

    # Greeks common to both
    gamma = n_d1 / (S * sigma * sqrt_T)
    vega = S * n_d1 * sqrt_T  # per 1 unit change in sigma

    return {
        'price': price,
        'delta': delta,
        'gamma': gamma,
        'theta': theta / 365,  # daily theta
        'vega': vega / 100,    # per 1% change in vol
        'rho': rho / 100       # per 1% change in rate
    }


def implied_volatility(market_price: float, S: float, K: float,
                       T: float, r: float,
                       option_type: str = 'call') -> float:
    """
    Find implied volatility using Newton-Raphson method.
    """
    sigma = 0.3  # initial guess

    for _ in range(100):
        result = black_scholes(S, K, T, r, sigma, option_type)
        diff = result['price'] - market_price

        if abs(diff) < 1e-8:
            return sigma

        # vega was scaled by 100, undo for Newton step
        vega_unscaled = result['vega'] * 100
        if abs(vega_unscaled) < 1e-12:
            break

        sigma = sigma - diff / vega_unscaled
        sigma = max(sigma, 0.001)  # keep sigma positive

    return sigma
```

### 17.7.7 System Design: Trading System

**Question**: Design a real-time trading system that can handle 100,000 messages per second.

```
+------------------------------------------------------------------------+
|              TRADING SYSTEM ARCHITECTURE                               |
+------------------------------------------------------------------------+
|                                                                        |
|  MARKET DATA         STRATEGY ENGINE        ORDER MANAGEMENT           |
|  +----------------+  +------------------+  +-------------------+       |
|  | Feed Handlers  |  | Signal Generator |  | Order Router      |       |
|  |   |            |  |   |              |  |   |               |       |
|  | Normalizer     |  | Risk Checks     |  | Exchange Gateway  |       |
|  |   |            |  |   |              |  |   |               |       |
|  | Book Builder   |  | Position Manager |  | Fill Handler      |       |
|  +-------+--------+  +--------+---------+  +--------+----------+       |
|          |                     |                     |                  |
|          v                     v                     v                  |
|  +-----------------------------------------------------------+        |
|  |              SHARED MEMORY / RING BUFFER                   |        |
|  |  (Lock-free, single-producer-single-consumer)              |        |
|  +-----------------------------------------------------------+        |
|          |                     |                     |                  |
|  +-------v--------+  +--------v---------+  +--------v----------+       |
|  | Historical DB   |  | Risk Dashboard   |  | Compliance Log    |       |
|  | (TimescaleDB)   |  | (Grafana)        |  | (Kafka -> S3)     |       |
|  +----------------+  +------------------+  +-------------------+       |
|                                                                        |
+------------------------------------------------------------------------+

KEY DESIGN DECISIONS:

1. LATENCY: Use shared memory or memory-mapped files between
   components (not network calls). Lock-free data structures.

2. THROUGHPUT: Ring buffers (LMAX Disruptor pattern) for
   message passing. Batch processing where possible.

3. RELIABILITY: Write-ahead logging for all state changes.
   Heartbeat monitoring. Automatic failover.

4. LANGUAGE: C++ for hot path (feed handler -> strategy ->
   order router). Python for research and monitoring.

5. NETWORKING: Kernel bypass (DPDK/Solarflare) for market
   data. Binary protocols over TCP for exchange connectivity.
```

**Key points to discuss**:

- Single-threaded event loop vs. multi-threaded with lock-free queues
- Memory allocation: pre-allocate everything, no malloc in the hot path
- Clock synchronization: PTP (Precision Time Protocol) for timestamping
- Monitoring without adding latency (sample, do not log every message)
- Disaster recovery: what happens when a component crashes mid-trade?

---
