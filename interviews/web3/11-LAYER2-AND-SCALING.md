# Chapter 11: Layer 2 and Scaling

## Introduction

Ethereum mainnet (Layer 1) processes ~15 transactions per second at $1-50+ per transaction. This is unusable for mainstream applications. Layer 2 (L2) solutions execute transactions off the main chain while inheriting Ethereum's security guarantees. Understanding L2 architecture is essential because most new DApp development now happens on L2s, and the design space is evolving rapidly with zero-knowledge proofs.

```
+------------------------------------------------------------------------+
|                    SCALING SOLUTIONS                                    |
+------------------------------------------------------------------------+
|                                                                        |
|  OPTIMISTIC ROLLUPS            ZK ROLLUPS                              |
|  +------------------------+   +---------------------------+            |
|  | Optimism (OP Stack)     |   | zkSync Era                |            |
|  | Arbitrum One / Nova     |   | StarkNet                  |            |
|  | Base (Coinbase)         |   | Polygon zkEVM             |            |
|  | Mantle                  |   | Scroll                    |            |
|  | 7-day challenge period  |   | Linea                     |            |
|  | EVM equivalent          |   | Validity proofs (instant) |            |
|  +------------------------+   +---------------------------+            |
|                                                                        |
|  SIDECHAINS                    OTHER APPROACHES                        |
|  +------------------------+   +---------------------------+            |
|  | Polygon PoS             |   | State channels (Raiden)   |            |
|  | BNB Chain               |   | Plasma (legacy)           |            |
|  | Own consensus/security  |   | Validiums (off-chain DA)  |            |
|  | NOT L2 (own security)   |   | Volitions (hybrid DA)     |            |
|  +------------------------+   +---------------------------+            |
|                                                                        |
+------------------------------------------------------------------------+
```

---

## 1. The Scaling Problem

```
ETHEREUM L1 LIMITATIONS

Throughput:  ~15 TPS (transactions per second)
Gas cost:    ~$1-50+ per transaction (varies with demand)
Finality:    ~13 minutes (2 epochs for PoS finality)

For comparison:
  Visa:      ~65,000 TPS
  Solana:    ~65,000 TPS (different tradeoffs)

The blockchain trilemma forces a choice:
  Ethereum chose: Decentralization + Security
  Sacrifice:      Scalability (solved by L2s)
```

---

## 2. Rollups: The Core Idea

All rollups share the same fundamental design: execute transactions off-chain, post compressed transaction data to L1, and use a proof mechanism to ensure correctness.

```
ROLLUP ARCHITECTURE

Users submit transactions to L2 sequencer
        |
        v
+------------------+
| L2 SEQUENCER     |  Executes transactions locally (fast, cheap)
|                  |  Batches them together
|                  |  Compresses data
+------------------+
        |
        v
+------------------+
| ETHEREUM L1      |  Receives compressed batch data
|                  |  Stores it in calldata/blobs
|                  |  Verifies correctness via proof
+------------------+

Key insight: L1 doesn't re-execute transactions.
It only verifies that the L2 executed them correctly.
```

---

## 3. Optimistic Rollups

### 3.1 How They Work

Optimistic rollups assume all transactions are valid ("optimistic") and only check if someone submits a **fraud proof**.

```
OPTIMISTIC ROLLUP FLOW

1. Sequencer executes transactions on L2
2. Sequencer posts state root + compressed tx data to L1
3. Challenge period begins (7 days)
4. Anyone can submit a fraud proof during this window:
   "The sequencer computed the wrong state root!"
   -> L1 re-executes the disputed transaction
   -> If fraud is proven: sequencer's bond is slashed
   -> State root is corrected
5. After 7 days with no challenge: state is finalized

+--Day 0--------Day 1--------...--------Day 7--+
| Batch posted  | Challenge window open         |
|               | Anyone can dispute             |
|               |                    Finalized! ->|
+-----------------------------------------------+
```

