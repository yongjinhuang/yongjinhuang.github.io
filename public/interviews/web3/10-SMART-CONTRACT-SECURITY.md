# Chapter 10: Smart Contract Security

## Introduction

Smart contract security is unlike any other domain of software security. Traditional software bugs cause inconvenience; smart contract bugs cause irreversible financial loss. There is no "patch Friday" — once a contract is deployed, its code is permanent. Attackers monitor the mempool 24/7 with automated bots that can drain vulnerable contracts within minutes of deployment. The total value lost to smart contract exploits exceeds $6 billion.

This chapter covers the most common vulnerabilities, real-world attack case studies, security tools, and the auditing methodology used by professional security firms.

```
+------------------------------------------------------------------------+
|                  SMART CONTRACT SECURITY                                |
+------------------------------------------------------------------------+
|                                                                        |
|  COMMON VULNERABILITIES        ATTACK VECTORS                          |
|  +----------------------+     +---------------------------+            |
|  | Reentrancy            |     | Flash loan attacks        |            |
|  | Access control         |     | Price oracle manipulation |            |
|  | Integer overflow       |     | Sandwich attacks (MEV)    |            |
|  | Front-running          |     | Governance attacks        |            |
|  | Denial of service      |     | Rug pulls                 |            |
|  | Logic errors           |     | Supply chain (dependency) |            |
|  +----------------------+     +---------------------------+            |
|                                                                        |
|  SECURITY TOOLS                AUDIT METHODOLOGY                       |
|  +----------------------+     +---------------------------+            |
|  | Slither (static)      |     | Manual code review        |            |
|  | Mythril (symbolic)    |     | Automated analysis        |            |
|  | Echidna (fuzzing)     |     | Formal verification       |            |
|  | Foundry fuzz/invariant|     | Economic modeling         |            |
|  | Certora (formal)      |     | Bug bounty programs       |            |
|  +----------------------+     +---------------------------+            |
|                                                                        |
+------------------------------------------------------------------------+
```

---

## 1. Reentrancy

### 1.1 The Classic Attack

Reentrancy is the most infamous smart contract vulnerability. It occurs when a contract makes an external call before updating its own state, allowing the callee to re-enter the calling function.

```
REENTRANCY ATTACK FLOW

Victim Contract                    Attacker Contract
+-----------------+                +-----------------+
| withdraw() {    |                | receive() {     |
|   check balance | <--- call ---  |   // re-enter!  |
|   send ETH -----+--- ETH -----> |   victim.       |
|   update balance|                |     withdraw()  |
| }               |                | }               |
+-----------------+                +-----------------+

Timeline:
1. Attacker calls withdraw()
2. Victim checks balance: 1 ETH ✓
3. Victim sends 1 ETH to attacker
4. Attacker's receive() re-calls withdraw()
5. Victim checks balance: STILL 1 ETH (not yet updated!)
6. Victim sends 1 ETH again
7. Repeat until contract is drained
8. Finally, balance is updated (too late)
```

### 1.2 The DAO Hack (2016)

The most famous reentrancy attack drained 3.6 million ETH (~$60M at the time) from "The DAO." This led to the Ethereum hard fork that created Ethereum Classic.

### 1.3 Prevention

```solidity
// VULNERABLE
contract Vulnerable {
    mapping(address => uint256) public balances;

    function withdraw() external {
        uint256 amount = balances[msg.sender];
        (bool success,) = msg.sender.call{value: amount}(""); // INTERACTION
        require(success);
        balances[msg.sender] = 0; // EFFECT (too late!)
    }
}

// FIX 1: Checks-Effects-Interactions pattern
contract FixedCEI {
    mapping(address => uint256) public balances;

    function withdraw() external {
        uint256 amount = balances[msg.sender];
        require(amount > 0, "No balance");     // CHECK
        balances[msg.sender] = 0;               // EFFECT (before call!)
        (bool success,) = msg.sender.call{value: amount}(""); // INTERACTION
        require(success);
    }
}

// FIX 2: Reentrancy guard (mutex)
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract FixedGuard is ReentrancyGuard {
    mapping(address => uint256) public balances;

    function withdraw() external nonReentrant {
        uint256 amount = balances[msg.sender];
        balances[msg.sender] = 0;
        (bool success,) = msg.sender.call{value: amount}("");
        require(success);
    }
}
```

### 1.4 Cross-Function and Cross-Contract Reentrancy

