# Chapter 14: Projects and Career

## Introduction

The best way to learn Web3 development is to build. This chapter provides five progressively complex projects that exercise every skill from the previous chapters, followed by career guidance for the various roles in the Web3 ecosystem. Each project includes requirements, architecture decisions, and the key learning outcomes.

```
+------------------------------------------------------------------------+
|                    PORTFOLIO PROJECTS                                    |
+------------------------------------------------------------------------+
|                                                                        |
|  BEGINNER                      INTERMEDIATE                            |
|  +------------------------+   +---------------------------+            |
|  | 1. ERC-20 Token + DApp  |   | 3. DEX (AMM)              |            |
|  |    Solidity, Hardhat,   |   |    Uniswap V2 mechanics,  |            |
|  |    ethers.js, React     |   |    liquidity, pricing      |            |
|  |                         |   |                            |            |
|  | 2. NFT Collection       |   | 4. DAO Governance          |            |
|  |    ERC-721, IPFS,       |   |    Governor, Timelock,     |            |
|  |    metadata, minting    |   |    voting, proposals       |            |
|  +------------------------+   +---------------------------+            |
|                                                                        |
|  ADVANCED                                                              |
|  +------------------------------------------------------------+       |
|  | 5. Lending Protocol                                          |       |
|  |    Interest rates, collateral, liquidation, oracles, flash   |       |
|  |    loans, multi-asset, fuzz testing, formal verification     |       |
|  +------------------------------------------------------------+       |
|                                                                        |
+------------------------------------------------------------------------+
```

---

## 1. Project 1: ERC-20 Token + DApp

### 1.1 Requirements

Build a complete ERC-20 token with a minting DApp frontend.

```
FEATURES:
  Smart Contract:
  - ERC-20 token with ERC-2612 permit
  - Owner can mint new tokens
  - Anyone can burn their own tokens
  - Maximum supply cap
  - Pausable by owner

  Frontend:
  - Connect wallet (RainbowKit)
  - Display token balance
  - Mint tokens (owner only)
  - Transfer tokens to another address
  - Approve + TransferFrom flow

  Testing:
  - Foundry unit tests (100% coverage on core functions)
  - Fuzz testing for transfer edge cases
  - Fork test against mainnet USDC for comparison
```

### 1.2 Architecture

```
Project Structure:
contracts/
  src/
    MyToken.sol          (ERC-20 + Permit + Ownable + Pausable)
  test/
    MyToken.t.sol        (Foundry tests)
  script/
    Deploy.s.sol         (Deployment script)

frontend/
  src/
    app/
      page.tsx           (Main DApp page)
      providers.tsx      (wagmi + RainbowKit setup)
    components/
      MintForm.tsx       (Mint tokens — owner only)
      TransferForm.tsx   (Transfer tokens)
      BalanceDisplay.tsx (Show balance)
    wagmi.ts             (Chain config)
```

### 1.3 Key Learning Outcomes

- Solidity fundamentals (types, functions, modifiers, events)
- OpenZeppelin contract inheritance
- Foundry testing and deployment
- wagmi hooks for contract interaction
- Transaction lifecycle in the UI

---

## 2. Project 2: NFT Collection

### 2.1 Requirements

```
FEATURES:
  Smart Contract:
  - ERC-721 collection with configurable supply (10,000)
  - Whitelist minting with Merkle proofs (early access)
  - Public mint with price (0.05 ETH)
  - Reveal mechanism (hidden metadata until reveal)
  - Royalties (ERC-2981)
  - Withdraw funds to owner

  Off-chain:
  - Generate metadata JSON for each token
  - Upload images + metadata to IPFS (Pinata)
  - Merkle tree generation for whitelist

  Frontend:
  - Mint page with connect wallet
  - Gallery showing minted NFTs
  - Whitelist checker (am I on the list?)
```

