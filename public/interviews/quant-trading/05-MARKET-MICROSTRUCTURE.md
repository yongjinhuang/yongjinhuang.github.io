# Chapter 5: Market Microstructure

## What Is Market Microstructure?

Market microstructure is the study of how markets actually work at the lowest level: how orders arrive, how prices form, how trades get matched, and how information gets incorporated into prices. While traditional finance assumes frictionless markets where you can buy or sell any quantity at the "market price," microstructure reveals the messy reality underneath.

Understanding microstructure is essential for anyone building trading systems. Every basis point of spread, every microsecond of latency, and every tick of price impact directly affects your P&L.

```
+------------------------------------------------------------------------+
|                    MARKET MICROSTRUCTURE OVERVIEW                       |
+------------------------------------------------------------------------+
|                                                                        |
|  PRICE FORMATION          ORDER MATCHING         INFORMATION           |
|  +------------------+    +------------------+   +------------------+   |
|  | Order Book        |    | Matching Engines  |   | Informed Trading  |  |
|  | Bid-Ask Spread    |    | Price-Time FIFO   |   | Kyle's Lambda     |  |
|  | Depth of Book     |    | Pro-Rata          |   | Glosten-Milgrom   |  |
|  | Book Imbalance    |    | Auction Mechanisms|   | PIN / VPIN        |  |
|  +------------------+    +------------------+   +------------------+   |
|                                                                        |
|  MARKET MAKING           PRICE IMPACT           FRAGMENTATION          |
|  +------------------+    +------------------+   +------------------+   |
|  | Spread Capture    |    | Temporary Impact  |   | Multiple Venues   |  |
|  | Inventory Risk    |    | Permanent Impact  |   | NBBO / Reg NMS    |  |
|  | Avellaneda-Stoikov|    | Almgren-Chriss    |   | Dark Pools        |  |
|  | Adverse Selection |    | Square-Root Law   |   | PFOF              |  |
|  +------------------+    +------------------+   +------------------+   |
|                                                                        |
+------------------------------------------------------------------------+
```

---

## 5.1 The Order Book

The order book (also called the limit order book or LOB) is the central data structure of modern electronic markets. It is a real-time record of all outstanding buy and sell orders for a given instrument at each price level.

### 5.1.1 Bid-Ask Spread Explained

The **bid** is the highest price any buyer is currently willing to pay. The **ask** (or offer) is the lowest price any seller is currently willing to accept. The difference between them is the **bid-ask spread**.

```
  ASK SIDE (Sellers)
  +-----------------------------------------+
  |  Price    |  Size   |  # Orders         |
  +-----------------------------------------+
  |  $100.05  |   200   |     3             |  <-- Best Ask (Inside Ask)
  |  $100.06  |   500   |     7             |
  |  $100.07  |  1200   |    12             |
  |  $100.08  |   800   |     5             |
  |  $100.09  |   350   |     4             |
  +-----------------------------------------+

              Spread = $100.05 - $100.03 = $0.02

  BID SIDE (Buyers)
  +-----------------------------------------+
  |  Price    |  Size   |  # Orders         |
  +-----------------------------------------+
  |  $100.03  |   300   |     4             |  <-- Best Bid (Inside Bid)
  |  $100.02  |   600   |     8             |
  |  $100.01  |  1500   |    15             |
  |  $100.00  |  2000   |    20             |
  |   $99.99  |   900   |     6             |
  +-----------------------------------------+

  Mid Price = ($100.05 + $100.03) / 2 = $100.04
```

Key definitions:

- **Best Bid (BB)**: $100.03 -- highest price a buyer will pay
- **Best Ask (BA)**: $100.05 -- lowest price a seller will accept
- **Spread**: BA - BB = $0.02 (2 cents, or 2 basis points on a $100 stock)
- **Mid Price**: (BA + BB) / 2 = $100.04
- **Microprice**: Weighted mid = (BB x AskSize + BA x BidSize) / (BidSize + AskSize)

The spread compensates liquidity providers for two risks:

1. **Inventory risk** -- holding a position that moves against you
2. **Adverse selection** -- trading against someone who knows more than you

### 5.1.2 Depth of Book: Level 1, Level 2, Level 3

Market data comes in different levels of detail:

```
+------------------------------------------------------------------------+
|  LEVEL 1 (Top of Book)                                                 |
|  +------------------------------------------------------------------+  |
|  |  Best Bid: $100.03 x 300    Best Ask: $100.05 x 200             |  |
|  |  Last Trade: $100.04 x 100  Volume: 1,234,567                   |  |
|  +------------------------------------------------------------------+  |
|  Cost: Free or cheap. Available everywhere.                            |
|  Use: Basic price monitoring, simple strategies.                       |
+------------------------------------------------------------------------+
|                                                                        |
|  LEVEL 2 (Depth of Book / Market Depth)                                |
|  +------------------------------------------------------------------+  |
|  |  Bid Side          |          Ask Side                           |  |
|  |  $100.03  x  300   |   $100.05  x  200                          |  |
|  |  $100.02  x  600   |   $100.06  x  500                          |  |
|  |  $100.01  x 1500   |   $100.07  x 1200                          |  |
|  |  $100.00  x 2000   |   $100.08  x  800                          |  |
|  |   $99.99  x  900   |   $100.09  x  350                          |  |
|  +------------------------------------------------------------------+  |
|  Cost: $10-50/month retail, higher institutional.                      |
|  Use: Seeing support/resistance, gauging supply/demand.                |
+------------------------------------------------------------------------+
|                                                                        |
|  LEVEL 3 (Full Order Book / Order-by-Order)                            |
|  +------------------------------------------------------------------+  |
|  |  Bid Side                                                        |  |
|  |  $100.03:  Order#1 100sh @09:30:01.123456                       |  |
|  |            Order#2  50sh @09:30:01.234567                        |  |
|  |            Order#3 150sh @09:30:01.345678                        |  |
|  |  $100.02:  Order#4 200sh @09:30:00.987654                       |  |
|  |            Order#5 400sh @09:30:01.456789                        |  |
|  |            ...                                                   |  |
|  +------------------------------------------------------------------+  |
|  Cost: Exchange direct feed ($thousands/month).                        |
|  Use: HFT, queue position estimation, microstructure research.         |
+------------------------------------------------------------------------+
```

### 5.1.3 Price-Time Priority (FIFO Matching)

Most equity exchanges use price-time priority, also called First-In-First-Out (FIFO). The rules are simple:

1. **Price priority**: Better-priced orders execute first (higher bids, lower asks)
2. **Time priority**: Among orders at the same price, earlier orders execute first

```
Example: Three buy orders arrive at the bid of $100.03

  Queue at $100.03:
  +-------+--------+------------------+----------+
  | Order | Size   | Arrival Time     | Position |
  +-------+--------+------------------+----------+
  |   A   |  100   | 09:30:01.000001  |    1st   |
  |   B   |  150   | 09:30:01.000050  |    2nd   |
  |   C   |   50   | 09:30:01.000200  |    3rd   |
  +-------+--------+------------------+----------+
  Total queue depth: 300 shares

  Now a market SELL order for 200 shares arrives:

  Step 1: Fill Order A completely (100 shares) -- 100 remaining
  Step 2: Fill Order B partially (100 of 150 shares) -- 0 remaining
  Step 3: Order B has 50 shares remaining at position 1
  Step 4: Order C has  50 shares remaining at position 2

  Result:
  +-------+-----------+------------+----------+
  | Order | Filled    | Remaining  | Position |
  +-------+-----------+------------+----------+
  |   A   |  100/100  |     0      |  DONE    |
  |   B   |  100/150  |    50      |   1st    |
  |   C   |    0/50   |    50      |   2nd    |
  +-------+-----------+------------+----------+
```

**Why queue position matters**: In highly liquid stocks, getting to the front of the queue at the best price is extremely valuable. This is one reason HFT firms invest millions in latency reduction -- arriving microseconds earlier means better queue position and higher fill probability.

### 5.1.4 Order Book Visualization

Here is a full order book visualization showing the depth chart (cumulative quantity at each price level):

```
  Cumulative Ask Volume
  2000 |                                              ############
  1800 |                                     #########
  1500 |                            #########
  1000 |                   #########
   700 |          #########
   200 |  ########
       +--|-------|-------|-------|-------|-------|-------> Price
       $100.03  $100.05  $100.06  $100.07  $100.08  $100.09

  Cumulative Bid Volume
       $99.99  $100.00  $100.01  $100.02  $100.03
       +--|-------|-------|-------|-------|-------> Price
   300 |                                  ########
   900 |                         #########
  2400 |                #########
  4400 |       #########
  5300 |#######

  Combined Depth Chart (typical L-shape / U-shape):

  Volume
  5000 |##                                                    ##
  4000 |  ##                                               ###
  3000 |    ##                                          ###
  2000 |      ###                                    ###
  1000 |         ####                            ####
   500 |             #####                  #####
   200 |                  #####      ######
     0 +-----|------|------|--||--|------|------|------|------> Price
       $99.99 $100.00  $100.01  ||  $100.05  $100.07  $100.09
                         BID   SPREAD   ASK
```

### 5.1.5 Book Imbalance as a Signal

**Order book imbalance** measures the relative pressure of bids versus asks at the top of the book. It is one of the most studied short-term predictive signals.

```
                    BidSize - AskSize
  Imbalance (I) = -------------------
                    BidSize + AskSize

  Where BidSize = quantity at best bid
        AskSize = quantity at best ask
```

The imbalance ranges from -1 (all ask, no bid) to +1 (all bid, no ask).

**Numerical Example**:

```
  Best Bid: $100.03 x 800 shares
  Best Ask: $100.05 x 200 shares

  Imbalance = (800 - 200) / (800 + 200) = 600 / 1000 = +0.60

  Interpretation: Strong bid-side pressure. The mid price is likely
  to move UP in the short term because:
  - More buyers than sellers at the inside
  - An incoming market sell will be absorbed by the large bid
  - An incoming market buy may exhaust the thin ask and push price up
```

**Multi-level imbalance** extends this to deeper levels of the book:

```
           Sum(BidSize_i * w_i) - Sum(AskSize_i * w_i)
  I_deep = -------------------------------------------
           Sum(BidSize_i * w_i) + Sum(AskSize_i * w_i)

  Where w_i is a decay weight (e.g., w_i = exp(-alpha * i))
  giving more weight to levels closer to the inside.
```

Empirical research shows that book imbalance at the top 1-5 levels predicts short-term price moves (next 1-100 milliseconds) with modest but statistically significant accuracy.

### 5.1.6 Full Order Book Example with Worked Analysis

```
+------------------------------------------------------------------------+
|              AAPL ORDER BOOK SNAPSHOT - 10:15:32.456789 ET              |
+------------------------------------------------------------------------+
|                                                                        |
|  ASK (Sell) Side                                                       |
|  Level | Price    | Size  | #Orders | Cumulative                       |
|  ------|----------|-------|---------|------------                       |
|    5   | $175.10  |  3000 |    8    |   7800                           |
|    4   | $175.09  |  1200 |    5    |   4800                           |
|    3   | $175.08  |  1500 |    6    |   3600                           |
|    2   | $175.07  |   800 |    4    |   2100                           |
|    1   | $175.06  |  1300 |    7    |   1300   <-- Best Ask             |
|  ------|----------|-------|---------|------------                       |
|                  SPREAD = $0.02 (1.1 bps)                              |
|  ------|----------|-------|---------|------------                       |
|    1   | $175.04  |  2100 |    9    |   2100   <-- Best Bid             |
|    2   | $175.03  |  1800 |    7    |   3900                           |
|    3   | $175.02  |  2200 |   10    |   6100                           |
|    4   | $175.01  |  1000 |    4    |   7100                           |
|    5   | $175.00  |  4500 |   15    |  11600                           |
|  BID (Buy) Side                                                        |
|                                                                        |
+------------------------------------------------------------------------+
|  Mid Price:   $175.050                                                 |
|  Microprice:  (175.04*1300 + 175.06*2100)/(1300+2100) = $175.0524     |
|  Imbalance:   (2100 - 1300) / (2100 + 1300) = +0.235                  |
|  Observation:  Mild bid-side pressure, slight upward bias expected     |
+------------------------------------------------------------------------+
```

**Microprice calculation in detail**:

```
  Microprice = (BB * QA + BA * QB) / (QA + QB)

  BB = $175.04   (best bid price)
  BA = $175.06   (best ask price)
  QB = 2100      (best bid quantity)
  QA = 1300      (best ask quantity)

  Microprice = (175.04 * 1300 + 175.06 * 2100) / (1300 + 2100)
             = (227,552 + 367,626) / 3400
             = 595,178 / 3400
             = $175.0524

  The microprice is closer to the ask ($175.06) because the bid side
  is heavier. The intuition: when there are more buyers, the "fair"
  price is pulled toward the ask because a random incoming order is
  more likely to be a buy, pushing price up.
```

