# Chapter 13: Infrastructure and Tooling

## Introduction

Behind every DApp is a stack of infrastructure: nodes that serve RPC requests, indexers that make on-chain data queryable, decentralized storage for NFT metadata, and oracles that feed off-chain data to smart contracts. Understanding this infrastructure layer is essential for building production-grade applications and for the growing career path of blockchain infrastructure engineering.

```
+------------------------------------------------------------------------+
|                    WEB3 INFRASTRUCTURE                                  |
+------------------------------------------------------------------------+
|                                                                        |
|  NODES & RPC                   INDEXING & DATA                         |
|  +------------------------+   +---------------------------+            |
|  | Geth (Go Ethereum)     |   | The Graph (subgraphs)     |            |
|  | Reth (Rust Ethereum)   |   | Dune Analytics (SQL)      |            |
|  | Alchemy / Infura       |   | Nansen / Arkham           |            |
|  | QuickNode              |   | Etherscan API             |            |
|  | Lodestar (consensus)   |   | Covalent / Moralis        |            |
|  +------------------------+   +---------------------------+            |
|                                                                        |
|  STORAGE                       ORACLES & AUTOMATION                    |
|  +------------------------+   +---------------------------+            |
|  | IPFS (content-addressed)|   | Chainlink (price feeds)   |            |
|  | Arweave (permanent)    |   | Chainlink Automation      |            |
|  | Filecoin (incentivized)|   | Gelato (web3 automation)  |            |
|  | Pinata / nft.storage   |   | OpenZeppelin Defender     |            |
|  +------------------------+   +---------------------------+            |
|                                                                        |
|  MONITORING & SECURITY         MULTI-SIG & GOVERNANCE                  |
|  +------------------------+   +---------------------------+            |
|  | Tenderly (simulation)  |   | Safe (Gnosis Safe)        |            |
|  | Forta (threat detect.) |   | Tally (governance UI)     |            |
|  | OpenZeppelin Defender  |   | Snapshot (off-chain votes) |            |
|  | PagerDuty / OpsGenie   |   | Timelock controllers      |            |
|  +------------------------+   +---------------------------+            |
|                                                                        |
+------------------------------------------------------------------------+
```

---

## 1. Ethereum Nodes

### 1.1 Execution + Consensus Clients

Post-Merge Ethereum requires running two clients:

```
ETHEREUM NODE ARCHITECTURE

+------------------+        +-------------------+
| Execution Client |        | Consensus Client  |
| (processes txs)  | <----> | (PoS consensus)   |
|                  | Engine  |                   |
| Geth (Go)        |  API   | Prysm (Go)        |
| Nethermind (C#)  |        | Lighthouse (Rust)  |
| Besu (Java)      |        | Teku (Java)        |
| Reth (Rust)      |        | Lodestar (TS)      |
| Erigon (Go)      |        | Nimbus (Nim)       |
+------------------+        +-------------------+

Node Requirements:
  Full node:    8+ cores, 16 GB RAM, 2 TB SSD, 25 Mbps
  Archive node: 8+ cores, 64 GB RAM, 15+ TB SSD
  Validator:    Full node + 32 ETH stake

Reth is the newest and fastest execution client,
written in Rust by the Paradigm team.
```

### 1.2 RPC Providers

Most DApps use hosted RPC providers instead of running their own nodes:

| Provider | Free Tier | Features |
|----------|-----------|----------|
| Alchemy | 300M compute units/mo | Enhanced APIs, webhooks, NFT API |
| Infura | 100K requests/day | Oldest provider, IPFS integration |
| QuickNode | 10M API credits/mo | Multi-chain, streams, marketplace |
| Ankr | 30M requests/mo | Decentralized RPC, load balancing |
| Blast API | 40M requests/mo | Multi-region, decentralized nodes |

