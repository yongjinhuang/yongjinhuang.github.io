# Chapter 5: Advanced Solidity

## Introduction

Once you can write basic contracts, you need to master the patterns that enable upgradeable systems, gas efficiency, and complex protocol design. Production DeFi protocols like Uniswap, Aave, and Compound use advanced Solidity patterns extensively — proxy contracts for upgradeability, inline assembly for gas savings, and sophisticated access control for multi-million dollar treasuries.

This chapter covers the advanced patterns that separate a junior Solidity developer from a senior protocol engineer: inline assembly (Yul), proxy patterns, gas optimization, design patterns, access control, meta-transactions, and low-level EVM interactions.

```
+------------------------------------------------------------------------+
|                    ADVANCED SOLIDITY PATTERNS                           |
+------------------------------------------------------------------------+
|                                                                        |
|  PROXY PATTERNS           GAS OPTIMIZATION        ASSEMBLY (YUL)       |
|  +--------------------+  +--------------------+  +------------------+  |
|  | Transparent Proxy   |  | Storage packing    |  | Inline assembly  |  |
|  | UUPS (EIP-1822)     |  | unchecked{} blocks |  | mstore / mload   |  |
|  | Beacon Proxy        |  | Calldata vs memory |  | sstore / sload   |  |
|  | Diamond (EIP-2535)  |  | Custom errors      |  | calldataload     |  |
|  | Minimal Proxy (1167)|  | Batch operations   |  | Bit manipulation |  |
|  +--------------------+  +--------------------+  +------------------+  |
|                                                                        |
|  DESIGN PATTERNS          ACCESS CONTROL          META-TRANSACTIONS    |
|  +--------------------+  +--------------------+  +------------------+  |
|  | Checks-Effects-     |  | Ownable            |  | EIP-712 typed    |  |
|  |   Interactions      |  | AccessControl      |  | EIP-2612 permit  |  |
|  | Pull over Push      |  | Timelock           |  | EIP-2771 forward |  |
|  | Commit-Reveal       |  | Multi-sig (Safe)   |  | Gasless txs      |  |
|  | Factory             |  | Governor           |  | Relayers         |  |
|  +--------------------+  +--------------------+  +------------------+  |
|                                                                        |
+------------------------------------------------------------------------+
```

---

## 1. Inline Assembly (Yul)

### 1.1 When to Use Assembly

Inline assembly gives you direct access to EVM opcodes. Use it when:

- Gas savings are critical (hot paths in DeFi protocols)
- You need operations not exposed by Solidity (e.g., `CREATE2`, `RETURNDATASIZE`)
- You need to interact with non-standard contracts

**Do not** use assembly unless you have a measurable reason — it bypasses Solidity's safety checks.

### 1.2 Yul Syntax

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract YulBasics {
    // Read a storage slot directly
    function readSlot(uint256 slot) external view returns (uint256 value) {
        assembly {
            value := sload(slot)
        }
    }

    // Write to a storage slot directly
    function writeSlot(uint256 slot, uint256 value) external {
        assembly {
            sstore(slot, value)
        }
    }

    // Efficient memory copy
    function efficientHash(uint256 a, uint256 b) external pure returns (bytes32 result) {
        assembly {
            // Store a at memory position 0x00
            mstore(0x00, a)
            // Store b at memory position 0x20 (32 bytes after)
            mstore(0x20, b)
            // Hash 64 bytes starting from memory position 0x00
            result := keccak256(0x00, 0x40)
        }
    }

    // Read packed storage (two uint128s in one slot)
    function readPacked(uint256 slot) external view returns (uint128 low, uint128 high) {
        assembly {
            let packed := sload(slot)
            low := and(packed, 0xffffffffffffffffffffffffffffffff)
            high := shr(128, packed)
        }
    }

    // Return data directly (gas-efficient custom error)
    function revertWithReason() external pure {
        assembly {
            // Store error selector for Error(string)
            mstore(0x00, 0x08c379a000000000000000000000000000000000000000000000000000000000)
            mstore(0x04, 0x20) // offset to string
            mstore(0x24, 0x0d) // string length (13)
            mstore(0x44, "Access denied") // string data
            revert(0x00, 0x64)
        }
    }
}
```

### 1.3 Common Assembly Patterns

```solidity
contract AssemblyPatterns {
    // Check if address is a contract
    function isContract(address addr) internal view returns (bool) {
        uint256 size;
        assembly {
            size := extcodesize(addr)
        }
        return size > 0;
    }

    // Efficient address comparison
    function addressEquals(address a, address b) internal pure returns (bool result) {
        assembly {
            result := eq(a, b)
        }
    }

    // Efficient safe transfer using low-level call
    function safeTransferETH(address to, uint256 amount) internal {
        bool success;
        assembly {
            success := call(gas(), to, amount, 0, 0, 0, 0)
        }
        require(success, "ETH transfer failed");
    }
}
```

---

## 2. Proxy Patterns and Upgradeability

### 2.1 The Fundamental Conflict

Smart contracts are immutable once deployed — that is a feature, not a bug. But real software needs updates. Proxy patterns solve this by separating **storage** (proxy contract, never changes) from **logic** (implementation contract, can be replaced).

```
PROXY PATTERN ARCHITECTURE

