# Chapter 7: Token Standards

## Introduction

Token standards are the foundation of interoperability in Web3. When every fungible token implements the same interface (ERC-20), wallets, DEXs, lending protocols, and analytics tools can all interact with it without custom integration. Understanding token standards — their interfaces, their quirks, and their security implications — is essential for building anything in the Web3 ecosystem.

```
+------------------------------------------------------------------------+
|                    TOKEN STANDARDS ECOSYSTEM                            |
+------------------------------------------------------------------------+
|                                                                        |
|  FUNGIBLE TOKENS              NON-FUNGIBLE TOKENS                      |
|  +----------------------+    +---------------------------+             |
|  | ERC-20 (standard)     |    | ERC-721 (NFTs)            |             |
|  | ERC-2612 (permit)     |    | ERC-721A (gas-efficient)  |             |
|  | ERC-777 (hooks)       |    | ERC-721Enumerable         |             |
|  | ERC-4626 (vaults)     |    | ERC-6551 (Token Bound)    |             |
|  +----------------------+    +---------------------------+             |
|                                                                        |
|  MULTI-TOKEN                  SPECIAL PURPOSE                          |
|  +----------------------+    +---------------------------+             |
|  | ERC-1155 (multi)      |    | Soulbound Tokens (SBTs)   |             |
|  | Batch transfers       |    | Wrapped tokens (WETH)     |             |
|  | Fungible + NFT in one |    | Rebasing tokens           |             |
|  +----------------------+    +---------------------------+             |
|                                                                        |
+------------------------------------------------------------------------+
```

---

## 1. Why Standards Matter

```
WITHOUT STANDARDS:                WITH STANDARDS (ERC-20):

Wallet must know each             Wallet calls balanceOf(addr)
token's custom API                on ANY token — same interface

DEX needs custom logic            DEX calls transferFrom()
for each token                    on ANY token — same interface

New token launches:               New token launches:
6 months of integrations          Instant compatibility with
before anyone can use it          every wallet, DEX, and tool
```

**Composability** is the superpower of Web3: because all ERC-20 tokens share the same interface, a lending protocol can accept any ERC-20 as collateral without changes.

---

## 2. ERC-20: Fungible Tokens

### 2.1 The Interface

```solidity
interface IERC20 {
    // Read functions
    function name() external view returns (string memory);
    function symbol() external view returns (string memory);
    function decimals() external view returns (uint8);
    function totalSupply() external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
    function allowance(address owner, address spender) external view returns (uint256);

    // Write functions
    function transfer(address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);

    // Events
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
}
```

### 2.2 The Approve/TransferFrom Pattern

```
Direct transfer:
  Alice calls token.transfer(Bob, 100)
  Alice -> Bob: 100 tokens

Two-step pattern (used by protocols):
  Step 1: Alice calls token.approve(DEX, 100)
          "DEX is allowed to spend 100 of my tokens"
  Step 2: DEX calls token.transferFrom(Alice, DEX, 100)
          "DEX moves 100 tokens from Alice to itself"

Why this exists:
  Smart contracts cannot initiate calls.
  Alice must first grant permission, then the contract acts on her behalf.
```

### 2.3 Complete ERC-20 Implementation

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract MyToken is ERC20, ERC20Burnable, ERC20Permit, Ownable {
    constructor(address initialOwner)
        ERC20("MyToken", "MTK")
        ERC20Permit("MyToken")
        Ownable(initialOwner)
    {
        _mint(initialOwner, 1_000_000 * 10 ** decimals());
    }

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}
```

### 2.4 ERC-20 Gotchas

| Gotcha                         | Tokens Affected    | Solution                                        |
| ------------------------------ | ------------------ | ----------------------------------------------- |
| No `bool` return on `transfer` | USDT, BNB          | Use `SafeERC20.safeTransfer()`                  |
| Fee-on-transfer                | STA, PAXG          | Check balance before/after transfer             |
| Rebasing (balance changes)     | stETH, AMPL        | Use wrappers (wstETH)                           |
| Approval race condition        | All ERC-20         | Use `increaseAllowance()`/`decreaseAllowance()` |
| Decimals != 18                 | USDC (6), WBTC (8) | Always use `10 ** decimals()`                   |

---

## 3. ERC-721: Non-Fungible Tokens

### 3.1 The Interface

Each ERC-721 token has a unique `tokenId`. Ownership is tracked per token, not per balance.

```solidity
interface IERC721 {
    function balanceOf(address owner) external view returns (uint256);
    function ownerOf(uint256 tokenId) external view returns (address);

