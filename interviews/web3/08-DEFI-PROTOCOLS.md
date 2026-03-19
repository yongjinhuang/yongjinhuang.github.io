# Chapter 8: DeFi Protocols

## Introduction

Decentralized Finance (DeFi) recreates traditional financial services — trading, lending, borrowing, insurance — using smart contracts instead of banks and brokers. DeFi protocols manage over $100B in total value locked (TVL) and process billions in daily volume. Understanding how these protocols work at the smart contract level is essential for building, auditing, or integrating with the DeFi ecosystem.

This chapter covers the core DeFi primitives: automated market makers (AMMs), lending/borrowing protocols, stablecoins, oracles, flash loans, and yield aggregation.

```
+------------------------------------------------------------------------+
|                        DEFI ECOSYSTEM                                   |
+------------------------------------------------------------------------+
|                                                                        |
|  TRADING (DEXs)               LENDING / BORROWING                      |
|  +----------------------+    +---------------------------+             |
|  | Uniswap (AMM)         |    | Aave (variable/stable)    |             |
|  | Curve (stableswaps)   |    | Compound (cTokens)        |             |
|  | Balancer (weighted)   |    | MakerDAO (CDP + DAI)      |             |
|  | SushiSwap, PancakeSwap|    | Morpho (peer-to-peer)     |             |
|  +----------------------+    +---------------------------+             |
|                                                                        |
|  STABLECOINS                  ORACLES                                  |
|  +----------------------+    +---------------------------+             |
|  | USDC (centralized)    |    | Chainlink (decentralized) |             |
|  | DAI (crypto-backed)   |    | Uniswap TWAP (on-chain)   |             |
|  | USDT (centralized)    |    | Pyth (low-latency)        |             |
|  | FRAX (algorithmic)    |    | Band Protocol             |             |
|  +----------------------+    +---------------------------+             |
|                                                                        |
|  YIELD                        DERIVATIVES                              |
|  +----------------------+    +---------------------------+             |
|  | Yearn (auto-compound) |    | GMX (perpetuals)          |             |
|  | Convex (Curve boost)  |    | dYdX (orderbook)          |             |
|  | Pendle (yield trading)|    | Synthetix (synthetic)     |             |
|  | EigenLayer (restaking)|    | Options (Lyra, Premia)    |             |
|  +----------------------+    +---------------------------+             |
|                                                                        |
+------------------------------------------------------------------------+
```

---

## 1. Automated Market Makers (AMMs)

### 1.1 The Problem AMMs Solve

Traditional exchanges use **order books** — buyers and sellers post limit orders, and a matching engine pairs them. This requires:

- High throughput (millions of orders/second)
- Market makers to provide liquidity
- Low latency (microseconds)

None of these work on-chain (15 TPS, 12-second blocks, $5+ per transaction). AMMs replace the order book with a mathematical formula.

### 1.2 Constant Product Formula (Uniswap V2)

```
The Constant Product Formula:

    x * y = k

Where:
  x = reserve of Token A in the pool
  y = reserve of Token B in the pool
  k = constant (invariant)

Example:
  Pool has 100 ETH and 200,000 USDC
  k = 100 * 200,000 = 20,000,000

  Alice wants to buy 1 ETH:
  New ETH reserve: 100 - 1 = 99
  New USDC reserve: k / 99 = 20,000,000 / 99 = 202,020.20
  USDC Alice pays: 202,020.20 - 200,000 = 2,020.20 USDC for 1 ETH

  Price impact: Alice paid $2,020/ETH vs spot price of $2,000/ETH
  Slippage: 1% — larger trades cause more slippage
```

```
PRICE CURVE VISUALIZATION

USDC (y)
  ^
  |
  | *
  |  *
  |   *
  |    **
  |      ***
  |         *****
  |              **********
  |                        ******************
  +-----------------------------------------> ETH (x)

  The curve x*y=k means:
  - Large trades move the price significantly (high slippage)
  - The pool can never be fully drained (asymptotic)
  - Price = y/x (ratio of reserves)
```

### 1.3 Uniswap V2 Core Mechanics

```solidity
// Simplified Uniswap V2 swap logic
contract SimpleAMM {
    IERC20 public token0;
    IERC20 public token1;
    uint256 public reserve0;
    uint256 public reserve1;

    // Swap token0 for token1
    function swap(uint256 amountIn, uint256 minAmountOut) external {
        // 0.3% fee
        uint256 amountInWithFee = amountIn * 997;
        // Constant product: (x + dx*0.997) * (y - dy) = x * y
        uint256 amountOut = (amountInWithFee * reserve1) /
            (reserve0 * 1000 + amountInWithFee);

        require(amountOut >= minAmountOut, "Slippage exceeded");

        token0.transferFrom(msg.sender, address(this), amountIn);
        token1.transfer(msg.sender, amountOut);

        reserve0 += amountIn;
        reserve1 -= amountOut;
    }
}
```