```typescript
// Using Alchemy Enhanced APIs
import { Alchemy, Network } from "alchemy-sdk";

const alchemy = new Alchemy({
  apiKey: process.env.ALCHEMY_API_KEY,
  network: Network.ETH_MAINNET,
});

// Enhanced: Get all ERC-20 tokens owned by an address
const balances = await alchemy.core.getTokenBalances(
  "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045" // vitalik.eth
);

// Enhanced: Get all NFTs owned by an address
const nfts = await alchemy.nft.getNftsForOwner("vitalik.eth");

// Standard: Call any JSON-RPC method
const blockNumber = await alchemy.core.getBlockNumber();
```

---

## 2. The Graph (Subgraphs)

### 2.1 Why The Graph Exists

Reading complex data from Ethereum is painful with standard RPC:
- Get all Transfer events for a token in the last 30 days? Scan millions of blocks.
- Get all positions for a Uniswap V3 LP? Multiple contract calls per position.
- Get historical TVL of a protocol? Not directly available.

The Graph indexes blockchain data into queryable subgraphs accessible via GraphQL.

### 2.2 Subgraph Architecture

```
THE GRAPH PIPELINE

Ethereum Node                 Graph Node              DApp
+----------+                 +----------+            +------+
| Blocks & |  events/calls   | Index &  |  GraphQL   | React|
| Events   |  ------------> | Store in |  -------->  | UI   |
|          |                 | Postgres |  queries    |      |
+----------+                 +----------+            +------+

1. Developer writes a subgraph manifest (subgraph.yaml)
2. Defines entities (data schema) in schema.graphql
3. Writes mapping handlers in AssemblyScript
4. Deploys to The Graph Network (or self-hosted)
5. DApp queries via GraphQL endpoint
```

### 2.3 Example Subgraph

```yaml
# subgraph.yaml
specVersion: 0.0.5
schema:
  file: ./schema.graphql
dataSources:
  - kind: ethereum/contract
    name: MyToken
    network: mainnet
    source:
      address: "0x1234..."
      abi: MyToken
      startBlock: 19000000
    mapping:
      kind: ethereum/events
      apiVersion: 0.0.7
      language: wasm/assemblyscript
      entities:
        - Transfer
      abis:
        - name: MyToken
          file: ./abis/MyToken.json
      eventHandlers:
        - event: Transfer(indexed address,indexed address,uint256)
          handler: handleTransfer
      file: ./src/mapping.ts
```

```graphql
# schema.graphql
type Transfer @entity {
  id: ID!
  from: Bytes!
  to: Bytes!
  value: BigInt!
  timestamp: BigInt!
  blockNumber: BigInt!
}

type Account @entity {
  id: ID!
  balance: BigInt!
  transfersOut: [Transfer!]! @derivedFrom(field: "from")
  transfersIn: [Transfer!]! @derivedFrom(field: "to")
}
```

```typescript
// src/mapping.ts (AssemblyScript)
import { Transfer as TransferEvent } from "../generated/MyToken/MyToken";
import { Transfer, Account } from "../generated/schema";
import { BigInt } from "@graphprotocol/graph-ts";

export function handleTransfer(event: TransferEvent): void {
  let transfer = new Transfer(event.transaction.hash.toHex() + "-" + event.logIndex.toString());
  transfer.from = event.params.from;
  transfer.to = event.params.to;
  transfer.value = event.params.value;
  transfer.timestamp = event.block.timestamp;
  transfer.blockNumber = event.block.number;
  transfer.save();

  // Update sender account
  let sender = Account.load(event.params.from.toHex());
  if (sender == null) {
    sender = new Account(event.params.from.toHex());
    sender.balance = BigInt.fromI32(0);
  }
  sender.balance = sender.balance.minus(event.params.value);
  sender.save();

  // Update receiver account
  let receiver = Account.load(event.params.to.toHex());
  if (receiver == null) {
    receiver = new Account(event.params.to.toHex());
    receiver.balance = BigInt.fromI32(0);
  }
  receiver.balance = receiver.balance.plus(event.params.value);
  receiver.save();
}
```