---

## 5.2 Matching Engines

The matching engine is the core software at the heart of every exchange. It receives orders, validates them, and matches buyers with sellers according to a set of rules.

### 5.2.1 How Exchanges Match Orders

```
+------------------------------------------------------------------------+
|                    ORDER MATCHING FLOW                                  |
+------------------------------------------------------------------------+
|                                                                        |
|  Trader A          Exchange                        Trader B            |
|  +------+    +---------------------------+        +------+             |
|  | BUY  |--->| 1. Receive Order           |<------| SELL |             |
|  | 100sh|    | 2. Validate (risk checks)  |       | 100sh|             |
|  |@MKT  |    | 3. Check order book        |       |@175.06             |
|  +------+    | 4. Match if possible       |       +------+             |
|              | 5. Generate execution msg   |                           |
|              | 6. Update order book        |                           |
|              | 7. Publish market data      |                           |
|              +---------------------------+                             |
|                         |                                              |
|                         v                                              |
|              +---------------------------+                             |
|              | EXECUTION REPORT           |                            |
|              | Trader A: Bought 100 @175.06                            |
|              | Trader B: Sold   100 @175.06                            |
|              | Trade Price: $175.06                                     |
|              | Timestamp: 10:15:32.456790123                            |
|              +---------------------------+                             |
|                                                                        |
+------------------------------------------------------------------------+
```

### 5.2.2 Price-Time Priority Algorithm

The most common matching algorithm, used by NYSE, NASDAQ, LSE, and most equity exchanges:

```
Algorithm: PRICE_TIME_PRIORITY_MATCH(incoming_order, order_book)

  IF incoming_order is a BUY:
    opposite_side = order_book.asks (sorted by price ASC, then time ASC)
  ELSE:
    opposite_side = order_book.bids (sorted by price DESC, then time DESC)

  remaining_qty = incoming_order.quantity

  FOR EACH resting_order IN opposite_side:
    IF NOT price_compatible(incoming_order, resting_order):
      BREAK  // No more matches possible

    fill_qty = MIN(remaining_qty, resting_order.remaining_qty)

    GENERATE execution(
      price = resting_order.price,   // Passive order determines price
      quantity = fill_qty
    )

    remaining_qty -= fill_qty
    resting_order.remaining_qty -= fill_qty

    IF resting_order.remaining_qty == 0:
      REMOVE resting_order from book

    IF remaining_qty == 0:
      BREAK  // Incoming order fully filled

  IF remaining_qty > 0:
    IF incoming_order.type == LIMIT:
      ADD incoming_order to book with remaining_qty
    ELSE:  // MARKET order
      CANCEL remaining (or handle per exchange rules)
```

**Worked example**:

```
  Initial Ask Side:
  +-------+----------+-------+---------------------+
  | Order | Price    | Size  | Time                 |
  +-------+----------+-------+---------------------+
  |   X   | $175.06  |  300  | 09:30:01.000100      |
  |   Y   | $175.06  |  200  | 09:30:01.000200      |
  |   Z   | $175.07  |  500  | 09:30:00.999999      |
  +-------+----------+-------+---------------------+

  Incoming: BUY 400 shares @ MARKET

  Step 1: Match with X at $175.06 (best price, earliest time)
          Fill 300 shares. X exhausted. Remaining: 100.

  Step 2: Match with Y at $175.06 (same price, next in time)
          Fill 100 shares. Y partially filled (100 remaining). Done.

  Result:
  - Buyer gets: 300 @ $175.06 + 100 @ $175.06 = 400 @ $175.06
  - Average price: $175.06 (all at same price level)
  - Order Z at $175.07 was NOT touched (price priority)

  Remaining Ask Side:
  +-------+----------+-------+
  | Order | Price    | Size  |
  +-------+----------+-------+
  |   Y   | $175.06  |  100  |  (partially filled)
  |   Z   | $175.07  |  500  |
  +-------+----------+-------+
```

### 5.2.3 Pro-Rata Matching

Some futures exchanges (notably CME for certain products like Eurodollar futures) use pro-rata matching. Instead of rewarding speed (time priority), pro-rata rewards SIZE.

```
  Pro-Rata Rule:
  Each resting order at the best price gets filled proportionally
  to its share of total quantity at that price level.

  Example: Three orders at the best ask of $175.06
  +-------+-------+------------------+
  | Order | Size  | Share of Level   |
  +-------+-------+------------------+
  |   A   | 1000  | 1000/2000 = 50%  |
  |   B   |  600  |  600/2000 = 30%  |
  |   C   |  400  |  400/2000 = 20%  |
  +-------+-------+------------------+
  Total at level: 2000

  Incoming BUY for 500 shares:

  Pro-rata allocation:
  A gets: 500 * 50% = 250 shares
  B gets: 500 * 30% = 150 shares
  C gets: 500 * 20% = 100 shares
                       ---
               Total:  500 shares (exact)

  Under price-time priority, only A would have been filled (500 of 1000).
  Under pro-rata, ALL participants get partial fills.
```

**Implications**:

| Feature | Price-Time (FIFO) | Pro-Rata |
|---------|-------------------|----------|
| Rewards | Speed (latency) | Size (capital) |
| Spread | Tighter (race to queue) | Wider (less incentive to improve) |
| HFT advantage | High (queue position) | Lower (size matters more) |
| Fill certainty | Binary (front or back) | Partial fills common |
| Used by | Most equity exchanges | Some futures (CME), options |

### 5.2.4 Auction Mechanisms

Exchanges use auction mechanisms at specific times when continuous trading is inappropriate:

```
+------------------------------------------------------------------------+
|                    AUCTION TYPES                                       |
+------------------------------------------------------------------------+
|                                                                        |
|  OPENING AUCTION (9:28-9:30 AM ET for NYSE)                           |
|  +------------------------------------------------------------------+  |
|  | Purpose: Establish fair opening price after overnight gap          |  |
|  | Process:                                                          |  |
|  |   1. Collect orders during pre-open (7:00-9:28 AM)               |  |
|  |   2. Calculate indicative match price                             |  |
|  |   3. Freeze new orders (9:28-9:30 imbalance-only period)         |  |
|  |   4. Match all orders at single clearing price at 9:30            |  |
|  |                                                                   |  |
|  |  Clearing Price Determination:                                    |  |
|  |  Find price P* that maximizes executable volume                   |  |
|  |  (buyers willing to pay >= P* matched with sellers at <= P*)      |  |
|  +------------------------------------------------------------------+  |
|                                                                        |
|  CLOSING AUCTION (3:50-4:00 PM ET for NYSE)                           |
|  +------------------------------------------------------------------+  |
|  | Purpose: Establish closing price (used for NAV, index calc)       |  |
|  | Handles ~7-10% of daily volume in liquid stocks                   |  |
|  | Market-on-Close (MOC) and Limit-on-Close (LOC) orders             |  |
|  +------------------------------------------------------------------+  |
|                                                                        |
|  CIRCUIT BREAKER AUCTION                                               |
|  +------------------------------------------------------------------+  |
|  | Triggered when price moves too far too fast:                      |  |
|  | Level 1: S&P 500 down 7%  -> 15-min halt                        |  |
|  | Level 2: S&P 500 down 13% -> 15-min halt                        |  |
|  | Level 3: S&P 500 down 20% -> Trading halted for day              |  |
|  | LULD: Individual stock bands (5% or 10% from ref price)           |  |
|  +------------------------------------------------------------------+  |
|                                                                        |
+------------------------------------------------------------------------+
```

**Opening auction example**:

```
  Pre-open orders accumulated:

  Buy Orders:              Sell Orders:
  200 @ Market             300 @ Market
  500 @ $175.10            400 @ $174.90
  300 @ $175.05            200 @ $175.00
  400 @ $175.00            600 @ $175.05
  100 @ $174.95            100 @ $175.10

  Demand Schedule:                Supply Schedule:
  Price     Cum Buy               Price     Cum Sell
  $175.10   200+500 = 700         $174.90   300+400 = 700
  $175.05   700+300 = 1000        $175.00   700+200 = 900
  $175.00   1000+400 = 1400       $175.05   900+600 = 1500
  $174.95   1400+100 = 1500       $175.10   1500+100 = 1600

  Clearing price is where supply crosses demand:
  At $175.05: 1000 buy vs 1500 sell -> executable = 1000
  At $175.00: 1400 buy vs  900 sell -> executable =  900

  P* = $175.05 (maximizes volume at 1000 shares)
  All 1000 shares trade at $175.05 simultaneously.
```

### 5.2.5 Exchange Latency

The time it takes for an order to reach the matching engine and get a response varies dramatically:

```
+------------------------------------------------------------------------+
|              EXCHANGE LATENCY COMPARISON (Round-Trip)                   |
+------------------------------------------------------------------------+
|                                                                        |
|  Exchange           Median Latency     Technology                      |
|  ----------------------------------------------------------------      |
|  IEX                ~350 microseconds  Intentional speed bump (350us)  |
|  NYSE               ~30 microseconds   Pillar matching engine          |
|  NASDAQ             ~15 microseconds   INET platform                   |
|  CME Globex         ~5 microseconds    Co-located                      |
|  BATS/Cboe          ~10 microseconds   Z-Series matching engine        |
|  LSE                ~20 microseconds   Millennium Exchange             |
|  Tokyo (JPX)        ~15 microseconds   Arrowhead                       |
|                                                                        |
|  For comparison:                                                       |
|  Human blink:            ~300,000 microseconds (300 ms)                |
|  Human reaction time:    ~250,000 microseconds (250 ms)                |
|  Speed of light NYC-CHI: ~3,900 microseconds one-way (fiber)           |
|  Speed of light NYC-CHI: ~3,200 microseconds one-way (microwave)       |
|                                                                        |
+------------------------------------------------------------------------+
```

### 5.2.6 Co-location and Proximity Hosting

**Co-location** means placing your trading servers in the same data center as the exchange's matching engine to minimize network latency.

```
  WITHOUT Co-location:
  +----------+                                    +----------+
  | Trader   |  ~~~~~ 1-50 ms over internet ~~~~> | Exchange |
  | Server   |  <~~~~ 1-50 ms response ~~~~~~~~~~  | Engine   |
  | (Office) |           Round trip: 2-100 ms      | (DC)     |
  +----------+                                    +----------+

  WITH Co-location:
  +----------+    +----------+
  | Trader   |--->| Exchange |     Same rack or adjacent rack
  | Server   |<---| Engine   |     Round trip: 1-10 microseconds
  | (Colo)   |    | (DC)     |     ~1000x faster than remote
  +----------+    +----------+

  Cost of Co-location:
  +------------------------------------------+
  | NYSE Mahwah, NJ:  ~$5,000-14,000/month   |
  | NASDAQ Carteret:  ~$4,000-12,000/month    |
  | CME Aurora, IL:   ~$3,000-10,000/month    |
  | Plus: power, cross-connects, hardware     |
  | Typical total:    $20,000-50,000/month    |
  +------------------------------------------+
```

---

## 5.3 Market Making

Market makers are participants who continuously post buy and sell orders, providing liquidity to other traders. They profit from the bid-ask spread but face risks from inventory accumulation and adverse selection.

### 5.3.1 What Market Makers Do

```
+------------------------------------------------------------------------+
|                    MARKET MAKER ROLE                                    |
+------------------------------------------------------------------------+
|                                                                        |
|  Time T:  Market Maker posts quotes                                    |
|           BID: Buy  1000 @ $175.04                                     |
|           ASK: Sell 1000 @ $175.06                                     |
|           Spread: $0.02                                                |
|                                                                        |
|  Time T+1: Buyer arrives, lifts the ask                                |
|           MM sells 500 @ $175.06  (now short 500 shares)               |
|                                                                        |
|  Time T+2: Seller arrives, hits the bid                                |
|           MM buys 300 @ $175.04   (now short 200 shares)               |
|                                                                        |
|  Time T+3: Seller arrives again                                        |
|           MM buys 500 @ $175.04   (now long 300 shares)                |
|                                                                        |
|  P&L from spread capture:                                              |
|  Sold 500 @ $175.06 = +$87,530.00                                     |
|  Bought 800 @ $175.04 = -$140,032.00                                  |
|  Net position: long 300 shares @ avg $175.04                           |
|  Realized spread P&L: 500 * $0.02 = $10.00 (on round-trips)           |
|  Unrealized: 300 shares of inventory risk                              |
|                                                                        |
+------------------------------------------------------------------------+
```