### 3.2 Withdrawal Delay

The 7-day challenge period means withdrawals from L2 to L1 take a week. Solutions:

```
BRIDGING L2 -> L1

Standard bridge:  7 days (wait for challenge period)
Fast bridge:      ~10 minutes (liquidity providers front the funds)
                  Examples: Hop Protocol, Across, Stargate

How fast bridges work:
1. User deposits on L2, requests fast withdrawal
2. Liquidity provider sends funds on L1 immediately
3. LP gets reimbursed after 7-day challenge period
4. LP charges a small fee (0.05-0.1%)
```

### 3.3 Key Optimistic Rollups

| Rollup | Stack | TVL | Notable |
|--------|-------|-----|---------|
| Arbitrum One | Nitro | ~$15B | Largest L2 by TVL, Stylus (Rust/C++) |
| Optimism | OP Stack | ~$7B | Superchain vision, many forks |
| Base | OP Stack | ~$5B | Built by Coinbase |
| Mantle | OP Stack fork | ~$1B | EigenDA for data availability |

---

## 4. ZK Rollups

### 4.1 How They Work

ZK rollups use **validity proofs** (zero-knowledge proofs) to prove that all transactions were executed correctly. No challenge period needed — the proof is mathematically verified on L1.

```
ZK ROLLUP FLOW

1. Sequencer executes transactions on L2
2. Prover generates a ZK proof:
   "These 10,000 transactions were all executed correctly,
    and the resulting state root is 0xABC..."
3. ZK proof + state root posted to L1
4. L1 verifier contract checks the proof (~200K gas)
5. If proof is valid: state is IMMEDIATELY finalized

Advantage over optimistic:
  - No 7-day delay (instant finality on L1)
  - Smaller on-chain footprint (proof is tiny vs fraud proof)

Disadvantage:
  - Generating ZK proofs is computationally expensive
  - EVM equivalence is harder to achieve
  - Prover infrastructure is complex
```

### 4.2 Key ZK Rollups

| Rollup | Proof System | EVM Compat. | Notable |
|--------|-------------|-------------|---------|
| zkSync Era | PLONK + custom | zkEVM (bytecode level) | Account abstraction native |
| StarkNet | STARKs | Cairo language (not EVM) | Quantum-resistant |
| Polygon zkEVM | PLONK + recursion | EVM equivalent (Type 2) | Close to mainnet EVM |
| Scroll | KZG + halo2 | EVM equivalent (Type 2) | Community-driven |
| Linea | lattice-based | EVM equivalent | Built by ConsenSys |

### 4.3 EVM Equivalence Types

```
ZK-EVM COMPATIBILITY LEVELS (Vitalik's taxonomy)

Type 1: Fully Ethereum-equivalent
  - Identical to Ethereum L1 EVM
  - Can verify Ethereum blocks directly
  - Slowest prover, most compatible
  - Example: Taiko

Type 2: Fully EVM-equivalent
  - Same EVM but different state/block structure
  - All Solidity contracts work unmodified
  - Example: Polygon zkEVM, Scroll

Type 2.5: EVM-equivalent except gas costs
  - Minor gas cost differences
  - Most contracts work unmodified
  - Example: Scroll

Type 3: Almost EVM-equivalent
  - Some EVM features missing/changed
  - Most contracts work, some need minor changes
  - Example: zkSync Era

Type 4: High-level language equivalent
  - Compiles Solidity to a different VM
  - Not bytecode compatible
  - Example: StarkNet (Cairo), zkSync (older versions)
```

---

## 5. Data Availability

### 5.1 Where Does L2 Data Live?