### 1.4 Liquidity Provision

Liquidity providers (LPs) deposit both tokens in equal value and earn trading fees:

```
LIQUIDITY PROVISION

Alice provides: 10 ETH + 20,000 USDC (at $2,000/ETH)
Pool now has:   110 ETH + 220,000 USDC
Alice receives: LP tokens representing her ~9.09% share

Fees collected: 0.3% of every swap
Alice earns:    ~9.09% of all fees

Risk: IMPERMANENT LOSS
  If ETH price doubles to $4,000:
  - Pool rebalances to ~77.8 ETH + 311,127 USDC (arbitrageurs trade)
  - Alice's share: ~7.07 ETH + 28,284 USDC = $56,568
  - If Alice had just held: 10 ETH + 20,000 USDC = $60,000
  - Impermanent loss: $60,000 - $56,568 = $3,432 (5.7%)

  IL is "impermanent" because it reverses if prices return to original.
  But if Alice withdraws while prices are different, the loss is real.
```

### 1.5 Uniswap V3: Concentrated Liquidity

V3 lets LPs provide liquidity in specific price ranges, dramatically improving capital efficiency:

```
UNISWAP V2 vs V3

V2: Liquidity spread across entire price range (0 to infinity)
    Capital efficiency: ~0.5% (most liquidity sits unused)

V3: LPs choose a price range [pLow, pHigh]
    Example: Provide ETH/USDC liquidity only between $1,800-$2,200
    Capital efficiency: up to 4000x better (if price stays in range)
    Risk: If price moves outside range, LP earns zero fees

    +---------+
    |  Active |  <- Concentrated liquidity in this range
    |  Range  |
    +----+----+
    |    |    |
    +---------+----> Price
   $1800   $2200
```

---

## 2. Lending and Borrowing

### 2.1 How DeFi Lending Works

```
LENDING / BORROWING FLOW

LENDER (Alice):                    BORROWER (Bob):
1. Deposit 1000 USDC              1. Deposit 2 ETH as collateral
2. Receive aUSDC (interest-       2. Borrow up to 80% LTV:
   bearing receipt token)             2 ETH * $2000 * 0.8 = $3,200 USDC
3. aUSDC balance grows             3. Pay variable interest rate
   automatically over time         4. Must maintain collateral ratio
4. Withdraw: burn aUSDC,              or face LIQUIDATION
   receive USDC + interest

Interest rates are determined by UTILIZATION:
  Utilization = Total Borrowed / Total Supplied
  Low utilization (10%):  Low rates (~2%) -> attract borrowers
  High utilization (90%): High rates (~20%) -> attract lenders
```

### 2.2 Liquidation

```
LIQUIDATION EXAMPLE

Bob deposits 2 ETH ($4,000) and borrows 3,000 USDC
Health Factor = Collateral Value * LTV / Debt = $4,000 * 0.8 / $3,000 = 1.07

ETH drops to $1,600:
Health Factor = $3,200 * 0.8 / $3,000 = 0.85 < 1.0  -> LIQUIDATABLE!

Liquidator Charlie:
1. Repays part of Bob's debt (e.g., 1,500 USDC)
2. Receives Bob's collateral at a discount (e.g., 5% bonus)
3. Gets 1,500 / $1,600 * 1.05 = 0.984 ETH (worth $1,575)
4. Profit: $75

This mechanism ensures the protocol remains solvent even during crashes.
```

### 2.3 Key Lending Protocols

| Protocol    | Model                              | Special Feature                               |
| ----------- | ---------------------------------- | --------------------------------------------- |
| Aave V3     | Pool-based                         | Flash loans, multi-chain, e-mode              |
| Compound V3 | Pool-based (single asset)          | One borrow asset per market                   |
| MakerDAO    | CDP (Collateralized Debt Position) | Mints DAI stablecoin                          |
| Morpho      | Peer-to-peer matching              | Better rates by matching lenders to borrowers |

---

## 3. Stablecoins

### 3.1 Types of Stablecoins

