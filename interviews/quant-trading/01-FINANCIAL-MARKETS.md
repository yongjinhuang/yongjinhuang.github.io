# Financial Markets Fundamentals

## Introduction

Before you write a single line of trading code, you need to understand the arena you are entering. Financial markets are where trillions of dollars change hands every day. They are the mechanism through which the world prices risk, allocates capital, and transfers ownership. As a quant, your job is to find tiny, repeatable inefficiencies in this enormous machine and exploit them before anyone else does.

This chapter assumes zero financial experience. By the end, you will understand what financial markets are, what instruments trade on them, how they are structured, how orders work, how prices form, who the participants are, what data is available, and the key quantitative concepts you will use throughout this guide.

---

## 1. What Is a Financial Market

A financial market is any system -- physical or electronic -- where buyers and sellers come together to trade financial instruments. That is the one-sentence definition. But to truly understand markets, you need to understand the four functions they serve.

### 1.1 The Four Functions of Financial Markets

```
+------------------------------------------------------------------------+
|                  FOUR FUNCTIONS OF FINANCIAL MARKETS                    |
+------------------------------------------------------------------------+
|                                                                        |
|  1. CAPITAL ALLOCATION          2. PRICE DISCOVERY                     |
|  +-------------------------+   +-----------------------------+         |
|  | Savers ---> Borrowers   |   | Millions of opinions about  |         |
|  | Investors -> Companies  |   | value converge into a single |         |
|  | Surplus --> Deficit     |   | number: the market price     |         |
|  | Idle $ --> Productive $ |   | Updated every millisecond    |         |
|  +-------------------------+   +-----------------------------+         |
|                                                                        |
|  3. LIQUIDITY                   4. RISK TRANSFER                       |
|  +-------------------------+   +-----------------------------+         |
|  | Convert assets to cash  |   | Hedgers offload risk to     |         |
|  | quickly, at fair price  |   | speculators willing to      |         |
|  | without moving the      |   | bear it for expected        |         |
|  | price significantly     |   | profit                      |         |
|  +-------------------------+   +-----------------------------+         |
|                                                                        |
+------------------------------------------------------------------------+
```

**Capital Allocation**: A company like Tesla needs billions to build factories. Instead of borrowing from one bank, it sells shares (equity) to millions of investors. Each investor contributes a small amount. The market aggregates this capital and channels it to where it can be productive.

**Price Discovery**: What is Apple worth? Nobody knows the "true" answer. But millions of traders, analysts, and algorithms constantly buy and sell Apple stock. The resulting price -- say $185.42 at 2:37 PM on a Tuesday -- represents the market's consensus estimate of Apple's value at that exact moment. This is price discovery.

**Liquidity**: If you own 100 shares of Microsoft, you can sell them in under a second during market hours and receive cash in your account. Try selling a house that fast. Markets provide liquidity -- the ability to enter and exit positions quickly without significantly affecting the price.

**Risk Transfer**: A wheat farmer worries about falling prices before harvest. A bread company worries about rising prices. Both can use futures contracts to lock in a price today. The farmer sells futures (hedges against price drops), the bread company buys futures (hedges against price rises). Risk is transferred from those who do not want it to those willing to bear it.

### 1.2 A Simple Example of Price Discovery

Imagine a stock with the following standing orders:

```
         PRICE DISCOVERY IN ACTION

  Sellers (Asks)              Buyers (Bids)
  Want to SELL at:            Want to BUY at:

  $10.05  (200 shares)
  $10.04  (500 shares)
  $10.03  (300 shares)
  -------------------------   <-- The Spread
                              $10.01  (400 shares)
                              $10.00  (600 shares)
                              $9.99   (250 shares)

  Best Ask: $10.03            Best Bid: $10.01
  Spread:   $10.03 - $10.01 = $0.02

  Mid Price = ($10.03 + $10.01) / 2 = $10.02

  The "price" of this stock right now is approximately $10.02.
  But no trade has happened yet -- this is just the state of
  the order book.

  If a buyer sends a market order to buy 300 shares, they will
  pay $10.03 (the best ask). The price just "moved" to $10.03.
  That IS price discovery.
```

### 1.3 Measuring Liquidity

Liquidity is not a single number. Quants measure it in several ways:

```
+------------------------------------------------------------------------+
|                     LIQUIDITY METRICS                                   |
+------------------------------------------------------------------------+
|                                                                        |
|  Metric              Definition                  Example               |
|  ------------------  -------------------------   ------------------    |
|  Bid-Ask Spread      Best ask - Best bid          $0.01 (liquid)       |
|                                                   $0.50 (illiquid)     |
|                                                                        |
|  Market Depth        Total size at top N levels   50,000 shares at     |
|                                                   top 5 levels         |
|                                                                        |
|  Daily Volume        Total shares/contracts       AAPL: ~50M shares    |
|                      traded per day               /day                 |
|                                                                        |
|  Turnover Ratio      Volume / Total outstanding   Higher = more liquid |
|                                                                        |
|  Price Impact        How much price moves when    Buy 10,000 shares    |
|                      you trade a given size       -> price moves $0.03 |
|                                                                        |
|  Resiliency          How quickly the book         Recovers in 50ms     |
|                      recovers after a large       (resilient) vs 5min  |
|                      trade                        (fragile)            |
|                                                                        |
+------------------------------------------------------------------------+
```

**Why quants care about liquidity**: If your strategy generates a signal to buy 100,000 shares, but the order book only has 5,000 shares at the best ask, your order will "walk the book" -- consuming liquidity at successively worse prices. This is called **market impact** and it can destroy a strategy's profitability.

---

## 2. Asset Classes

An asset class is a group of financial instruments that share similar characteristics and behave similarly in markets. Understanding asset classes is fundamental because each has different risk/return profiles, market structures, and trading mechanics.

```
+------------------------------------------------------------------------+
|                       MAJOR ASSET CLASSES                               |
+------------------------------------------------------------------------+
|                                                                        |
|  EQUITIES        FIXED INCOME      FX             COMMODITIES          |
|  (Stocks)        (Bonds)           (Currencies)   (Physical goods)     |
|  +----------+   +------------+   +----------+   +-------------+       |
|  | Ownership|   | Lending    |   | Currency |   | Gold, Oil    |       |
|  | in a     |   | money to   |   | exchange |   | Wheat, Gas   |       |
|  | company  |   | govt/corp  |   | rates    |   | Copper, Corn |       |
|  +----------+   +------------+   +----------+   +-------------+       |
|                                                                        |
|  DERIVATIVES                      CRYPTO                               |
|  (Derived from above)             (Digital assets)                     |
|  +-------------------------+     +--------------------+               |
|  | Options, Futures,       |     | Bitcoin, Ethereum  |               |
|  | Swaps, Forwards         |     | DeFi, Stablecoins  |               |
|  | Value depends on an     |     | 24/7 trading       |               |
|  | underlying asset        |     | Decentralized      |               |
|  +-------------------------+     +--------------------+               |
|                                                                        |
+------------------------------------------------------------------------+
```

### 2.1 Equities (Stocks)

A stock represents fractional ownership of a company. If a company has 1,000,000 shares outstanding and you own 1,000 shares, you own 0.1% of the company.

#### How Ownership Works

```
  COMPANY: Acme Corp
  Total shares outstanding: 10,000,000
  Current price per share: $50.00
  Market capitalization: 10,000,000 x $50 = $500,000,000

  +------------------------------------------------------+
  |                    ACME CORP                          |
  |           Market Cap: $500 Million                    |
  +------------------------------------------------------+
  |  Founder   | Institutions | Retail    | Treasury     |
  |  30%       | 45%          | 20%       | 5%           |
  |  3M shares | 4.5M shares  | 2M shares | 0.5M shares |
  +------------------------------------------------------+

  If you buy 100 shares at $50:
  - You pay: 100 x $50 = $5,000
  - You own: 100 / 10,000,000 = 0.001% of the company
  - You receive: voting rights + dividends (if any)
```

#### Stock Exchanges

Stocks trade on exchanges -- regulated marketplaces where buyers and sellers are matched electronically.

```
+------------------------------------------------------------------------+
|                    MAJOR STOCK EXCHANGES                                |
+------------------------------------------------------------------------+
|                                                                        |
|  Exchange              Location     Market Cap      Key Listings       |
|  --------------------  ----------   -------------   ----------------   |
|  NYSE                  New York     ~$25 trillion   BRK, JPM, JNJ     |
|  NASDAQ                New York     ~$22 trillion   AAPL, MSFT, AMZN  |
|  Shanghai (SSE)        Shanghai     ~$7 trillion    PetroChina, ICBC  |
|  Euronext              Europe       ~$7 trillion    LVMH, ASML        |
|  Tokyo (JPX)           Tokyo        ~$6 trillion    Toyota, Sony      |
|  Shenzhen (SZSE)       Shenzhen     ~$5 trillion    BYD, Midea        |
|  Hong Kong (HKEX)      Hong Kong    ~$5 trillion    Tencent, AIA      |
|  London (LSE)          London       ~$4 trillion    Shell, AstraZeneca|
|                                                                        |
+------------------------------------------------------------------------+

  NYSE Trading Hours (Eastern Time):

  04:00  07:00  09:30           16:00  20:00
  |------|------|----------------|------|
  Pre-mkt  Pre   Regular Session  After
  (ECN)   (ECN)  (Exchange)      (ECN)

  Most volume occurs during regular session (9:30 AM - 4:00 PM ET).
  Extended hours have lower liquidity and wider spreads.
```

#### Stock Market Indices

An index is a calculated number that represents the performance of a group of stocks. You cannot trade an index directly, but you can trade ETFs and futures that track indices.

```
+------------------------------------------------------------------------+
|                    MAJOR STOCK INDICES                                  |
+------------------------------------------------------------------------+
|                                                                        |
|  Index          Stocks   Weighting       What It Measures              |
|  -------------- ------   ------------    ---------------------------   |
|  S&P 500        500      Market-cap      Large-cap US stocks           |
|  NASDAQ 100     100      Market-cap      Large tech-heavy US stocks    |
|  Dow Jones      30       Price-weighted  30 blue-chip US stocks        |
|  Russell 2000   2000     Market-cap      Small-cap US stocks           |
|  FTSE 100       100      Market-cap      Large-cap UK stocks           |
|  Nikkei 225     225      Price-weighted  Large Japanese stocks         |
|  Euro Stoxx 50  50       Market-cap      Large Eurozone stocks         |
|                                                                        |
+------------------------------------------------------------------------+

  MARKET-CAP WEIGHTING (S&P 500 style):

  Company      Mkt Cap         Weight in Index
  ---------    -------------   ---------------
  Apple        $3.0 trillion   ~7.0%
  Microsoft    $2.8 trillion   ~6.5%
  Amazon       $1.8 trillion   ~4.2%
  ...
  Smallest     $10 billion     ~0.02%

  Total S&P 500 market cap: ~$43 trillion

  Apple's weight = $3.0T / $43T = ~7.0%

  This means Apple's price movement affects the index 350x
  more than the smallest constituent.

  PRICE WEIGHTING (Dow Jones style):

  Stock A price: $400  -> Weight = 400 / (400 + 100 + 50) = 72.7%
  Stock B price: $100  -> Weight = 100 / 550 = 18.2%
  Stock C price: $50   -> Weight = 50 / 550 = 9.1%

  Problem: A $400 stock has 8x the influence of a $50 stock,
  regardless of company size. This is why most modern indices
  use market-cap weighting instead.
```

#### IPOs (Initial Public Offerings)

An IPO is when a private company sells shares to the public for the first time.

```
  IPO PROCESS TIMELINE

  Private Company                                    Public Company
  |                                                        |
  v                                                        v
  [Select banks] -> [File S-1] -> [Road show] -> [Price] -> [Trade]
       |               |              |             |           |
    6-12 months    SEC review     2-3 weeks     Night before  Day 1
    before         45-90 days     Pitch to       Set final    Shares
                                  investors      IPO price    trade on
                                                              exchange

  Example: Acme Corp IPO
  - IPO price set at: $25/share
  - Shares offered: 20,000,000
  - Capital raised: $500,000,000
  - First day closing price: $38 (52% "pop")
  - The "pop" represents money left on the table for the company
    but is profit for IPO investors who got allocated shares
```