### 5.3.2 Bid-Ask Spread as Compensation

The spread compensates market makers for three costs:

```
  Total Spread = Order Processing Cost
               + Inventory Holding Cost
               + Adverse Selection Cost

  +-----------------------------------------------------+
  |  Component              | Typical Fraction           |
  |-------------------------|----------------------------|
  |  Order Processing       | 10-20% (fees, technology)  |
  |  Inventory Holding      | 20-30% (risk of position)  |
  |  Adverse Selection      | 50-70% (informed traders)  |
  +-----------------------------------------------------+

  The adverse selection component dominates because market makers
  lose systematically when trading against informed participants
  (hedge funds, insiders, etc.) who know which direction the
  price will move.
```

### 5.3.3 Inventory Risk Management

Market makers try to keep their inventory near zero. Holding a large long or short position exposes them to directional risk.

```
  Inventory Management Strategies:

  1. SKEWING QUOTES
  +------------------------------------------------------------------+
  |  Inventory = 0 (neutral):                                        |
  |    Bid: $175.04    Ask: $175.06    (symmetric around mid)        |
  |                                                                  |
  |  Inventory = +500 (long, want to sell):                          |
  |    Bid: $175.03    Ask: $175.05    (shift DOWN to attract sells) |
  |                                                                  |
  |  Inventory = -500 (short, want to buy):                          |
  |    Bid: $175.05    Ask: $175.07    (shift UP to attract buys)    |
  +------------------------------------------------------------------+

  2. WIDENING SPREAD (during uncertainty)
  +------------------------------------------------------------------+
  |  Normal:     Bid $175.04 / Ask $175.06  (spread = $0.02)         |
  |  High vol:   Bid $175.02 / Ask $175.08  (spread = $0.06)         |
  |  News event: Bid $174.95 / Ask $175.15  (spread = $0.20)         |
  +------------------------------------------------------------------+

  3. HEDGING
  +------------------------------------------------------------------+
  |  Long 5000 AAPL -> Hedge with short AAPL futures or QQQ ETF      |
  |  Delta-neutral portfolio minimizes directional exposure            |
  +------------------------------------------------------------------+
```

### 5.3.4 The Avellaneda-Stoikov Model

The Avellaneda-Stoikov (2008) model is the foundational framework for optimal market making. It derives the optimal bid and ask quotes as a function of inventory, volatility, and time.

```
  Model Setup:
  - Mid price follows: dS = sigma * dW  (arithmetic Brownian motion)
  - Market maker has utility: U(x) = -exp(-gamma * x)  (CARA utility)
  - gamma = risk aversion parameter
  - sigma = volatility of mid price
  - T = terminal time, t = current time
  - q = current inventory

  Reservation Price (where MM thinks fair value is, given inventory):
  +------------------------------------------------------------------+
  |                                                                  |
  |   r(s, q, t) = s - q * gamma * sigma^2 * (T - t)                |
  |                                                                  |
  |   s = current mid price                                          |
  |   q = inventory (positive = long)                                |
  |   gamma = risk aversion                                          |
  |   sigma = volatility                                             |
  |   T - t = time remaining                                         |
  |                                                                  |
  +------------------------------------------------------------------+

  Optimal Spread:
  +------------------------------------------------------------------+
  |                                                                  |
  |   delta = gamma * sigma^2 * (T - t) + (2/gamma) * ln(1 + gamma/k)|
  |                                                                  |
  |   k = order arrival rate parameter                               |
  |                                                                  |
  +------------------------------------------------------------------+

  Optimal Quotes:
  +------------------------------------------------------------------+
  |                                                                  |
  |   Bid = r - delta/2                                              |
  |   Ask = r + delta/2                                              |
  |                                                                  |
  |   Substituting:                                                  |
  |   Bid = s - q*gamma*sigma^2*(T-t) - delta/2                     |
  |   Ask = s - q*gamma*sigma^2*(T-t) + delta/2                     |
  |                                                                  |
  +------------------------------------------------------------------+
```

**Numerical example**:

```
  Parameters:
    s     = $100.00   (current mid price)
    q     = +200      (long 200 shares)
    gamma = 0.001     (risk aversion)
    sigma = $0.50     (volatility per unit time)
    T - t = 1.0       (1 time unit remaining)
    k     = 1.5       (order arrival intensity)

  Reservation price:
    r = 100.00 - 200 * 0.001 * 0.50^2 * 1.0
    r = 100.00 - 200 * 0.001 * 0.25
    r = 100.00 - 0.05
    r = $99.95

  The MM thinks fair value is $99.95 (below mid) because they are
  LONG 200 shares and want to sell, so they shade their valuation down.

  Optimal spread:
    delta = 0.001 * 0.25 * 1.0 + (2/0.001) * ln(1 + 0.001/1.5)
    delta = 0.00025 + 2000 * ln(1.000667)
    delta = 0.00025 + 2000 * 0.000667
    delta = 0.00025 + 1.334
    delta = $1.334

  Optimal quotes:
    Bid = 99.95 - 1.334/2 = 99.95 - 0.667 = $99.283
    Ask = 99.95 + 1.334/2 = 99.95 + 0.667 = $100.617

  Note: The quotes are asymmetric around the mid ($100.00).
  The bid is further from mid ($0.717 below) than the ask ($0.617 above)
  because the MM is long and wants to sell more than buy.
```

### 5.3.5 Adverse Selection Risk

Adverse selection occurs when a market maker's counterparty has superior information about the future price direction.

```
  Two Types of Traders Hitting the Market Maker:

  +------------------------------------------------------------------+
  |  UNINFORMED TRADERS (noise traders, retail, rebalancers)          |
  |  - Trade for liquidity needs, not information                    |
  |  - Buy and sell roughly equally                                  |
  |  - MM profits from spread on these trades                        |
  |  - Example: Pension fund rebalancing, retail day trader           |
  +------------------------------------------------------------------+
  |  INFORMED TRADERS (hedge funds, insiders, quant strategies)       |
  |  - Trade because they know price will move                       |
  |  - Buy before price goes up, sell before price goes down         |
  |  - MM loses on these trades (sells before up-move, buys before   |
  |    down-move)                                                    |
  |  - Example: HF with earnings prediction model buys before beat   |
  +------------------------------------------------------------------+

  Market Maker P&L Decomposition:
  +------------------------------------------------------------------+
  |                                                                  |
  |  Spread Earned on           Adverse Selection Loss               |
  |  Uninformed Trades    >     on Informed Trades                   |
  |  (must be true for MM to survive)                                |
  |                                                                  |
  |  If adverse selection cost exceeds spread revenue:               |
  |  -> MM widens spread (making market less liquid)                 |
  |  -> MM reduces size (less depth)                                 |
  |  -> MM pulls quotes entirely (market breaks down)               |
  |                                                                  |
  +------------------------------------------------------------------+
```

### 5.3.6 Market Making P&L Calculation Example

```
  Scenario: Market making AAPL for one trading session

  Parameters:
  - Bid-ask spread quoted: $0.02
  - Average trade size: 200 shares
  - Number of round-trip trades: 500
  - Adverse selection losses: 15% of trades result in adverse move of $0.05

  REVENUE (Spread Capture):
  +------------------------------------------------------------------+
  |  Round-trip spread revenue = 500 * 200 * $0.02 / 2               |
  |                            = 500 * 200 * $0.01                   |
  |                            = $1,000.00                           |
  |                                                                  |
  |  (Divide by 2 because each round trip has a buy and sell,        |
  |   each capturing half the spread)                                |
  +------------------------------------------------------------------+

  COSTS:
  +------------------------------------------------------------------+
  |  1. Exchange fees:                                                |
  |     Maker rebate: -$0.002/share (negative = receive)             |
  |     Total shares: 500 * 200 * 2 = 200,000 shares                |
  |     Fee cost: 200,000 * (-$0.002) = -$400.00 (rebate received)  |
  |                                                                  |
  |  2. Adverse selection losses:                                    |
  |     15% of 500 = 75 adverse trades                               |
  |     Loss per adverse trade: 200 * $0.05 = $10.00                |
  |     Total adverse selection: 75 * $10.00 = $750.00               |
  |                                                                  |
  |  3. Technology / co-location: $200/day (amortized)               |
  |                                                                  |
  |  4. End-of-day inventory: 300 shares * $0.03 overnight move      |
  |     Inventory cost: $9.00                                        |
  +------------------------------------------------------------------+

  NET P&L:
  +------------------------------------------------------------------+
  |  Spread revenue:        +$1,000.00                               |
  |  Exchange rebates:        +$400.00                               |
  |  Adverse selection:       -$750.00                               |
  |  Technology:              -$200.00                               |
  |  Inventory cost:            -$9.00                               |
  |  --------------------------------                                |
  |  Net daily P&L:           +$441.00                               |
  |                                                                  |
  |  Sharpe ratio (annualized, assuming $150 daily stdev):           |
  |  = (441 * 252) / (150 * sqrt(252))                               |
  |  = 111,132 / 2,381                                               |
  |  = 46.7 (extremely high, typical for successful MM)              |
  +------------------------------------------------------------------+
```

### 5.3.7 Designated Market Makers (DMMs) on NYSE

```
+------------------------------------------------------------------------+
|              NYSE DESIGNATED MARKET MAKERS                              |
+------------------------------------------------------------------------+
|                                                                        |
|  DMMs are firms assigned to specific stocks on NYSE. They have both    |
|  obligations and privileges:                                           |
|                                                                        |
|  OBLIGATIONS:                                                          |
|  +------------------------------------------------------------------+  |
|  | - Maintain continuous two-sided quotes                            |  |
|  | - Maintain "fair and orderly" market                              |  |
|  | - Provide price improvement on retail orders                      |  |
|  | - Participate in opening/closing auctions                         |  |
|  | - Step in during volatile periods (commit capital)                |  |
|  +------------------------------------------------------------------+  |
|                                                                        |
|  PRIVILEGES:                                                           |
|  +------------------------------------------------------------------+  |
|  | - See order flow information before public                        |  |
|  | - Parity allocation (share of trade when at same price)           |  |
|  | - Information advantage from being at "point of sale"             |  |
|  | - Lower exchange fees / higher rebates                            |  |
|  +------------------------------------------------------------------+  |
|                                                                        |
|  Major DMM Firms:                                                      |
|  - Citadel Securities                                                  |
|  - GTS (Global Trading Systems)                                        |
|  - Virtu Financial                                                     |
|                                                                        |
+------------------------------------------------------------------------+
```

---

## 5.4 Price Impact Models

When you trade, you move the price. Understanding how much and for how long is critical for execution quality and strategy design.

### 5.4.1 Temporary vs Permanent Impact

```
  Price
  ^
  |
  |              Permanent Impact
  |          .............................*****
  |        **                           *
  |      **   Temporary Impact         *
  |     * <-- Peak impact             *
  |    *       during execution      *
  |   *                             *
  |  *                            **
  | *                          ***
  |*  <-- Start of            *    Price partially reverts
  |       large buy       ****     after execution ends
  |****                 **
  |                  ***
  |  Pre-trade    ***
  |  price      **
  +--*********--------|-----------|-----------> Time
               Start   End        Settle
               Trade   Trade

  +------------------------------------------------------------------+
  |  Total Impact = Temporary Impact + Permanent Impact               |
  |                                                                  |
  |  Temporary: Price dislocation that reverts after execution ends.  |
  |             Caused by: order imbalance, inventory effects on MMs  |
  |             Typically reverts in seconds to minutes.              |
  |                                                                  |
  |  Permanent: Price change that persists indefinitely.             |
  |             Caused by: information content of the trade.          |
  |             Reflects the market learning from your order flow.   |
  +------------------------------------------------------------------+
```

### 5.4.2 Square-Root Impact Model (Kyle's Lambda)

The most widely used empirical model of price impact is the square-root model:

```
  +------------------------------------------------------------------+
  |                                                                  |
  |  Impact = sigma * sqrt(Q / V)                                    |
  |                                                                  |
  |  sigma = daily volatility of the asset                           |
  |  Q     = quantity traded (shares)                                |
  |  V     = average daily volume (shares)                           |
  |  Q/V   = participation rate                                      |
  |                                                                  |
  +------------------------------------------------------------------+

  More generally (with calibrated constants):

  +------------------------------------------------------------------+
  |                                                                  |
  |  Impact = eta * sigma * (Q / V)^delta                            |
  |                                                                  |
  |  eta   ~ 0.5 to 1.0  (calibration constant)                     |
  |  delta ~ 0.5 to 0.6  (square-root exponent)                     |
  |                                                                  |
  +------------------------------------------------------------------+
```