```solidity
// Cross-function reentrancy: attacker re-enters a DIFFERENT function
contract CrossFunction {
    mapping(address => uint256) public balances;

    function withdraw() external {
        uint256 amount = balances[msg.sender];
        (bool success,) = msg.sender.call{value: amount}("");
        require(success);
        balances[msg.sender] = 0;
    }

    function transfer(address to, uint256 amount) external {
        // Attacker re-enters HERE during withdraw's external call
        // balances[msg.sender] is not yet 0!
        require(balances[msg.sender] >= amount);
        balances[msg.sender] -= amount;
        balances[to] += amount;
    }
}
```

---

## 2. Access Control Vulnerabilities

```solidity
// VULNERABLE: Missing access control
contract Vulnerable {
    address public owner;

    // Anyone can call this and become owner!
    function setOwner(address newOwner) external {
        owner = newOwner;
    }

    // Missing onlyOwner modifier
    function withdrawAll() external {
        (bool s,) = msg.sender.call{value: address(this).balance}("");
        require(s);
    }
}

// REAL CASE: Parity Wallet hack (2017)
// The wallet library's initialize function was public
// An attacker called it, became owner, and drained 150,000 ETH ($30M)
// Later, another attacker "accidentally" killed the library contract,
// freezing 513,000 ETH ($150M) permanently

// FIX: Always use access control
import "@openzeppelin/contracts/access/Ownable.sol";

contract Fixed is Ownable {
    constructor() Ownable(msg.sender) {}

    function withdrawAll() external onlyOwner {
        (bool s,) = owner().call{value: address(this).balance}("");
        require(s);
    }
}
```

---

## 3. Oracle Manipulation

### 3.1 Spot Price Manipulation

```
ORACLE MANIPULATION ATTACK

Protocol uses Uniswap spot price as oracle:
  price = reserveUSDC / reserveETH

Attack (single transaction):
1. Flash loan 10,000 ETH
2. Swap 10,000 ETH for USDC on Uniswap
   -> ETH reserve drops, USDC reserve rises
   -> Spot price of ETH drops dramatically
3. Use manipulated low price to borrow cheap from victim protocol
4. Swap USDC back to ETH (restoring Uniswap price)
5. Repay flash loan
6. Profit from undercollateralized borrow

Prevention:
- Use Chainlink oracles (resistant to single-tx manipulation)
- Use TWAP (Time-Weighted Average Price) over 30+ minutes
- NEVER use spot DEX prices for critical operations
```

### 3.2 Safe Oracle Usage

```solidity
import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";

contract SafeOracle {
    AggregatorV3Interface internal priceFeed;

    error StalePrice();
    error InvalidPrice();
    error RoundIncomplete();

    function getPrice() public view returns (uint256) {
        (
            uint80 roundId,
            int256 price,
            ,
            uint256 updatedAt,
            uint80 answeredInRound
        ) = priceFeed.latestRoundData();

        // Check 1: Price is positive
        if (price <= 0) revert InvalidPrice();

        // Check 2: Price is not stale (updated within last hour)
        if (block.timestamp - updatedAt > 3600) revert StalePrice();

        // Check 3: Round is complete
        if (answeredInRound < roundId) revert RoundIncomplete();

        return uint256(price);
    }
}
```

---

## 4. Flash Loan Attacks

```
REAL-WORLD FLASH LOAN ATTACK: bZx (2020, ~$1M stolen)

1. Flash borrow 10,000 ETH from dYdX
2. Deposit 5,500 ETH into Compound as collateral
3. Borrow 112 WBTC from Compound
4. Swap 1,300 ETH for WBTC on Uniswap (pushes WBTC price up)
5. Sell 112 WBTC on Uniswap at inflated price
6. Repay Compound loan
7. Repay flash loan
8. Profit: ~$350K

The attack exploited the dependency between a lending protocol's
price oracle and a DEX's spot price.
```

---

## 5. Common Vulnerability Patterns

### 5.1 Checklist of Vulnerabilities

```
+------------------------------------------------------------------------+
|                VULNERABILITY CHECKLIST                                   |
+------------------------------------------------------------------------+
| Vulnerability              | Impact    | Prevention                     |
|----------------------------|-----------|--------------------------------|
| Reentrancy                 | Critical  | CEI pattern, ReentrancyGuard   |
| Access control missing     | Critical  | Ownable, AccessControl         |
| Oracle manipulation        | Critical  | Chainlink, TWAP, no spot price |
| Unchecked return values    | High      | SafeERC20, check call results  |
| Front-running              | High      | Commit-reveal, private mempool |
| Integer overflow (pre-0.8) | High      | Use Solidity 0.8+ or SafeMath  |
| Denial of service          | High      | Pull over push, gas limits     |
| Signature replay           | High      | Nonces, EIP-712, chain ID      |
| tx.origin authentication   | High      | Use msg.sender, never tx.origin|
| Delegatecall to untrusted  | Critical  | Only delegatecall to known code|
| Uninitialized proxy        | Critical  | Use initializers, not constr.  |
| Storage collision (proxy)  | Critical  | EIP-1967 slots, append-only    |
| Selfdestruct forwarding    | Medium    | Check for code at address      |
| Block.timestamp dependence | Low       | Don't use for randomness       |
| Centralization risk        | Medium    | Multisig, timelock, governance |
+------------------------------------------------------------------------+
```

