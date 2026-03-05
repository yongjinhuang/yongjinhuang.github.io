# Chapter 12: Advanced Topics

## Introduction

This chapter covers the cutting-edge topics shaping the future of Web3: MEV (the invisible tax on users), account abstraction (making wallets usable), zero-knowledge applications beyond rollups, restaking (EigenLayer), and the modular blockchain thesis. These are the areas where the most active research and development is happening.

```
+------------------------------------------------------------------------+
|                    ADVANCED WEB3 TOPICS                                  |
+------------------------------------------------------------------------+
|                                                                        |
|  MEV                           ACCOUNT ABSTRACTION                     |
|  +------------------------+   +---------------------------+            |
|  | Sandwich attacks        |   | ERC-4337                  |            |
|  | Arbitrage bots          |   | Smart contract wallets    |            |
|  | Liquidation bots        |   | Paymasters (gas in ERC20) |            |
|  | Flashbots / MEV-Boost   |   | Session keys              |            |
|  | PBS (Proposer-Builder)  |   | Social recovery            |            |
|  +------------------------+   +---------------------------+            |
|                                                                        |
|  ZK APPLICATIONS               RESTAKING & MODULARITY                  |
|  +------------------------+   +---------------------------+            |
|  | ZK identity (Worldcoin) |   | EigenLayer (restaking)    |            |
|  | ZK privacy (Aztec)      |   | AVS (Active Valid. Svc.)  |            |
|  | ZK bridges (Succinct)   |   | Modular blockchains       |            |
|  | ZK coprocessors          |   | Celestia (DA layer)       |            |
|  | ZK machine learning     |   | Shared sequencing         |            |
|  +------------------------+   +---------------------------+            |
|                                                                        |
+------------------------------------------------------------------------+
```

---

## 1. MEV (Maximal Extractable Value)

### 1.1 What Is MEV?

MEV is the profit that block builders/validators can extract by reordering, inserting, or censoring transactions within a block. It is an invisible tax on users.

```
MEV TAXONOMY

GOOD MEV (beneficial):
  Arbitrage:     Equalizes prices across DEXs
  Liquidation:   Keeps lending protocols solvent

BAD MEV (harmful):
  Sandwich:      Front-run + back-run user trades
  Time-bandit:   Reorg blocks to steal MEV from past blocks
  JIT liquidity: Just-in-time LP that extracts value from traders

MEV SUPPLY CHAIN (post-Merge Ethereum):

User -> Wallet -> Mempool -> Searcher -> Builder -> Relay -> Proposer
                                |           |         |        |
                         Finds MEV     Builds    Routes    Proposes
                         opportunities optimal   blocks    to network
                                       blocks
```

### 1.2 Sandwich Attacks

```
SANDWICH ATTACK

Alice wants to buy ETH with 10,000 USDC on Uniswap
Alice sets 1% slippage tolerance

Attacker sees Alice's pending transaction in the mempool:

1. FRONT-RUN: Attacker buys ETH (pushes price UP)
   Price: $2,000 -> $2,015

2. ALICE'S TX: Alice buys ETH at inflated price
   Alice gets less ETH than expected
   Price: $2,015 -> $2,030

3. BACK-RUN: Attacker sells ETH at higher price
   Price: $2,030 -> $2,015
   Attacker profit: ~$15 per ETH * amount

Alice lost ~0.75% to the sandwich attack (within her 1% slippage)
Attacker earned the difference as profit
```

### 1.3 Flashbots and MEV-Boost

```
MEV-BOOST: How blocks are built on Ethereum today

Without MEV-Boost:
  Proposer builds their own block (simple, inefficient)

With MEV-Boost (used by ~90% of validators):
  1. Searchers find MEV opportunities
  2. Searchers send bundles to Block Builders
  3. Builders assemble optimal blocks
  4. Builders submit blocks to Relays
  5. Relays verify and forward to Proposers
  6. Proposer selects most profitable block
  7. Proposer gets paid by builder (bid)

This separates block building from block proposing (PBS).
```

### 1.4 Protecting Against MEV