**Why square-root?** It is a robust empirical finding across many markets and time periods. The intuition is that impact grows sublinearly because:
- Large orders are typically split across time
- Markets absorb liquidity gradually
- Information leaks slowly rather than all at once

**Numerical example**:

```
  AAPL stock:
    sigma = 1.5% daily volatility
    V     = 50,000,000 shares ADV (average daily volume)
    Q     = 500,000 shares to buy (1% of ADV)
    eta   = 0.8

  Impact = 0.8 * 0.015 * sqrt(500,000 / 50,000,000)
         = 0.8 * 0.015 * sqrt(0.01)
         = 0.8 * 0.015 * 0.1
         = 0.0012
         = 12 basis points

  On a $175 stock: 12 bps = $0.21 per share adverse price movement.
  Total impact cost: 500,000 * $0.21 = $105,000

  Now consider a LESS liquid stock:
    sigma = 3.0% daily volatility
    V     = 1,000,000 shares ADV
    Q     = 500,000 shares (50% of ADV!)

  Impact = 0.8 * 0.03 * sqrt(500,000 / 1,000,000)
         = 0.8 * 0.03 * sqrt(0.5)
         = 0.8 * 0.03 * 0.707
         = 0.01697
         = 170 basis points

  On a $20 stock: 170 bps = $0.34 per share.
  Total cost: 500,000 * $0.34 = $170,000

  Key insight: Trading 50% of ADV is extremely costly. This is why
  large institutional orders take DAYS to execute.
```

### 5.4.3 Almgren-Chriss Framework

The Almgren-Chriss (2001) model provides an optimal execution trajectory for liquidating (or acquiring) a large position, balancing market impact against timing risk.

```
  Problem Setup:
  +------------------------------------------------------------------+
  |  You need to sell X shares over time period T.                   |
  |  If you sell too fast:  High market impact (temporary)           |
  |  If you sell too slow:  High timing risk (price may move)        |
  |  Goal: Find optimal liquidation schedule                         |
  +------------------------------------------------------------------+

  Cost Components:
  +------------------------------------------------------------------+
  |                                                                  |
  |  E[Cost] = permanent_impact + temporary_impact + timing_risk     |
  |                                                                  |
  |  Permanent impact: gamma * X^2 / 2                               |
  |    (linear in shares, fixed regardless of schedule)              |
  |                                                                  |
  |  Temporary impact: eta * sum(n_i^2 / tau)                        |
  |    (depends on rate of trading at each interval)                 |
  |                                                                  |
  |  Timing risk: sigma^2 * sum(x_i^2 * tau)                        |
  |    (variance from holding inventory exposed to price moves)      |
  |                                                                  |
  +------------------------------------------------------------------+

  Optimal Trajectory (for risk-averse trader):

  +------------------------------------------------------------------+
  |                                                                  |
  |  x(t) = X * sinh(kappa * (T - t)) / sinh(kappa * T)             |
  |                                                                  |
  |  kappa = sqrt(lambda * sigma^2 / eta)                            |
  |                                                                  |
  |  lambda = risk aversion parameter                                |
  |  sigma  = price volatility                                       |
  |  eta    = temporary impact coefficient                           |
  |                                                                  |
  +------------------------------------------------------------------+
```

The shape of the trajectory depends on risk aversion:

```
  Shares
  Remaining
  X |*
    | *
    |  *         lambda = 0 (risk neutral):
    |   *        Uniform (TWAP) schedule
    |    *       Sell X/N shares each period
    |     *
    |      *
    |       *
    |        *
  0 +--------*-----> Time
    0        T

  Shares                              Shares
  Remaining                           Remaining
  X |*                                X |*
    |*                                  | *
    | *       lambda = HIGH             |   *     lambda = LOW
    |  **     (very risk averse):       |     *   (less risk averse):
    |    **   Front-load execution      |       * More uniform
    |      ** Sell aggressively early   |        *
    |        *                          |         **
    |         **                        |           **
    |           ***                     |             ***
  0 +------------***-> Time           0 +---------------***-> Time
    0              T                    0                 T
```

### 5.4.4 Volume-Weighted Impact

A more practical impact model used by execution desks:

```
  Participation-Weighted Impact:
  +------------------------------------------------------------------+
  |                                                                  |
  |  Impact(bps) = alpha + beta * POV^gamma                          |
  |                                                                  |
  |  POV = Percentage of Volume (your shares / market volume)        |
  |                                                                  |
  |  Typical calibration for US equities:                            |
  |    alpha ~ 5 bps    (fixed cost per trade)                       |
  |    beta  ~ 30 bps   (scale factor)                               |
  |    gamma ~ 0.5      (square-root)                                |
  |                                                                  |
  +------------------------------------------------------------------+

  Example at different participation rates:

  POV    | Impact (bps) | On $100 stock
  -------|-------------|---------------
   1%    |  5 + 30*0.1 = 8.0  bps  |  $0.08/share
   5%    |  5 + 30*0.224 = 11.7 bps |  $0.12/share
  10%    |  5 + 30*0.316 = 14.5 bps |  $0.15/share
  20%    |  5 + 30*0.447 = 18.4 bps |  $0.18/share
  50%    |  5 + 30*0.707 = 26.2 bps |  $0.26/share
```

### 5.4.5 Why Large Orders Move Prices

```
+------------------------------------------------------------------------+
|              WHY LARGE ORDERS MOVE PRICES                              |
+------------------------------------------------------------------------+
|                                                                        |
|  1. MECHANICAL IMPACT (Liquidity Consumption)                          |
|     Large buy order eats through multiple ask levels:                  |
|                                                                        |
|     Before:  Ask $100.05 x 500 | $100.06 x 300 | $100.07 x 200       |
|     Buy 900 shares at market:                                          |
|     Fill: 500@$100.05 + 300@$100.06 + 100@$100.07                     |
|     After:   Ask $100.07 x 100  (best ask moved up $0.02)             |
|                                                                        |
|  2. INFORMATION IMPACT                                                 |
|     Market participants observe the large buy and infer:               |
|     "Someone with information is buying -> price should be higher"     |
|     They pull their sell orders or raise their prices.                 |
|                                                                        |
|  3. INVENTORY IMPACT                                                   |
|     Market makers who sold to the large buyer are now short.           |
|     They raise their quotes to reduce further selling risk.            |
|     Other MMs see the trade and also widen/raise quotes.               |
|                                                                        |
|  4. MOMENTUM / HERDING                                                 |
|     Other traders see the price rising and pile on (buy).              |
|     Trend-followers detect upward momentum.                            |
|     This amplifies the initial impact.                                 |
|                                                                        |
+------------------------------------------------------------------------+
```

### 5.4.6 Information Leakage

```
  How your order reveals information to the market:

  +------- Your 100,000 share buy order -------+
  |                                             |
  | Split into 200-share child orders           |
  | Sent to exchange over 30 minutes            |
  |                                             |
  +---------------------------------------------+
           |
           v
  +------- What the market sees -------+
  |                                     |
  | Consistent buying pressure          |
  | Bid side replenishing after fills   |
  | Order flow imbalance skewing buy    |
  | Same broker tag on many orders      |
  | Size clustering at round numbers    |
  |                                     |
  +-------------------------------------+
           |
           v
  +------- Predatory traders react -------+
  |                                        |
  | Detect the "iceberg" pattern           |
  | Front-run by buying ahead of you       |
  | Your remaining fills become more costly |
  | Information leakage cost: 5-20 bps     |
  |                                        |
  +----------------------------------------+

  Mitigation Strategies:
  - Randomize order sizes (avoid patterns)
  - Vary timing (not perfectly periodic)
  - Use multiple venues / dark pools
  - Employ anti-gaming logic in algos
  - Use implementation shortfall algos that adapt to detection
```

---

## 5.5 Tick Data Analysis

Tick data is the most granular level of market data: every individual quote update and trade, timestamped to microsecond or nanosecond precision.

### 5.5.1 Trade and Quote (TAQ) Data

```
+------------------------------------------------------------------------+
|              TAQ DATA STRUCTURE                                        |
+------------------------------------------------------------------------+
|                                                                        |
|  QUOTE RECORD (NBBO Update):                                          |
|  +------------------------------------------------------------------+  |
|  | Timestamp        | Symbol | Bid     | BidSz | Ask     | AskSz   |  |
|  |------------------|--------|---------|-------|---------|---------|  |
|  | 09:30:01.123456  | AAPL   | $175.04 |  300  | $175.06 |  200    |  |
|  | 09:30:01.123478  | AAPL   | $175.04 |  500  | $175.06 |  200    |  |
|  | 09:30:01.123512  | AAPL   | $175.04 |  500  | $175.05 |  100    |  |
|  | 09:30:01.123599  | AAPL   | $175.05 |  200  | $175.06 |  400    |  |
|  +------------------------------------------------------------------+  |
|                                                                        |
|  TRADE RECORD:                                                         |
|  +------------------------------------------------------------------+  |
|  | Timestamp        | Symbol | Price   | Size  | Exchange | Cond    |  |
|  |------------------|--------|---------|-------|----------|---------|  |
|  | 09:30:01.123460  | AAPL   | $175.06 |  100  | NASDAQ   | @       |  |
|  | 09:30:01.123515  | AAPL   | $175.05 |   50  | NYSE     | @       |  |
|  | 09:30:01.123600  | AAPL   | $175.05 |  200  | BATS     | @       |  |
|  +------------------------------------------------------------------+  |
|                                                                        |
|  Data volumes (single liquid US stock):                                |
|  - Quotes: ~100,000-500,000 updates per day                           |
|  - Trades: ~10,000-100,000 trades per day                              |
|  - Full US market: ~10-50 GB per day (compressed)                      |
|                                                                        |
+------------------------------------------------------------------------+
```

### 5.5.2 Bid-Ask Bounce

The bid-ask bounce is a statistical artifact that occurs because trades alternate between the bid and ask prices, creating artificial negative autocorrelation in trade prices.

```
  True price is constant at $100.04 (mid price)
  But trades bounce between bid and ask:

  Price
  $100.06 |     *           *       *
          |    / \         / \     / \
  $100.05 |   /   \       /   \   /   \
          |  /     \     /     \  /     \
  $100.04 |- - - - - - - - - - - - - - - -  (true mid price)
          |          \  /        \
  $100.03 |           \/          *
          |
          +-----------------------------------------> Trade #

  The pattern: Buy at ask ($100.06), sell at bid ($100.03), etc.

  This creates:
  - Negative first-order autocorrelation in trade returns
  - Overestimation of volatility at high frequencies
  - Spurious mean-reversion signal if not accounted for

  Roll (1984) showed that:
    Cov(r_t, r_{t-1}) = -spread^2 / 4

  So if the bid-ask spread is $0.02:
    Cov = -0.02^2 / 4 = -0.0001
```

### 5.5.3 Lee-Ready Algorithm for Trade Classification

A fundamental task in microstructure is determining whether each trade was buyer-initiated or seller-initiated. The **Lee-Ready algorithm** (1991) is the standard approach.

```
  Algorithm: LEE_READY(trade_price, bid, ask)

  Step 1: QUOTE TEST
    mid = (bid + ask) / 2
    IF trade_price > mid:
      classify as BUY (buyer initiated)
    ELSE IF trade_price < mid:
      classify as SELL (seller initiated)
    ELSE IF trade_price == mid:
      Go to Step 2

  Step 2: TICK TEST (for trades at midpoint)
    Compare trade_price to previous trade_price:
    IF trade_price > prev_price:
      classify as BUY (uptick)
    ELSE IF trade_price < prev_price:
      classify as SELL (downtick)
    ELSE:
      Use previous tick classification (zero-tick rule)

  Note: Lee-Ready uses quotes from 5 seconds BEFORE the trade
  (to account for reporting delays in the original paper).
  Modern implementations often use contemporaneous quotes.
```

**Worked example**:

```
  Prevailing Quotes: Bid = $175.04, Ask = $175.06, Mid = $175.05

  Trade 1: $175.06 (at the ask)
    Quote test: $175.06 > $175.05 -> BUY

  Trade 2: $175.04 (at the bid)
    Quote test: $175.04 < $175.05 -> SELL

  Trade 3: $175.05 (at the midpoint)
    Quote test: inconclusive (at mid)
    Tick test: $175.05 > $175.04 (prev trade) -> BUY (uptick)

  Trade 4: $175.05 (at the midpoint again)
    Quote test: inconclusive
    Tick test: $175.05 = $175.05 (prev trade) -> same as prev = BUY

  Result: BUY, SELL, BUY, BUY

  Signed Order Flow = +1 - 1 + 1 + 1 = +2 (net buying pressure)
```