```
DATA AVAILABILITY SPECTRUM

Full Rollup (on-chain DA):
  All tx data posted to Ethereum L1 calldata/blobs
  Most secure, most expensive
  Examples: Arbitrum, Optimism, zkSync

Validium (off-chain DA):
  ZK proofs on L1, data stored off-chain (committee)
  Cheaper, but data could become unavailable
  Examples: StarkEx (Immutable X), Arbitrum Nova

Volition (hybrid):
  Users choose per-transaction: on-chain or off-chain DA
  Flexible tradeoff
  Example: zkSync Era (planned), StarkNet

Sovereign Rollup:
  Posts data to a DA layer (not Ethereum)
  Uses Celestia, EigenDA, or Avail for cheaper DA
  Settlement can still happen on Ethereum
```

### 5.2 EIP-4844: Proto-Danksharding (Blobs)

EIP-4844 introduced "blob" transactions — a new data type specifically for rollups that is ~10x cheaper than calldata:

```
BEFORE EIP-4844 (March 2024):
  Rollups post data to calldata: ~16 gas per byte
  Cost: ~$0.50-5.00 per L2 transaction

AFTER EIP-4844:
  Rollups post data to blobs: ~1 gas per byte equivalent
  Cost: ~$0.001-0.05 per L2 transaction
  10-100x cheaper!

Blobs:
  - Up to 6 blobs per block (128 KB each, 768 KB total)
  - Automatically pruned after ~18 days
  - Not accessible by smart contracts (only commitment)
  - Separate fee market from regular gas
```

---

## 6. Cross-Chain Bridges

### 6.1 How Bridges Work

```
BRIDGE ARCHITECTURE

L1 (Ethereum)                    L2 (Arbitrum)
+-------------------+            +-------------------+
| Bridge Contract   |            | Bridge Contract   |
|                   |  message   |                   |
| 1. Lock 10 ETH   |----------->| 3. Mint 10 arbETH |
|    in escrow      |            |    to user         |
|                   |  message   |                   |
| 6. Unlock 10 ETH  |<-----------| 4. Burn 10 arbETH |
|    to user        |            |    from user       |
+-------------------+            +-------------------+

Canonical bridge: Official bridge run by the rollup
                  Most secure, but slow (7-day withdrawal for optimistic)

Third-party bridge: Hop, Across, Stargate, Wormhole
                    Fast, but introduces additional trust assumptions
```

### 6.2 Bridge Security Risks

Bridges are the most attacked infrastructure in Web3 (>$2.5B stolen):

| Attack | Year | Lost | Cause |
|--------|------|------|-------|
| Ronin Bridge | 2022 | $624M | Compromised 5/9 validator keys |
| Wormhole | 2022 | $326M | Signature verification bypass |
| Nomad | 2022 | $190M | Initialization bug (anyone could drain) |
| Harmony Horizon | 2022 | $100M | Compromised 2/5 multisig keys |

**Key lesson**: Bridges are high-value targets because they hold locked funds. Minimize bridge usage; prefer native L2 assets when possible.

---

## 7. L2 Development

### 7.1 Deploying to L2s

Deploying to an L2 is nearly identical to deploying to Ethereum mainnet — just change the RPC URL:

```typescript
// hardhat.config.ts
const config: HardhatUserConfig = {
  networks: {
    arbitrum: {
      url: "https://arb1.arbitrum.io/rpc",
      accounts: [process.env.PRIVATE_KEY!],
    },
    optimism: {
      url: "https://mainnet.optimism.io",
      accounts: [process.env.PRIVATE_KEY!],
    },
    base: {
      url: "https://mainnet.base.org",
      accounts: [process.env.PRIVATE_KEY!],
    },
    zksync: {
      url: "https://mainnet.era.zksync.io",
      accounts: [process.env.PRIVATE_KEY!],
      // zkSync requires a special compiler plugin
    },
  },
};
```

### 7.2 L2-Specific Considerations