| Protection | How It Works | Example |
|-----------|-------------|---------|
| Private mempool | Submit tx directly to builder, skip public mempool | Flashbots Protect |
| MEV-aware DEX | DEX routes orders to avoid sandwiching | CoW Swap |
| Intent-based | Express intent, solver finds best execution | UniswapX |
| Lower slippage | Reduce slippage tolerance (may cause tx failure) | Manual |
| Batch auctions | All orders in a batch get same price | CoW Protocol |

---

## 2. Account Abstraction (ERC-4337)

### 2.1 The Problem

```
CURRENT WALLET UX (EOA):

- Must have ETH to pay gas (can't pay with USDC)
- Lose seed phrase = lose everything (no recovery)
- One signature per transaction (no batching)
- No spending limits, session keys, or automation
- Must approve + transfer (two transactions for every DeFi action)

Web2 comparison:
  Gmail: "Forgot password? Click to recover"
  Ethereum: "Lost seed phrase? Funds gone forever"
```

### 2.2 How ERC-4337 Works

```
ERC-4337 ARCHITECTURE

User creates a UserOperation (UserOp) instead of a transaction:

UserOp {
  sender:       smart contract wallet address
  callData:     what to execute
  nonce:        replay protection
  signature:    can be anything (fingerprint, passkey, multisig)
  paymaster:    who pays for gas (can be a sponsor)
  ...
}

Flow:
1. User signs UserOp with their key (any signature scheme)
2. UserOp sent to a separate Bundler mempool (not L1 mempool)
3. Bundler collects multiple UserOps
4. Bundler calls EntryPoint contract on-chain
5. EntryPoint validates each UserOp:
   a. Calls wallet's validateUserOp() to check signature
   b. If paymaster: calls paymaster's validatePaymasterUserOp()
   c. Executes the callData on the wallet

+--------+     +---------+     +------------+     +--------+
| User   |---->| Bundler |---->| EntryPoint |---->| Wallet |
| (signs |     | (off-   |     | (on-chain  |     | (smart |
|  UserOp)|    |  chain) |     |  singleton)|     |  cont.)|
+--------+     +---------+     +------------+     +--------+
                                     |
                               +----------+
                               | Paymaster|
                               | (pays gas|
                               |  in ERC20)|
                               +----------+
```

### 2.3 Key Features Enabled

```
ACCOUNT ABSTRACTION FEATURES

1. Gas Sponsorship (Paymasters):
   - Protocol pays gas for users (onboarding)
   - Users pay gas in USDC, not ETH
   - Subscription model (protocol sponsors N free txs/month)

2. Social Recovery:
   - If you lose your key, 3/5 trusted friends can help recover
   - No single point of failure

3. Session Keys:
   - Grant a game temporary permission to submit txs
   - Limited by: time, gas amount, specific functions
   - No need to approve every action

4. Batch Transactions:
   - approve + swap in a single UserOp
   - Multiple DeFi actions atomically

5. Any Signature Scheme:
   - Passkeys (WebAuthn/FIDO2) - log in with fingerprint
   - Multisig (2/3 signers)
   - MPC (distributed key)
```

### 2.4 Simple Smart Wallet

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@account-abstraction/contracts/core/BaseAccount.sol";

contract SimpleWallet is BaseAccount {
    address public owner;
    IEntryPoint private immutable _entryPoint;

    constructor(IEntryPoint entryPoint_, address owner_) {
        _entryPoint = entryPoint_;
        owner = owner_;
    }

    function entryPoint() public view override returns (IEntryPoint) {
        return _entryPoint;
    }

    function _validateSignature(
        PackedUserOperation calldata userOp,
        bytes32 userOpHash
    ) internal view override returns (uint256) {
        // Verify the signature is from the owner
        bytes32 hash = MessageHashUtils.toEthSignedMessageHash(userOpHash);
        if (ECDSA.recover(hash, userOp.signature) != owner) {
            return SIG_VALIDATION_FAILED;
        }
        return SIG_VALIDATION_SUCCESS;
    }

    // Execute arbitrary calls (only via EntryPoint)
    function execute(address dest, uint256 value, bytes calldata data) external {
        _requireFromEntryPoint();
        (bool success, bytes memory result) = dest.call{value: value}(data);
        if (!success) {
            assembly { revert(add(result, 32), mload(result)) }
        }
    }
}
```

---

## 3. Zero-Knowledge Applications

### 3.1 Beyond Rollups

ZK proofs enable far more than just scaling:

```
ZK APPLICATION CATEGORIES