```
+------------------------------------------------------------------------+
|                    STABLECOIN TAXONOMY                                   |
+------------------------------------------------------------------------+
|                                                                        |
|  FIAT-BACKED (Centralized)                                             |
|  USDC (Circle): 1 USDC = $1 in bank reserves                          |
|  USDT (Tether): Largest by market cap, controversial reserves          |
|  Pro: Stable, simple | Con: Centralized, can freeze accounts           |
|                                                                        |
|  CRYPTO-BACKED (Over-collateralized)                                   |
|  DAI (MakerDAO): Backed by ETH/WBTC/USDC at 150%+ collateral         |
|  Lock $150 of ETH -> mint $100 DAI                                    |
|  Pro: Decentralized | Con: Capital inefficient, can depeg in crashes  |
|                                                                        |
|  ALGORITHMIC (Under/un-collateralized)                                 |
|  FRAX: Partially algorithmic, partially backed                        |
|  UST (collapsed): Was backed by LUNA — death spiral in May 2022       |
|  Pro: Capital efficient | Con: Fragile, UST collapse lost ~$40B       |
|                                                                        |
|  REAL-WORLD ASSET BACKED                                               |
|  USDY (Ondo): Backed by US Treasuries                                 |
|  Pro: Yield-bearing, transparent | Con: Regulatory complexity         |
|                                                                        |
+------------------------------------------------------------------------+
```

### 3.2 MakerDAO / DAI

```
DAI MINTING PROCESS

1. User opens a "Vault" (formerly CDP)
2. Deposits collateral (ETH, WBTC, etc.)
3. Borrows (mints) DAI up to collateral ratio
4. Pays stability fee (interest) in DAI
5. Must maintain collateral ratio or face liquidation

Example:
  Deposit 10 ETH ($20,000)
  Collateral ratio: 150%
  Max DAI mintable: $20,000 / 1.5 = 13,333 DAI
  Safe to mint: ~8,000 DAI (conservative)
```

---

## 4. Oracles

### 4.1 The Oracle Problem

Smart contracts cannot access external data (prices, weather, sports scores) by themselves. Oracles bridge the gap between on-chain and off-chain data.

```
THE ORACLE PROBLEM

On-chain world:              Off-chain world:
+------------------+         +------------------+
| Smart contracts  |   ???   | ETH/USD price    |
| DeFi protocols   | <------ | Stock data       |
| Need real prices |         | Weather data     |
+------------------+         +------------------+

Without oracles: Contracts have NO idea what ETH is worth in USD
With oracles:    Chainlink nodes feed price data on-chain
```

### 4.2 Chainlink Price Feeds

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";

contract PriceConsumer {
    AggregatorV3Interface internal priceFeed;

    constructor() {
        // ETH/USD price feed on Ethereum mainnet
        priceFeed = AggregatorV3Interface(
            0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419
        );
    }

    function getLatestPrice() public view returns (int256 price, uint256 updatedAt) {
        (
            /* uint80 roundID */,
            price,
            /* uint256 startedAt */,
            updatedAt,
            /* uint80 answeredInRound */
        ) = priceFeed.latestRoundData();

        // price has 8 decimals: 200000000000 = $2,000.00
        // ALWAYS check staleness:
        require(block.timestamp - updatedAt < 3600, "Stale price");
        require(price > 0, "Invalid price");
    }
}
```

### 4.3 TWAP Oracles (Uniswap)

Time-Weighted Average Prices from on-chain DEX data — no external dependency but can be manipulated with large capital:

```
TWAP vs Chainlink:

TWAP (Uniswap):
  Pro: Fully on-chain, no external dependency
  Con: Can be manipulated with flash loans
  Con: Lags behind real price

Chainlink:
  Pro: Resistant to flash loan manipulation
  Pro: Fast updates, reliable
  Con: External dependency, costs to operate nodes
```

---

## 5. Flash Loans

### 5.1 What Are Flash Loans?

Flash loans let you borrow unlimited capital with zero collateral, as long as you repay within the same transaction. If you don't repay, the entire transaction reverts as if it never happened.

```
FLASH LOAN TRANSACTION (single atomic transaction):

1. Borrow 1,000,000 USDC from Aave (zero collateral)
2. Swap 500,000 USDC for ETH on Uniswap (price: $2,000)
3. Sell 250 ETH on Sushiswap (price: $2,010)
4. Profit: 250 * $10 = $2,500
5. Repay 1,000,000 USDC + 0.09% fee (900 USDC)
6. Keep profit: $2,500 - $900 = $1,600

If step 3 fails (price changed): ENTIRE transaction reverts
                                  Loan was never taken
                                  Zero risk to borrower
```

### 5.2 Flash Loan Implementation

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@aave/v3-core/contracts/flashloan/base/FlashLoanSimpleReceiverBase.sol";

contract MyFlashLoan is FlashLoanSimpleReceiverBase {
    constructor(IPoolAddressesProvider provider)
        FlashLoanSimpleReceiverBase(provider)
    {}

    function executeFlashLoan(address asset, uint256 amount) external {
        POOL.flashLoanSimple(
            address(this),
            asset,
            amount,
            "",    // params
            0      // referral code
        );
    }

    // Called by Aave after lending the funds
    function executeOperation(
        address asset,
        uint256 amount,
        uint256 premium,
        address /* initiator */,
        bytes calldata /* params */
    ) external override returns (bool) {
        // You now have `amount` of `asset` in this contract
        // DO YOUR ARBITRAGE / LIQUIDATION / COLLATERAL SWAP HERE

        // Repay the loan + fee
        uint256 amountOwed = amount + premium;
        IERC20(asset).approve(address(POOL), amountOwed);

        return true;
    }
}
```