### 5.2 tx.origin Phishing

```solidity
// VULNERABLE: Uses tx.origin for authentication
contract Wallet {
    address public owner;

    function transfer(address to, uint256 amount) external {
        // tx.origin is the original transaction sender (EOA)
        // NOT the immediate caller (msg.sender)
        require(tx.origin == owner, "Not owner"); // BUG!
        payable(to).transfer(amount);
    }
}

// ATTACK: Trick owner into calling attacker's contract
contract Attacker {
    Wallet public wallet;

    // If owner calls ANY function on this contract,
    // tx.origin will be the owner, and the transfer succeeds!
    receive() external payable {
        wallet.transfer(address(this), address(wallet).balance);
    }
}

// FIX: Always use msg.sender
require(msg.sender == owner, "Not owner");
```

---

## 6. Security Tools

### 6.1 Slither (Static Analysis)

```bash
# Install
pip3 install slither-analyzer

# Run on a project
slither .

# Output example:
# MyContract.withdraw() (src/MyContract.sol#45-52)
#   sends eth to arbitrary user
#   Dangerous calls:
#     - (success) = msg.sender.call{value: amount}()
#   State variables written after the call:
#     - balances[msg.sender] = 0
#   -> Reentrancy vulnerability detected!
```

### 6.2 Foundry Fuzz Testing

```solidity
// Fuzz testing: Foundry generates random inputs to find edge cases
contract TokenFuzzTest is Test {
    MyToken token;

    function setUp() public {
        token = new MyToken();
        token.mint(address(this), 1_000_000e18);
    }

    // Foundry calls this with hundreds of random (to, amount) values
    function testFuzz_TransferNeverExceedsBalance(
        address to,
        uint256 amount
    ) public {
        vm.assume(to != address(0));
        vm.assume(to != address(this));

        uint256 balanceBefore = token.balanceOf(address(this));

        if (amount > balanceBefore) {
            vm.expectRevert();
            token.transfer(to, amount);
        } else {
            token.transfer(to, amount);
            assertEq(token.balanceOf(address(this)), balanceBefore - amount);
            assertEq(token.balanceOf(to), amount);
        }
    }
}
```

### 6.3 Invariant Testing

```solidity
// Invariant: totalSupply must always equal sum of all balances
contract TokenInvariantTest is Test {
    MyToken token;
    Handler handler;

    function setUp() public {
        token = new MyToken();
        handler = new Handler(token);
        targetContract(address(handler));
    }

    function invariant_TotalSupplyMatchesBalances() public view {
        assertEq(
            token.totalSupply(),
            token.balanceOf(address(handler)) +
            token.balanceOf(address(this))
        );
    }
}
```

### 6.4 Echidna (Property-Based Fuzzing)

```solidity
// Echidna test: property that should ALWAYS hold
contract EchidnaTest {
    MyToken token;

    constructor() {
        token = new MyToken();
        token.mint(address(this), 1000e18);
    }

    // Echidna tries to break this property with random transactions
    function echidna_total_supply_never_exceeds_cap() public view returns (bool) {
        return token.totalSupply() <= 1_000_000e18;
    }
}
```

```bash
# Run Echidna
echidna . --contract EchidnaTest --config echidna.yaml
```

### 6.5 Tool Comparison

| Tool | Type | Language | Best For |
|------|------|----------|----------|
| Slither | Static analysis | Python | Quick vulnerability scan |
| Mythril | Symbolic execution | Python | Deep bug finding |
| Echidna | Property fuzzing | Haskell | Invariant testing |
| Foundry fuzz | Fuzz testing | Rust | Fast fuzzing, integrated |
| Certora | Formal verification | Certora Prover | Mathematical correctness proofs |
| Tenderly | Simulation | Cloud | Transaction debugging |

---

## 7. Audit Methodology

### 7.1 Professional Audit Process