### 2.2 Key Smart Contract Code

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract MyNFTCollection is ERC721, Ownable {
    uint256 public constant MAX_SUPPLY = 10_000;
    uint256 public constant MINT_PRICE = 0.05 ether;
    uint256 public constant MAX_PER_WALLET = 3;

    bytes32 public merkleRoot;
    string private _baseTokenURI;
    string private _hiddenURI;
    bool public revealed;
    bool public whitelistMintActive;
    bool public publicMintActive;

    uint256 private _nextTokenId;
    mapping(address => uint256) public mintCount;

    error MaxSupplyReached();
    error InsufficientPayment();
    error MaxPerWalletExceeded();
    error MintNotActive();
    error InvalidProof();

    constructor(bytes32 _merkleRoot, string memory hiddenURI)
        ERC721("MyNFT", "MNFT")
        Ownable(msg.sender)
    {
        merkleRoot = _merkleRoot;
        _hiddenURI = hiddenURI;
    }

    function whitelistMint(bytes32[] calldata proof) external payable {
        if (!whitelistMintActive) revert MintNotActive();
        if (_nextTokenId >= MAX_SUPPLY) revert MaxSupplyReached();
        if (msg.value < MINT_PRICE) revert InsufficientPayment();
        if (mintCount[msg.sender] >= MAX_PER_WALLET) revert MaxPerWalletExceeded();

        bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encode(msg.sender))));
        if (!MerkleProof.verify(proof, merkleRoot, leaf)) revert InvalidProof();

        mintCount[msg.sender]++;
        _safeMint(msg.sender, _nextTokenId++);
    }

    function publicMint() external payable {
        if (!publicMintActive) revert MintNotActive();
        if (_nextTokenId >= MAX_SUPPLY) revert MaxSupplyReached();
        if (msg.value < MINT_PRICE) revert InsufficientPayment();
        if (mintCount[msg.sender] >= MAX_PER_WALLET) revert MaxPerWalletExceeded();

        mintCount[msg.sender]++;
        _safeMint(msg.sender, _nextTokenId++);
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        if (!revealed) return _hiddenURI;
        return string(abi.encodePacked(_baseTokenURI, Strings.toString(tokenId), ".json"));
    }

    function reveal(string calldata baseURI) external onlyOwner {
        _baseTokenURI = baseURI;
        revealed = true;
    }

    function withdraw() external onlyOwner {
        (bool success,) = owner().call{value: address(this).balance}("");
        require(success);
    }
}
```

---

## 3. Project 3: Decentralized Exchange (AMM)

### 3.1 Requirements

```
FEATURES:
  Smart Contracts:
  - Factory contract (creates trading pairs)
  - Pair contract (holds liquidity, executes swaps)
  - Router contract (user-facing, handles multi-hop swaps)
  - Constant product formula (x * y = k)
  - 0.3% trading fee to LPs
  - LP token minting/burning

  Frontend:
  - Swap interface (select tokens, input amount, see output)
  - Add/remove liquidity interface
  - Pool info (reserves, price, your LP share)
  - Price impact warning for large trades

  Testing:
  - Invariant test: k never decreases (excluding fees)
  - Fuzz test: any sequence of swaps/mints/burns
  - Fork test: compare output with Uniswap V2
```

### 3.2 Core AMM Logic

```solidity
// Simplified swap function
function swap(uint256 amountIn, uint256 minAmountOut, bool zeroForOne) external {
    (uint256 reserveIn, uint256 reserveOut) = zeroForOne
        ? (reserve0, reserve1)
        : (reserve1, reserve0);

    // Calculate output with 0.3% fee
    uint256 amountInWithFee = amountIn * 997;
    uint256 amountOut = (amountInWithFee * reserveOut) /
        (reserveIn * 1000 + amountInWithFee);

    require(amountOut >= minAmountOut, "Slippage");

    // Transfer tokens
    IERC20(zeroForOne ? token0 : token1).transferFrom(msg.sender, address(this), amountIn);
    IERC20(zeroForOne ? token1 : token0).transfer(msg.sender, amountOut);

    // Update reserves
    _update();

    emit Swap(msg.sender, amountIn, amountOut, zeroForOne);
}
```

### 3.3 Key Learning Outcomes

- DeFi protocol architecture
- Mathematical invariants (constant product)
- LP token mechanics
- Slippage and price impact
- Multi-contract system design

---

## 4. Project 4: DAO Governance

### 4.1 Requirements

```
FEATURES:
  Smart Contracts:
  - Governance token (ERC-20 + ERC20Votes)
  - Governor contract (proposals, voting, execution)
  - Timelock controller (delay before execution)
  - Treasury contract (holds DAO funds)

  Governance Flow:
  1. Token holders delegate voting power
  2. Anyone with enough tokens can create a proposal
  3. 3-day voting period
  4. If passed (quorum + majority): queued in timelock
  5. After 2-day timelock delay: executable by anyone

  Frontend:
  - Proposal list with status
  - Create proposal form
  - Vote (For / Against / Abstain)
  - Delegate voting power
  - Treasury balance display