### 5.5.4 Roll's Spread Estimator

Roll (1984) showed you can estimate the effective spread from trade price autocorrelation alone, without needing quote data.

```
  Roll's Model:
  +------------------------------------------------------------------+
  |                                                                  |
  |  Observed trade price: P_t = M_t + c * Q_t                      |
  |                                                                  |
  |  M_t = true (efficient) price                                   |
  |  c   = half-spread (effective half-spread)                       |
  |  Q_t = trade direction (+1 for buy, -1 for sell)                 |
  |                                                                  |
  |  Key result:                                                     |
  |  Cov(dP_t, dP_{t-1}) = -c^2                                     |
  |                                                                  |
  |  Therefore:                                                      |
  |  c = sqrt(-Cov(dP_t, dP_{t-1}))                                 |
  |  Effective spread = 2c = 2 * sqrt(-Cov)                          |
  |                                                                  |
  +------------------------------------------------------------------+

  Numerical Example:

  Trade prices: $100.06, $100.04, $100.05, $100.03, $100.06,
                $100.04, $100.05, $100.03, $100.06, $100.05

  Returns (dP): -0.02, +0.01, -0.02, +0.03, -0.02,
                +0.01, -0.02, +0.03, -0.01

  Autocovariance:
  Cov(dP_t, dP_{t-1}) = mean product of consecutive returns
  = [(-0.02)(0.01) + (0.01)(-0.02) + (-0.02)(0.03) + (0.03)(-0.02)
     + (-0.02)(0.01) + (0.01)(-0.02) + (-0.02)(0.03) + (0.03)(-0.01)] / 8
  = [-0.0002 + (-0.0002) + (-0.0006) + (-0.0006)
     + (-0.0002) + (-0.0002) + (-0.0006) + (-0.0003)] / 8
  = -0.0029 / 8
  = -0.0003625

  c = sqrt(0.0003625) = $0.01904
  Effective spread = 2 * $0.01904 = $0.0381

  (True spread was approximately $0.02-0.03, so the estimate is
  in the right ballpark given limited data.)
```

### 5.5.5 Volume Clock vs Time Clock

Traditional time series sample at fixed time intervals (every minute, every second). But market activity is not uniform in time. Volume-based sampling adapts to market activity.

```
  TIME CLOCK (fixed interval):
  +------------------------------------------------------------------+
  |  Sample every 1 minute regardless of activity                    |
  |                                                                  |
  |  Problem:                                                        |
  |  9:30-9:35 AM:  Very high volume (opening)  -> 5 samples        |
  |  12:00-12:05 PM: Very low volume (lunch)    -> 5 samples        |
  |                                                                  |
  |  Same number of samples but vastly different information content |
  +------------------------------------------------------------------+

  VOLUME CLOCK (activity-based):
  +------------------------------------------------------------------+
  |  Sample every N shares traded                                    |
  |                                                                  |
  |  9:30-9:35 AM:  500,000 shares -> 50 samples (at 10,000 each)   |
  |  12:00-12:05 PM: 50,000 shares -> 5 samples                     |
  |                                                                  |
  |  More samples when market is active, fewer when quiet            |
  |  Returns are more "normal" (closer to Gaussian)                  |
  +------------------------------------------------------------------+

  Three Alternative Bar Types (Marcos Lopez de Prado):

  +------------------------------------------------------------------+
  |  TICK BARS:    Sample every N trades (e.g., every 100 trades)    |
  |  VOLUME BARS:  Sample every N shares (e.g., every 10,000 shares) |
  |  DOLLAR BARS:  Sample every $N notional (e.g., every $1M traded) |
  +------------------------------------------------------------------+

  Comparison for a stock going from $50 to $100:

  Volume bars: 10,000 shares at $50 = $500K notional
               10,000 shares at $100 = $1M notional
               -> Different economic significance per bar

  Dollar bars: $1M at $50 = 20,000 shares
               $1M at $100 = 10,000 shares
               -> Consistent economic significance per bar

  Dollar bars are preferred for strategies spanning long time periods
  where price levels change significantly.
```

### 5.5.6 Signature Plot

The **signature plot** shows how estimated realized variance changes with sampling frequency. It is a diagnostic tool for understanding microstructure noise.

```
  Realized Variance (RV) vs Sampling Frequency:

  RV (annualized)
  40% |*
     |  *
  35% |    *
     |      *       Microstructure noise dominates
  30% |        *     at high frequencies (bid-ask bounce,
     |          *    discreteness effects)
  25% |            *
     |              **
  20% |                ***
     |                   ****
  18% |                       *********
     |                                **********
  16% |                                         *************
     |                                                       ********
  15% |                                                               ***
     +--|-------|-------|-------|-------|-------|-------|-------> Sampling
       1s      5s     30s     1m      5m     15m     30m      Interval

  Interpretation:
  +------------------------------------------------------------------+
  |  At very high frequency (1 second):                              |
  |  RV is inflated by bid-ask bounce -> overestimates true vol      |
  |                                                                  |
  |  At moderate frequency (5-15 minutes):                           |
  |  RV stabilizes near true volatility                              |
  |                                                                  |
  |  At low frequency (30 min+):                                     |
  |  RV is noisy due to few observations                             |
  |                                                                  |
  |  The "flat" region of the signature plot indicates the optimal   |
  |  sampling frequency for variance estimation (typically 5-15 min) |
  +------------------------------------------------------------------+
```

To handle microstructure noise at high frequencies, researchers use noise-robust variance estimators:

```
  Common noise-robust estimators:
  1. Two-Scale Realized Variance (TSRV) - Zhang, Mykland, Ait-Sahalia
  2. Multi-Scale Realized Variance (MSRV) - Zhang
  3. Realized Kernel - Barndorff-Nielsen, Hansen, Lunde, Shephard
  4. Pre-averaging estimator - Jacod, Li, Mykland, Podolskij, Vetter
```

---

## 5.6 Information and Price Discovery

How does information get incorporated into prices? This section covers the foundational models of informed trading.

### 5.6.1 Kyle's Model of Informed Trading (1985)

Kyle's model is one of the most important in all of financial economics. It shows how a single informed trader interacts with noise traders and a market maker.

```
+------------------------------------------------------------------------+
|              KYLE'S MODEL (1985)                                       |
+------------------------------------------------------------------------+
|                                                                        |
|  Three types of participants:                                          |
|                                                                        |
|  1. INFORMED TRADER (one)                                              |
|     - Knows the true value V of the asset                              |
|     - Chooses how aggressively to trade                                |
|     - Wants to maximize profit but hides among noise                   |
|                                                                        |
|  2. NOISE TRADERS (many)                                               |
|     - Trade randomly (for liquidity needs)                             |
|     - Order flow: u ~ N(0, sigma_u^2)                                  |
|                                                                        |
|  3. MARKET MAKER (competitive)                                         |
|     - Sets price equal to expected value given total order flow        |
|     - Sees: total flow = x (informed) + u (noise) but cannot          |
|       distinguish between them                                         |
|                                                                        |
+------------------------------------------------------------------------+

  Key Results:

  The informed trader submits: x = beta * (V - P_0)
  where beta = sigma_u / sigma_V  (trade more when noise is high)

  The market maker sets price:
    P = P_0 + lambda * (x + u)

  where lambda = sigma_V / (2 * sigma_u)  (Kyle's Lambda)

  +------------------------------------------------------------------+
  |  KYLE'S LAMBDA (lambda):                                         |
  |                                                                  |
  |  - Measures price impact per unit of order flow                  |
  |  - Higher lambda = more price impact = less liquid market        |
  |  - lambda = sigma_V / (2 * sigma_u)                              |
  |                                                                  |
  |  If sigma_V is large (much private info): lambda is large        |
  |    -> Each trade moves price a lot (market is wary)              |
  |                                                                  |
  |  If sigma_u is large (lots of noise trading): lambda is small    |
  |    -> Trades move price less (hard to detect informed trader)    |
  +------------------------------------------------------------------+
```

**Numerical example**:

```
  Setup:
    P_0 = $50.00     (current price)
    V   = $52.00     (true value, known only to informed trader)
    sigma_V = $2.00  (uncertainty about true value)
    sigma_u = 1000   (noise trader order flow standard deviation)

  Kyle's lambda:
    lambda = 2.00 / (2 * 1000) = $0.001 per share

  Informed trader's optimal order:
    beta = 1000 / 2.00 = 500
    x = 500 * (52.00 - 50.00) = 500 * 2.00 = 1000 shares (buy)

  If noise traders happen to buy u = 500 shares:
    Total order flow = 1000 + 500 = 1500
    New price = 50.00 + 0.001 * 1500 = $51.50

  Informed trader's profit:
    Bought 1000 shares at approximately $51.50 (average execution)
    True value is $52.00
    Profit per share ~ $0.50
    Total profit ~ $500

  Key insight: The informed trader does NOT push price all the way
  to $52.00. They trade just enough to profit while keeping their
  information partially hidden. Price discovery is GRADUAL.
```

### 5.6.2 Glosten-Milgrom Model (1985)

While Kyle models batch trading, Glosten-Milgrom models sequential trade-by-trade price updates. The market maker uses Bayesian updating.

```
+------------------------------------------------------------------------+
|              GLOSTEN-MILGROM MODEL                                     |
+------------------------------------------------------------------------+
|                                                                        |
|  Setup:                                                                |
|  - Asset has true value V_H (high) or V_L (low)                       |
|  - Prior probability of V_H: pi                                       |
|  - Fraction of informed traders: mu                                    |
|  - Fraction of uninformed traders: 1 - mu                              |
|  - Informed traders always buy if V=V_H, sell if V=V_L                |
|  - Uninformed buy or sell with equal probability                       |
|                                                                        |
|  Market Maker's Quotes:                                                |
|                                                                        |
|  Ask = E[V | next trade is a buy]                                      |
|      = V_H * P(V=V_H | buy) + V_L * P(V=V_L | buy)                   |
|                                                                        |
|  Bid = E[V | next trade is a sell]                                     |
|      = V_H * P(V=V_H | sell) + V_L * P(V=V_L | sell)                  |
|                                                                        |
+------------------------------------------------------------------------+

  Bayesian Update After a BUY:

  P(buy | V=V_H) = mu * 1 + (1-mu) * 0.5 = mu + (1-mu)/2 = (1+mu)/2
  P(buy | V=V_L) = mu * 0 + (1-mu) * 0.5 = (1-mu)/2

  By Bayes' rule:
  P(V=V_H | buy) = pi * (1+mu)/2 / [pi*(1+mu)/2 + (1-pi)*(1-mu)/2]

  Numerical Example:
    V_H = $55, V_L = $45, pi = 0.5, mu = 0.3

  Before any trade:
    E[V] = 0.5 * 55 + 0.5 * 45 = $50.00

  After observing a BUY:
    P(V_H | buy) = 0.5*(1.3)/2 / [0.5*(1.3)/2 + 0.5*(0.7)/2]
                 = 0.325 / (0.325 + 0.175)
                 = 0.325 / 0.500
                 = 0.65

    Updated E[V] = 0.65 * 55 + 0.35 * 45 = 35.75 + 15.75 = $51.50

  After observing another BUY:
    pi_new = 0.65
    P(V_H | buy) = 0.65*(1.3)/2 / [0.65*(1.3)/2 + 0.35*(0.7)/2]
                 = 0.4225 / (0.4225 + 0.1225)
                 = 0.4225 / 0.5450
                 = 0.775

    Updated E[V] = 0.775 * 55 + 0.225 * 45 = 42.625 + 10.125 = $52.75

  After 2 consecutive buys, the price moved from $50.00 to $52.75.
  The market maker is learning that the informed trader is buying,
  which means V=V_H=$55 is more likely.
```

### 5.6.3 PIN: Probability of Informed Trading