```
SMART CONTRACT AUDIT PROCESS

Phase 1: SCOPING (1-2 days)
  - Define scope: which contracts, which functions
  - Review documentation and specifications
  - Understand the protocol's intended behavior
  - Identify key assets and attack surfaces

Phase 2: AUTOMATED ANALYSIS (1-2 days)
  - Run Slither, Mythril, Echidna
  - Review compiler warnings
  - Check test coverage
  - Run gas analysis

Phase 3: MANUAL REVIEW (5-15 days)
  - Line-by-line code review
  - Check access control on every function
  - Trace fund flows (where does money go?)
  - Check all external interactions
  - Review math (overflow, rounding, precision loss)
  - Check upgrade safety (storage layout)
  - Review economic attack surfaces

Phase 4: REPORT (2-3 days)
  - Classify findings: Critical / High / Medium / Low / Info
  - Write proof-of-concept exploits for critical findings
  - Recommend fixes
  - Deliver report to client

Phase 5: FIX REVIEW (2-3 days)
  - Verify fixes are correct
  - Check for regressions
  - Final sign-off
```

### 7.2 Bug Bounty Programs

```
BUG BOUNTY PLATFORMS

Immunefi:    Largest Web3 bug bounty platform
             $150M+ paid out, bounties up to $10M
             Used by: Wormhole, Optimism, MakerDAO

Code4rena:   Competitive audit contests
             Auditors compete to find bugs
             Fixed-price audits with prize pools

Sherlock:    Audit marketplace + bug bounty
             Backed by insurance for protocols

HackerOne:   Traditional platform, some Web3 programs
```

---

## 8. Worked Problems

### Problem 1: Find the Bug

```solidity
contract Auction {
    address public highestBidder;
    uint256 public highestBid;

    function bid() external payable {
        require(msg.value > highestBid, "Bid too low");

        // Refund previous highest bidder
        if (highestBidder != address(0)) {
            payable(highestBidder).transfer(highestBid); // BUG!
        }

        highestBidder = msg.sender;
        highestBid = msg.value;
    }
}

// BUG: If highestBidder is a contract that reverts on receive(),
// no one can ever outbid them (DOS attack).
// transfer() reverts on failure, blocking all future bids.

// FIX: Use pull-over-push pattern
mapping(address => uint256) public pendingReturns;

function bid() external payable {
    require(msg.value > highestBid);
    pendingReturns[highestBidder] += highestBid;
    highestBidder = msg.sender;
    highestBid = msg.value;
}

function withdraw() external {
    uint256 amount = pendingReturns[msg.sender];
    pendingReturns[msg.sender] = 0;
    payable(msg.sender).transfer(amount);
}
```

### Problem 2: Signature Replay Attack

```solidity
// VULNERABLE: Signature can be replayed
contract VulnerableRelay {
    function execute(address to, uint256 amount, bytes calldata sig) external {
        bytes32 hash = keccak256(abi.encodePacked(to, amount));
        address signer = ECDSA.recover(hash, sig);
        require(signer == owner, "Invalid signer");
        payable(to).transfer(amount);
        // BUG: Same signature can be submitted again!
    }
}

// FIX: Include nonce and chain ID
contract FixedRelay {
    mapping(address => uint256) public nonces;

    function execute(address to, uint256 amount, uint256 nonce, bytes calldata sig) external {
        require(nonce == nonces[owner], "Invalid nonce");
        bytes32 hash = keccak256(abi.encodePacked(to, amount, nonce, block.chainid, address(this)));
        address signer = ECDSA.recover(hash, sig);
        require(signer == owner, "Invalid signer");
        nonces[owner]++;
        payable(to).transfer(amount);
    }
}
```

---

## Appendix: Security Cheat Sheet

```
SMART CONTRACT SECURITY CHEAT SHEET

Before Every Function:
  [ ] Who can call this? (access control)
  [ ] What state does it read/write?
  [ ] Does it make external calls? (reentrancy risk)
  [ ] Can inputs cause overflow/underflow?
  [ ] Can it be front-run?

Before Every Deploy:
  [ ] Run Slither (zero high/critical findings)
  [ ] Run fuzz tests (1000+ runs)
  [ ] 100% test coverage on critical paths
  [ ] Professional audit for >$100K TVL
  [ ] Bug bounty program set up
  [ ] Emergency pause mechanism
  [ ] Timelock on admin functions
  [ ] Multisig for admin keys (NOT a single EOA)

Top Attack Patterns:
  1. Reentrancy -> CEI + ReentrancyGuard
  2. Oracle manipulation -> Chainlink, never spot price
  3. Flash loan price manipulation -> TWAP, oracle checks
  4. Access control -> Ownable/AccessControl on all admin funcs
  5. Signature replay -> Nonces + chain ID + contract address
  6. Front-running -> Commit-reveal or private mempool
```