```

### 4.2 Governor Setup

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/governance/Governor.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorSettings.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorCountingSimple.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorVotes.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorVotesQuorumFraction.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorTimelockControl.sol";

contract MyGovernor is
    Governor,
    GovernorSettings,
    GovernorCountingSimple,
    GovernorVotes,
    GovernorVotesQuorumFraction,
    GovernorTimelockControl
{
    constructor(IVotes _token, TimelockController _timelock)
        Governor("MyDAO")
        GovernorSettings(
            7200,    // 1 day voting delay (blocks)
            50400,   // 1 week voting period (blocks)
            100e18   // 100 tokens to propose
        )
        GovernorVotes(_token)
        GovernorVotesQuorumFraction(4) // 4% quorum
        GovernorTimelockControl(_timelock)
    {}
}
```

---

## 5. Project 5: Lending Protocol

### 5.1 Requirements

```
FEATURES:
  Smart Contracts:
  - Multi-asset lending pool
  - Variable interest rates (utilization-based)
  - Over-collateralized borrowing (150% min)
  - Liquidation engine (5% bonus to liquidators)
  - Chainlink oracle integration for prices
  - Flash loan support
  - Interest-bearing receipt tokens (aTokens)

  Security:
  - Reentrancy guards on all external functions
  - Oracle staleness checks
  - Liquidation health factor calculations
  - Fuzz testing with Foundry (1000+ runs)
  - Invariant testing (total debt <= total collateral * LTV)

  This is a capstone project combining everything:
  - Token standards (ERC-20, ERC-4626)
  - DeFi mechanics (interest, liquidation)
  - Oracle integration (Chainlink)
  - Security patterns (CEI, reentrancy guard)
  - Gas optimization (storage packing, unchecked)
  - Frontend (wagmi, multi-contract interaction)
```

---

## 6. Career Paths

### 6.1 Role Comparison

```
+------------------------------------------------------------------------+
|                    WEB3 CAREER PATHS                                    |
+------------------------------------------------------------------------+
|                                                                        |
|  SMART CONTRACT DEVELOPER                                              |
|  Salary: $120K-250K  |  Demand: Very High                             |
|  Skills: Solidity, Foundry/Hardhat, EVM internals, testing             |
|  Entry: Build 2-3 projects, contribute to OpenZeppelin                 |
|                                                                        |
|  PROTOCOL ENGINEER                                                     |
|  Salary: $150K-350K  |  Demand: High                                  |
|  Skills: Advanced Solidity, DeFi math, mechanism design, auditing      |
|  Entry: Study Uniswap/Aave source code, build a DEX or lending proto  |
|                                                                        |
|  SMART CONTRACT AUDITOR                                                |
|  Salary: $150K-500K+ |  Demand: Very High                             |
|  Skills: EVM bytecode, attack patterns, formal verification            |
|  Entry: Solve CTFs (Ethernaut, Damn Vulnerable DeFi), join Code4rena  |
|                                                                        |
|  DAPP FRONTEND DEVELOPER                                               |
|  Salary: $100K-200K  |  Demand: High                                  |
|  Skills: React/Next.js, wagmi/ethers.js, wallet integration           |
|  Entry: Build DApp frontends, contribute to open-source DApps         |
|                                                                        |
|  BLOCKCHAIN INFRA ENGINEER                                             |
|  Salary: $130K-280K  |  Demand: Medium-High                           |
|  Skills: Go/Rust, P2P networking, consensus protocols, DevOps          |
|  Entry: Contribute to Geth/Reth, run validators, build indexers        |
|                                                                        |
|  ZK ENGINEER                                                           |
|  Salary: $150K-400K  |  Demand: High (growing fast)                   |
|  Skills: Cryptography, Circom/Noir/Halo2, math (algebra, polynomials) |
|  Entry: Study ZK theory, build circuits, contribute to ZK projects     |
|                                                                        |
+------------------------------------------------------------------------+
```