User calls Proxy              Proxy delegates to Implementation
+------------------+          +------------------+
| Proxy Contract   |          | Implementation   |
|                  |  ------> |                  |
| Storage lives    | delegate | Logic lives      |
| HERE             |   call   | HERE             |
|                  |          |                  |
| admin: 0xAdmin   |          | function foo() { |
| impl:  0xImplV1  |          |   // business    |
| slot0: userData  |          |   // logic        |
| slot1: balances  |          | }                |
+------------------+          +------------------+

Key insight: delegatecall executes implementation code
but reads/writes the PROXY's storage and uses the
PROXY's msg.sender and msg.value.
```

### 2.2 delegatecall Explained

```solidity
// When Proxy receives a call:
//   msg.sender = original caller (NOT the proxy)
//   storage = proxy's storage (NOT the implementation's)
//   code = implementation's code

// This is why storage layout must match between proxy and implementation!

contract Proxy {
    address public implementation;

    fallback() external payable {
        address impl = implementation;
        assembly {
            // Copy calldata to memory
            calldatacopy(0, 0, calldatasize())
            // Delegatecall to implementation
            let result := delegatecall(gas(), impl, 0, calldatasize(), 0, 0)
            // Copy return data
            returndatacopy(0, 0, returndatasize())
            // Return or revert based on result
            switch result
            case 0 { revert(0, returndatasize()) }
            default { return(0, returndatasize()) }
        }
    }
}
```

### 2.3 Transparent Proxy (OpenZeppelin)

The admin can call upgrade functions; all other callers get delegated to the implementation. This prevents function selector clashes.

```solidity
// Simplified Transparent Proxy logic:
// - If msg.sender == admin: handle admin functions (upgrade, changeAdmin)
// - If msg.sender != admin: delegatecall to implementation

// Deployment with OpenZeppelin:
import "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";

// Deploy implementation first, then proxy pointing to it
// ProxyAdmin contract manages upgrades
```

### 2.4 UUPS Proxy (EIP-1822)

The upgrade logic lives in the implementation contract (not the proxy). This makes the proxy simpler and cheaper to deploy.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

contract MyTokenV1 is UUPSUpgradeable, OwnableUpgradeable {
    uint256 public value;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address initialOwner) public initializer {
        __Ownable_init(initialOwner);
        __UUPSUpgradeable_init();
    }

    function setValue(uint256 _value) external {
        value = _value;
    }

    // Only owner can authorize upgrades
    function _authorizeUpgrade(address newImplementation)
        internal
        override
        onlyOwner
    {}
}

// V2 adds a new function without changing existing storage layout
contract MyTokenV2 is MyTokenV1 {
    uint256 public newValue; // Appended AFTER existing storage

    function setNewValue(uint256 _newValue) external {
        newValue = _newValue;
    }
}
```

### 2.5 Storage Collision

The most dangerous proxy bug: proxy and implementation accidentally use the same storage slot for different variables.

```
STORAGE COLLISION EXAMPLE

Proxy storage:             Implementation storage:
Slot 0: implementation     Slot 0: totalSupply     <-- COLLISION!
Slot 1: admin              Slot 1: owner           <-- COLLISION!

Fix: Use "unstructured storage" — store proxy variables at
     random slots derived from a hash:

bytes32 constant IMPL_SLOT = keccak256("eip1967.proxy.implementation") - 1;
// = 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc
```