PRIVACY:
  Private transactions: "I sent tokens" (without revealing amount/recipient)
  Private voting: "I voted" (without revealing my vote)
  Private identity: "I am over 18" (without revealing birthday)
  Examples: Aztec Network, Tornado Cash (sanctioned), Semaphore

IDENTITY & CREDENTIALS:
  Worldcoin: Proof of unique human (iris scan, ZK proof)
  Polygon ID: Verifiable credentials on-chain
  ZK-KYC: Prove compliance without sharing personal data

BRIDGES:
  ZK light clients: Prove a block was finalized on another chain
  Succinct: ZK proofs of Ethereum consensus
  Polyhedra: Cross-chain ZK verification

COPROCESSORS:
  Axiom: Query historical Ethereum data with ZK proofs
  Brevis: ZK-proven cross-chain data access
  "Prove that account X had balance > Y at block N"
  without storing all historical state on-chain
```

### 3.2 ZK Circuit Development

```
ZK DEVELOPMENT LANGUAGES

Circom:     Domain-specific language for ZK circuits
            Compiles to R1CS constraints
            Most battle-tested, used by Tornado Cash, Hermez

Noir:       Rust-like language by Aztec
            Higher-level, easier to learn
            Growing ecosystem

Cairo:      StarkNet's language
            Provable programs, not just circuits
            More general-purpose than Circom

Halo2:      Rust library for PLONK-based circuits
            Used by Scroll, Privacy Pools
            Lower-level, more flexibility

Leo:        Aleo's language for ZK programs
            Focuses on developer experience
```

---

## 4. EigenLayer and Restaking

### 4.1 What Is Restaking?

```
EIGENLAYER: RESTAKING EXPLAINED

Problem:
  New protocols need economic security (stake)
  Building a new validator set from scratch is expensive
  Each new protocol fragments Ethereum's security

Solution:
  ETH stakers "restake" their ETH to secure additional protocols
  One validator secures BOTH Ethereum AND other services

+-------------------+
| 32 ETH Staked     |
| on Ethereum       |
+-------------------+
         |
    Restaked to:
    +----------+  +----------+  +----------+
    | Oracle   |  | Bridge   |  | DA Layer |
    | Network  |  | Protocol |  |          |
    +----------+  +----------+  +----------+

    Each of these is an AVS (Actively Validated Service)
    If the validator misbehaves, their ETH is slashed
    by BOTH Ethereum AND the AVS they opted into
```

### 4.2 Actively Validated Services (AVS)

| AVS Category | Examples | What They Validate |
|-------------|----------|-------------------|
| Oracle networks | Custom Chainlink alternative | Price data correctness |
| Data availability | EigenDA | Rollup data is available |
| Bridges | Cross-chain messaging | Message correctness |
| Sequencers | Shared sequencing | L2 transaction ordering |
| Coprocessors | ZK proof verification | Computation correctness |

---

## 5. Modular Blockchains

### 5.1 Monolithic vs Modular

```
MONOLITHIC BLOCKCHAIN (traditional):
  One chain does everything:
  +------------------------------------------+
  | Execution + Consensus + DA + Settlement  |
  |            (Ethereum L1)                  |
  +------------------------------------------+

MODULAR BLOCKCHAIN (emerging):
  Each layer is specialized:
  +-------------+  +-------------+  +-------------+
  | Execution   |  | Data Avail. |  | Consensus   |
  | (Rollups)   |  | (Celestia)  |  | (Ethereum)  |
  | Arbitrum,   |  | EigenDA     |  | Settlement  |
  | zkSync, etc |  | Avail       |  | layer       |
  +-------------+  +-------------+  +-------------+

Benefits:
  - Each layer optimized for its function
  - Mix and match components
  - Cheaper (specialized DA costs less)
  - More scalable (parallel execution layers)
```

### 5.2 Key Modular Projects

| Project | Role | Description |
|---------|------|-------------|
| Celestia | Data Availability | Specialized DA layer, modular-first |
| EigenDA | Data Availability | DA secured by restaked ETH |
| Avail | Data Availability | Polygon's DA layer |
| Espresso | Shared Sequencing | Multiple rollups share one sequencer |
| Astria | Shared Sequencing | Decentralized shared sequencer |
| Dymension | Settlement | Settlement layer for RollApps |

---

## 6. Intents and Chain Abstraction

### 6.1 Intent-Based Architecture

```
TRADITIONAL FLOW:
  User specifies HOW: "Swap 100 USDC for ETH on Uniswap V3
                       on Arbitrum, using pool fee tier 0.3%"