```
DEPLOYING TO L2: WHAT'S DIFFERENT

Gas costs:
  - L2 execution gas is cheap (~0.1 gwei vs 30+ gwei on L1)
  - L1 data posting is the main cost (calldata/blob fees)
  - Optimize for calldata size, not just computation

Block times:
  - Arbitrum: ~0.25 seconds
  - Optimism: 2 seconds
  - Base: 2 seconds
  - Faster UX, but different timing assumptions

Finality:
  - Optimistic: Soft finality in seconds, hard finality in 7 days
  - ZK: Soft finality in seconds, hard finality in ~1 hour

L1 -> L2 messaging:
  - ~10 minutes (Optimistic) or ~20 minutes (ZK)
  - Use retryable tickets (Arbitrum) or cross-domain messengers

Contract differences:
  - Most Solidity contracts work unmodified on L2
  - Some opcodes behave differently (block.number, block.timestamp)
  - L2 block.number ≠ L1 block.number
  - Gas metering differs (L1 data fee + L2 execution fee)
```

---

## 8. The Rollup Landscape

```
+------------------------------------------------------------------------+
|                    L2 LANDSCAPE (2025)                                   |
+------------------------------------------------------------------------+
|                                                                        |
|  GENERAL PURPOSE                                                       |
|  Arbitrum One:   Largest TVL, Stylus (Rust/C++), Orbit L3 chains      |
|  Optimism:       OP Stack (Base, Zora, Mode built on it), Superchain  |
|  zkSync Era:     Native account abstraction, paymaster (gas in ERC20) |
|  Polygon zkEVM:  Near-EVM equivalence, Polygon ecosystem              |
|  StarkNet:       Cairo language, quantum-resistant STARKs              |
|                                                                        |
|  APPLICATION-SPECIFIC                                                  |
|  Immutable X:    Gaming/NFTs (StarkEx validium, zero gas for mints)   |
|  dYdX v4:        Perpetual DEX (custom Cosmos chain)                  |
|  Sorare:         Fantasy sports (StarkEx)                              |
|  Arbitrum Nova:  Social/gaming (AnyTrust, cheaper DA)                 |
|                                                                        |
|  EMERGING                                                              |
|  L3s:            App-chains on top of L2s (Orbit, OP Stack)           |
|  Based rollups:  Use L1 proposers instead of centralized sequencer    |
|  Shared sequencing: Multiple rollups share one sequencer              |
|                                                                        |
+------------------------------------------------------------------------+
```

---

## 9. Worked Problems

### Problem: Calculate L2 Transaction Cost

```
A transaction on Arbitrum:
  L2 execution: 200,000 gas * 0.1 gwei = 0.00002 ETH
  L1 calldata:  500 bytes * 16 gas/byte = 8,000 gas
                8,000 * 30 gwei = 0.00024 ETH

  Total: 0.00026 ETH (~$0.52 at $2,000/ETH)

Same transaction on Ethereum L1:
  Execution: 200,000 gas * 30 gwei = 0.006 ETH (~$12.00)

Savings: ~96% cheaper on L2
```

---

## Appendix: L2 Cheat Sheet

```
LAYER 2 CHEAT SHEET

Optimistic Rollups:
  Assume valid, prove fraud if needed
  7-day challenge period for withdrawals
  EVM equivalent (deploy existing Solidity unchanged)
  Examples: Arbitrum, Optimism, Base

ZK Rollups:
  Prove validity with math (ZK proofs)
  No challenge period (instant finality)
  EVM compatibility varies (Type 1-4)
  Examples: zkSync, StarkNet, Polygon zkEVM, Scroll

Data Availability:
  Rollup:    TX data on L1 (most secure, most expensive)
  Validium:  TX data off-chain (cheaper, weaker DA)
  EIP-4844:  Blob transactions (10-100x cheaper than calldata)

Bridges:
  Canonical:   Official, secure, slow (7-day for optimistic)
  Third-party: Fast (~10 min), additional trust assumptions
  Security:    #1 attack target in Web3 (>$2.5B stolen)

Deploying to L2:
  Same Solidity, same tools (Hardhat/Foundry)
  Just change RPC URL
  Watch for: block.number differences, gas metering, finality
```