### 2.6 Proxy Pattern Comparison

| Pattern        | Proxy Gas | Upgrade Auth            | Storage Risk    | Use Case               |
| -------------- | --------- | ----------------------- | --------------- | ---------------------- |
| Transparent    | Higher    | ProxyAdmin contract     | Low (separated) | General purpose        |
| UUPS           | Lower     | Implementation contract | Medium          | Gas-sensitive          |
| Beacon         | Medium    | Beacon contract         | Low             | Many identical proxies |
| Diamond (2535) | Higher    | Configurable            | Complex         | Large protocols        |
| Minimal (1167) | Very Low  | None (not upgradeable)  | None            | Cheap clones           |

---

## 3. Gas Optimization Techniques

### 3.1 Storage Optimization

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// BAD: Each variable uses a full 32-byte slot
contract Expensive {
    uint256 public a;     // Slot 0 (32 bytes, wastes 24 bytes for small values)
    uint8 public b;       // Slot 1 (only needs 1 byte but uses full slot)
    uint8 public c;       // Slot 2
    address public d;     // Slot 3
    // SSTORE cost: 4 * 20,000 = 80,000 gas for first writes
}

// GOOD: Pack variables into fewer slots
contract Cheap {
    uint8 public b;       // Slot 0 (1 byte)
    uint8 public c;       // Slot 0 (1 byte, packed with b)
    address public d;     // Slot 0 (20 bytes, packed with b and c)
    uint256 public a;     // Slot 1 (needs full slot)
    // SSTORE cost: 2 * 20,000 = 40,000 gas — 50% savings!
}
```

### 3.2 unchecked Blocks

```solidity
// Solidity 0.8+ adds overflow checks on every arithmetic operation
// Each check costs ~100-200 gas. Skip them when overflow is impossible.