INTENT-BASED FLOW:
  User specifies WHAT: "I want to swap 100 USDC for the most ETH possible"
  Solver figures out HOW: optimal route, chain, DEX, timing

+--------+     +--------+     +---------+     +--------+
| User   |---->| Intent |---->| Solver  |---->| Execute|
| "swap  |     | Pool   |     | Network |     | on-    |
|  100   |     | (off-  |     | (compete|     | chain  |
|  USDC" |     |  chain)|     |  to fill)|    |        |
+--------+     +--------+     +---------+     +--------+

Examples:
  UniswapX:     Intent-based DEX aggregation
  CoW Protocol: Batch auction solver
  Across:       Cross-chain intent-based bridging
  1inch Fusion: Resolver competition for best execution
```

### 6.2 Chain Abstraction

The goal: users should not need to know which chain they are on.

```
CHAIN ABSTRACTION VISION

Today:
  1. Switch to Arbitrum network
  2. Bridge ETH from Ethereum to Arbitrum
  3. Wait 10 minutes
  4. Approve USDC on Arbitrum
  5. Swap on Uniswap Arbitrum
  6. Bridge result back if needed

With Chain Abstraction:
  1. Click "Swap" in the DApp
  2. Done (wallet + solver handle chain routing automatically)

Enabling technologies:
  - Account abstraction (same wallet on all chains)
  - Intent-based execution (solvers find best route)
  - Cross-chain messaging (bridges in the background)
  - Paymaster sponsorship (gas abstracted away)
```

---

## 7. Worked Problems

### Problem: MEV Calculation

```
A Uniswap V2 pool has 1000 ETH and 2,000,000 USDC.
Alice submits: swap 100,000 USDC for ETH, 1% slippage.

Sandwich attacker calculation:
1. Front-run: Buy ETH with 50,000 USDC
   dy = (50,000 * 997 * 1000) / (2,000,000 * 1000 + 50,000 * 997)
   dy = 24.32 ETH
   New reserves: 975.68 ETH, 2,050,000 USDC

2. Alice's tx: Buy ETH with 100,000 USDC
   dy = (100,000 * 997 * 975.68) / (2,050,000 * 1000 + 100,000 * 997)
   dy = 45.26 ETH
   New reserves: 930.42 ETH, 2,150,000 USDC

3. Back-run: Sell 24.32 ETH
   dx = (24.32 * 997 * 2,150,000) / (930.42 * 1000 + 24.32 * 997)
   dx = 54,628 USDC
   Profit: 54,628 - 50,000 = $4,628

Alice lost ~$4,628 in value compared to fair price.
Attacker gained ~$4,628 minus gas costs.
```

---

## Appendix: Advanced Topics Cheat Sheet

```
ADVANCED WEB3 CHEAT SHEET

MEV:
  Sandwich: front-run + back-run user swaps
  Protection: Flashbots Protect, CoW Swap, low slippage
  PBS: Proposer-Builder Separation (90% of blocks)

Account Abstraction (ERC-4337):
  UserOp -> Bundler -> EntryPoint -> Smart Wallet
  Paymasters: sponsor gas or pay in ERC-20
  Session keys: temporary permissions for games/DApps
  Social recovery: friends help recover lost access

ZK Applications:
  Privacy: private transactions, voting, identity
  Identity: Worldcoin, Polygon ID (prove without revealing)
  Coprocessors: ZK-proven historical data queries
  Languages: Circom, Noir, Cairo, Halo2

EigenLayer:
  Restaking: Use staked ETH to secure additional services
  AVS: Actively Validated Services (oracles, bridges, DA)
  Risk: Additional slashing conditions

Modular Blockchains:
  Separate: Execution | Data Availability | Consensus | Settlement
  Celestia/EigenDA: Specialized DA layers
  Shared sequencing: Multiple rollups, one sequencer

Intents:
  User says WHAT, solver figures out HOW
  UniswapX, CoW Protocol, Across
  Enables chain abstraction (user doesn't choose chain)
```