#### Stock Splits

A stock split increases the number of shares while proportionally decreasing the price. It does not change the value of your holdings.

```
  2-FOR-1 STOCK SPLIT

  BEFORE SPLIT                    AFTER SPLIT
  +---------------------+        +---------------------+
  | Shares: 1,000       |   -->  | Shares: 2,000       |
  | Price:  $200/share  |        | Price:  $100/share   |
  | Value:  $200,000    |        | Value:  $200,000     |
  +---------------------+        +---------------------+

  Nothing changed economically. The pizza is the same size --
  you just cut it into more slices.

  REVERSE SPLIT (1-for-10):
  +---------------------+        +---------------------+
  | Shares: 10,000      |   -->  | Shares: 1,000       |
  | Price:  $0.50/share |        | Price:  $5.00/share  |
  | Value:  $5,000      |        | Value:  $5,000       |
  +---------------------+        +---------------------+

  Reverse splits are often done to avoid delisting (exchanges
  require minimum share prices, typically $1).

  QUANT IMPACT: You MUST adjust historical prices for splits
  or your return calculations will show phantom 50% drops/gains.
  This is called "adjusting for corporate actions."
```

#### Dividends

A dividend is a cash payment from a company to its shareholders, typically paid quarterly.

```
  DIVIDEND EXAMPLE

  Company: JNJ (Johnson & Johnson)
  Quarterly dividend: $1.24 per share
  Annual dividend: $4.96 per share
  Current price: $160.00
  Dividend yield: $4.96 / $160.00 = 3.1%

  DIVIDEND TIMELINE

  Declaration    Ex-Dividend    Record      Payment
  Date           Date           Date        Date
  |              |              |           |
  v              v              v           v
  [Announced] -> [Buy before   [Company    [Cash hits
                  this date     checks who   your
                  to receive    owns shares] account]
                  dividend]

  On the ex-dividend date, the stock price typically drops
  by approximately the dividend amount:

  Day before ex-div: $160.00
  Ex-dividend day:   $158.76  (dropped ~$1.24)

  QUANT IMPACT: Like splits, dividends must be accounted for
  in historical price data. "Adjusted close" prices reflect
  both splits and dividends. Always use adjusted prices for
  backtesting.
```

### 2.2 Fixed Income (Bonds)

A bond is a loan that you make to a government or corporation. The borrower promises to pay you regular interest (called the "coupon") and return your principal at maturity.

```
  ANATOMY OF A BOND

  +------------------------------------------------------------------------+
  |  Issuer:          US Treasury (Government bond)                        |
  |  Face Value:      $1,000 (also called "par value")                     |
  |  Coupon Rate:     4.0% annual (paid semi-annually)                     |
  |  Maturity:        10 years from issuance                               |
  |  Issue Price:     $1,000 (at par)                                      |
  +------------------------------------------------------------------------+

  CASH FLOW TIMELINE (semi-annual coupons)

  Buy bond                                              Get principal back
  -$1,000                                               +$1,000
  |    +$20   +$20   +$20   +$20   ...   +$20   +$20   +$1,020
  |-----|------|------|------|------...------|------|------|
  t=0   6mo    1yr    1.5yr  2yr          9yr   9.5yr  10yr

  Each coupon payment = $1,000 x 4.0% / 2 = $20
  Total coupons over 10 years = 20 payments x $20 = $400
  Total return = $400 coupons + $1,000 principal = $1,400
  Profit = $400 on a $1,000 investment
```

#### Yield

Yield is the return you earn on a bond. It is inversely related to price. This inverse relationship is one of the most important concepts in finance.

```
  PRICE-YIELD INVERSE RELATIONSHIP

  Price ($)
  1,200 |  *
        |    *
  1,100 |      *
        |        *
  1,000 |----------*---------- Par Value
        |            *
    900 |              *
        |                *
    800 |                  *
        +--+--+--+--+--+--+---> Yield (%)
           2  3  4  5  6  7  8

  WHY? Intuition with an example:

  You hold a bond paying 4% coupon ($40/year on $1,000 face).
  New bonds are now issued at 5% ($50/year on $1,000 face).

  Nobody will pay $1,000 for your 4% bond when they can get
  a 5% bond for $1,000. So your bond price must DROP until
  its yield (based on the lower price) equals ~5%.

  Your bond price drops to ~$920.
  Now: $40 / $920 = 4.35% current yield
  Plus the $80 capital gain ($1,000 - $920) over remaining
  life brings the yield-to-maturity to ~5%.
```

#### Duration

Duration measures a bond's sensitivity to interest rate changes. It answers: "If interest rates move 1%, how much does my bond price change?"

```
  DURATION EXAMPLE

  Bond A: 2-year Treasury, 3% coupon    -> Duration: ~1.9 years
  Bond B: 10-year Treasury, 4% coupon   -> Duration: ~8.3 years
  Bond C: 30-year Treasury, 4.5% coupon -> Duration: ~17.5 years

  If interest rates rise by 1%:

  Bond A price change: -1.9% x 1% = -1.9%    ($1,000 -> $981)
  Bond B price change: -8.3% x 1% = -8.3%    ($1,000 -> $917)
  Bond C price change: -17.5% x 1% = -17.5%  ($1,000 -> $825)

  +------------------------------------------+
  |  RULE OF THUMB:                          |
  |                                          |
  |  Longer maturity = Higher duration       |
  |  Higher duration = More interest rate    |
  |                    risk                  |
  |  Lower coupon = Higher duration          |
  |  (Zero-coupon bond has highest duration) |
  +------------------------------------------+
```

#### The Yield Curve

The yield curve plots yields across different maturities for the same credit quality (usually US Treasuries).

```
  YIELD CURVE SHAPES

  NORMAL (Economy expanding)     INVERTED (Recession signal)
  Yield                          Yield
  5% |              ****         5% | ****
     |          ****                |     ****
  4% |      ****                 4% |         ****
     |   ***                        |             ****
  3% | **                        3% |                 ****
     +--+--+--+--+--+-->            +--+--+--+--+--+-->
     3m 1y 2y 5y 10y 30y            3m 1y 2y 5y 10y 30y

  FLAT (Transition/uncertainty)  HUMPED (Mixed signals)
  Yield                          Yield
  5% |                           5% |      ****
     |                              |    **    **
  4% | **********************    4% |  **        ****
     |                              | *              ****
  3% |                           3% |*
     +--+--+--+--+--+-->            +--+--+--+--+--+-->
     3m 1y 2y 5y 10y 30y            3m 1y 2y 5y 10y 30y

  QUANT SIGNIFICANCE:
  - The yield curve has predicted every US recession since 1970
    when it inverts (short rates > long rates)
  - The 2-year vs 10-year spread (2s10s) is the most watched
  - Many quant strategies trade the yield curve shape
  - Example: "Steepener" = bet that long rates will rise
    relative to short rates
```

#### Credit Risk: Government vs Corporate Bonds

```
  CREDIT QUALITY SPECTRUM

  LOWEST RISK                                    HIGHEST RISK
  (Lowest Yield)                                 (Highest Yield)
  |                                                        |
  v                                                        v
  US Treasury  Agency   AAA   AA   A   BBB | BB   B   CCC  D
  (risk-free)  (Fannie) Corp  Corp Corp Corp| Corp Corp Corp Default
                                            |
                                    Investment |  High Yield
                                    Grade      |  ("Junk")
                                               |
  CREDIT SPREAD = Corporate yield - Treasury yield

  Example (10-year bonds):
  US Treasury:      4.00%
  AAA Corporate:    4.50%  (spread: 0.50% or 50 basis points)
  BBB Corporate:    5.50%  (spread: 1.50% or 150 basis points)
  BB (Junk):        7.00%  (spread: 3.00% or 300 basis points)
  CCC (Distressed): 12.00% (spread: 8.00% or 800 basis points)

  1 basis point (bp) = 0.01%
  100 basis points = 1.00%

  QUANT STRATEGIES: Credit spread trading, relative value
  between different credit tiers, CDS (credit default swap)
  trading, distressed debt analysis.
```

### 2.3 Foreign Exchange (FX)

The foreign exchange market is the largest financial market in the world with over $7.5 trillion in daily turnover. It trades currencies in pairs.

```
  FX CURRENCY PAIR NOTATION

  EUR/USD = 1.0850
  ^^^/^^^   ^^^^^^
  Base/Quote  Price

  "1 Euro costs 1.0850 US Dollars"

  If you BUY EUR/USD at 1.0850:
    You are buying Euros and selling Dollars
    You pay $1,085 to get 1,000 Euros

  If EUR/USD rises to 1.0950:
    Your 1,000 Euros are now worth $1,095
    Profit: $10 per 1,000 Euros
    That is a move of 100 "pips"

  +------------------------------------------------------------------------+
  |                    MAJOR CURRENCY PAIRS                                |
  +------------------------------------------------------------------------+
  |                                                                        |
  |  "Majors" (most liquid, tightest spreads)                              |
  |  EUR/USD  (Euro / Dollar)         ~24% of daily volume                |
  |  USD/JPY  (Dollar / Yen)          ~13% of daily volume                |
  |  GBP/USD  (Pound / Dollar)        ~10% of daily volume                |
  |  USD/CHF  (Dollar / Swiss Franc)                                      |
  |  AUD/USD  (Dollar / Aussie)                                           |
  |  USD/CAD  (Dollar / Canadian)                                         |
  |                                                                        |
  |  "Crosses" (no USD)                                                   |
  |  EUR/GBP, EUR/JPY, GBP/JPY                                           |
  |                                                                        |
  |  "Exotics" (emerging market, less liquid)                              |
  |  USD/TRY, USD/ZAR, USD/MXN, USD/BRL                                  |
  |                                                                        |
  +------------------------------------------------------------------------+
```

#### Bid/Ask and Pips

```
  FX QUOTE EXAMPLE

  EUR/USD:  Bid: 1.08500  |  Ask: 1.08520
                          |
            You SELL at   |  You BUY at
            this price    |  this price
                          |
  Spread = 1.08520 - 1.08500 = 0.00020 = 2.0 pips

  WHAT IS A PIP?
  - For most pairs: 4th decimal place (0.0001)
  - For JPY pairs: 2nd decimal place (0.01)

  EUR/USD moves from 1.0850 to 1.0875 = +25 pips
  USD/JPY moves from 148.50 to 149.00 = +50 pips

  PIP VALUE (for a "standard lot" = 100,000 units):
  EUR/USD: 1 pip = $10.00
  USD/JPY: 1 pip = ~$6.70 (varies with exchange rate)

  So if you buy 1 standard lot of EUR/USD at 1.0850
  and it goes to 1.0950 (100 pip move):
  Profit = 100 pips x $10/pip = $1,000
```

#### Carry Trade

```
  THE CARRY TRADE

  Concept: Borrow in a low-interest-rate currency, invest in
  a high-interest-rate currency. Earn the interest differential.

  Example:
  - Japan interest rate: 0.25%
  - Australia interest rate: 4.35%
  - Carry = 4.35% - 0.25% = 4.10% per year

  Step 1: Borrow 10,000,000 JPY at 0.25%
  Step 2: Convert to AUD (buy AUD/JPY)
  Step 3: Invest AUD at 4.35%
  Step 4: Earn 4.10% spread annually

  +-----------------------------------------+
  |  RISK: If the AUD drops 5% against JPY, |
  |  you lose 5% on the currency but only   |
  |  earned 4.1% in carry. Net loss: -0.9%  |
  |                                         |
  |  Carry trades blow up spectacularly     |
  |  when high-yield currencies crash       |
  |  (e.g., 2008 Yen carry trade unwind).  |
  +-----------------------------------------+

  QUANT INSIGHT: Carry is one of the most well-documented
  factors in FX. It works on average but has negative skew
  (small profits most of the time, occasional huge losses).
```

#### Central Banks and FX