    function safeTransferFrom(address from, address to, uint256 tokenId) external;
    function transferFrom(address from, address to, uint256 tokenId) external;

    function approve(address to, uint256 tokenId) external;
    function setApprovalForAll(address operator, bool approved) external;
    function getApproved(uint256 tokenId) external view returns (address);
    function isApprovedForAll(address owner, address operator) external view returns (bool);

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId);
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);
}
```

### 3.2 Complete NFT Collection

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract MyNFT is ERC721, ERC721URIStorage, Ownable {
    uint256 private _nextTokenId;
    uint256 public constant MAX_SUPPLY = 10_000;
    uint256 public constant MINT_PRICE = 0.05 ether;

    error MaxSupplyReached();
    error InsufficientPayment();

    constructor(address initialOwner)
        ERC721("MyNFT", "MNFT")
        Ownable(initialOwner)
    {}

    function mint(string calldata uri) external payable returns (uint256) {
        if (_nextTokenId >= MAX_SUPPLY) revert MaxSupplyReached();
        if (msg.value < MINT_PRICE) revert InsufficientPayment();

        uint256 tokenId = _nextTokenId;
        _nextTokenId = tokenId + 1;

        _safeMint(msg.sender, tokenId);
        _setTokenURI(tokenId, uri);

        return tokenId;
    }

    function withdraw() external onlyOwner {
        (bool success,) = owner().call{value: address(this).balance}("");
        require(success);
    }

    // Required overrides
    function tokenURI(uint256 tokenId) public view override(ERC721, ERC721URIStorage)
        returns (string memory)
    {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721, ERC721URIStorage)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
```

### 3.3 Metadata Standard

NFT metadata follows a JSON standard that marketplaces (OpenSea, Blur) use to display NFTs:

```json
{
  "name": "My NFT #1",
  "description": "A unique digital collectible",
  "image": "ipfs://QmHash.../1.png",
  "attributes": [
    { "trait_type": "Background", "value": "Blue" },
    { "trait_type": "Eyes", "value": "Laser" },
    { "trait_type": "Rarity Score", "display_type": "number", "value": 85 }
  ]
}
```

```
METADATA STORAGE OPTIONS

On-chain:   Store JSON directly in contract storage
            Pro: Fully decentralized, permanent
            Con: Very expensive gas costs

IPFS:       Store JSON/images on IPFS, URI = "ipfs://Qm..."
            Pro: Content-addressed, immutable, cheap
            Con: Must pin files (Pinata, Infura, nft.storage)

Arweave:    Permanent storage, URI = "ar://..."
            Pro: Pay once, stored forever
            Con: Higher upfront cost

Centralized: Store on AWS/GCS, URI = "https://api.example.com/..."
             Pro: Fast, flexible
             Con: Server goes down = metadata gone (rug risk)
```

### 3.4 ERC-721A (Gas-Efficient Batch Minting)

Standard ERC-721 costs ~50,000 gas per mint. ERC-721A (by Azuki) allows minting N tokens for nearly the same gas as minting 1:

```
Gas cost comparison for minting 5 NFTs:

ERC-721:   5 * ~50,000 = ~250,000 gas
ERC-721A:  ~52,000 gas total (lazy initialization)

How: ERC-721A assumes consecutive tokenIds and only writes the
     starting index. ownerOf() walks backwards to find the owner.
```

---

## 4. ERC-1155: Multi-Token Standard