### 5.3 Flash Loan Use Cases

| Use Case           | Description                                     |
| ------------------ | ----------------------------------------------- |
| Arbitrage          | Buy low on DEX A, sell high on DEX B            |
| Liquidation        | Borrow to repay undercollateralized positions   |
| Collateral swap    | Change collateral type without closing position |
| Self-liquidation   | Liquidate your own position to avoid penalty    |
| Governance attacks | Borrow governance tokens, vote, repay           |

---

## 6. Yield Aggregation

### 6.1 How Yield Aggregators Work

```
YIELD AGGREGATION (Yearn Finance model)

User deposits USDC into Yearn Vault
                |
                v
    +----------------------------+
    | Yearn Strategy Controller  |
    |                            |
    |  Strategy 1: Aave (3.5%)   |
    |  Strategy 2: Compound (4%) |
    |  Strategy 3: Curve (6%)    |
    |                            |
    |  Auto-rebalance to highest |
    |  yield, auto-compound      |
    +----------------------------+
                |
                v
    User's USDC earns optimized yield
    with automatic compounding
```

---

## 7. DeFi Composability (Money Legos)

The power of DeFi is that protocols compose together like building blocks:

```
COMPOSABILITY EXAMPLE: Leveraged Yield Farming

1. Deposit 1 ETH into Aave as collateral
2. Borrow USDC against ETH
3. Swap USDC for more ETH on Uniswap
4. Deposit that ETH back into Aave
5. Repeat (leverage loop)

Result: 3x leveraged ETH exposure
  Earn: Staking yield * 3
  Risk: Liquidation if ETH drops 33%

Each step uses a different protocol's smart contracts,
all composing together in a single transaction.
```

---

## 8. Worked Problems

### Problem 1: Calculate AMM Output

**Question**: A Uniswap V2 pool has 50 ETH and 100,000 USDC. Alice wants to swap 5 ETH for USDC. What does she receive (0.3% fee)?

```
k = 50 * 100,000 = 5,000,000
amountInWithFee = 5 * 0.997 = 4.985
newReserveETH = 50 + 4.985 = 54.985
newReserveUSDC = 5,000,000 / 54.985 = 90,936.89
amountOut = 100,000 - 90,936.89 = 9,063.11 USDC

Effective price: 9,063.11 / 5 = $1,812.62 per ETH
Spot price before swap: 100,000 / 50 = $2,000 per ETH
Price impact: ~9.4% (large trade relative to pool size)
```

### Problem 2: Liquidation Threshold

**Question**: Bob has 10 ETH ($2,000 each) as collateral in Aave and borrowed 12,000 DAI. Liquidation threshold is 82.5%. At what ETH price does Bob get liquidated?

```
Liquidation when: Collateral * LT < Debt
10 * price * 0.825 = 12,000
price = 12,000 / (10 * 0.825) = $1,454.55

Bob gets liquidated if ETH drops below ~$1,455.
```

---

## Appendix: DeFi Protocols Cheat Sheet

```
DEFI CHEAT SHEET

AMM (Automated Market Maker):
  x * y = k          Constant product (Uniswap V2)
  Slippage = f(trade size / pool size)
  Impermanent Loss = price divergence penalty for LPs
  Fee: 0.3% typical (goes to LPs)

Lending:
  Utilization = Borrowed / Supplied
  Health Factor = (Collateral * LT) / Debt
  Liquidation when Health Factor < 1.0
  Liquidator gets collateral at discount (5-10%)

Stablecoins:
  Fiat-backed: USDC, USDT (centralized, redeemable)
  Crypto-backed: DAI (over-collateralized, 150%+)
  Algorithmic: High risk, UST collapse = $40B loss

Oracles:
  Chainlink: Decentralized oracle network, industry standard
  TWAP: On-chain price average, vulnerable to manipulation
  Always check: staleness, price > 0, round completeness

Flash Loans:
  Borrow unlimited, repay in same transaction
  Zero collateral, zero risk (tx reverts if not repaid)
  Fee: 0.05-0.09%
  Used for: arbitrage, liquidation, collateral swap

Key Metrics:
  TVL: Total Value Locked (assets deposited in protocol)
  APY: Annual Percentage Yield (with compounding)
  APR: Annual Percentage Rate (without compounding)
  IL:  Impermanent Loss (LP price divergence cost)
```