```
  CENTRAL BANK IMPACT ON CURRENCIES

  Central Bank       Currency     Key Rate
  ----------------   --------     --------
  Federal Reserve    USD          Fed Funds Rate
  ECB                EUR          Main Refinancing Rate
  Bank of Japan      JPY          Policy Rate
  Bank of England    GBP          Bank Rate
  PBoC               CNY          Loan Prime Rate

  MECHANISM:

  Central bank RAISES rates
       |
       v
  Higher yields on that currency's bonds
       |
       v
  Foreign investors buy bonds (need local currency)
       |
       v
  Demand for currency INCREASES
       |
       v
  Currency APPRECIATES

  This is why FX traders obsess over central bank meetings,
  forward guidance, and interest rate differentials.
```

### 2.4 Commodities

Commodities are raw materials or primary agricultural products that can be bought and sold. They typically trade via futures contracts rather than the physical goods themselves.

```
+------------------------------------------------------------------------+
|                    COMMODITY CATEGORIES                                 |
+------------------------------------------------------------------------+
|                                                                        |
|  ENERGY              METALS              AGRICULTURE                   |
|  +---------------+  +---------------+   +------------------+          |
|  | Crude Oil     |  | Gold          |   | Corn             |          |
|  |  (WTI, Brent) |  | Silver        |   | Wheat            |          |
|  | Natural Gas   |  | Copper        |   | Soybeans         |          |
|  | Gasoline      |  | Platinum      |   | Cotton           |          |
|  | Heating Oil   |  | Palladium     |   | Sugar            |          |
|  +---------------+  | Aluminum      |   | Coffee           |          |
|                      +---------------+   | Cattle / Hogs    |          |
|  SOFTS                                   +------------------+          |
|  +---------------+                                                     |
|  | Cocoa         |   MAJOR EXCHANGES:                                  |
|  | Orange Juice  |   CME Group (COMEX, NYMEX) - Chicago/New York       |
|  | Lumber        |   ICE (Intercontinental Exchange) - Atlanta/London  |
|  +---------------+   LME (London Metal Exchange) - London              |
|                                                                        |
+------------------------------------------------------------------------+
```

#### Spot vs Futures Prices

```
  SPOT vs FUTURES

  Spot price:    The price for IMMEDIATE delivery
  Futures price: The price for delivery at a FUTURE date

  Example: Crude Oil (WTI) on March 1, 2026

  Spot (March delivery):   $78.50/barrel
  April futures:           $78.80/barrel
  May futures:             $79.20/barrel
  June futures:            $79.50/barrel
  December futures:        $76.00/barrel

  Plotting these prices gives the "futures curve" or
  "forward curve":

  Price ($)
  80 |     *     *
     |  *           *
  79 |*                *
     |                    *
  78 |                       *
     |                          *
  77 |                             *
     |                                *
  76 |                                   *
     +--+--+--+--+--+--+--+--+--+--+--+--> Month
     Mar Apr May Jun Jul Aug Sep Oct Nov Dec
```

#### Contango and Backwardation

```
  CONTANGO (Futures > Spot)

  Price
  |           *  *  *  *  *  <-- Futures curve (upward sloping)
  |        *
  |     *
  |  * <-- Spot price
  +---------------------------------> Time to expiry

  Normal for storable commodities (oil, gold, corn).
  Futures price = Spot + storage costs + financing costs

  Example: Gold spot = $2,050
  Storage + insurance for 6 months = $12
  Financing cost for 6 months = $40
  6-month futures price = $2,050 + $12 + $40 = $2,102

  BACKWARDATION (Futures < Spot)

  Price
  |  * <-- Spot price
  |     *
  |        *
  |           *  *  *  *  *  <-- Futures curve (downward sloping)
  +---------------------------------> Time to expiry

  Occurs when:
  - Current supply shortage (spot demand > supply)
  - Convenience yield (benefit of holding physical commodity)
  - Market expects future price declines

  QUANT STRATEGY: "Roll yield" -- systematically being long
  in backwardated markets or short in contango markets earns
  returns as futures converge to spot at expiration.
```

### 2.5 Derivatives

Derivatives are financial instruments whose value is derived from an underlying asset. They are contracts between two parties, not ownership of an asset.

```
+------------------------------------------------------------------------+
|                    DERIVATIVES OVERVIEW                                 |
+------------------------------------------------------------------------+
|                                                                        |
|  Type       Exchange-Traded?  Obligation?     Standardized?            |
|  --------   ---------------  ------------    -------------             |
|  Forwards   No (OTC)         Both parties    No (custom)               |
|  Futures    Yes              Both parties    Yes                       |
|  Options    Both             Buyer: right    Mostly yes                |
|                              Seller: oblig.                            |
|  Swaps      No (OTC)         Both parties    No (custom)               |
|                                                                        |
+------------------------------------------------------------------------+

  FORWARD CONTRACT
  +---------------------------------------------------+
  | Agreement to buy/sell an asset at a future date    |
  | at a price agreed upon TODAY                       |
  |                                                   |
  | Example: Farmer agrees to sell 5,000 bushels of   |
  | wheat at $6.50/bushel in 3 months to a bakery     |
  |                                                   |
  | If price at delivery is $7.00: farmer "lost" $0.50|
  | If price at delivery is $6.00: farmer "gained"$0.50|
  | But both parties eliminated price uncertainty     |
  +---------------------------------------------------+

  FUTURES CONTRACT = Standardized forward traded on exchange
  +---------------------------------------------------+
  | Same as forward but:                              |
  | - Standardized sizes (e.g., 1,000 barrels oil)    |
  | - Daily mark-to-market (margin calls)             |
  | - Cleared through a clearinghouse (no credit risk)|
  | - Can easily exit by taking opposite position     |
  +---------------------------------------------------+

  OPTIONS (detailed treatment in Chapter 13)
  +---------------------------------------------------+
  | CALL option: Right (not obligation) to BUY        |
  | PUT option:  Right (not obligation) to SELL       |
  |                                                   |
  | Example: AAPL Call Option                         |
  | Strike: $190, Expiry: March 21, Premium: $5.00   |
  |                                                   |
  | If AAPL is at $200 at expiry:                     |
  |   Exercise: buy at $190, worth $200               |
  |   Profit: $200 - $190 - $5 = $5 per share        |
  |                                                   |
  | If AAPL is at $185 at expiry:                     |
  |   Don't exercise (would buy at $190, worth $185)  |
  |   Loss: $5 (the premium you paid)                 |
  +---------------------------------------------------+

  SWAPS
  +---------------------------------------------------+
  | Exchange of cash flows between two parties         |
  |                                                   |
  | Most common: Interest Rate Swap                   |
  | Party A pays: fixed 4% on $100M notional          |
  | Party B pays: floating SOFR rate on $100M         |
  |                                                   |
  | If SOFR = 3.5%: A pays $4M, B pays $3.5M         |
  |   Net: A pays B $0.5M                             |
  | If SOFR = 4.5%: A pays $4M, B pays $4.5M         |
  |   Net: B pays A $0.5M                             |
  +---------------------------------------------------+
```

### 2.6 Cryptocurrencies

Cryptocurrencies are digital assets that use cryptographic techniques and distributed ledgers (blockchains) to enable peer-to-peer transactions without intermediaries.

```
+------------------------------------------------------------------------+
|                    CRYPTO LANDSCAPE FOR QUANTS                          |
+------------------------------------------------------------------------+
|                                                                        |
|  LAYER 1 CHAINS        STABLECOINS         DEFI                       |
|  +-----------------+  +---------------+   +------------------+        |
|  | Bitcoin (BTC)   |  | USDT (Tether) |   | Uniswap (DEX)    |        |
|  |  Store of value |  | USDC (Circle) |   | Aave (Lending)   |        |
|  |  Digital gold   |  | DAI (Maker)   |   | Compound         |        |
|  |                 |  | Pegged to $1  |   | Curve Finance    |        |
|  | Ethereum (ETH)  |  +---------------+   +------------------+        |
|  |  Smart contract |                                                   |
|  |  platform       |  EXCHANGES                                        |
|  |  DeFi base      |  +---------------------------------+             |
|  +-----------------+  | Centralized: Binance, Coinbase, |             |
|                       |              Kraken, OKX         |             |
|                       | Decentralized: Uniswap, dYdX,   |             |
|                       |                Hyperliquid        |             |
|                       +---------------------------------+             |
|                                                                        |
+------------------------------------------------------------------------+
```

#### Unique Characteristics for Quant Trading

```
  WHY CRYPTO IS DIFFERENT FOR QUANTS

  +-------------------------------+----------------------------------+
  | Characteristic                | Implication for Quants           |
  +-------------------------------+----------------------------------+
  | 24/7/365 trading              | No overnight gaps, but need      |
  |                               | 24/7 monitoring infrastructure   |
  +-------------------------------+----------------------------------+
  | Fragmented across exchanges   | Cross-exchange arbitrage          |
  |                               | opportunities exist              |
  +-------------------------------+----------------------------------+
  | Higher volatility             | Wider profit opportunities but   |
  | (BTC: ~60% annual vol)       | also larger drawdowns            |
  | (S&P 500: ~15% annual vol)   |                                  |
  +-------------------------------+----------------------------------+
  | Less regulated                | Fewer restrictions but more      |
  |                               | manipulation risk                |
  +-------------------------------+----------------------------------+
  | Transparent order books       | On-chain data provides unique    |
  |                               | alpha signals (whale tracking)   |
  +-------------------------------+----------------------------------+
  | Funding rates (perpetuals)    | Similar to carry trade --        |
  |                               | systematic strategy possible     |
  +-------------------------------+----------------------------------+
  | Lower barriers to entry       | Retail quants can compete more   |
  |                               | effectively than in TradFi       |
  +-------------------------------+----------------------------------+

  CRYPTO ARBITRAGE EXAMPLE

  Exchange A: BTC = $63,100  (ask)
  Exchange B: BTC = $63,250  (bid)

  Buy on A, sell on B:
  Gross profit: $150 per BTC
  Transaction fees: ~$60 (0.1% x 2 x $63,000)
  Transfer time: 10-30 minutes (BTC network)
  Risk: Price may move during transfer

  Net profit IF price holds: ~$90 per BTC (~0.14%)

  This is why quants pre-fund multiple exchanges and use
  statistical arbitrage (trade then rebalance later) rather
  than physical transfer.
```

---

## 3. Market Structure

Market structure describes how trades are organized, matched, and settled. Understanding market structure is essential for quants because it determines what data you see, what latency matters, and what strategies are viable.

### 3.1 Exchanges vs OTC Markets

```
+------------------------------------------------------------------------+
|              EXCHANGE-TRADED vs OVER-THE-COUNTER (OTC)                 |
+------------------------------------------------------------------------+
|                                                                        |
|  EXCHANGE                          OTC                                 |
|  +----------------------------+   +------------------------------+    |
|  | Centralized venue           |   | Bilateral (dealer-to-dealer) |    |
|  | Anonymous matching          |   | Negotiated directly          |    |
|  | Standardized contracts      |   | Customizable terms           |    |
|  | Public price transparency   |   | Limited price transparency   |    |
|  | Regulated                   |   | Less regulated               |    |
|  | Clearinghouse guarantees    |   | Counterparty credit risk     |    |
|  +----------------------------+   +------------------------------+    |
|                                                                        |
|  Examples:                         Examples:                           |
|  NYSE, NASDAQ (equities)           FX spot market                     |
|  CME, ICE (futures/options)        Interest rate swaps                 |
|  CBOE (options)                    Corporate bonds (most)              |
|                                    CDOs, exotic derivatives            |
|                                                                        |
|  WHO TRADES WHERE:                                                     |
|  Retail traders -> Exchange (usually)                                  |
|  Hedge funds -> Both                                                   |
|  Banks -> Both (market makers on exchange, dealers in OTC)             |
|  Pension funds -> OTC for large/custom trades                          |
|                                                                        |
+------------------------------------------------------------------------+
```

### 3.2 The Central Limit Order Book (CLOB)

The CLOB is the core data structure of modern electronic exchanges. Every quant must understand it deeply.