### 6.2 Learning Platforms

| Platform                 | Type                 | Best For                  |
| ------------------------ | -------------------- | ------------------------- |
| CryptoZombies            | Interactive tutorial | Solidity beginners        |
| Ethernaut (OpenZeppelin) | Security CTF         | Smart contract security   |
| Damn Vulnerable DeFi     | Security CTF         | DeFi-specific attacks     |
| Speedrun Ethereum        | Project-based        | Building DApps end-to-end |
| Alchemy University       | Full curriculum      | Structured Web3 education |
| Updraft (Cyfrin)         | Video courses        | Patrick Collins teaching  |
| Node Guardians           | Gamified quests      | Intermediate Solidity     |

### 6.3 Communities and Job Boards

```
COMMUNITIES:
  Ethereum R&D Discord         Core protocol discussions
  Foundry Telegram             Foundry tooling support
  OpenZeppelin Forum           Smart contract security
  ETHGlobal                    Hackathons (best way to get hired)

JOB BOARDS:
  crypto.jobs                  Largest Web3 job board
  web3.career                  Web3-specific roles
  Cryptocurrency Jobs          Established board
  AngelList Web3               Startup roles
  Protocol-specific (apply directly to Uniswap, Aave, etc.)

HOW TO GET HIRED:
  1. Build portfolio projects (deploy on testnet)
  2. Contribute to open-source (OpenZeppelin, Foundry, wagmi)
  3. Win or place in hackathons (ETHGlobal, Devfolio)
  4. Write technical blog posts (Mirror, dev.to)
  5. Compete in audit contests (Code4rena, Sherlock)
  6. Get active on Ethereum R&D Discord / Twitter (X)
```

### 6.4 Interview Preparation

```
COMMON WEB3 INTERVIEW TOPICS

Smart Contract Developer:
  - Explain the EVM execution model (stack, memory, storage)
  - What is reentrancy? Write a vulnerable contract and fix it
  - Explain proxy patterns (Transparent vs UUPS)
  - How does Uniswap V2 constant product formula work?
  - Gas optimization: rewrite this contract to use less gas
  - Explain ERC-4626 vault mechanics
  - Live coding: implement an ERC-20 from scratch

Security Auditor:
  - Find the bug in this contract (timed exercise)
  - Explain flash loan attacks with examples
  - What is MEV? How do sandwich attacks work?
  - Walk through a real exploit (Euler, Curve, Nomad)
  - Write a proof-of-concept exploit in Foundry

Frontend Developer:
  - Explain the transaction lifecycle from user click to finality
  - How does wagmi handle optimistic updates?
  - What happens when a user rejects a transaction?
  - How do you handle chain switching?
  - Build a simple DApp in 2 hours (live coding)

Infrastructure:
  - Explain Ethereum's consensus mechanism post-Merge
  - What is EIP-4844 and how do blobs work?
  - How does The Graph index data?
  - Design a monitoring system for a DeFi protocol
```

---

## Appendix: Project Complexity Guide

```
PROJECT DIFFICULTY AND SKILLS MAP

Project 1: ERC-20 Token + DApp              Difficulty: ★★☆☆☆
  Chapters used: 04, 06, 09
  New skills: Solidity basics, Foundry, wagmi

Project 2: NFT Collection                   Difficulty: ★★★☆☆
  Chapters used: 02, 04, 06, 07, 09
  New skills: Merkle proofs, IPFS, metadata, minting

Project 3: DEX (AMM)                        Difficulty: ★★★★☆
  Chapters used: 04, 05, 06, 08, 09, 10
  New skills: DeFi math, multi-contract systems, LP tokens

Project 4: DAO Governance                   Difficulty: ★★★★☆
  Chapters used: 04, 05, 06, 07, 09
  New skills: Governance, delegation, timelocks, proposals

Project 5: Lending Protocol                 Difficulty: ★★★★★
  Chapters used: ALL
  New skills: Interest models, liquidation, oracles, flash loans

RECOMMENDED ORDER:
  Week 1-2:  Project 1 (learn basics)
  Week 3-4:  Project 2 (add complexity)
  Week 5-7:  Project 3 (DeFi fundamentals)
  Week 8-9:  Project 4 (governance)
  Week 10-14: Project 5 (capstone)
```