```graphql
# Query the subgraph
{
  transfers(
    first: 10,
    orderBy: timestamp,
    orderDirection: desc,
    where: { from: "0xAlice..." }
  ) {
    id
    to
    value
    timestamp
  }

  account(id: "0xAlice...") {
    balance
    transfersOut(first: 5) {
      to
      value
    }
  }
}
```

---

## 3. IPFS and Decentralized Storage

### 3.1 IPFS (InterPlanetary File System)

```
IPFS: Content-Addressed Storage

Traditional web:  https://example.com/image.png
  - Location-addressed: "the file at this URL"
  - URL can change, server can go down

IPFS:             ipfs://QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG
  - Content-addressed: "the file with this hash"
  - Hash is deterministic: same content = same hash
  - Anyone can host (pin) the content
  - Content is immutable (changing content = different hash)

How it works:
1. File is split into chunks
2. Each chunk is hashed
3. Chunks form a Merkle DAG
4. Root hash = Content Identifier (CID)
5. Any IPFS node with the data can serve it
```

### 3.2 Pinning Services

IPFS does not guarantee persistence — if no one pins (stores) your data, it gets garbage collected.

| Service | Model | Best For |
|---------|-------|----------|
| Pinata | Hosted pinning | NFT metadata, DApp assets |
| nft.storage | Free (Filecoin-backed) | NFT metadata specifically |
| Web3.storage | Free tier | General Web3 storage |
| Infura IPFS | Pay-per-use | Enterprise |
| Filecoin | Incentivized storage | Long-term archival |
| Arweave | Pay once, store forever | Permanent storage |

```javascript
// Upload to IPFS via Pinata
const pinataSDK = require("@pinata/sdk");
const pinata = new pinataSDK({ pinataApiKey: "...", pinataSecretApiKey: "..." });

// Upload JSON metadata
const metadata = {
  name: "My NFT #1",
  description: "A unique collectible",
  image: "ipfs://QmImageHash...",
  attributes: [{ trait_type: "Rarity", value: "Legendary" }],
};

const result = await pinata.pinJSONToIPFS(metadata);
console.log(`IPFS URI: ipfs://${result.IpfsHash}`);
// Use this URI as the tokenURI in your NFT contract
```

---

## 4. Chainlink Services

### 4.1 Beyond Price Feeds

```
CHAINLINK SERVICES ECOSYSTEM

Price Feeds:        ETH/USD, BTC/USD, etc.
                    Used by: Aave, Compound, MakerDAO

VRF (Verifiable     Provably random numbers on-chain
Randomness):        Used by: NFT mints, games, lotteries

Automation:         Trigger smart contract functions based on
                    conditions (time, on-chain events)
                    Used by: Auto-compounding, liquidation bots

CCIP (Cross-Chain   Secure cross-chain messaging and token transfers
Interop Protocol):  Used by: Cross-chain DeFi, bridging

Functions:          Execute arbitrary JavaScript off-chain,
                    return result on-chain with proof
                    Used by: API integrations, computation
```

### 4.2 Chainlink VRF (Verifiable Random Function)

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@chainlink/contracts/src/v0.8/vrf/VRFConsumerBaseV2.sol";

contract RandomNFT is VRFConsumerBaseV2 {
    // VRF request -> Chainlink generates random number ->
    // Callback delivers provably random result on-chain

    function requestRandomWords() external returns (uint256 requestId) {
        requestId = COORDINATOR.requestRandomWords(
            keyHash,
            subscriptionId,
            requestConfirmations,
            callbackGasLimit,
            numWords
        );
    }

    // Chainlink calls this with the random result
    function fulfillRandomWords(uint256 requestId, uint256[] memory randomWords)
        internal override
    {
        uint256 randomTokenId = randomWords[0] % MAX_SUPPLY;
        // Mint NFT with provably random traits
    }
}
```

---

## 5. Monitoring and Operations

### 5.1 Tenderly