```
  CENTRAL LIMIT ORDER BOOK (CLOB)

  The order book is a data structure that holds all outstanding
  limit orders, organized by price and time priority.

  SELL SIDE (Asks/Offers)          PRICE      BUY SIDE (Bids)
  Quantity  |  # Orders            Level       # Orders  |  Quantity
  ----------|----------           -------     ----------|----------
     200    |     1               $10.08
     500    |     3               $10.07
     800    |     5               $10.06
   1,200    |     8               $10.05
   2,500    |    12               $10.04       <-- Best Ask
  ----------------------------------------------------------
                                  $10.02       15  |   3,000  <-- Best Bid
                                  $10.01       10  |   2,000
                                  $10.00        8  |   1,500
                                   $9.99        5  |     800
                                   $9.98        3  |     400

  Spread = Best Ask - Best Bid = $10.04 - $10.02 = $0.02
  Mid Price = ($10.04 + $10.02) / 2 = $10.03

  PRICE-TIME PRIORITY (FIFO):
  +---------------------------------------------------+
  | At each price level, orders are filled in the     |
  | order they were received.                          |
  |                                                   |
  | At $10.02 bid, 15 orders totaling 3,000 shares:  |
  | Order 1 (placed 9:30:00): 500 shares  <- filled 1st|
  | Order 2 (placed 9:30:01): 200 shares  <- filled 2nd|
  | Order 3 (placed 9:30:05): 300 shares  <- filled 3rd|
  | ...                                               |
  +---------------------------------------------------+
```

#### How a Trade Occurs in the CLOB

```
  MATCHING ENGINE WALKTHROUGH

  Initial State:
  Ask: 2,500 @ $10.04  |  Bid: 3,000 @ $10.02

  Event: New MARKET BUY order for 1,000 shares arrives

  Step 1: Match against best ask ($10.04)
          Consume 1,000 of the 2,500 shares at $10.04

  Result:
  Ask: 1,500 @ $10.04  |  Bid: 3,000 @ $10.02
  Trade printed: 1,000 @ $10.04

  Event: New MARKET BUY order for 2,000 shares arrives

  Step 1: Match against best ask ($10.04)
          Consume remaining 1,500 shares at $10.04
  Step 2: Not fully filled. Move to next level.
          Consume 500 of 800 shares at $10.06

  Result:
  Ask: 300 @ $10.06    |  Bid: 3,000 @ $10.02
  Trades printed: 1,500 @ $10.04, 500 @ $10.06

  The buyer's average price: (1,500 x $10.04 + 500 x $10.06) / 2,000
                            = ($15,060 + $5,030) / 2,000
                            = $10.045

  This "walking the book" is MARKET IMPACT in action.
  The aggressive buyer moved the price from $10.04 to $10.06.
```

### 3.3 Market Makers and Their Role

```
+------------------------------------------------------------------------+
|                    MARKET MAKERS                                        |
+------------------------------------------------------------------------+
|                                                                        |
|  A market maker continuously posts both BID and ASK quotes,            |
|  earning the spread on each round-trip trade.                          |
|                                                                        |
|  MARKET MAKER'S QUOTES:                                                |
|                                                                        |
|  BUY 500 @ $10.02  <-->  SELL 500 @ $10.04                            |
|                                                                        |
|  If both sides fill:                                                   |
|  Buy  500 shares @ $10.02 = -$5,010                                   |
|  Sell 500 shares @ $10.04 = +$5,020                                   |
|  Profit: $10 (the spread x quantity)                                   |
|                                                                        |
|  This looks easy, but the risks are enormous:                          |
|                                                                        |
|  ADVERSE SELECTION:                                                    |
|  +-------------------------------------------------------+            |
|  | An informed trader knows bad news is coming.           |            |
|  | They sell 500 shares to the market maker at $10.02.    |            |
|  | News breaks. Stock drops to $9.50.                     |            |
|  | Market maker is stuck with 500 shares worth $9.50      |            |
|  | that they bought at $10.02.                            |            |
|  | Loss: 500 x ($10.02 - $9.50) = $260                   |            |
|  | This one bad trade wipes out 26 round-trip spreads.    |            |
|  +-------------------------------------------------------+            |
|                                                                        |
|  INVENTORY RISK:                                                       |
|  If more people sell to you than buy from you, you accumulate          |
|  a long position. If the stock drops, you lose money.                  |
|  Market makers must actively manage their inventory.                   |
|                                                                        |
|  KEY MARKET MAKERS:                                                    |
|  Citadel Securities, Virtu Financial, Jane Street,                     |
|  Optiver, Flow Traders, Jump Trading                                   |
|                                                                        |
+------------------------------------------------------------------------+
```

### 3.4 Dark Pools and Alternative Trading Systems

```
  DARK POOLS

  A dark pool is a private trading venue where orders are NOT
  displayed to the public until after execution.

  WHY DO DARK POOLS EXIST?

  Imagine a pension fund needs to sell 5,000,000 shares of AAPL.

  If they post a visible sell order on NYSE:
  +-----------------------------------------------+
  | Everyone sees the huge sell order              |
  | -> Other traders front-run (sell before you)   |
  | -> Price drops before you can sell             |
  | -> You get a much worse average price          |
  +-----------------------------------------------+

  In a dark pool:
  +-----------------------------------------------+
  | Order is hidden from public view               |
  | Matched against other large hidden orders      |
  | Typically executed at the NBBO midpoint        |
  | Less market impact for large orders            |
  +-----------------------------------------------+

  NBBO = National Best Bid and Offer (best prices across
  all exchanges)

  MARKET STRUCTURE OVERVIEW:

  +--------+     +----------+     +-----------+
  | Lit     |     | Dark     |     | Other     |
  | Venues  |     | Pools    |     | Venues    |
  +--------+     +----------+     +-----------+
  | NYSE    |     | Crossfinder   | Retail     |
  | NASDAQ  |     | (Credit      | wholesalers|
  | ARCA    |     |  Suisse)     | (Citadel,  |
  | BATS    |     | SIGMA X      |  Virtu)    |
  | IEX     |     | (Goldman)    |            |
  | Direct  |     | MS Pool      | Internali- |
  | Edge    |     | (Morgan      | zation     |
  |         |     |  Stanley)    |            |
  +--------+     +----------+     +-----------+

  ~60% of         ~15% of         ~25% of
  US equity       US equity       US equity
  volume          volume          volume

  QUANT IMPACT: Your strategy's execution quality depends on
  which venues you route orders to. Smart Order Routing (SOR)
  algorithms optimize across all these venues.
```

### 3.5 Clearing and Settlement

```
  CLEARING AND SETTLEMENT

  When you click "buy" and your order fills, the trade is
  NOT complete. Three things must happen:

  TRADE LIFECYCLE:

  [Execution]  ->  [Clearing]  ->  [Settlement]
   Matching         Validation      Transfer of
   engine finds     + netting       cash and
   a match          via CCP         securities
   (microseconds)   (same day)      (T+1)

  T+1 SETTLEMENT (US equities since May 2024):

  Day 0 (Trade day):
    You buy 100 shares of AAPL at $185.00
    Cost: $18,500

  Day 1 (Settlement day):
    Your broker delivers $18,500 to the seller's broker
    The seller's broker delivers 100 shares to your broker
    Shares appear in your account

  CENTRAL COUNTERPARTY (CCP):

  WITHOUT CCP:                      WITH CCP:

  Buyer <-----> Seller              Buyer <---> CCP <---> Seller

  Problem: If seller                CCP guarantees both sides.
  goes bankrupt before              If seller defaults, CCP
  delivering shares,                steps in and completes
  buyer is stuck.                   the trade.

  Major CCPs:
  - DTCC (US equities)
  - OCC (US options)
  - CME Clearing (US futures)
  - LCH (European interest rate swaps)
  - ICE Clear (credit derivatives)

  NETTING EXAMPLE:

  Without netting:
  Firm A buys  1,000 AAPL from Firm B = $185,000 ->
  Firm A sells   800 AAPL to Firm B   = $148,000 <-
  Total movement: $333,000 + 1,800 shares

  With netting:
  Net: Firm A buys 200 AAPL from Firm B
  Total movement: $37,000 + 200 shares

  Netting reduces settlement risk by ~90%.
```

---

## 4. Order Types

Understanding order types is critical for quants because the choice of order type directly affects execution quality, fill probability, and market impact.

### 4.1 Basic Order Types

```
+------------------------------------------------------------------------+
|                    BASIC ORDER TYPES                                    |
+------------------------------------------------------------------------+

  MARKET ORDER
  +------------------------------------------------------+
  | "Buy/sell immediately at the best available price"    |
  |                                                      |
  | Pros: Guaranteed execution (if liquidity exists)      |
  | Cons: No price guarantee, may experience slippage     |
  |                                                      |
  | Example: Market buy 500 shares of AAPL               |
  | Ask side: 300 @ $185.10, 400 @ $185.15               |
  | Fill: 300 @ $185.10 + 200 @ $185.15                  |
  | Average: $185.12 (not $185.10 as you might expect)   |
  +------------------------------------------------------+

  LIMIT ORDER
  +------------------------------------------------------+
  | "Buy/sell only at this price or better"               |
  |                                                      |
  | Buy limit: Maximum price you will pay                |
  | Sell limit: Minimum price you will accept             |
  |                                                      |
  | Pros: Price guarantee, adds liquidity                 |
  | Cons: May not fill, opportunity cost                  |
  |                                                      |
  | Example: Limit buy 500 AAPL at $184.50               |
  | Current ask: $185.10                                  |
  | Order sits in book at $184.50, waiting.               |
  | If price drops to $184.50 -> fills                    |
  | If price never reaches $184.50 -> no fill             |
  +------------------------------------------------------+

  STOP ORDER (Stop-Loss)
  +------------------------------------------------------+
  | "When price reaches X, trigger a market order"        |
  |                                                      |
  | Stop sell: Sell if price drops to your stop level     |
  | Stop buy:  Buy if price rises to your stop level      |
  |                                                      |
  | Example: You own AAPL at $185. Stop sell at $180.     |
  | If AAPL drops to $180, a market sell is triggered.    |
  | You may fill at $179.95 (slippage in fast market).    |
  |                                                      |
  | WARNING: Stop orders do NOT guarantee a fill at the   |
  | stop price. In a gap-down, you could fill much lower. |
  +------------------------------------------------------+

  STOP-LIMIT ORDER
  +------------------------------------------------------+
  | "When price reaches X, place a limit order at Y"      |
  |                                                      |
  | Example: Stop at $180, limit at $179.50               |
  | If AAPL drops to $180, a limit sell at $179.50 is     |
  | placed. If price gaps below $179.50, no fill at all.  |
  |                                                      |
  | You get price protection but risk no execution.       |
  +------------------------------------------------------+
```

### 4.2 Advanced Order Types

```
  ICEBERG ORDER (Hidden Quantity)
  +------------------------------------------------------+
  | Shows only a portion of the total order size          |
  |                                                      |
  | Total: 50,000 shares                                  |
  | Display: 1,000 shares (visible in book)               |
  | Reserve: 49,000 shares (hidden)                       |
  |                                                      |
  | When 1,000 shares fill, another 1,000 are displayed.  |
  | Repeats until all 50,000 are filled.                  |
  |                                                      |
  |    Book shows:                                        |
  |    $10.02: 1,000 shares  <-- Looks like small order   |
  |    Reality: 50,000 shares waiting behind it           |
  |                                                      |
  | QUANT DETECTION: Iceberg orders can be detected by    |
  | watching for repeated replenishment at the same price.|
  | If 1,000 shares fill and instantly 1,000 reappear     |
  | at the same price, it is likely an iceberg.           |
  +------------------------------------------------------+

  TWAP (Time-Weighted Average Price)
  +------------------------------------------------------+
  | Splits a large order into equal slices over time       |
  |                                                      |
  | Order: Buy 100,000 shares over 2 hours                |
  | Slices: 120 slices of ~833 shares every minute        |
  |                                                      |
  | Time:  10:00  10:01  10:02  ...  11:59                |
  |        |833   |833   |833   ...  |833                 |
  |                                                      |
  | Goal: Achieve an average price close to the time-     |
  | weighted average market price over the period.        |
  |                                                      |
  | Simple but predictable (others can detect the pattern)|
  +------------------------------------------------------+

  VWAP (Volume-Weighted Average Price)
  +------------------------------------------------------+
  | Splits a large order proportional to expected volume   |
  |                                                      |
  | If 30% of daily volume occurs 9:30-10:30,             |
  | then 30% of the order executes in that window.        |
  |                                                      |
  | Volume Profile:                                       |
  |  Vol                                                  |
  |  |***          **                          ***        |
  |  |****        ****                        *****       |
  |  |*****      ******                      *******      |
  |  |*******  *********                   **********     |
  |  +--+--+--+--+--+--+--+--+--+--+--+--+--+--+-->     |
  |  9:30  10:30  11:30  12:30  1:30  2:30  3:30 4:00    |
  |  Open         Lunch lull           Close              |
  |                                                      |
  | U-shaped volume: Heavy at open/close, light midday    |
  | VWAP algo trades more during high-volume periods      |
  |                                                      |
  | BENCHMARK: Institutional traders are often evaluated   |
  | on how close their execution was to VWAP.             |
  +------------------------------------------------------+
```