contract UncheckedExample {
    // BAD: Overflow checks on loop counter (can never overflow)
    function sumBad(uint256[] calldata arr) external pure returns (uint256 total) {
        for (uint256 i = 0; i < arr.length; i++) {  // checked i++
            total += arr[i];
        }
    }

    // GOOD: unchecked loop counter saves ~100 gas per iteration
    function sumGood(uint256[] calldata arr) external pure returns (uint256 total) {
        for (uint256 i = 0; i < arr.length;) {
            total += arr[i];
            unchecked { ++i; }  // pre-increment is also slightly cheaper
        }
    }
}
```

### 3.3 Custom Errors vs String Errors

```solidity
contract ErrorComparison {
    // BAD: String error costs ~2,500+ gas for the string storage
    function requireWithString(uint256 x) external pure {
        require(x > 0, "Value must be greater than zero");
    }

    // GOOD: Custom error costs ~100 gas (just 4-byte selector)
    error ValueMustBePositive();
    function requireWithCustom(uint256 x) external pure {
        if (x == 0) revert ValueMustBePositive();
    }
    // Gas savings: ~2,400 gas per revert
}
```

### 3.4 Calldata vs Memory

```solidity
contract CalldataVsMemory {
    // BAD: Copies array from calldata to memory (expensive)
    function processBad(uint256[] memory data) external pure returns (uint256) {
        return data[0];
    }

    // GOOD: Reads directly from calldata (no copy)
    function processGood(uint256[] calldata data) external pure returns (uint256) {
        return data[0];
    }
    // Savings: ~60 gas per 32 bytes of data
}
```

### 3.5 Gas Optimization Summary

```
+------------------------------------------------------------------------+
|                    GAS OPTIMIZATION CHEAT SHEET                         |
+------------------------------------------------------------------------+
| Technique                    | Savings         | Risk Level             |
|------------------------------|-----------------|------------------------|
| Pack storage variables       | 20,000 per slot | Low                    |
| unchecked{} for safe math    | 100-200 per op  | Medium (verify safe)   |
| Custom errors vs strings     | 2,400 per revert| Low                    |
| calldata vs memory params    | 60 per 32 bytes | Low                    |
| Cache storage in memory      | 2,100 per SLOAD | Low                    |
| Short-circuit evaluation     | Variable        | Low                    |
| Events vs storage for logs   | 15,000+ per log | Low (not queryable)    |
| Batch operations             | 21,000 per tx   | Low                    |
| Constants and immutables     | 2,100 per read  | Low                    |
| Pre-increment (++i vs i++)   | ~5 per iteration| Low                    |
| Inline assembly              | 10-50%          | High (bypasses safety) |
+------------------------------------------------------------------------+
```

---

## 4. Design Patterns

### 4.1 Checks-Effects-Interactions (CEI)

The most important pattern for preventing reentrancy attacks.

```solidity
contract CEIPattern {
    mapping(address => uint256) public balances;

    // BAD: Interaction before effects (vulnerable to reentrancy)
    function withdrawBad(uint256 amount) external {
        require(balances[msg.sender] >= amount, "Insufficient");
        // INTERACTION first — attacker can re-enter before balance is updated
        (bool success,) = msg.sender.call{value: amount}("");
        require(success);
        // EFFECT after — too late, attacker already re-entered
        balances[msg.sender] -= amount;
    }

    // GOOD: Checks-Effects-Interactions order
    function withdrawGood(uint256 amount) external {
        // CHECK
        require(balances[msg.sender] >= amount, "Insufficient");
        // EFFECT (update state BEFORE external call)
        balances[msg.sender] -= amount;
        // INTERACTION (external call LAST)
        (bool success,) = msg.sender.call{value: amount}("");
        require(success);
    }
}
```

### 4.2 Pull Over Push (Withdrawal Pattern)

Instead of pushing funds to recipients (which can fail), let recipients pull their funds.

```solidity
contract PullPayment {
    mapping(address => uint256) public pendingWithdrawals;

    // Internal: credit funds to recipient
    function _asyncTransfer(address dest, uint256 amount) internal {
        pendingWithdrawals[dest] += amount;
    }

    // External: recipient pulls their own funds
    function withdraw() external {
        uint256 amount = pendingWithdrawals[msg.sender];
        require(amount > 0, "Nothing to withdraw");
        pendingWithdrawals[msg.sender] = 0;
        (bool success,) = msg.sender.call{value: amount}("");
        require(success, "Transfer failed");
    }
}
```

### 4.3 Commit-Reveal

Prevent front-running by splitting actions into commit (hidden) and reveal (public) phases.

```solidity
contract CommitReveal {
    mapping(address => bytes32) public commits;
    mapping(address => uint256) public commitTimestamps;

    uint256 public constant REVEAL_PERIOD = 1 hours;

    // Phase 1: Commit a hidden value
    function commit(bytes32 commitment) external {
        commits[msg.sender] = commitment;
        commitTimestamps[msg.sender] = block.timestamp;
    }

    // Phase 2: Reveal the actual value
    function reveal(uint256 value, bytes32 salt) external {
        require(
            block.timestamp >= commitTimestamps[msg.sender] + REVEAL_PERIOD,
            "Too early"
        );
        require(
            commits[msg.sender] == keccak256(abi.encodePacked(value, salt, msg.sender)),
            "Invalid reveal"
        );
        commits[msg.sender] = bytes32(0);
        // Process the revealed value...
    }
}
```

### 4.4 Factory Pattern

Deploy new contracts programmatically, often used for creating pairs in DEXs or vaults.

```solidity
contract VaultFactory {
    mapping(address => address) public vaults;

    event VaultCreated(address indexed token, address vault);

    function createVault(address token) external returns (address vault) {
        require(vaults[token] == address(0), "Vault exists");

        // Deploy new Vault contract
        vault = address(new Vault(token, msg.sender));
        vaults[token] = vault;

        emit VaultCreated(token, vault);
    }
}
```

---

## 5. Access Control

### 5.1 Ownable (Single Admin)

```solidity
import "@openzeppelin/contracts/access/Ownable.sol";

contract SimpleToken is Ownable {
    constructor() Ownable(msg.sender) {}

    function mint(address to, uint256 amount) external onlyOwner {
        // Only the owner can mint
    }
}
```

### 5.2 Role-Based Access Control

```solidity
import "@openzeppelin/contracts/access/AccessControl.sol";

contract Treasury is AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant TREASURER_ROLE = keccak256("TREASURER_ROLE");

    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(MINTER_ROLE, admin);
    }

    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        // Only addresses with MINTER_ROLE can call this
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        // Only pausers can pause
    }

    function withdraw(address to, uint256 amount) external onlyRole(TREASURER_ROLE) {
        // Only treasurers can withdraw
    }
}
```

### 5.3 Timelock Controllers

For governance, changes should have a delay period so users can react:

```solidity
import "@openzeppelin/contracts/governance/TimelockController.sol";