The **PIN** model (Easley, Kiefer, O'Hara, Paperman, 1996) estimates the probability that any given trade is from an informed trader.

```
+------------------------------------------------------------------------+
|              PIN MODEL                                                 |
+------------------------------------------------------------------------+
|                                                                        |
|  Model structure (for each trading day):                               |
|                                                                        |
|                    alpha (prob of info event)                           |
|                   /          \                                         |
|                  /            \                                        |
|          Info Event         No Info Event                              |
|         /        \                |                                    |
|      delta     1-delta           |                                    |
|      (bad)     (good)            |                                    |
|        |          |              |                                     |
|     Informed   Informed      Only Uninformed                           |
|     SELLS      BUYS         (epsilon_b buys, epsilon_s sells)          |
|     (mu+eps)   (mu+eps)                                                |
|                                                                        |
|  Parameters:                                                           |
|    alpha   = probability of an information event                       |
|    delta   = probability the info event is bad news                    |
|    mu      = arrival rate of informed traders                          |
|    epsilon_b = arrival rate of uninformed buy orders                   |
|    epsilon_s = arrival rate of uninformed sell orders                  |
|                                                                        |
|  PIN Formula:                                                          |
|  +--------------------------------------------------------------+     |
|  |                                                              |     |
|  |            alpha * mu                                        |     |
|  |  PIN = ---------------------                                 |     |
|  |        alpha*mu + epsilon_b + epsilon_s                      |     |
|  |                                                              |     |
|  |  = (informed order arrival rate) / (total order arrival rate)|     |
|  |                                                              |     |
|  +--------------------------------------------------------------+     |
|                                                                        |
+------------------------------------------------------------------------+

  Numerical Example:

    alpha     = 0.3  (30% chance of info event on any day)
    delta     = 0.5  (50/50 good or bad news)
    mu        = 200  (200 informed orders per day when event occurs)
    epsilon_b = 400  (400 uninformed buy orders per day)
    epsilon_s = 400  (400 uninformed sell orders per day)

    PIN = (0.3 * 200) / (0.3 * 200 + 400 + 400)
        = 60 / (60 + 800)
        = 60 / 860
        = 0.070 = 7.0%

  Interpretation: About 7% of orders are from informed traders.
  This is typical for a liquid large-cap stock.

  PIN Ranges by Stock Type:
  +----------------------------------+
  | Large-cap (AAPL, MSFT): 5-10%   |
  | Mid-cap:                10-20%   |
  | Small-cap:              20-40%   |
  | Pre-announcement:       30-50%+  |
  +----------------------------------+

  Higher PIN -> wider spreads (market makers charge more for
  adverse selection risk)
```

### 5.6.4 VPIN: Volume-Synchronized PIN

**VPIN** (Easley, Lopez de Prado, O'Hara, 2012) is a real-time version of PIN that does not require maximum likelihood estimation. It uses volume buckets instead of time intervals.

```
+------------------------------------------------------------------------+
|              VPIN CALCULATION                                          |
+------------------------------------------------------------------------+
|                                                                        |
|  Step 1: Define volume bucket size V_bucket                            |
|          (e.g., 1/50th of expected daily volume)                       |
|                                                                        |
|  Step 2: Classify each trade as buy or sell (Lee-Ready or bulk         |
|          volume classification)                                        |
|                                                                        |
|  Step 3: For each volume bucket tau:                                   |
|          V_buy(tau)  = total buy volume in bucket                      |
|          V_sell(tau) = total sell volume in bucket                     |
|          Order Imbalance OI(tau) = |V_buy(tau) - V_sell(tau)|          |
|                                                                        |
|  Step 4: VPIN over n buckets:                                          |
|                                                                        |
|           1    n                                                       |
|  VPIN = ----- SUM  OI(tau_i)  /  V_bucket                             |
|           n   i=1                                                      |
|                                                                        |
|         = Average absolute order imbalance / bucket volume             |
|                                                                        |
+------------------------------------------------------------------------+

  Numerical Example:

  V_bucket = 10,000 shares, n = 5 buckets

  Bucket | Buy Vol | Sell Vol | OI = |Buy-Sell|
  -------|---------|----------|------------------
     1   |  7,000  |  3,000   | 4,000
     2   |  4,500  |  5,500   | 1,000
     3   |  8,000  |  2,000   | 6,000
     4   |  5,200  |  4,800   |   400
     5   |  6,500  |  3,500   | 3,000

  Average OI = (4000 + 1000 + 6000 + 400 + 3000) / 5 = 14400/5 = 2880

  VPIN = 2880 / 10000 = 0.288 = 28.8%

  Interpretation:
  - VPIN of 0.288 indicates moderate toxicity
  - Values above 0.3-0.4 are considered high toxicity
  - VPIN spiked to ~0.9 before the May 6, 2010 Flash Crash
```

### 5.6.5 Order Flow Toxicity

```
  Order Flow Toxicity Timeline (Flash Crash Example):

  VPIN
  1.0 |                                          *
      |                                         **
  0.8 |                                        *
      |                                       *
  0.6 |                                     **
      |                                   **
  0.4 |                               ****
      |                        *******
  0.2 |  ***********  *********
      |             **
  0.0 +---|---|---|---|---|---|---|---|---|----> Time
      9:30 10:00 11:00 12:00 1:00 2:00 2:30 2:45 2:50

      Normal trading   Toxicity building    Flash Crash
                                             at 2:45 PM

  When VPIN is high:
  +------------------------------------------------------------------+
  | - Market makers face high adverse selection                      |
  | - Spreads widen, depth decreases                                 |
  | - Market becomes fragile and vulnerable to crashes               |
  | - Smart traders should reduce position sizes                     |
  | - Market makers should pull quotes or widen dramatically         |
  +------------------------------------------------------------------+
```

---

## 5.7 Market Fragmentation

In modern markets, trading for a single stock occurs simultaneously across many different venues. This creates both opportunities and challenges.

### 5.7.1 Multiple Venues and Best Execution

```
+------------------------------------------------------------------------+
|              US EQUITY MARKET FRAGMENTATION                            |
+------------------------------------------------------------------------+
|                                                                        |
|  16 Registered Exchanges:                                              |
|  +------------------------------------------------------------------+  |
|  | NYSE, NYSE Arca, NYSE American, NYSE National, NYSE Chicago     |  |
|  | NASDAQ (3 tiers), Cboe BZX, BYX, EDGX, EDGA                    |  |
|  | IEX, LTSE, MEMX, MIAX Pearl Equities                           |  |
|  +------------------------------------------------------------------+  |
|                                                                        |
|  ~40 Alternative Trading Systems (Dark Pools):                         |
|  +------------------------------------------------------------------+  |
|  | Citadel Connect, Virtu MatchIt, UBS ATS                          |  |
|  | JPM-X, Morgan Stanley Pool, Goldman Sigma X                      |  |
|  | Instinet, Liquidnet, Level ATS                                   |  |
|  +------------------------------------------------------------------+  |
|                                                                        |
|  Typical Market Share (US Equities):                                   |
|  +------------------------------------------------------------------+  |
|  |  NYSE Group:          ~25%                                       |  |
|  |  NASDAQ Group:         ~20%                                      |  |
|  |  Cboe Group:           ~20%                                      |  |
|  |  IEX:                  ~3%                                       |  |
|  |  Other exchanges:      ~5%                                       |  |
|  |  Dark pools/ATS:       ~15%                                      |  |
|  |  Wholesalers (PFOF):   ~12%                                      |  |
|  +------------------------------------------------------------------+  |
|                                                                        |
+------------------------------------------------------------------------+
```

### 5.7.2 National Best Bid and Offer (NBBO)

The NBBO is the best available bid and ask across ALL exchanges at any given moment.

```
  Example: AAPL quotes across exchanges at 10:15:32

  Exchange    | Bid        | Ask        | Bid Size | Ask Size
  ------------|------------|------------|----------|----------
  NYSE        | $175.04    | $175.06    |   300    |   400
  NASDAQ      | $175.03    | $175.05    |   500    |   200
  Cboe BZX    | $175.04    | $175.06    |   200    |   300
  Cboe EDGX   | $175.03    | $175.07    |   100    |   100
  IEX         | $175.04    | $175.06    |   150    |   150
  NYSE Arca   | $175.04    | $175.05    |   400    |   250

  NBBO Calculation:
  +------------------------------------------------------------------+
  |  National Best Bid  = MAX(all bids) = $175.04                    |
  |    (at NYSE, Cboe BZX, IEX, NYSE Arca)                          |
  |    Total size at NBB = 300 + 200 + 150 + 400 = 1,050 shares     |
  |                                                                  |
  |  National Best Offer = MIN(all asks) = $175.05                   |
  |    (at NASDAQ, NYSE Arca)                                        |
  |    Total size at NBO = 200 + 250 = 450 shares                   |
  |                                                                  |
  |  NBBO: $175.04 x $175.05  (spread = $0.01 = 1 penny)            |
  |                                                                  |
  |  Note: NBBO is tighter than any individual exchange.             |
  |  NYSE alone has a $0.02 spread but NASDAQ has the best ask.      |
  +------------------------------------------------------------------+
```

### 5.7.3 Regulation NMS

Regulation National Market System (2005, fully implemented 2007) is the cornerstone of US equity market regulation. Its key provisions:

```
+------------------------------------------------------------------------+
|              REGULATION NMS - KEY RULES                                |
+------------------------------------------------------------------------+
|                                                                        |
|  RULE 611: ORDER PROTECTION RULE (Trade-Through Rule)                  |
|  +------------------------------------------------------------------+  |
|  | Exchanges cannot execute trades at prices WORSE than the best    |  |
|  | price available on another exchange.                              |  |
|  |                                                                  |  |
|  | Example:                                                         |  |
|  | NASDAQ best ask: $175.05                                         |  |
|  | NYSE receives a buy order and has an ask at $175.06              |  |
|  | NYSE CANNOT fill at $175.06 -- must route to NASDAQ or match     |  |
|  | at $175.05 or better.                                            |  |
|  |                                                                  |  |
|  | Exception: "Fast market" exemption for manual quotes              |  |
|  +------------------------------------------------------------------+  |
|                                                                        |
|  RULE 610: ACCESS RULE                                                 |
|  +------------------------------------------------------------------+  |
|  | - Access fees capped at $0.003/share ($0.30 per 100 shares)      |  |
|  | - Ensures fair access to all exchange quotes                     |  |
|  | - Prevents "locked" markets (bid = ask across exchanges)         |  |
|  +------------------------------------------------------------------+  |
|                                                                        |
|  RULE 612: SUB-PENNY RULE                                              |
|  +------------------------------------------------------------------+  |
|  | - Minimum tick size: $0.01 for stocks >= $1.00                   |  |
|  | - Minimum tick size: $0.0001 for stocks < $1.00                  |  |
|  | - Prevents sub-penny price improvement (except for hidden orders |  |
|  |   which can trade at midpoint in dark pools)                     |  |
|  +------------------------------------------------------------------+  |
|                                                                        |
+------------------------------------------------------------------------+
```

### 5.7.4 Payment for Order Flow (PFOF)

```
+------------------------------------------------------------------------+
|              PAYMENT FOR ORDER FLOW                                    |
+------------------------------------------------------------------------+
|                                                                        |
|  How it works:                                                         |
|                                                                        |
|  Retail       Broker        Wholesaler      Exchange                   |
|  Trader      (e.g. Schwab) (e.g. Citadel)                             |
|    |              |              |               |                      |
|    |-- Buy 100 -->|              |               |                      |
|    |   AAPL @MKT  |-- Route to ->|               |                      |
|    |              |   wholesaler |               |                      |
|    |              |<-- Pay $0.20 |               |                      |
|    |              |   per 100 sh |               |                      |
|    |              |              |-- Fill at ---->|                      |
|    |              |              |  $175.054      |  (midpoint or        |
|    |              |              |  (price        |   slight improvement |
|    |<-- Filled -->|              |   improvement) |   vs NBBO)          |
|    |  @ $175.054  |              |               |                      |
|                                                                        |
|  Economics:                                                            |
|  +------------------------------------------------------------------+  |
|  | NBBO: $175.04 bid / $175.06 ask                                  |  |
|  | Without PFOF: Retail buy fills at $175.06 (ask)                  |  |
|  | With PFOF: Wholesaler fills at $175.054 ($0.006 improvement)     |  |
|  |                                                                  |  |
|  | Retail saves:  100 * $0.006 = $0.60 per order                    |  |
|  | Broker gets:   $0.20 per 100 shares from wholesaler              |  |
|  | Wholesaler:    Earns spread minus improvement minus PFOF         |  |
|  |               = $0.02 - $0.006 - $0.002 = $0.012/share          |  |
|  |               On millions of orders daily -> very profitable     |  |
|  +------------------------------------------------------------------+  |
|                                                                        |
|  Controversy:                                                          |
|  +------------------------------------------------------------------+  |
|  | FOR:  Retail gets price improvement and commission-free trading  |  |
|  | AGAINST: Retail may get better prices in a competitive auction   |  |
|  |          Broker incentive misaligned (route for PFOF, not best   |  |
|  |          execution). SEC proposed Rule 615 (order competition    |  |
|  |          rule) to address this via auctions.                     |  |
|  +------------------------------------------------------------------+  |
|                                                                        |
+------------------------------------------------------------------------+
```

### 5.7.5 Dark Pools and Crossing Networks

Dark pools are private trading venues where orders are not displayed publicly before execution.

```
+------------------------------------------------------------------------+
|              DARK POOLS                                                |
+------------------------------------------------------------------------+
|                                                                        |
|  LIT EXCHANGE (Transparent):                                           |
|  +------------------------------------------------------------------+  |
|  | - All orders visible in the order book                           |  |
|  | - Pre-trade transparency: everyone sees bids/asks                |  |
|  | - Post-trade transparency: all trades reported                   |  |
|  | - Price discovery happens here                                   |  |
|  +------------------------------------------------------------------+  |
|                                                                        |
|  DARK POOL (Opaque):                                                   |
|  +------------------------------------------------------------------+  |
|  | - Orders are hidden until execution                              |  |
|  | - No pre-trade transparency                                      |  |
|  | - Post-trade transparency: trades reported within 10 seconds     |  |
|  | - Typically match at or within the NBBO midpoint                 |  |
|  | - Good for large institutional orders (reduces information leak) |  |
|  +------------------------------------------------------------------+  |
|                                                                        |
|  Types of Dark Pools:                                                  |
|  +------------------------------------------------------------------+  |
|  | 1. EXCHANGE-OWNED: NYSE Dark, NASDAQ Private Market               |  |
|  |    - Extensions of lit exchange                                   |  |
|  |                                                                  |  |
|  | 2. BROKER-DEALER: Goldman Sigma X, JPM-X, MS Pool                 |  |
|  |    - Cross client orders internally                               |  |
|  |    - Potential conflicts of interest                              |  |
|  |                                                                  |  |
|  | 3. AGENCY: Liquidnet, ITG POSIT, Instinet CBX                     |  |
|  |    - Strictly match buy-side with buy-side                        |  |
|  |    - Large block trades (10,000+ shares)                          |  |
|  |    - Least information leakage                                    |  |
|  +------------------------------------------------------------------+  |
|                                                                        |
|  Advantages:                       Disadvantages:                      |
|  +---------------------------+    +---------------------------+        |
|  | Reduced information leak   |    | No price discovery        |        |
|  | Lower market impact        |    | Potential front-running   |        |
|  | Midpoint pricing           |    | Adverse selection risk    |        |
|  | Large block capability     |    | Low fill rates            |        |
|  +---------------------------+    +---------------------------+        |
|                                                                        |
+------------------------------------------------------------------------+
```

### 5.7.6 Maker-Taker Fee Model

```
+------------------------------------------------------------------------+
|              MAKER-TAKER FEE MODEL                                    |
+------------------------------------------------------------------------+
|                                                                        |
|  Most US exchanges use the maker-taker model:                          |
|                                                                        |
|  MAKER (posts limit order that adds liquidity):                        |
|    -> Receives REBATE from exchange                                    |
|    -> Typically: -$0.0020 to -$0.0032 per share (negative = rebate)    |
|                                                                        |
|  TAKER (sends marketable order that removes liquidity):                |
|    -> Pays FEE to exchange                                             |
|    -> Typically: +$0.0025 to +$0.0030 per share                       |
|                                                                        |
|  Exchange Revenue = Taker Fee - Maker Rebate > 0                       |
|                                                                        |
|  Example:                                                              |
|  +------------------------------------------------------------------+  |
|  | Trader A posts limit buy at $175.04  (MAKER)                     |  |
|  | Trader B sends market sell          (TAKER)                      |  |
|  |                                                                  |  |
|  | Trade executes at $175.04                                        |  |
|  | Trader A (maker): gets $0.0025/share REBATE                      |  |
|  | Trader B (taker): pays $0.0030/share FEE                         |  |
|  | Exchange keeps:   $0.0030 - $0.0025 = $0.0005/share              |  |
|  +------------------------------------------------------------------+  |
|                                                                        |
|  INVERTED EXCHANGES (taker-maker):                                     |
|  +------------------------------------------------------------------+  |
|  | Some exchanges invert the model:                                 |  |
|  | Maker PAYS a fee, Taker gets a REBATE                            |  |
|  | Examples: Cboe BYX, NYSE National                                |  |
|  |                                                                  |  |
|  | Used by: Traders who want to take liquidity cheaply               |  |
|  | Attracts: Aggressive marketable orders                            |  |
|  | Trade-off: Less resting liquidity (makers pay)                    |  |
|  +------------------------------------------------------------------+  |
|                                                                        |
|  Fee Schedule Comparison (per share):                                  |
|  +---------------------+--------+---------+---------+                  |
|  | Exchange            | Maker  | Taker   | Net     |                  |
|  +---------------------+--------+---------+---------+                  |
|  | NYSE Arca           | -$0.0025| +$0.0030| +$0.0005|                  |
|  | NASDAQ              | -$0.0025| +$0.0030| +$0.0005|                  |
|  | Cboe BZX            | -$0.0032| +$0.0030| -$0.0002|                  |
|  | Cboe EDGX           | -$0.0032| +$0.0030| -$0.0002|                  |
|  | Cboe BYX (inverted) | +$0.0005| -$0.0003| +$0.0002|                  |
|  | IEX                 | -$0.0000| +$0.0009| +$0.0009|                  |
|  +---------------------+--------+---------+---------+                  |
|                                                                        |
+------------------------------------------------------------------------+
```

---

## 5.8 Practical Microstructure Analysis

This section covers practical techniques for analyzing market microstructure data, detecting manipulation, and building predictive signals.

### 5.8.1 Computing Effective Spread from Trade Data

The **effective spread** measures the actual transaction cost, as opposed to the quoted spread.

```
  Quoted Spread vs Effective Spread:

  +------------------------------------------------------------------+
  | QUOTED SPREAD = Ask - Bid (what's displayed)                     |
  |   Example: $175.06 - $175.04 = $0.02                            |
  |                                                                  |
  | EFFECTIVE SPREAD = 2 * |Trade Price - Midpoint| * Sign           |
  |   Measures actual cost of execution                              |
  |   Can be smaller than quoted spread (price improvement)          |
  |   or larger (trades walking through the book)                    |
  +------------------------------------------------------------------+

  Computing Effective Spread:

  For each trade i:
    mid_i = (bid_i + ask_i) / 2
    d_i = sign of trade (+1 for buy, -1 for sell)  [via Lee-Ready]

    Effective spread_i = 2 * d_i * (price_i - mid_i)

  Average effective spread = mean(effective_spread_i)

  Worked Example:

  Trade | Price    | Bid     | Ask     | Mid      | Sign | Eff Spread
  ------|----------|---------|---------|----------|------|----------
    1   | $175.06  | $175.04 | $175.06 | $175.05  |  +1  | 2*1*0.01 = $0.02
    2   | $175.04  | $175.04 | $175.06 | $175.05  |  -1  | 2*(-1)*(-0.01) = $0.02
    3   | $175.054 | $175.04 | $175.06 | $175.05  |  +1  | 2*1*0.004 = $0.008
    4   | $175.07  | $175.04 | $175.06 | $175.05  |  +1  | 2*1*0.02 = $0.04
    5   | $175.05  | $175.04 | $175.06 | $175.05  |  +1  | 2*1*0.00 = $0.00

  Average effective spread = (0.02 + 0.02 + 0.008 + 0.04 + 0.00) / 5
                           = 0.088 / 5 = $0.0176

  Quoted spread: $0.02
  Average effective spread: $0.0176

  Effective < Quoted because:
  - Trade 3 got price improvement (executed inside the spread)
  - Trade 5 executed at midpoint (e.g., dark pool)
  - Trade 4 increased the average (walked through the book)

  REALIZED SPREAD (measures MM profitability):
  +------------------------------------------------------------------+
  | Realized spread_i = 2 * d_i * (price_i - mid_{i+5min})          |
  |                                                                  |
  | Uses midpoint 5 MINUTES later to see if the MM made or lost     |
  | money after the trade.                                           |
  |                                                                  |
  | If realized spread < effective spread:                           |
  |   -> Adverse selection is eating into MM profits                 |
  |   -> The traded direction predicted subsequent price movement    |
  +------------------------------------------------------------------+
```

### 5.8.2 Measuring Market Quality Metrics

```
+------------------------------------------------------------------------+
|              MARKET QUALITY METRICS                                    |
+------------------------------------------------------------------------+
|                                                                        |
|  1. QUOTED SPREAD                                                      |
|     QS = Ask - Bid                                                     |
|     Time-weighted average during trading hours                         |
|                                                                        |
|  2. EFFECTIVE SPREAD                                                   |
|     ES = 2 * |Trade Price - Mid|                                       |
|     Volume-weighted across all trades                                  |
|                                                                        |
|  3. REALIZED SPREAD                                                    |
|     RS = 2 * D * (Trade Price - Mid_{+5min})                           |
|     Measures actual liquidity provider profit                          |
|                                                                        |
|  4. PRICE IMPACT                                                       |
|     PI = 2 * D * (Mid_{+5min} - Mid)                                  |
|     Note: Effective Spread = Realized Spread + Price Impact            |
|                                                                        |
|  5. DEPTH                                                              |
|     Total shares available at best bid + best ask                      |
|     Dollar depth = Bid_size * Bid + Ask_size * Ask                     |
|                                                                        |
|  6. RESILIENCY                                                         |
|     How quickly the book recovers after a large trade                  |
|     Measured as time to return to pre-trade depth                      |
|                                                                        |
|  7. AMIHUD ILLIQUIDITY RATIO                                           |
|     ILLIQ = (1/D) * SUM(|r_d| / Volume_d)                             |
|     Higher ratio = less liquid                                         |
|                                                                        |
+------------------------------------------------------------------------+

  Example: Computing daily market quality for AAPL

  +----------------------------------------------+
  | Metric                  | Value              |
  +----------------------------------------------+
  | Avg Quoted Spread       | $0.010  (0.6 bps)  |
  | Avg Effective Spread    | $0.008  (0.5 bps)  |
  | Avg Realized Spread     | $0.003  (0.2 bps)  |
  | Avg Price Impact        | $0.005  (0.3 bps)  |
  | Avg Depth at Inside     | 1,500 shares        |
  | Avg Daily Volume        | 55M shares          |
  | Amihud Ratio            | 0.0000012           |
  +----------------------------------------------+

  Interpretation:
  - Very tight spreads (highly liquid large-cap)
  - Effective < Quoted (price improvement from dark pools/PFOF)
  - Realized spread is positive (MMs are profitable on average)
  - Price impact is ~60% of effective spread (high adverse selection)
  - Deep book (1,500 shares per side at inside)
```

### 5.8.3 Detecting Spoofing and Layering Patterns

**Spoofing** is the illegal practice of placing large orders with the intent to cancel before execution, to manipulate the perception of supply/demand. **Layering** is a form of spoofing involving multiple price levels.

```
+------------------------------------------------------------------------+
|              SPOOFING DETECTION                                        |
+------------------------------------------------------------------------+
|                                                                        |
|  Typical Spoofing Pattern:                                             |
|                                                                        |
|  Time    Order Book (Bid Side)           Action                        |
|  ------  ----------------------------   ----------------------------   |
|  T+0     $100.03 x 200                  Normal book                    |
|          $100.02 x 300                                                 |
|          $100.01 x 400                                                 |
|                                                                        |
|  T+1     $100.03 x 200                  Spoofer places large           |
|          $100.02 x 300                  bid orders at $100.00-         |
|          $100.01 x 400                  $100.02 to create the          |
|   >>>    $100.02 x 5000  (SPOOF)        illusion of strong demand      |
|   >>>    $100.01 x 8000  (SPOOF)                                       |
|   >>>    $100.00 x 10000 (SPOOF)                                       |
|                                                                        |
|  T+2     Other traders see huge bids    Others react: "strong          |
|          and buy, pushing ask up.        support, let me buy too"      |
|                                                                        |
|  T+3     Price moves up to $100.05      Spoofer SELLS at higher       |
|          Spoofer sells 1000 shares       price (their real intent)     |
|                                                                        |
|  T+4     Spoofer cancels all            Book returns to normal.        |
|          large bid orders                Spoofer profited from the      |
|          (never intended to buy)         artificial price move.        |
|                                                                        |
+------------------------------------------------------------------------+

  Detection Signals:

  +------------------------------------------------------------------+
  | 1. ORDER-TO-TRADE RATIO                                          |
  |    High ratio of order submissions to actual executions           |
  |    Normal: 5:1 to 20:1                                           |
  |    Suspicious: 100:1+ on one side                                |
  |                                                                  |
  | 2. ASYMMETRIC BOOK ACTIVITY                                      |
  |    Large orders on one side, actual trades on the other           |
  |    Pattern: Place big bids, trade on ask side                    |
  |                                                                  |
  | 3. RAPID CANCELLATION                                            |
  |    Orders cancelled within milliseconds of placement             |
  |    Especially if cancelled just before they would be filled      |
  |                                                                  |
  | 4. LAYERING PATTERN                                              |
  |    Multiple large orders at successive price levels              |
  |    All placed within a short window                              |
  |    All cancelled together                                        |
  |                                                                  |
  | 5. TEMPORAL CORRELATION                                          |
  |    Spoof orders placed, price moves, opposite-side trade,        |
  |    then spoof orders cancelled. Repeating cycle.                 |
  +------------------------------------------------------------------+

  Quantitative Detection Algorithm:

  For each participant p in time window [t, t+W]:
    cancellation_rate_p = cancelled_volume_p / submitted_volume_p
    imbalance_p = |buy_submitted - sell_submitted| / total_submitted
    trade_opposite_p = fraction of actual trades on opposite side
                       from large resting orders

    IF cancellation_rate_p > 0.90
       AND imbalance_p > 0.80
       AND trade_opposite_p > 0.70:
      FLAG participant p for investigation
```

### 5.8.4 Order Flow Imbalance Prediction

Order flow imbalance (OFI) is a powerful predictor of short-term price movements. The concept aggregates signed volume to measure net buying or selling pressure.

```
+------------------------------------------------------------------------+
|              ORDER FLOW IMBALANCE (OFI) MODEL                         |
+------------------------------------------------------------------------+
|                                                                        |
|  Basic OFI (Cont, Kukanov, Stoikov, 2014):                             |
|                                                                        |
|  At each book update, compute the change in bid/ask quantities:        |
|                                                                        |
|  e_n = delta(BidQty_best) * I(BidPrice_best >= BidPrice_prev)          |
|      - delta(AskQty_best) * I(AskPrice_best <= AskPrice_prev)          |
|                                                                        |
|  Where:                                                                |
|  - delta(BidQty) is the change in quantity at best bid                 |
|  - I() is an indicator function                                        |
|  - Positive e_n = net bid pressure (buying), expect price UP           |
|  - Negative e_n = net ask pressure (selling), expect price DOWN        |
|                                                                        |
|  Aggregate OFI over interval [t, t+T]:                                 |
|  OFI(t, T) = Sum of e_n over all book updates in interval              |
|                                                                        |
|  Regression:                                                           |
|  dP(t, T) = alpha + beta * OFI(t, T) + epsilon                        |
|                                                                        |
|  beta is positive and significant (R^2 = 0.5-0.7 at tick level)       |
|                                                                        |
+------------------------------------------------------------------------+

  Example: Tracking OFI over 5 book updates

  Update | BB    | BQ   | BA    | AQ   | e_n    | Cumulative OFI
  -------|-------|------|-------|------|--------|----------------
    0    |175.04 | 300  |175.06 | 200  |  --    |   0
    1    |175.04 | 500  |175.06 | 200  | +200   | +200
    2    |175.04 | 500  |175.06 | 400  | -200   |   0
    3    |175.04 | 400  |175.06 | 400  | -100   | -100
    4    |175.05 | 200  |175.06 | 400  | +200   | +100
    5    |175.05 | 200  |175.06 | 100  | +300   | +400

  Cumulative OFI = +400 (net buying pressure)
  Prediction: price likely to move UP in the next few updates.

  Update 4 interpretation:
  - Best bid improved from $175.04 to $175.05
  - New quantity at best bid is 200
  - This counts as +200 (new aggressive bid)
  - Ask unchanged

  Update 5 interpretation:
  - Ask quantity decreased from 400 to 100 (300 shares removed/filled)
  - This counts as +300 (ask side thinning = bullish)
```

### 5.8.5 High-Frequency Signals from the Order Book

```
+------------------------------------------------------------------------+
|              HF SIGNALS FROM THE ORDER BOOK                           |
+------------------------------------------------------------------------+
|                                                                        |
|  1. WEIGHTED MID-PRICE (Microprice)                                    |
|     p_micro = (P_bid * Q_ask + P_ask * Q_bid) / (Q_ask + Q_bid)       |
|     Predicts next trade price better than simple midpoint              |
|     Alpha: 1-5 ticks horizon                                          |
|                                                                        |
|  2. MULTI-LEVEL BOOK IMBALANCE                                         |
|     Sum weighted bid quantities vs ask quantities at top N levels      |
|     Weights decay exponentially with distance from inside              |
|     Alpha: 10-100 ms horizon                                          |
|                                                                        |
|  3. TRADE IMBALANCE                                                    |
|     Net signed volume over rolling window                              |
|     (buy_volume - sell_volume) / total_volume                          |
|     Alpha: 100 ms - 1 second                                          |
|                                                                        |
|  4. QUEUE DEPLETION SIGNAL                                             |
|     When quantity at best bid/ask drops rapidly (being consumed)       |
|     Predicts imminent best price change                                |
|     Alpha: 1-10 ms (extremely fast)                                    |
|                                                                        |
|  5. LARGE ORDER DETECTION (Iceberg)                                    |
|     Detect hidden liquidity by observing replenishment patterns        |
|     Same price refills after execution = iceberg order                 |
|     Alpha: minutes horizon (trade alongside the iceberg)               |
|                                                                        |
|  6. CROSS-ASSET LEAD-LAG                                               |
|     ES futures lead SPY by 1-10 ms                                     |
|     AAPL options lead AAPL stock during events                         |
|     Alpha: 1-100 ms (requires co-location)                             |
|                                                                        |
|  7. SPREAD REGIME                                                      |
|     When spread is unusually wide/narrow for time of day               |
|     Wide spread = uncertainty = potential volatility                    |
|     Alpha: seconds to minutes                                          |
|                                                                        |
+------------------------------------------------------------------------+

  Signal Combination Example (simple linear model):

  +------------------------------------------------------------------+
  | Feature                      | Coefficient | T-stat | Horizon    |
  +------------------------------------------------------------------+
  | Book Imbalance (Level 1)     |  +0.42      |  15.3  | 100 ms     |
  | Book Imbalance (Level 2-5)   |  +0.18      |   8.7  | 100 ms     |
  | Trade Imbalance (1s window)  |  +0.31      |  12.1  | 100 ms     |
  | Spread Percentile            |  -0.05      |  -2.3  | 100 ms     |
  | ES Futures Lead              |  +0.55      |  22.8  | 100 ms     |
  +------------------------------------------------------------------+
  | Model R^2: 0.15 (at 100ms horizon)                               |
  | Note: R^2 of 0.15 is EXCELLENT for price prediction.             |
  | Most alpha signals have R^2 < 0.05 at longer horizons.           |
  +------------------------------------------------------------------+
```

---

## 5.9 Putting It All Together: From Theory to Practice

### 5.9.1 The Full Picture

```
+------------------------------------------------------------------------+
|              MICROSTRUCTURE IN A TRADING SYSTEM                        |
+------------------------------------------------------------------------+
|                                                                        |
|  RAW DATA                                                              |
|  +------------------------------------------------------------------+  |
|  | Exchange feeds -> Order book updates -> Trade prints              |  |
|  | (Level 3 data from co-located servers, ~5 microsecond latency)   |  |
|  +------------------------------------------------------------------+  |
|                      |                                                 |
|                      v                                                 |
|  MICROSTRUCTURE ENGINE                                                 |
|  +------------------------------------------------------------------+  |
|  | 1. Reconstruct full order book (all levels, all venues)          |  |
|  | 2. Compute NBBO in real-time                                     |  |
|  | 3. Classify trades (Lee-Ready)                                   |  |
|  | 4. Compute signals:                                              |  |
|  |    - Book imbalance (multi-level)                                |  |
|  |    - Order flow imbalance (OFI)                                  |  |
|  |    - Trade imbalance (signed volume)                             |  |
|  |    - Microprice / weighted mid                                   |  |
|  |    - VPIN (volume-synchronized toxicity)                         |  |
|  |    - Cross-asset lead-lag                                        |  |
|  | 5. Estimate effective spread, price impact                       |  |
|  +------------------------------------------------------------------+  |
|                      |                                                 |
|                      v                                                 |
|  SIGNAL -> STRATEGY -> EXECUTION                                       |
|  +------------------------------------------------------------------+  |
|  | Alpha signal: "Book imbalance predicts +2 ticks in 100ms"        |  |
|  | Strategy: Buy if OFI > threshold, sell if OFI < -threshold       |  |
|  | Execution: Post limit order 1 tick below predicted direction     |  |
|  | Risk: Size based on spread regime and volatility estimate        |  |
|  +------------------------------------------------------------------+  |
|                      |                                                 |
|                      v                                                 |
|  P&L ATTRIBUTION                                                       |
|  +------------------------------------------------------------------+  |
|  | Gross alpha:        +15 bps per trade                            |  |
|  | Spread cost:         -4 bps (effective spread)                   |  |
|  | Exchange fees:       -2 bps (net of rebates)                     |  |
|  | Market impact:       -3 bps (temporary impact)                   |  |
|  | Net alpha:           +6 bps per trade                            |  |
|  | Trades per day:      5,000                                       |  |
|  | Avg notional:        $50,000                                     |  |
|  | Daily P&L:           5000 * $50,000 * 0.0006 = $150,000          |  |
|  +------------------------------------------------------------------+  |
|                                                                        |
+------------------------------------------------------------------------+
```

### 5.9.2 Key Takeaways

```
+------------------------------------------------------------------------+
|              CHAPTER 5 SUMMARY                                        |
+------------------------------------------------------------------------+
|                                                                        |
|  1. The order book is the fundamental data structure of markets.       |
|     Understanding its dynamics is essential for any trading strategy.  |
|                                                                        |
|  2. Matching engines use price-time priority (equities) or pro-rata   |
|     (some futures). Queue position is a first-class concern.          |
|                                                                        |
|  3. Market makers earn the spread but face adverse selection.          |
|     The Avellaneda-Stoikov model formalizes optimal quoting.          |
|                                                                        |
|  4. Price impact follows a square-root law. The Almgren-Chriss        |
|     framework gives optimal execution trajectories.                   |
|                                                                        |
|  5. Tick data analysis requires specialized tools: Lee-Ready for      |
|     trade classification, Roll for spread estimation, volume clocks   |
|     for sampling, and signature plots for volatility.                 |
|                                                                        |
|  6. Information models (Kyle, Glosten-Milgrom, PIN/VPIN) explain      |
|     how informed trading affects prices and spreads.                   |
|                                                                        |
|  7. Markets are fragmented across 16+ exchanges and 40+ dark pools.   |
|     Reg NMS, NBBO, and maker-taker fees shape the landscape.         |
|                                                                        |
|  8. Practical signals: book imbalance, OFI, microprice, trade         |
|     imbalance, and cross-asset lead-lag are the bread and butter      |
|     of HF alpha generation.                                           |
|                                                                        |
+------------------------------------------------------------------------+
```

### 5.9.3 Essential References

| Paper / Book | Author(s) | Year | Topic |
|---|---|---|---|
| *Trading and Exchanges* | Larry Harris | 2003 | Comprehensive microstructure textbook |
| *Market Microstructure Theory* | Maureen O'Hara | 1995 | Theoretical foundations |
| *Continuous Auctions and Insider Trading* | Albert Kyle | 1985 | Kyle's Lambda, informed trading |
| *Bid, Ask and Transaction Prices* | Lawrence Glosten, Paul Milgrom | 1985 | Adverse selection model |
| *A Simple Implicit Measure of the Effective Bid-Ask Spread* | Richard Roll | 1984 | Roll's spread estimator |
| *Inferring Trade Direction from Intraday Data* | Charles Lee, Mark Ready | 1991 | Trade classification algorithm |
| *High-frequency trading in a limit order book* | Marco Avellaneda, Sasha Stoikov | 2008 | Optimal market making |
| *Optimal Execution of Portfolio Transactions* | Robert Almgren, Neil Chriss | 2001 | Execution optimization |
| *Flow Toxicity and Liquidity in a High Frequency World* | David Easley, Marcos Lopez de Prado, Maureen O'Hara | 2012 | VPIN |
| *A Likelihood Approach to Estimating PIN* | David Easley et al. | 1996 | PIN model |
| *The Price Impact of Order Book Events* | Rama Cont, Arseniy Kukanov, Sasha Stoikov | 2014 | Order flow imbalance |
| *Advances in Financial Machine Learning* | Marcos Lopez de Prado | 2018 | Dollar/volume bars, modern methods |

---

*Next Chapter: [06-TIME-SERIES-ANALYSIS](./06-TIME-SERIES-ANALYSIS.md) -- Stationarity, ARIMA, GARCH, cointegration, spectral analysis, and regime detection for financial time series.*