### 4.3 Time-in-Force Instructions

```
  TIME-IN-FORCE: How long does your order stay active?

  +--------------------+-------------------------------------------+
  | Instruction        | Behavior                                  |
  +--------------------+-------------------------------------------+
  | DAY                | Cancel at market close if not filled       |
  | GTC                | Good-Till-Cancelled: stays until filled    |
  |                    | or manually cancelled (up to 90 days)     |
  | IOC                | Immediate-Or-Cancel: fill what you can     |
  |                    | NOW, cancel the rest immediately          |
  | FOK                | Fill-Or-Kill: fill ENTIRE order NOW or     |
  |                    | cancel the entire thing                   |
  | MOO                | Market-On-Open: execute at opening auction |
  | MOC                | Market-On-Close: execute at closing auction|
  +--------------------+-------------------------------------------+

  EXAMPLE COMPARISON:

  Order: Buy 5,000 shares at $10.00
  Available at $10.00: 3,000 shares

  DAY:  Buy 3,000, rest sits in book until close
  GTC:  Buy 3,000, rest sits in book until filled or cancelled
  IOC:  Buy 3,000, cancel remaining 2,000 immediately
  FOK:  Cancel entire order (cannot fill all 5,000 at once)
```

### 4.4 How Orders Interact with the Order Book

```
  ORDER BOOK INTERACTION SCENARIOS

  Initial Book State:

  ASK:  500 @ $10.05
        800 @ $10.04
      1,200 @ $10.03     <-- Best Ask
  --------------------------------
      2,000 @ $10.01     <-- Best Bid
      1,500 @ $10.00
        600 @ $9.99

  SCENARIO 1: Limit buy 400 @ $10.01
  -> Joins the bid at $10.01
  -> Book now shows 2,400 @ $10.01
  -> No trade occurs (passive order, adds liquidity)

  SCENARIO 2: Limit buy 400 @ $10.03
  -> Crosses the spread! Matches against best ask
  -> Trade: 400 shares @ $10.03
  -> Best ask now: 800 @ $10.03 (1,200 - 400 = 800)
  -> Aggressive order, removes liquidity

  SCENARIO 3: Market buy 1,500
  -> Matches 1,200 @ $10.03 (clears that level)
  -> Matches 300 @ $10.04 (partially fills next level)
  -> Trades: 1,200 @ $10.03 + 300 @ $10.04
  -> Average price: $10.033
  -> New best ask: 500 @ $10.04
  -> Price moved from $10.03 to $10.04 (market impact)

  SCENARIO 4: Limit sell 500 @ $10.02
  -> Between best bid ($10.01) and best ask ($10.03)
  -> Does NOT cross (no match)
  -> Sits in the book, becomes the new best ask
  -> Spread narrows: was $0.02, now $0.01
  -> This order IMPROVED the market

  MAKER vs TAKER:
  +-------------------------------------------------+
  | MAKER: Places limit order that rests in book     |
  |   -> Adds liquidity, often gets rebate from      |
  |      exchange (~$0.002/share on US equities)     |
  |                                                 |
  | TAKER: Places order that immediately matches     |
  |   -> Removes liquidity, pays fee to exchange     |
  |      (~$0.003/share on US equities)             |
  |                                                 |
  | This is called the "maker-taker" fee model.     |
  | Some venues use "taker-maker" (inverted).       |
  +-------------------------------------------------+
```

---

## 5. Price Formation

Price formation is the process by which markets arrive at the "correct" price for an asset. Understanding this process is fundamental to quantitative trading because your job is to find cases where the price is wrong.

### 5.1 Supply and Demand

```
  SUPPLY AND DEMAND IN FINANCIAL MARKETS

  Price
  |
  |  Supply (sellers)
  |  /
  | /             Demand (buyers)
  |/                 \
  |*--------*         \     <- Equilibrium price
  |          \         \
  |           \         \
  |            \         \
  +------------------------------> Quantity

  At the equilibrium price, the quantity demanded equals
  the quantity supplied. This is the market-clearing price.

  WHAT SHIFTS DEMAND?                WHAT SHIFTS SUPPLY?
  +---------------------------+     +---------------------------+
  | Good earnings -> demand    |     | Insider selling -> supply  |
  |   increases -> price rises |     |   increases -> price falls |
  | Analyst upgrade -> demand  |     | New share issuance ->      |
  |   increases -> price rises |     |   supply up -> price falls |
  | Index inclusion -> passive |     | Lock-up expiry -> supply   |
  |   demand -> price rises    |     |   increases -> price falls |
  | Recession fears -> demand  |     | Share buybacks -> supply   |
  |   decreases -> price falls |     |   decreases -> price rises |
  +---------------------------+     +---------------------------+
```

### 5.2 The Efficient Market Hypothesis (EMH)

The EMH is the most important and controversial theory in finance. It says that asset prices fully reflect all available information.

```
+------------------------------------------------------------------------+
|              EFFICIENT MARKET HYPOTHESIS (EMH)                         |
+------------------------------------------------------------------------+
|                                                                        |
|  WEAK FORM                                                             |
|  +---------------------------------------------------------------+    |
|  | Prices reflect all PAST TRADING DATA                           |    |
|  | (historical prices, volume, etc.)                              |    |
|  |                                                                |    |
|  | Implication: Technical analysis cannot consistently profit     |    |
|  | You cannot predict future prices from past prices alone        |    |
|  |                                                                |    |
|  | Evidence: Mixed. Some momentum effects persist.                |    |
|  +---------------------------------------------------------------+    |
|                                                                        |
|  SEMI-STRONG FORM                                                      |
|  +---------------------------------------------------------------+    |
|  | Prices reflect all PUBLICLY AVAILABLE information              |    |
|  | (financials, news, analyst reports, macro data)                |    |
|  |                                                                |    |
|  | Implication: Fundamental analysis cannot consistently profit   |    |
|  | Prices adjust "instantly" to new public information            |    |
|  |                                                                |    |
|  | Evidence: Prices DO adjust very fast to news, but some         |    |
|  | anomalies persist (value effect, size effect, momentum)        |    |
|  +---------------------------------------------------------------+    |
|                                                                        |
|  STRONG FORM                                                           |
|  +---------------------------------------------------------------+    |
|  | Prices reflect ALL information (including PRIVATE/insider)     |    |
|  |                                                                |    |
|  | Implication: Even insider information cannot profit             |    |
|  | Nobody can consistently beat the market                        |    |
|  |                                                                |    |
|  | Evidence: Clearly false. Insider trading IS profitable         |    |
|  | (which is why it is illegal).                                  |    |
|  +---------------------------------------------------------------+    |
|                                                                        |
|  QUANT PERSPECTIVE:                                                    |
|  Markets are "mostly efficient, mostly of the time."                   |
|  Quants look for small, temporary inefficiencies to exploit.           |
|  The harder the inefficiency is to find and trade, the more            |
|  likely it persists.                                                   |
|                                                                        |
+------------------------------------------------------------------------+
```

### 5.3 Information Asymmetry

```
  INFORMATION ASYMMETRY

  Not all traders have the same information. This creates
  a hierarchy of informedness:

  MOST INFORMED                              LEAST INFORMED
  |                                                      |
  v                                                      v
  Company    Sellside   Buyside    Quant      Retail
  Insiders   Analysts   PMs        Traders    Investors
  |          |          |          |          |
  | Know     | Have     | Read     | See      | Read
  | internal | company  | research | market   | news
  | numbers  | access   | + their  | data +   | after
  | before   | + build  | own      | find     | it has
  | anyone   | models   | research | patterns | moved
  |          |          |          |          | the price

  ADVERSE SELECTION PROBLEM:

  When you trade, you should always ask: "Who is on the
  other side and WHY are they trading?"

  If someone is aggressively selling into your buy order,
  they may know something you do not. This is the fundamental
  challenge of market making and one reason spreads exist --
  they compensate the market maker for the risk of trading
  against informed participants.

  QUANT APPROACH: Statistical models can estimate the
  probability that incoming order flow is "informed" vs
  "uninformed" by analyzing:
  - Order size relative to typical
  - Time of arrival (near earnings? near macro releases?)
  - Aggressiveness (market orders vs limit orders)
  - Sequential patterns (repeated one-sided flow)
```

### 5.4 Price Impact and Market Impact

```
  PRICE IMPACT

  When you trade, you move the price. This is called
  price impact and it is a cost that is often larger
  than commissions for institutional traders.

  TEMPORARY vs PERMANENT IMPACT:

  Price
  |
  |         *  <- Temporary impact (immediately after trade)
  |        / \
  |       /   *  <- Price partially reverts
  |      /     \___*___*___  <- New permanent level
  |     /
  |    *  <- Price before trade
  |
  +-----+--+--+--+--+--+--+---> Time
       Trade              Minutes later

  Temporary impact: Market bounces back as order book
  replenishes. This is the "resiliency" of the market.

  Permanent impact: Your trade revealed information.
  The market adjusts to incorporate this new info.

  SQUARE ROOT LAW OF MARKET IMPACT:

  Impact ~ sigma * sqrt(Q / V)

  Where:
  sigma = daily volatility of the stock
  Q     = number of shares you trade
  V     = average daily volume

  Example:
  AAPL: sigma = 1.5%, V = 50,000,000 shares/day
  You want to trade Q = 500,000 shares

  Impact ~ 1.5% * sqrt(500,000 / 50,000,000)
         ~ 1.5% * sqrt(0.01)
         ~ 1.5% * 0.1
         ~ 0.15%

  On a $185 stock, that is ~$0.28 per share in market impact.
  For 500,000 shares: $140,000 in impact cost alone.

  This is why execution algorithms (TWAP, VWAP) exist --
  to minimize market impact by spreading orders over time.
```

---

## 6. Key Market Participants

Understanding who you trade against is critical. Each participant type has different objectives, constraints, time horizons, and information advantages.

```
+------------------------------------------------------------------------+
|                    MARKET PARTICIPANT ECOSYSTEM                         |
+------------------------------------------------------------------------+
|                                                                        |
|                        REGULATORS                                      |
|                   (SEC, CFTC, FINRA)                                   |
|                          |                                             |
|    +-----------+---------+---------+------------+                      |
|    |           |                   |            |                      |
|    v           v                   v            v                      |
| SELL SIDE   EXCHANGES          BUY SIDE     DATA/INFRA                |
| (Banks)     (NYSE,NASDAQ)      (Funds)      (Bloomberg)              |
|    |           |                   |            |                      |
|    +-----+-----+-----+-----+------+            |                      |
|          |           |           |              |                      |
|          v           v           v              |                      |
|      MARKET       LARGE       RETAIL            |                      |
|      MAKERS     INSTITUTIONS  TRADERS           |                      |
|                                                                        |
+------------------------------------------------------------------------+
```

### 6.1 Participant Types in Detail