ERC-1155 combines fungible and non-fungible tokens in a single contract, with efficient batch operations.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract GameItems is ERC1155, Ownable {
    uint256 public constant GOLD = 0;       // Fungible (many copies)
    uint256 public constant SILVER = 1;      // Fungible
    uint256 public constant SWORD = 2;       // Semi-fungible (limited copies)
    uint256 public constant SHIELD = 3;
    uint256 public constant LEGENDARY = 4;   // Non-fungible (1 copy)

    constructor(address initialOwner)
        ERC1155("https://game.example.com/api/item/{id}.json")
        Ownable(initialOwner)
    {
        _mint(initialOwner, GOLD, 10_000, "");
        _mint(initialOwner, SILVER, 50_000, "");
        _mint(initialOwner, SWORD, 100, "");
        _mint(initialOwner, SHIELD, 200, "");
        _mint(initialOwner, LEGENDARY, 1, "");
    }

    // Batch transfer: move multiple token types in one transaction
    function batchTransferItems(
        address to,
        uint256[] calldata ids,
        uint256[] calldata amounts
    ) external {
        safeBatchTransferFrom(msg.sender, to, ids, amounts, "");
    }
}
```

**When to use each standard**:

| Use Case                   | Standard | Why                             |
| -------------------------- | -------- | ------------------------------- |
| Currency/governance token  | ERC-20   | Simple, universal compatibility |
| Unique art/collectible     | ERC-721  | Each token is distinct          |
| Game items (mix of types)  | ERC-1155 | Batch operations, mixed types   |
| Yield-bearing vault shares | ERC-4626 | Standardized vault interface    |

---

## 5. ERC-4626: Tokenized Vaults

ERC-4626 standardizes yield-bearing vaults (deposit assets, receive shares):

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";

contract SimpleVault is ERC4626 {
    constructor(IERC20 asset)
        ERC4626(asset)
        ERC20("Vault Shares", "vSHARE")
    {}

    // Users deposit underlying asset, receive vault shares
    // deposit(100 USDC) -> receive 100 vSHARE (initially 1:1)

    // As vault earns yield, share price increases
    // 100 vSHARE might later be worth 110 USDC

    // Users redeem shares for underlying + yield
    // redeem(100 vSHARE) -> receive 110 USDC
}
```

```
ERC-4626 CORE FUNCTIONS

Deposit flow:   user deposits assets -> receives shares
                deposit(assets, receiver) -> shares minted
                mint(shares, receiver) -> assets pulled

Withdraw flow:  user burns shares -> receives assets
                withdraw(assets, receiver, owner) -> shares burned
                redeem(shares, receiver, owner) -> assets returned

Preview:        previewDeposit(assets) -> shares you'd get
                previewRedeem(shares) -> assets you'd get
                convertToShares(assets) / convertToAssets(shares)
```

---

## 6. Other Token Standards

### 6.1 Soulbound Tokens (SBTs)

Non-transferable tokens that represent identity, credentials, or reputation:

```solidity
contract SoulboundToken is ERC721 {
    error SoulboundNoTransfer();

    // Override transfer functions to prevent transfers
    function _update(address to, uint256 tokenId, address auth)
        internal override returns (address)
    {
        address from = _ownerOf(tokenId);
        if (from != address(0) && to != address(0)) {
            revert SoulboundNoTransfer(); // Block transfers (but allow mint/burn)
        }
        return super._update(to, tokenId, auth);
    }
}
```

### 6.2 ERC-6551: Token Bound Accounts

Gives every NFT its own smart contract wallet. An NFT can own other tokens and NFTs:

```
Before ERC-6551:            After ERC-6551:

NFT #42 is just an image    NFT #42 has its own wallet (0xTBA...)
owned by Alice               ├── Owns 500 USDC
                              ├── Owns NFT #99 (a sword)
                              ├── Owns 2.5 ETH
                              └── Can interact with DeFi protocols
```

---

## 7. Token Economics

### 7.1 Supply Mechanisms