// Deploy TimelockController with:
//   - minDelay: 2 days (time users have to exit before changes take effect)
//   - proposers: [governor address]
//   - executors: [governor address]
//   - admin: address(0) (renounce admin immediately)
```

---

## 6. Libraries

### 6.1 SafeERC20

Many ERC-20 tokens (notably USDT) do not return `true` on `transfer` and `approve`, violating the standard. `SafeERC20` handles this:

```solidity
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract VaultWithSafeTransfer {
    using SafeERC20 for IERC20;

    IERC20 public token;

    function deposit(uint256 amount) external {
        // BAD: token.transfer(address(this), amount); // May silently fail with USDT
        // GOOD:
        token.safeTransferFrom(msg.sender, address(this), amount);
    }

    function withdraw(uint256 amount) external {
        token.safeTransfer(msg.sender, amount);
    }
}
```

---

## 7. Meta-Transactions and EIP-712

### 7.1 EIP-2612: Permit (Gasless Approval)

The standard ERC-20 `approve` + `transferFrom` flow requires two transactions. EIP-2612 `permit` lets users sign an off-chain message that the contract verifies, enabling single-transaction approval.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

contract MyToken is ERC20Permit {
    constructor()
        ERC20("MyToken", "MTK")
        ERC20Permit("MyToken")
    {
        _mint(msg.sender, 1000000 * 10 ** 18);
    }
}

// Usage: User signs permit off-chain, relayer submits the transaction
// User pays ZERO gas for approval!
```

```javascript
// Off-chain: user signs the permit
const { ethers } = require('ethers');

async function signPermit(token, signer, spender, value, deadline) {
  const nonce = await token.nonces(signer.address);
  const domain = {
    name: await token.name(),
    version: '1',
    chainId: (await signer.provider.getNetwork()).chainId,
    verifyingContract: await token.getAddress(),
  };

  const types = {
    Permit: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'nonce', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
    ],
  };

  const message = {
    owner: signer.address,
    spender,
    value,
    nonce,
    deadline,
  };

  const signature = await signer.signTypedData(domain, types, message);
  const { v, r, s } = ethers.Signature.from(signature);
  return { v, r, s };
}
```

### 7.2 EIP-2771: Trusted Forwarder

Enables gasless transactions by having a trusted relayer submit transactions on behalf of users:

```
Flow:
1. User signs a meta-transaction off-chain
2. Relayer submits it to a Forwarder contract
3. Forwarder verifies signature and calls target contract
4. Target contract reads msg.sender from calldata (not tx.origin)
5. User pays zero gas; relayer pays gas and gets reimbursed off-chain
```

---

## 8. Low-Level Calls

### 8.1 call, staticcall, delegatecall

```solidity
contract LowLevelCalls {
    // call: Execute function on another contract
    function doCall(address target, bytes calldata data) external payable returns (bytes memory) {
        (bool success, bytes memory result) = target.call{value: msg.value}(data);
        require(success, "Call failed");
        return result;
    }

    // staticcall: Read-only call (cannot modify state)
    function doStaticCall(address target, bytes calldata data) external view returns (bytes memory) {
        (bool success, bytes memory result) = target.staticcall(data);
        require(success, "Static call failed");
        return result;
    }

    // delegatecall: Execute code in caller's context (used by proxies)
    function doDelegateCall(address target, bytes calldata data) external returns (bytes memory) {
        (bool success, bytes memory result) = target.delegatecall(data);
        require(success, "Delegatecall failed");
        return result;
    }
}
```

### 8.2 abi.encode vs abi.encodePacked

```solidity
contract EncodingDifference {
    // abi.encode: Standard ABI encoding (padded to 32 bytes)
    // Safe for hashing, no collision risk
    function safeHash(address a, uint256 b) external pure returns (bytes32) {
        return keccak256(abi.encode(a, b));
    }

    // abi.encodePacked: Tightly packed encoding (no padding)
    // DANGER: Can have hash collisions!
    // abi.encodePacked("ab", "c") == abi.encodePacked("a", "bc")
    function unsafeHash(string calldata a, string calldata b) external pure returns (bytes32) {
        return keccak256(abi.encodePacked(a, b)); // COLLISION RISK with dynamic types!
    }
}
```