```
  RETAIL TRADERS
  +------------------------------------------------------+
  | Who:     Individuals trading personal accounts        |
  | Size:    $100 - $1,000,000 typically                  |
  | Edge:    Patience, flexibility, no benchmark          |
  | Weakness: Information disadvantage, emotional bias    |
  | Horizon: Minutes to months                            |
  | Platforms: Robinhood, Interactive Brokers, Schwab     |
  |                                                      |
  | ~25% of US equity volume (up from ~10% pre-2020)     |
  +------------------------------------------------------+

  INSTITUTIONAL INVESTORS
  +------------------------------------------------------+
  | Who:     Mutual funds, ETF providers                  |
  | Size:    $1B - $1T+ AUM                               |
  | Edge:    Scale, research teams, data access            |
  | Weakness: Size (hard to trade without impact),         |
  |          regulatory constraints, benchmark tracking    |
  | Horizon: Months to years                               |
  | Examples: BlackRock, Vanguard, Fidelity                |
  |                                                      |
  | Key fact: Index funds MUST buy/sell when index          |
  | composition changes -- they have no choice. This       |
  | creates predictable trading patterns that quants       |
  | exploit (index rebalance front-running).               |
  +------------------------------------------------------+

  MARKET MAKERS
  +------------------------------------------------------+
  | Who:     Firms that continuously quote bid/ask         |
  | Size:    Handle billions in daily volume               |
  | Edge:    Speed (microsecond latency), technology,      |
  |          rebates from exchanges, information from      |
  |          order flow                                    |
  | Weakness: Adverse selection, inventory risk             |
  | Horizon: Milliseconds to minutes                       |
  | Examples: Citadel Securities, Virtu, Jane Street       |
  |                                                      |
  | Virtu had 1 losing day in 6+ years of trading.        |
  | That tells you how consistent their edge is.          |
  +------------------------------------------------------+

  PROPRIETARY TRADERS (Prop Shops)
  +------------------------------------------------------+
  | Who:     Firms trading their own capital                |
  | Size:    $100M - $10B+ in trading capital              |
  | Edge:    Technology + talent + speed                    |
  | Weakness: Alpha decay (signals get crowded)             |
  | Horizon: Microseconds to weeks                         |
  | Examples: Jump Trading, Tower Research, HRT,           |
  |          DRW, Optiver, SIG                             |
  +------------------------------------------------------+

  HEDGE FUNDS
  +------------------------------------------------------+
  | Who:     Pooled investment vehicles for sophisticated   |
  |          investors (accredited/qualified)              |
  | Size:    $100M - $100B+ AUM                            |
  | Edge:    Flexible mandates, leverage, short selling,    |
  |          alternative data, top talent                  |
  | Weakness: Performance pressure, fee drag (2/20),        |
  |          redemption risk                               |
  | Horizon: Days to years                                 |
  | Styles:                                                |
  |   Quant: Renaissance (Medallion), Two Sigma, DE Shaw  |
  |   Macro: Bridgewater, Soros, Tudor                     |
  |   L/S:   Tiger Global, Coatue, Viking                  |
  +------------------------------------------------------+

  PENSION FUNDS & SOVEREIGN WEALTH FUNDS
  +------------------------------------------------------+
  | Who:     Government/corporate retirement funds +       |
  |          national investment funds                    |
  | Size:    $100B - $1T+ AUM (largest pools of capital)  |
  | Edge:    Very long horizon, patient capital             |
  | Weakness: Bureaucratic, slow decision-making            |
  | Horizon: Years to decades                               |
  | Examples: Norway GPFG ($1.7T), CalPERS ($500B),        |
  |          GIC Singapore, ADIA Abu Dhabi                 |
  +------------------------------------------------------+

  HIGH-FREQUENCY TRADERS (HFT)
  +------------------------------------------------------+
  | Who:     Subset of prop shops specializing in speed    |
  | Size:    Small per-trade profit, massive volume        |
  | Edge:    Microsecond latency, co-location, FPGA/ASIC  |
  | Weakness: Massive infrastructure cost, arms race        |
  | Horizon: Microseconds to milliseconds                  |
  | Strategies:                                            |
  |   - Market making (tightest quotes, fastest cancels)   |
  |   - Statistical arbitrage (cross-venue)                |
  |   - Latency arbitrage (faster data feeds)              |
  |   - Event-driven (macro data releases)                 |
  |                                                      |
  | HFT accounts for ~50% of US equity volume.            |
  | Average holding period: 1-10 seconds.                  |
  | Profit per trade: often < $0.01/share.                 |
  | Daily trades: millions.                                |
  +------------------------------------------------------+
```

### 6.2 The Food Chain

```
  THE MARKET FOOD CHAIN

  Think of markets as an ecosystem where participants
  trade against each other:

       Informed traders
       (hedge funds, insiders)
              |
              | trade against
              v
       Market makers
       (Citadel, Virtu)
              |
              | trade against
              v
       Uninformed flow
       (retail, index funds)
              |
              | creates
              v
       Predictable patterns
       (index rebalance, option hedging)
              |
              | exploited by
              v
       Systematic traders
       (quant funds, prop shops)

  YOUR GOAL AS A QUANT:
  - Find trades where YOU are the more informed party
  - Avoid trades where you are the LESS informed party
  - Never forget: for every trade, someone is on the
    other side. If you cannot identify who and why,
    you are likely the "dumb money."
```

---

## 7. Market Data

Data is the raw material of quantitative trading. The quality, granularity, and timeliness of your data directly determine the quality of your research and the viability of your strategies.

### 7.1 Level 1 vs Level 2 Data

```
  MARKET DATA HIERARCHY

  LEVEL 1 (Top of Book / BBO)
  +------------------------------------------------------+
  | What you get:                                         |
  |   Best Bid:  $185.10  x  500 shares                  |
  |   Best Ask:  $185.12  x  300 shares                  |
  |   Last Trade: $185.11  x  100 shares                 |
  |                                                      |
  | This is the most basic market data.                   |
  | Free from most brokers.                               |
  | Updated in real-time.                                 |
  | Sufficient for most retail strategies.                |
  +------------------------------------------------------+

  LEVEL 2 (Depth of Book / Full Order Book)
  +------------------------------------------------------+
  | What you get: ALL visible orders at ALL price levels  |
  |                                                      |
  |  ASK SIDE                    BID SIDE                |
  |  Price    Size  Orders       Price    Size  Orders   |
  |  $185.16  2,100    8         $185.10  4,500   15    |
  |  $185.15  1,800    6         $185.09  3,200   12    |
  |  $185.14  1,200    5         $185.08  2,800   10    |
  |  $185.13    900    4         $185.07  1,500    7    |
  |  $185.12    300    2         $185.06    800    4    |
  |                                                      |
  | More expensive. Paid subscription required.           |
  | Essential for market making and HFT strategies.       |
  | Shows market depth and potential support/resistance.  |
  +------------------------------------------------------+

  LEVEL 3 (Full Order-by-Order Feed)
  +------------------------------------------------------+
  | What you get: Every individual order with unique ID   |
  |                                                      |
  | Order 12345: BUY  500 @ $185.10 (placed 09:30:01.234)|
  | Order 12346: BUY  200 @ $185.10 (placed 09:30:01.567)|
  | Order 12347: SELL 300 @ $185.12 (placed 09:30:01.890)|
  |                                                      |
  | Most granular. Available from exchange direct feeds.  |
  | Required for order flow analysis and HFT.             |
  | Can see individual order modifications and cancels.   |
  | Generates massive data volumes (GB per day per stock).|
  +------------------------------------------------------+

  DATA VOLUME COMPARISON:

  Level 1:  ~100 messages/second per active stock
  Level 2:  ~10,000 messages/second per active stock
  Level 3:  ~100,000+ messages/second per active stock

  For all US equities combined:
  Peak message rate: ~10 million messages per second
  Daily data volume: ~50-100 GB compressed
```

### 7.2 OHLCV Bars

```
  OHLCV (Open, High, Low, Close, Volume)

  The most common format for historical price data.
  Each "bar" summarizes trading activity over a time period.

  DAILY BAR EXAMPLE (AAPL, March 1, 2026):
  +------------------------------------------------------+
  | Open:   $184.50  (first trade of the day)             |
  | High:   $186.20  (highest trade of the day)           |
  | Low:    $183.80  (lowest trade of the day)            |
  | Close:  $185.75  (last trade of the day)              |
  | Volume: 52,340,000 shares traded                      |
  +------------------------------------------------------+

  CANDLESTICK VISUALIZATION:

  Bullish (Close > Open)        Bearish (Close < Open)

      --- $186.20 High              --- $186.20 High
       |                             |
      +++ $185.75 Close             +++ $185.75 Open
      |||                           |||
      ||| Body (filled/hollow)      ||| Body (filled/solid)
      |||                           |||
      +++ $184.50 Open              +++ $184.50 Close
       |                             |
      --- $183.80 Low               --- $183.80 Low

  ASCII CANDLESTICK CHART (5 days):

  $187 |
  $186 |    |     |
  $185 |  +-+-+   +-+   |
  $184 |  | | |   | |  +-+-+  +-+
  $183 |  +-+-+   | |  | | |  | |
  $182 |    |     +-+  | | |  | |
  $181 |          |    +-+-+  +-+
  $180 |                |      |
       +--+-----+-----+-----+-----+
         Mon    Tue   Wed   Thu   Fri

  COMMON BAR FREQUENCIES:
  1-minute bars:  Intraday strategies, ~390 bars per day
  5-minute bars:  Swing strategies, ~78 bars per day
  15-minute bars: Position entries, ~26 bars per day
  1-hour bars:    Medium-term, ~6.5 bars per day
  Daily bars:     Long-term strategies, ~252 bars per year
  Weekly bars:    Very long-term, ~52 bars per year

  QUANT NOTE: Bar frequency matters enormously.
  A pattern visible on daily bars may not exist on 1-min bars.
  Always match your data frequency to your strategy's
  expected holding period.
```

### 7.3 Tick Data

```
  TICK DATA (Trade and Quote Data)

  Tick data records EVERY individual event in the market.

  TRADE TICKS:
  Timestamp              Price    Size   Exchange  Conditions
  09:30:00.123456789     $185.10   100   NASDAQ    @
  09:30:00.123457234     $185.10   200   NYSE
  09:30:00.123458901     $185.11   500   ARCA
  09:30:00.123459012     $185.12   150   BATS
  09:30:00.123460345     $185.11   300   NASDAQ

  QUOTE TICKS:
  Timestamp              BidPx    BidSz  AskPx    AskSz  Exch
  09:30:00.123456000     $185.09  500    $185.11  300    NASDAQ
  09:30:00.123456100     $185.10  200    $185.11  300    NYSE
  09:30:00.123456200     $185.10  700    $185.12  400    NASDAQ
  09:30:00.123456300     $185.10  700    $185.11  150    BATS

  WHY TICK DATA MATTERS:
  +------------------------------------------------------+
  | 1. Most granular view of market activity              |
  | 2. Essential for market microstructure research       |
  | 3. Required for accurate backtesting of HFT          |
  | 4. Reveals patterns invisible in bar data             |
  |    (e.g., trade clustering, quote stuffing)           |
  | 5. Necessary for calculating accurate VWAP            |
  +------------------------------------------------------+

  DATA STORAGE CHALLENGE:

  1 stock x 1 day = ~500 MB of tick data
  4,000 US stocks x 252 days = ~504 TB per year

  This is why quants must understand data engineering,
  compression (Parquet, HDF5), and efficient storage.
```

### 7.4 Corporate Actions and Data Adjustments