```
+------------------------------------------------------------------------+
|                    TOKEN SUPPLY MODELS                                   |
+------------------------------------------------------------------------+
|                                                                        |
|  FIXED SUPPLY                 INFLATIONARY                             |
|  +-----------------------+   +---------------------------+             |
|  | Total supply set at    |   | New tokens minted per     |             |
|  | deployment, never      |   | block/epoch as rewards    |             |
|  | changes                |   | (like ETH staking rewards)|             |
|  | Example: UNI (1B)     |   | Example: ETH (~0.5%/year) |             |
|  +-----------------------+   +---------------------------+             |
|                                                                        |
|  DEFLATIONARY                 ELASTIC / REBASING                       |
|  +-----------------------+   +---------------------------+             |
|  | Tokens burned on usage |   | Supply adjusts to target  |             |
|  | (fees, buyback-burn)   |   | price by changing all     |             |
|  | Reduces supply over    |   | balances proportionally   |             |
|  | time                   |   | Example: AMPL, OHM        |             |
|  | Example: BNB, ETH burn |   |                           |             |
|  +-----------------------+   +---------------------------+             |
|                                                                        |
+------------------------------------------------------------------------+
```

### 7.2 Distribution Methods

| Method           | How It Works                               | Example                 |
| ---------------- | ------------------------------------------ | ----------------------- |
| Fair Launch      | No pre-mine, everyone mines/stakes equally | Bitcoin                 |
| ICO/IDO          | Public sale at fixed price                 | Early Ethereum          |
| Airdrop          | Free distribution to existing users        | Uniswap (UNI)           |
| Liquidity Mining | Earn tokens by providing liquidity         | Compound (COMP)         |
| Vesting          | Team/investor tokens unlock over time      | Most VC-backed projects |
| Points → Token   | Accumulate points, convert to tokens       | Blur, EigenLayer        |

---

## 8. Worked Problems

### Problem 1: Fee-on-Transfer Token Handling

```solidity
// This vault is BROKEN with fee-on-transfer tokens like USDT/STA:
contract BrokenVault {
    function deposit(IERC20 token, uint256 amount) external {
        token.transferFrom(msg.sender, address(this), amount);
        balances[msg.sender] += amount; // BUG: actual received < amount
    }
}

// Fix: Measure actual balance change
contract FixedVault {
    function deposit(IERC20 token, uint256 amount) external {
        uint256 balanceBefore = token.balanceOf(address(this));
        token.transferFrom(msg.sender, address(this), amount);
        uint256 received = token.balanceOf(address(this)) - balanceBefore;
        balances[msg.sender] += received; // Use actual received amount
    }
}
```

---

## Appendix: Token Standards Quick Reference

```
TOKEN STANDARDS CHEAT SHEET

ERC-20:    Fungible tokens (USDC, UNI, LINK)
           balanceOf, transfer, approve, transferFrom
           Decimals: usually 18, but USDC=6, WBTC=8

ERC-721:   Non-fungible tokens (unique, one owner per tokenId)
           ownerOf, safeTransferFrom, approve, setApprovalForAll
           Metadata: name, symbol, tokenURI -> JSON

ERC-1155:  Multi-token (fungible + non-fungible in one contract)
           balanceOf(account, id), safeBatchTransferFrom
           Great for games, reduces deployment costs

ERC-4626:  Tokenized vault (deposit assets, get yield-bearing shares)
           deposit, withdraw, mint, redeem, convertToShares
           Used by: Yearn V3, Aave, most yield protocols

ERC-2612:  Permit (gasless ERC-20 approval via signature)
           permit(owner, spender, value, deadline, v, r, s)

ERC-721A:  Gas-optimized batch minting (Azuki)
           ~52K gas for batch vs ~50K per item in standard

ERC-6551:  Token Bound Accounts (NFTs own assets)
           Each NFT gets its own contract wallet

SBT:       Soulbound token (non-transferable ERC-721)
           Identity, credentials, reputation
```