---

## 9. Clone Factory (EIP-1167 Minimal Proxy)

Deploy many identical contracts cheaply by pointing to a single implementation.

```solidity
import "@openzeppelin/contracts/proxy/Clones.sol";

contract VaultFactory {
    using Clones for address;

    address public immutable vaultImplementation;

    constructor(address _implementation) {
        vaultImplementation = _implementation;
    }

    function createVault(address token) external returns (address vault) {
        // Deploy a minimal proxy (only 45 bytes of bytecode!)
        // Costs ~36,000 gas instead of ~500,000+ for full deployment
        vault = vaultImplementation.clone();
        IVault(vault).initialize(token, msg.sender);
    }

    // Deterministic deployment with CREATE2
    function createVaultDeterministic(address token, bytes32 salt) external returns (address vault) {
        vault = vaultImplementation.cloneDeterministic(salt);
        IVault(vault).initialize(token, msg.sender);
    }

    // Predict address before deployment
    function predictVaultAddress(bytes32 salt) external view returns (address) {
        return vaultImplementation.predictDeterministicAddress(salt);
    }
}
```

---

## 10. Worked Problems

### Problem 1: Identify the Storage Collision

```solidity
// Implementation V1
contract TokenV1 {
    address public owner;    // Slot 0
    uint256 public totalSupply; // Slot 1
}

// Implementation V2 (BROKEN — storage collision)
contract TokenV2 {
    uint256 public totalSupply; // Slot 0 — WRONG! Was 'owner' in V1
    address public owner;       // Slot 1 — WRONG! Was 'totalSupply' in V1
    uint256 public newField;    // Slot 2
}

// Fix: V2 must APPEND new variables, never reorder existing ones
contract TokenV2Fixed {
    address public owner;       // Slot 0 (same as V1)
    uint256 public totalSupply; // Slot 1 (same as V1)
    uint256 public newField;    // Slot 2 (new, appended at end)
}
```

### Problem 2: Gas Optimize This Contract

```solidity
// BEFORE: ~180,000 gas for 10-item batch
contract BatchTransferBad {
    mapping(address => uint256) public balances;

    function batchTransfer(address[] memory recipients, uint256[] memory amounts) external {
        require(recipients.length == amounts.length, "Length mismatch");
        for (uint256 i = 0; i < recipients.length; i++) {
            require(balances[msg.sender] >= amounts[i], "Insufficient balance");
            balances[msg.sender] -= amounts[i];
            balances[recipients[i]] += amounts[i];
        }
    }
}

// AFTER: ~120,000 gas (33% savings)
contract BatchTransferGood {
    mapping(address => uint256) public balances;

    error InsufficientBalance();
    error LengthMismatch();

    function batchTransfer(address[] calldata recipients, uint256[] calldata amounts) external {
        if (recipients.length != amounts.length) revert LengthMismatch();

        uint256 senderBalance = balances[msg.sender]; // Cache storage read
        uint256 totalSent;

        for (uint256 i = 0; i < recipients.length;) {
            uint256 amount = amounts[i];
            totalSent += amount;
            balances[recipients[i]] += amount;
            unchecked { ++i; }
        }

        if (senderBalance < totalSent) revert InsufficientBalance();
        balances[msg.sender] = senderBalance - totalSent; // Single SSTORE
    }
}
```

---

## Appendix: Gas Cost Reference

```
COMMON EVM OPERATION GAS COSTS

Operation                          Gas Cost
--------------------------------------------
ADD / SUB / MUL                    3-5
SLOAD (cold)                       2,100
SLOAD (warm)                       100
SSTORE (0 -> non-zero)            20,000
SSTORE (non-zero -> non-zero)     2,900
SSTORE (non-zero -> 0, refund)    -4,800
CALL (cold address)                2,600
CALL (warm address)                100
LOG0                               375
LOG1                               750
LOG2                               1,125
KECCAK256 (per 32 bytes)           36
CALLDATACOPY (per 32 bytes)        3
MSTORE / MLOAD                    3
CREATE                             32,000
CREATE2                            32,000
SELFDESTRUCT                       5,000
Base transaction cost              21,000
Calldata zero byte                 4
Calldata non-zero byte             16
```