```
  CORPORATE ACTIONS AND THEIR IMPACT ON DATA

  +---------------------------------------------------------------+
  |  Action          Effect on Price    Effect on Volume            |
  +---------------------------------------------------------------+
  |  Stock Split     Price / split      Volume x split ratio       |
  |  (2:1)           ratio                                         |
  |  Example:        $200 -> $100      1M -> 2M shares             |
  +---------------------------------------------------------------+
  |  Reverse Split   Price x ratio     Volume / ratio              |
  |  (1:10)                                                        |
  |  Example:        $0.50 -> $5.00    10M -> 1M shares            |
  +---------------------------------------------------------------+
  |  Cash Dividend   Price drops by    No direct effect             |
  |                  ~dividend amount                              |
  |  Example:        $100 -> $99 on    Volume may spike on          |
  |                  ex-div date       ex-div date                  |
  +---------------------------------------------------------------+
  |  Spin-off        Price drops by    Shares of new company        |
  |                  value of new co.  distributed                  |
  +---------------------------------------------------------------+
  |  Merger (cash)   Converges to      Volume spikes on             |
  |                  acquisition price  announcement                |
  +---------------------------------------------------------------+

  WHY ADJUSTMENT MATTERS:

  RAW PRICES (unadjusted):
  Day    Price     Event
  ----   ------    -----
  D-2    $200.00
  D-1    $198.00
  D0     $100.00   <-- 2:1 split on this day
  D+1    $101.00
  D+2    $103.00

  Naive return D-1 to D0: ($100 - $198) / $198 = -49.5%
  This is WRONG. The stock did not crash 49.5%.

  ADJUSTED PRICES (split-adjusted):
  Day    Adj Price  Event
  ----   ---------  -----
  D-2    $100.00    (divided by 2)
  D-1    $99.00     (divided by 2)
  D0     $100.00    <-- split day
  D+1    $101.00
  D+2    $103.00

  Correct return D-1 to D0: ($100 - $99) / $99 = +1.01%

  RULE: ALWAYS use adjusted prices for return calculations.
  Most data providers offer "adjusted close" fields.
```

### 7.5 Data Vendors and Free Data Sources

```
+------------------------------------------------------------------------+
|                    MARKET DATA SOURCES                                  |
+------------------------------------------------------------------------+
|                                                                        |
|  PROFESSIONAL (Expensive)           COST                               |
|  +--------------------------------+-----------------------------+      |
|  | Bloomberg Terminal              | ~$24,000/year per seat     |      |
|  | Refinitiv (LSEG) Eikon          | ~$15,000/year per seat     |      |
|  | FactSet                         | ~$12,000/year per seat     |      |
|  | S&P Capital IQ                  | ~$15,000/year              |      |
|  | WRDS (academic)                 | ~$3,000/year (university)  |      |
|  +--------------------------------+-----------------------------+      |
|                                                                        |
|  MID-TIER (Affordable)                                                 |
|  +--------------------------------+-----------------------------+      |
|  | Polygon.io                      | $99-$499/month             |      |
|  | Databento                       | Usage-based pricing        |      |
|  | Norgate Data                    | $50-$200/month             |      |
|  | Quandl (Nasdaq Data Link)       | $50-$500/month             |      |
|  +--------------------------------+-----------------------------+      |
|                                                                        |
|  FREE (Limited)                                                        |
|  +--------------------------------+-----------------------------+      |
|  | Yahoo Finance (yfinance)        | Daily OHLCV, delayed       |      |
|  | Alpha Vantage                   | 5 requests/min free tier   |      |
|  | FRED (Federal Reserve)          | Economic/macro data        |      |
|  | SEC EDGAR                       | Company filings (10-K etc) |      |
|  | CoinGecko / CoinMarketCap      | Crypto data                |      |
|  | Binance API                     | Crypto tick data           |      |
|  +--------------------------------+-----------------------------+      |
|                                                                        |
|  GETTING STARTED RECOMMENDATION:                                       |
|  1. Yahoo Finance (yfinance library) for daily equity data             |
|  2. FRED for macro/economic data                                       |
|  3. Binance API for crypto tick data                                   |
|  4. Polygon.io when you need intraday equity data                      |
|                                                                        |
+------------------------------------------------------------------------+
```

---

## 8. Key Financial Concepts for Quants

These are the quantitative building blocks you will use in every chapter that follows. Each concept is introduced here at a level sufficient for understanding; later chapters will expand on them.

### 8.1 Returns: Simple vs Log Returns

```
  SIMPLE (ARITHMETIC) RETURNS

  r = (P_t - P_{t-1}) / P_{t-1}
  r = (ending price - beginning price) / beginning price

  Example:
  Buy at $100, sell at $110
  Simple return = ($110 - $100) / $100 = 0.10 = 10%

  Buy at $100, sell at $90
  Simple return = ($90 - $100) / $100 = -0.10 = -10%


  LOG (CONTINUOUSLY COMPOUNDED) RETURNS

  r_log = ln(P_t / P_{t-1})

  Example:
  Buy at $100, sell at $110
  Log return = ln(110/100) = ln(1.10) = 0.0953 = 9.53%

  Buy at $100, sell at $90
  Log return = ln(90/100) = ln(0.90) = -0.1054 = -10.54%


  WHY DO QUANTS PREFER LOG RETURNS?

  +------------------------------------------------------+
  | 1. ADDITIVITY OVER TIME                               |
  |    Log returns can be summed across time periods.     |
  |                                                      |
  |    Day 1: $100 -> $110  (log: +0.0953)               |
  |    Day 2: $110 -> $105  (log: -0.0465)               |
  |    Total: 0.0953 + (-0.0465) = 0.0488                |
  |    Check: ln(105/100) = 0.0488  CORRECT              |
  |                                                      |
  |    Simple returns cannot be summed:                   |
  |    Day 1: +10%, Day 2: -4.55%                        |
  |    10% + (-4.55%) = 5.45%                            |
  |    But actual: (105-100)/100 = 5%  WRONG             |
  +------------------------------------------------------+
  | 2. SYMMETRY                                           |
  |    +10% then -10% with simple returns:               |
  |    $100 -> $110 -> $99 (you lost money!)             |
  |                                                      |
  |    +0.0953 then -0.0953 with log returns:            |
  |    $100 -> $110 -> $100 (symmetric, back to start)   |
  +------------------------------------------------------+
  | 3. BETTER STATISTICAL PROPERTIES                      |
  |    Log returns are approximately normal (Gaussian)    |
  |    Simple returns are bounded at -100% (cannot go     |
  |    below -100%, but no upper bound)                   |
  +------------------------------------------------------+

  CONVERSION:
  log_return = ln(1 + simple_return)
  simple_return = exp(log_return) - 1

  FOR SMALL RETURNS (< 5%), they are approximately equal:
  Simple: 2.00%    Log: 1.98%    Difference: 0.02%
  Simple: 0.50%    Log: 0.50%    Difference: ~0.00%
```

### 8.2 Volatility

```
  VOLATILITY: THE MOST IMPORTANT RISK MEASURE

  Volatility measures how much an asset's price fluctuates.
  It is defined as the standard deviation of returns.

  CALCULATING HISTORICAL VOLATILITY (Step by Step):

  Day   Close    Log Return
  ---   ------   ----------
  1     $100.00
  2     $102.00  ln(102/100) = +0.0198
  3     $99.50   ln(99.5/102) = -0.0248
  4     $101.00  ln(101/99.5) = +0.0150
  5     $103.50  ln(103.5/101) = +0.0245
  6     $102.00  ln(102/103.5) = -0.0146

  Step 1: Calculate mean return
  mean = (0.0198 - 0.0248 + 0.0150 + 0.0245 - 0.0146) / 5
       = 0.0040

  Step 2: Calculate squared deviations from mean
  (0.0198 - 0.0040)^2 = 0.000250
  (-0.0248 - 0.0040)^2 = 0.000829
  (0.0150 - 0.0040)^2 = 0.000121
  (0.0245 - 0.0040)^2 = 0.000420
  (-0.0146 - 0.0040)^2 = 0.000346

  Step 3: Calculate variance (using N-1 for sample)
  variance = (0.000250 + 0.000829 + 0.000121
              + 0.000420 + 0.000346) / 4
           = 0.000492

  Step 4: Standard deviation (daily volatility)
  daily_vol = sqrt(0.000492) = 0.0222 = 2.22% per day

  Step 5: Annualize (multiply by sqrt of trading days)
  annual_vol = 2.22% x sqrt(252) = 2.22% x 15.87
             = 35.2% per year


  VOLATILITY COMPARISON:

  Asset Class              Typical Annual Volatility
  ----------------------   -------------------------
  US Treasury Bills        ~0.5%
  US Treasury Bonds        ~8-12%
  S&P 500 Index            ~15-20%
  Individual US stocks     ~25-50%
  Emerging market stocks   ~25-35%
  Commodities (oil)        ~30-40%
  Bitcoin                  ~60-80%

  VOLATILITY VISUALIZATION:

  Low Volatility (10%)              High Volatility (50%)
  Price                             Price
  |    /-\   /--\                    |      /\
  |   /   \_/    \   /\             |     /  \     /\
  |  /            \_/  \            |    /    \   /  \
  | /                   \           |   /      \_/    \
  |/                     \          |  /               \  /
  |                       --        | /                 \/
  +----------------------->Time    +----------------------->Time
  Smooth, gradual changes           Wild swings, large moves

  WHY VOLATILITY MATTERS FOR QUANTS:
  +------------------------------------------------------+
  | 1. Risk measurement: Higher vol = higher risk         |
  | 2. Position sizing: Trade smaller in high vol         |
  | 3. Option pricing: Vol is the key input to            |
  |    Black-Scholes (Chapter 13)                         |
  | 4. Strategy selection: Mean-reversion works in low    |
  |    vol; momentum works in high vol (generally)        |
  | 5. Regime detection: Vol regime changes signal         |
  |    shifts in market behavior                          |
  +------------------------------------------------------+
```

### 8.3 Correlation

```
  CORRELATION: HOW ASSETS MOVE TOGETHER

  Correlation (rho) ranges from -1 to +1.

  +1.0  Perfect positive: assets move in lockstep
   0.0  No relationship: movements are independent
  -1.0  Perfect negative: assets move in opposite directions

  VISUAL:

  rho = +0.9 (Strong positive)
  Asset B
  |          *  *
  |        *  *
  |      *  *
  |    *  *
  |  *  *
  +--*--*------------> Asset A
  Both go up together, both go down together.

  rho = 0.0 (No correlation)
  Asset B
  |  *    *     *
  |     *    *
  |  *     *   *
  |    *  *  *
  |  *   *    *
  +-----------------> Asset A
  No pattern -- knowing A tells you nothing about B.

  rho = -0.8 (Strong negative)
  Asset B
  |*  *
  |  *  *
  |    *  *
  |      *  *
  |        *  *
  +-----------------> Asset A
  When A goes up, B goes down (and vice versa).


  REAL-WORLD CORRELATIONS (approximate):

  +----------------------------------------------+
  | Pair                    Correlation           |
  +----------------------------------------------+
  | AAPL vs MSFT            +0.75                 |
  | S&P 500 vs NASDAQ       +0.95                 |
  | Stocks vs Bonds         -0.20 to +0.30        |
  | Gold vs USD             -0.40                 |
  | Oil vs Airlines         -0.50                 |
  | BTC vs S&P 500          +0.30 to +0.60        |
  +----------------------------------------------+

  DIVERSIFICATION BENEFIT:

  Two assets, each with 20% annual volatility:

  Correlation    Portfolio Vol    Reduction
  of +1.0        (50/50 mix)
  ----------     ---------------  ---------
  +1.0           20.0%            0%
  +0.5           17.3%            13.5%
   0.0           14.1%            29.5%
  -0.5           10.0%            50.0%
  -1.0            0.0%            100%

  With rho = -1 and equal weights, you can theoretically
  eliminate ALL volatility. This is why portfolio construction
  (Chapter 14) obsesses over correlations.

  WARNING: Correlations are NOT stable. They increase during
  crises ("correlations go to 1 in a crash"). This is the
  biggest trap in portfolio diversification.
```

### 8.4 Alpha and Beta