```
TENDERLY: Transaction Simulation & Debugging

Features:
  - Simulate transactions before sending (preview outcome)
  - Debug failed transactions (step through EVM execution)
  - Set up alerts (monitor contract events, state changes)
  - Fork mainnet for testing
  - Gas profiler (see gas breakdown per opcode)

Use cases:
  - "What would happen if I called this function?" (simulate)
  - "Why did this transaction revert?" (debug)
  - "Alert me if TVL drops below $1M" (monitor)
```

### 5.2 Forta (Threat Detection)

```
FORTA: Real-time Security Monitoring

Detection bots scan every transaction for:
  - Flash loan attacks in progress
  - Large token transfers (whale movements)
  - Governance proposal submissions
  - Admin key usage
  - Phishing contract deployments
  - Rug pull patterns

Alerts sent via: Slack, Discord, PagerDuty, webhooks
```

### 5.3 Safe (Gnosis Safe) Multisig

```
SAFE: Multi-Signature Wallet

Why: NEVER use a single EOA for protocol admin keys

Setup: 3-of-5 multisig
  - 5 signers (team members, advisors)
  - 3 must approve any transaction
  - No single point of failure

Common configuration for DeFi protocols:
  - Timelock (2-day delay on all admin actions)
  - Safe multisig as Timelock admin
  - Users have 2 days to exit if they disagree with changes

Integration:
  - Safe Transaction Service API
  - Safe Apps (DApps inside Safe UI)
  - Programmatic via safe-core-sdk
```

---

## 6. Dune Analytics

```sql
-- Dune Analytics: SQL queries on blockchain data
-- Query: Top 10 USDC holders

SELECT
    "from" as address,
    SUM(CASE WHEN "to" = address THEN value ELSE 0 END) -
    SUM(CASE WHEN "from" = address THEN value ELSE 0 END) as balance
FROM erc20_ethereum.evt_Transfer
WHERE contract_address = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48  -- USDC
GROUP BY 1
ORDER BY 2 DESC
LIMIT 10
```

---

## 7. Worked Problems

### Problem: Design Infrastructure for a DeFi Protocol

```
PRODUCTION INFRASTRUCTURE CHECKLIST

Smart Contracts:
  [ ] Deployed via multisig (Safe)
  [ ] Verified on Etherscan + Sourcify
  [ ] Timelock on all admin functions (48h minimum)
  [ ] Emergency pause mechanism
  [ ] Audited by 2+ firms

Frontend:
  [ ] Multiple RPC providers (Alchemy + Infura fallback)
  [ ] Subgraph for complex queries (The Graph)
  [ ] IPFS for static assets
  [ ] ENS for human-readable addresses

Monitoring:
  [ ] Tenderly alerts on critical state changes
  [ ] Forta bots for attack detection
  [ ] PagerDuty for on-call rotation
  [ ] Dune dashboard for protocol metrics

Security:
  [ ] Bug bounty on Immunefi ($100K+ for critical)
  [ ] Incident response plan documented
  [ ] War room channel (Discord/Slack)
  [ ] Emergency multisig with fast response signers
```

---

## Appendix: Infrastructure Cheat Sheet

```
WEB3 INFRASTRUCTURE CHEAT SHEET

Nodes:
  Execution clients: Geth (Go), Reth (Rust), Nethermind (C#)
  Consensus clients: Prysm (Go), Lighthouse (Rust), Teku (Java)
  Requirements: 16 GB RAM, 2 TB SSD, 25 Mbps
  Most DApps use hosted RPC: Alchemy, Infura, QuickNode

Indexing:
  The Graph: Subgraphs (GraphQL) for complex queries
  Dune: SQL analytics on blockchain data
  Etherscan API: Simple contract/tx queries

Storage:
  IPFS: Content-addressed, needs pinning
  Arweave: Permanent, pay once
  Pinata/nft.storage: Managed IPFS pinning

Oracles:
  Chainlink: Price feeds, VRF, Automation, CCIP
  Always validate: staleness, positive price, round complete

Operations:
  Safe: Multisig for admin keys (NEVER single EOA)
  Timelock: Delay on admin actions (48h+)
  Tenderly: Simulate, debug, monitor transactions
  Forta: Real-time threat detection
```