```
  ALPHA AND BETA: DECOMPOSING RETURNS

  The Capital Asset Pricing Model (CAPM) says:

  R_stock = alpha + beta * R_market + epsilon

  Where:
  R_stock   = return of the stock
  R_market  = return of the market (e.g., S&P 500)
  alpha     = excess return not explained by market
  beta      = sensitivity to market movements
  epsilon   = random noise

  BETA INTERPRETATION:

  Beta = 1.0:  Stock moves 1:1 with market
               Market up 2% -> Stock up ~2%

  Beta = 1.5:  Stock is 50% MORE volatile than market
               Market up 2% -> Stock up ~3%
               Market down 2% -> Stock down ~3%

  Beta = 0.5:  Stock is 50% LESS volatile than market
               Market up 2% -> Stock up ~1%

  Beta = 0.0:  Stock is unrelated to market
               (rare for stocks, common for market-neutral
               hedge fund strategies)

  Beta = -0.5: Stock moves OPPOSITE to market
               Market up 2% -> Stock down ~1%

  EXAMPLES:
  +----------------------------------------------+
  | Stock         Beta     Interpretation         |
  +----------------------------------------------+
  | Tesla (TSLA)  ~1.8     High beta, amplifies   |
  |                        market moves           |
  | Procter &     ~0.5     Low beta, defensive,   |
  | Gamble (PG)            stable business        |
  | Gold ETF      ~0.0     Not correlated with    |
  | (GLD)                  stock market           |
  | Inverse ETF   ~-1.0    Moves opposite to      |
  | (SH)                   market (by design)     |
  +----------------------------------------------+


  ALPHA INTERPRETATION:

  Alpha is the HOLY GRAIL of quantitative trading.

  Alpha > 0: Strategy beats the market after adjusting for risk
  Alpha = 0: Strategy matches the market (beta exposure only)
  Alpha < 0: Strategy underperforms (you should just buy index)

  EXAMPLE:
  Your strategy returned 15% this year.
  The market returned 10%.
  Your portfolio beta = 1.2

  Expected return from beta alone: 1.2 x 10% = 12%
  Your alpha: 15% - 12% = 3%

  You generated 3% of genuine skill-based return (alpha)
  above and beyond what you would have earned from simply
  having market exposure (beta).

  QUANT GOAL:
  +------------------------------------------------------+
  | Maximize alpha (skill-based returns)                  |
  | Minimize or neutralize beta (market exposure)         |
  |                                                      |
  | A "market-neutral" strategy has beta ~ 0.             |
  | Its returns come purely from alpha.                   |
  | This is what most quant hedge funds aim for.          |
  +------------------------------------------------------+
```

### 8.5 The Sharpe Ratio (Preview)

```
  SHARPE RATIO: RISK-ADJUSTED RETURN

  Sharpe = (R_portfolio - R_riskfree) / sigma_portfolio

  Where:
  R_portfolio  = annualized portfolio return
  R_riskfree   = risk-free rate (e.g., T-bill rate)
  sigma        = annualized portfolio volatility

  EXAMPLE:
  Strategy A: Return = 20%, Vol = 25%, Risk-free = 5%
  Sharpe A = (20% - 5%) / 25% = 0.60

  Strategy B: Return = 12%, Vol = 8%, Risk-free = 5%
  Sharpe B = (12% - 5%) / 8% = 0.875

  Strategy B is BETTER on a risk-adjusted basis despite
  lower absolute returns. You could lever Strategy B to
  match Strategy A's returns at lower risk.

  SHARPE RATIO INTERPRETATION:
  +------------------------------------------------------+
  | Sharpe < 0.5:  Poor (most retail traders)             |
  | Sharpe 0.5-1.0: Acceptable (decent active fund)      |
  | Sharpe 1.0-2.0: Very good (top hedge funds)          |
  | Sharpe 2.0-3.0: Excellent (elite strategies)         |
  | Sharpe > 3.0:   Extraordinary (HFT, likely overfitted|
  |                 if in backtesting, suspicious)        |
  +------------------------------------------------------+

  REAL-WORLD BENCHMARKS:
  S&P 500 long-term Sharpe:       ~0.4
  Typical hedge fund:             ~0.5-1.0
  Renaissance Medallion (legend): reportedly ~3.0+
  Top HFT strategies:             ~5.0+ (but tiny capacity)

  WARNING: Sharpe ratio has limitations:
  1. Assumes returns are normally distributed (they're not)
  2. Does not distinguish upside vs downside volatility
  3. Can be gamed by strategies with rare large losses
  4. Sensitive to the time period chosen

  Chapter 09 covers alternative risk metrics (Sortino ratio,
  maximum drawdown, Calmar ratio) that address these issues.
```

### 8.6 Liquidity and Its Measurement

```
  LIQUIDITY: CAN YOU TRADE WITHOUT MOVING THE PRICE?

  Liquidity is the ability to buy or sell an asset quickly,
  in size, without significantly impacting the price.

  DIMENSIONS OF LIQUIDITY:

  +------------------------------------------------------+
  | Dimension     Measure           Example               |
  +------------------------------------------------------+
  | Tightness     Bid-ask spread    AAPL: $0.01           |
  |                                 Penny stock: $0.10    |
  +------------------------------------------------------+
  | Depth         Size at best      AAPL: 50,000 shares   |
  |               bid/ask           Small cap: 500 shares |
  +------------------------------------------------------+
  | Breadth       Total volume      AAPL: 50M shares/day  |
  |               across all levels Small cap: 100K/day   |
  +------------------------------------------------------+
  | Resiliency    Recovery speed    AAPL: milliseconds     |
  |               after large trade Small cap: minutes     |
  +------------------------------------------------------+
  | Immediacy     Time to execute   AAPL: instant          |
  |                                 Illiquid bond: hours   |
  +------------------------------------------------------+

  LIQUIDITY SPECTRUM:

  MOST LIQUID                              LEAST LIQUID
  |                                               |
  v                                               v
  US           FX        Govt     Corp    Real    Private
  Treasury   Majors    Bonds    Bonds   Estate  Equity
  Bills     (EUR/USD)          (HY)

  US T-Bill -> days to settle, effectively instant
  Private Equity -> can take months/years to exit

  LIQUIDITY COST EXAMPLE:

  You want to buy $1,000,000 worth of stock.

  Liquid Stock (AAPL):
  +----------------------------------------------+
  | Spread cost: $0.01 x 5,400 shares = $54      |
  | Market impact: ~0.01% = $100                  |
  | Total cost: ~$154 (0.015% of order)           |
  +----------------------------------------------+

  Illiquid Stock (small-cap, thin):
  +----------------------------------------------+
  | Spread cost: $0.10 x 20,000 shares = $2,000  |
  | Market impact: ~0.50% = $5,000               |
  | Total cost: ~$7,000 (0.70% of order)          |
  +----------------------------------------------+

  The illiquid stock costs 45x more to trade!
  This is why many strategies that "work" in backtesting
  fail in practice -- they trade illiquid instruments where
  the costs overwhelm the signal.

  QUANT RULE OF THUMB:
  +------------------------------------------------------+
  | Never backtest a strategy on an instrument you cannot |
  | actually trade at the assumed prices.                 |
  |                                                      |
  | Always include realistic transaction costs:           |
  | - Commission: $0.005/share or less these days         |
  | - Spread: half the bid-ask spread                     |
  | - Market impact: use the square root law              |
  | - Slippage: 10-50% of spread as a buffer              |
  +------------------------------------------------------+
```

---

## Summary

```
+------------------------------------------------------------------------+
|                    CHAPTER 1 KEY TAKEAWAYS                              |
+------------------------------------------------------------------------+
|                                                                        |
|  MARKETS exist to allocate capital, discover prices, provide           |
|  liquidity, and transfer risk.                                         |
|                                                                        |
|  ASSET CLASSES: Equities (ownership), bonds (lending), FX              |
|  (currencies), commodities (physical goods), derivatives               |
|  (contracts), crypto (digital assets).                                 |
|                                                                        |
|  MARKET STRUCTURE: Exchanges (transparent, regulated) vs OTC           |
|  (bilateral, custom). The CLOB is the core data structure.             |
|  Market makers provide liquidity and earn the spread.                  |
|                                                                        |
|  ORDER TYPES: Market (speed), limit (price), stop (protection).        |
|  TWAP/VWAP for large orders. Understand maker vs taker.                |
|                                                                        |
|  PRICE FORMATION: Supply and demand drive prices. EMH says             |
|  markets are mostly efficient. Your job is to find where               |
|  they are not.                                                         |
|                                                                        |
|  PARTICIPANTS: Retail, institutions, market makers, prop shops,        |
|  hedge funds, HFT. Know who you are trading against.                   |
|                                                                        |
|  MARKET DATA: L1 (basic quotes), L2 (full book), L3 (individual       |
|  orders). OHLCV for research. Tick data for microstructure.            |
|  Always adjust for corporate actions.                                  |
|                                                                        |
|  KEY CONCEPTS: Use log returns (additive over time). Volatility        |
|  measures risk. Correlation drives diversification. Alpha is           |
|  skill-based return, beta is market exposure. Sharpe ratio             |
|  measures risk-adjusted return. Liquidity determines                   |
|  whether your strategy is actually tradeable.                          |
|                                                                        |
+------------------------------------------------------------------------+
```

---

## What Comes Next

Chapter 02 (Mathematical Foundations) will formalize the concepts introduced here. You will learn the probability theory, linear algebra, calculus, and stochastic processes that underpin every quantitative model. With the market knowledge from this chapter and the mathematical tools from the next, you will be ready to start building trading strategies.

```
  YOUR JOURNEY SO FAR:

  [Ch 01: Financial Markets] -----> You Are Here
       |
       v
  [Ch 02: Mathematical Foundations]
       |
       v
  [Ch 03: Python for Quant Trading]
       |
       v
  [Ch 04: C++ for Low-Latency Systems]
       |
       v
  ... (13 more chapters to mastery)
```

---

## Practice Questions

1. A stock trades at $50 with a bid of $49.98 and ask of $50.02. What is the spread in dollars and in basis points?

2. If you buy a bond with a 5% coupon and interest rates rise to 7%, does the bond price go up or down? Why?

3. Calculate the log return for a stock that goes from $100 to $95 to $102 over two days. Show that the sum of daily log returns equals the total log return.

4. A stock has a beta of 1.3. The market returns 8% and the risk-free rate is 4%. What return does CAPM predict for this stock?

5. Your strategy returns 18% annually with 12% volatility. The risk-free rate is 5%. What is the Sharpe ratio? Is this considered good?

6. You need to buy 200,000 shares of a stock that trades 2,000,000 shares per day with 1.5% daily volatility. Estimate the market impact using the square root law.

7. Explain why a pension fund would use a dark pool instead of a lit exchange to sell 3,000,000 shares.

8. What is the difference between contango and backwardation? Give a real-world example of when each might occur.

---

## Answers

**1.** Spread = $50.02 - $49.98 = $0.04. In basis points: ($0.04 / $50.00) x 10,000 = 8 basis points.

**2.** The bond price goes DOWN. New bonds offer 7%, so nobody will pay full price for your 5% bond. The price must drop until the yield equals approximately 7%.

**3.** Day 1: ln(95/100) = -0.05129. Day 2: ln(102/95) = +0.07129. Sum = +0.02000. Total: ln(102/100) = +0.01980. (The small difference is due to rounding; with exact values they match perfectly.)

**4.** Expected return = Risk-free + Beta x (Market - Risk-free) = 4% + 1.3 x (8% - 4%) = 4% + 5.2% = 9.2%.

**5.** Sharpe = (18% - 5%) / 12% = 1.08. This is very good -- in the range of top hedge funds.

**6.** Impact ~ 1.5% x sqrt(200,000 / 2,000,000) = 1.5% x sqrt(0.1) = 1.5% x 0.316 = 0.474%. On a $50 stock, that is about $0.24 per share or $48,000 total impact cost.

**7.** Posting 3,000,000 shares on a lit exchange would signal to the market that a massive seller exists. Other traders would front-run by selling ahead, driving the price down before the pension fund can execute. A dark pool hides the order from public view, allowing execution at or near the midpoint with less market impact.

**8.** Contango: futures price > spot price. Common in oil markets when storage costs are high and there is no supply shortage. Backwardation: futures price < spot price. Occurs during supply shortages (e.g., a refinery outage causing near-term oil scarcity) where the market pays a premium for immediate delivery.
