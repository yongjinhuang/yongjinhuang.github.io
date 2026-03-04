# Chapter 4: Solidity Fundamentals

## Introduction

Solidity is the dominant programming language for Ethereum smart contracts. It compiles to EVM bytecode — a stack-based instruction set executed by every node in the network. This means every operation you write has a direct monetary cost measured in gas. There is no garbage collector, no runtime exception handler that gracefully logs and continues, and no way to patch deployed code without explicit upgrade mechanisms. If your contract has a bug, it is immutable on-chain forever (unless you designed for upgradeability from the start). Understanding Solidity deeply is not optional; it is the difference between secure, gas-efficient contracts and catastrophic exploits.

Solidity borrows syntax from C++, JavaScript, and Python, but the execution model is radically different from all three. State lives in persistent storage slots on the blockchain. Memory is wiped after every external call. The call stack is limited to 1024 frames. Integer overflow was silently wrapping until Solidity 0.8.0 added built-in checked arithmetic. Every design decision in Solidity exists because of the constraints of a decentralized, adversarial, gas-metered execution environment.

This chapter covers the full Solidity language from contract structure through storage layout, function mechanics, inheritance, error handling, and the special functions that make contracts interact with Ether. Every concept is tied to its gas implications and security consequences.

```
+--------------------------------------------------------------------------------+
|                        SOLIDITY LANGUAGE LANDSCAPE                              |
+--------------------------------------------------------------------------------+
|                                                                                |
|  TYPE SYSTEM                    STORAGE LAYOUT          CONTROL FLOW           |
|  +------------------------+   +-------------------+   +--------------------+   |
|  | uint8..uint256          |   | Slot 0, 1, 2...   |   | if / else           |   |
|  | int8..int256            |   | 32 bytes per slot  |   | for / while / do    |   |
|  | address / payable       |   | Packing rules      |   | require / revert    |   |
|  | bool (1 byte in slot)   |   | Dynamic: keccak256 |   | assert / custom err |   |
|  | bytes1..bytes32         |   | Mappings: no iter  |   | try / catch         |   |
|  | string / bytes          |   | Arrays: length+data|   | break / continue    |   |
|  | arrays / mappings       |   | memory vs calldata |   |                     |   |
|  | structs / enums         |   | vs storage vs stack|   |                     |   |
|  +------------------------+   +-------------------+   +--------------------+   |
|                                                                                |
|  VISIBILITY                     MODIFIERS              SPECIAL FUNCTIONS       |
|  +------------------------+   +-------------------+   +--------------------+   |
|  | public    (ABI + int)   |   | onlyOwner           |   | constructor()       |   |
|  | external  (ABI only)    |   | nonReentrant        |   | receive()           |   |
|  | internal  (int + child) |   | whenNotPaused       |   | fallback()          |   |
|  | private   (this only)   |   | Custom validation   |   | selfdestruct()      |   |
|  +------------------------+   | _; placeholder      |   | (deprecated 0.8.24) |   |
|                                +-------------------+   +--------------------+   |
|                                                                                |
|  INHERITANCE                    EVENTS & LOGS          ERROR HANDLING          |
|  +------------------------+   +-------------------+   +--------------------+   |
|  | is keyword              |   | emit Event(...)     |   | Panic(uint256)      |   |
|  | C3 linearization        |   | indexed (3 max)     |   | Error(string)       |   |
|  | virtual / override      |   | Topics + data       |   | Custom errors       |   |
|  | abstract / interface    |   | Cheaper than storage|   | revert CustomErr()  |   |
|  | super keyword           |   | 375 gas + 375/topic|   | try/catch external  |   |
|  +------------------------+   +-------------------+   +--------------------+   |
|                                                                                |
+--------------------------------------------------------------------------------+
```

---

## 1. Contract Structure

Every Solidity file follows a predictable structure: license identifier, compiler version pragma, imports, and then one or more contract definitions. Here is the anatomy of a complete contract:

```
+------------------------------------------+
|  // SPDX-License-Identifier: MIT          |
|  pragma solidity ^0.8.20;                 |
|                                          |
|  import "./IERC20.sol";                   |
|                                          |
|  contract MyToken is IERC20 {             |
|    +-- State Variables ---------------+  |
|    |  mapping(address => uint256)      |  |
|    +----------------------------------+  |
|    +-- Events -------------------------+  |
|    |  event Transfer(...)              |  |
|    +----------------------------------+  |
|    +-- Errors -------------------------+  |
|    |  error InsufficientBalance(...)   |  |
|    +----------------------------------+  |
|    +-- Modifiers ----------------------+  |
|    |  modifier onlyOwner() { ... }     |  |
|    +----------------------------------+  |
|    +-- Constructor --------------------+  |
|    |  constructor(...) { ... }         |  |
|    +----------------------------------+  |
|    +-- External Functions -------------+  |
|    |  function transfer(...) external  |  |
|    +----------------------------------+  |
|    +-- Internal Functions -------------+  |
|    |  function _update(...) internal   |  |
|    +----------------------------------+  |
|  }                                       |
+------------------------------------------+
```

### 1.1 A Complete Minimal Contract

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title SimpleStorage
/// @notice Stores and retrieves a single unsigned integer
contract SimpleStorage {
    // State variable — stored permanently on-chain in slot 0
    uint256 private storedValue;

    // Events — emitted to the transaction log
    event ValueChanged(address indexed setter, uint256 oldValue, uint256 newValue);

    // Custom error — cheaper than string revert messages
    error ValueUnchanged(uint256 currentValue);

    // Modifier — reusable precondition check
    modifier valueChanged(uint256 _newValue) {
        if (_newValue == storedValue) {
            revert ValueUnchanged(storedValue);
        }
        _;
    }

    /// @notice Store a new value
    /// @param _value The value to store
    function set(uint256 _value) external valueChanged(_value) {
        uint256 oldValue = storedValue;
        storedValue = _value;
        emit ValueChanged(msg.sender, oldValue, _value);
    }

    /// @notice Retrieve the stored value
    /// @return The current stored value
    function get() external view returns (uint256) {
        return storedValue;
    }
}
```

### 1.2 SPDX License and Pragma

The **SPDX license identifier** is required by the compiler (warning if missing). The **pragma** directive constrains which compiler versions can compile the file. The `^` symbol means "compatible with" — `^0.8.20` allows `0.8.20` through `0.8.x` but not `0.9.0`.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;       // Allows 0.8.20 to 0.8.x

// Alternative: exact version lock (common in production)
pragma solidity 0.8.24;        // Only this exact version

// Alternative: range
pragma solidity >=0.8.20 <0.9.0;  // Same as ^0.8.20
```

### 1.3 Imports

Solidity supports named imports, which are preferred for clarity:

```solidity
// Import everything (avoid in production)
import "./IERC20.sol";

// Named import (preferred)
import {IERC20} from "./IERC20.sol";

// Multiple named imports
import {IERC20, IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

// Aliased import
import {IERC20 as Token} from "./IERC20.sol";
```

---

## 2. Value Types

Value types are copied when assigned or passed as arguments. They fit in a single EVM word (32 bytes) or smaller.

### 2.1 Integers

```
+--------------------------------------------------------------+
|                    INTEGER TYPES                              |
+--------------------------------------------------------------+
|  uint8    =  0 to 255                     (1 byte)           |
|  uint16   =  0 to 65,535                  (2 bytes)          |
|  uint32   =  0 to 4,294,967,295          (4 bytes)           |
|  uint64   =  0 to 18,446,744,073,709,551,615  (8 bytes)     |
|  uint128  =  0 to 2^128 - 1              (16 bytes)          |
|  uint256  =  0 to 2^256 - 1              (32 bytes)          |
|                                                              |
|  int8     = -128 to 127                   (1 byte)           |
|  int256   = -(2^255) to (2^255 - 1)      (32 bytes)         |
|                                                              |
|  uint  = alias for uint256                                   |
|  int   = alias for int256                                    |
+--------------------------------------------------------------+
|  OVERFLOW BEHAVIOR (Solidity >= 0.8.0):                      |
|  Arithmetic overflow/underflow REVERTS by default.           |
|  Use `unchecked { }` to restore wrapping behavior.           |
+--------------------------------------------------------------+
```

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract IntegerDemo {
    function checkedOverflow() external pure returns (uint8) {
        uint8 x = 255;
        // This REVERTS in Solidity 0.8+ with Panic(0x11)
        return x + 1;
    }

    function uncheckedOverflow() external pure returns (uint8) {
        uint8 x = 255;
        unchecked {
            // This wraps to 0 — no revert
            return x + 1;
        }
    }

    function gasSavingsWithUnchecked() external pure returns (uint256 sum) {
        // When you are certain overflow is impossible (e.g., loop counter),
        // unchecked saves gas by skipping overflow checks
        for (uint256 i = 0; i < 100;) {
            sum += i;
            unchecked { ++i; }  // i cannot overflow with < 100 iterations
        }
    }
}
```

### 2.2 Address Types

The **address** type holds a 20-byte Ethereum address. **address payable** is the same but adds `.transfer()` and `.send()` methods for sending Ether.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract AddressDemo {
    address public owner;
    address payable public treasury;

    constructor(address payable _treasury) {
        owner = msg.sender;          // msg.sender is address
        treasury = _treasury;
    }

    function getBalance() external view returns (uint256) {
        // .balance returns the ETH balance in wei
        return address(this).balance;
    }

    function withdraw() external {
        require(msg.sender == owner, "Not owner");

        // Three ways to send ETH:
        // 1. transfer() — forwards 2300 gas, reverts on failure
        // treasury.transfer(address(this).balance);

        // 2. send() — forwards 2300 gas, returns bool
        // bool success = treasury.send(address(this).balance);

        // 3. call() — forwards all gas, returns (bool, bytes) [RECOMMENDED]
        (bool success, ) = treasury.call{value: address(this).balance}("");
        require(success, "Transfer failed");
    }

    // Convert address to address payable
    function makePayable(address _addr) external pure returns (address payable) {
        return payable(_addr);
    }
}
```

### 2.3 Boolean, Fixed-Size Bytes, and Enums

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract ValueTypesDemo {
    // Boolean — 1 byte in storage, but occupies a full slot unless packed
    bool public isActive = true;

    // Fixed-size byte arrays — bytes1 through bytes32
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN");
    bytes4 public constant TRANSFER_SELECTOR = bytes4(keccak256("transfer(address,uint256)"));

    // Enums — internally represented as uint8
    enum Status { Pending, Active, Cancelled, Completed }
    Status public currentStatus;

    function setStatus(Status _status) external {
        currentStatus = _status;
    }

    // Type conversions
    function conversions() external pure returns (uint256, bytes32) {
        // address to uint160 to uint256
        address addr = 0x1234567890AbcdEF1234567890aBcdef12345678;
        uint256 addrAsUint = uint256(uint160(addr));

        // uint256 to bytes32
        bytes32 asBytes = bytes32(addrAsUint);

        return (addrAsUint, asBytes);
    }
}
```

---

## 3. Reference Types and Data Locations

This is the single most important concept in Solidity that separates beginners from competent developers. Reference types (arrays, structs, mappings, strings, bytes) do not fit in a single 32-byte word. They require a **data location** annotation: `storage`, `memory`, `calldata`, or they live on the stack.

### 3.1 Data Location Overview

```
+--------------------------------------------------------------------------------+
|                        DATA LOCATIONS IN THE EVM                                |
+--------------------------------------------------------------------------------+
|                                                                                |
|  STORAGE                          MEMORY                                       |
|  +----------------------------+  +----------------------------+                |
|  | Persistent (on-chain)       |  | Temporary (per call)       |                |
|  | 2^256 slots, 32 bytes each |  | Byte-addressable           |                |
|  | SSTORE: 20,000 gas (cold)  |  | MSTORE: 3 gas + expansion  |                |
|  | SLOAD:   2,100 gas (cold)  |  | MLOAD:  3 gas              |                |
|  | Most expensive operations   |  | Expands quadratically      |                |
|  | State variables live here   |  | Function-local variables   |                |
|  +----------------------------+  +----------------------------+                |
|                                                                                |
|  CALLDATA                         STACK                                        |
|  +----------------------------+  +----------------------------+                |
|  | Read-only input data        |  | 1024 depth limit           |                |
|  | Cannot be modified          |  | Holds local value types    |                |
|  | Cheapest for external args  |  | Free to use (3 gas/op)     |                |
|  | Passed by the caller        |  | "Stack too deep" at >16    |                |
|  | CALLDATALOAD: 3 gas         |  | local variables            |                |
|  +----------------------------+  +----------------------------+                |
|                                                                                |
|  ASSIGNMENT RULES:                                                             |
|  storage -> storage  =  Reference (same pointer)                               |
|  storage -> memory   =  Copy (independent)                                     |
|  memory  -> storage  =  Copy (writes to chain)                                 |
|  memory  -> memory   =  Reference (same pointer)                               |
|  calldata -> memory  =  Copy                                                   |
|  calldata -> storage =  Copy                                                   |
+--------------------------------------------------------------------------------+
```

### 3.2 Arrays

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract ArrayDemo {
    // Dynamic array in storage
    uint256[] public dynamicArray;

    // Fixed-size array in storage
    uint256[5] public fixedArray;

    function arrayOperations() external {
        // Push appends to dynamic arrays (storage only)
        dynamicArray.push(100);
        dynamicArray.push(200);
        dynamicArray.push(300);

        // Pop removes last element
        dynamicArray.pop();  // removes 300

        // Length
        uint256 len = dynamicArray.length;  // 2

        // Delete resets to default value but does NOT shrink the array
        delete dynamicArray[0];  // sets index 0 to 0, length still 2

        // Prevent unused variable warning
        len;
    }

    function memoryArrays() external pure returns (uint256[] memory) {
        // Memory arrays must have fixed size at creation
        uint256[] memory result = new uint256[](3);
        result[0] = 10;
        result[1] = 20;
        result[2] = 30;
        // result.push(40);  // COMPILE ERROR — no push on memory arrays
        return result;
    }

    // calldata is cheapest for external function inputs
    function sum(uint256[] calldata values) external pure returns (uint256 total) {
        for (uint256 i = 0; i < values.length;) {
            total += values[i];
            unchecked { ++i; }
        }
    }
}
```

### 3.3 Mappings

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract MappingDemo {
    // Simple mapping
    mapping(address => uint256) public balances;

    // Nested mapping
    mapping(address => mapping(address => uint256)) public allowances;

    // Mapping with struct value
    struct UserInfo {
        uint256 balance;
        uint256 lastDeposit;
        bool isActive;
    }
    mapping(address => UserInfo) public users;

    function deposit() external payable {
        // Mappings return default value (0) for non-existent keys
        balances[msg.sender] += msg.value;

        users[msg.sender] = UserInfo({
            balance: balances[msg.sender],
            lastDeposit: block.timestamp,
            isActive: true
        });
    }

    function approve(address spender, uint256 amount) external {
        allowances[msg.sender][spender] = amount;
    }

    // IMPORTANT: You CANNOT iterate over a mapping.
    // If you need iteration, maintain a separate array of keys.
    address[] public userAddresses;

    function registerUser() external {
        if (!users[msg.sender].isActive) {
            userAddresses.push(msg.sender);
        }
        users[msg.sender].isActive = true;
    }
}
```

### 3.4 Structs and Data Location Pitfalls

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract StructLocationDemo {
    struct Player {
        uint256 score;
        uint256 level;
        bool active;
    }

    mapping(uint256 => Player) public players;

    // CORRECT: storage reference modifies the original
    function levelUp(uint256 playerId) external {
        Player storage player = players[playerId];
        player.level += 1;       // Writes directly to storage
        player.score += 100;     // Writes directly to storage
    }

    // BUG: memory copy does NOT modify storage
    function levelUpBroken(uint256 playerId) external {
        Player memory player = players[playerId];  // Creates a COPY
        player.level += 1;       // Modifies the copy only
        player.score += 100;     // Modifies the copy only
        // Changes are LOST when function returns — storage is unchanged
    }

    // CORRECT if you want to read, modify, then write back
    function levelUpExplicit(uint256 playerId) external {
        Player memory player = players[playerId];  // Copy to memory
        player.level += 1;
        player.score += 100;
        players[playerId] = player;  // Write entire struct back to storage
    }
}
```

---

## 4. Functions

### 4.1 Visibility

```
+--------------------------------------------------------------+
|                 FUNCTION VISIBILITY                           |
+--------------------------------------------------------------+
|                                                              |
|  public    - Part of ABI (callable externally)               |
|             - Also callable internally                        |
|             - Generates an automatic getter for state vars   |
|                                                              |
|  external  - Part of ABI (callable externally only)          |
|             - Cannot be called internally with `this.f()`    |
|               directly (use this.f() if needed, but costly)  |
|             - More gas-efficient for large calldata args     |
|                                                              |
|  internal  - NOT part of ABI                                 |
|             - Callable from this contract and derived ones   |
|             - Default for state variables                    |
|                                                              |
|  private   - NOT part of ABI                                 |
|             - Only callable from this contract               |
|             - NOT callable from derived contracts             |
|             - Still visible on-chain (nothing is truly       |
|               private on a public blockchain)                |
|                                                              |
+--------------------------------------------------------------+
```

### 4.2 State Mutability

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract FunctionDemo {
    uint256 public counter;

    // No mutability keyword — reads AND writes state
    function increment() external {
        counter += 1;
    }

    // view — reads state but does not modify it
    function getCounter() external view returns (uint256) {
        return counter;
    }

    // pure — neither reads nor modifies state
    function add(uint256 a, uint256 b) external pure returns (uint256) {
        return a + b;
    }

    // payable — can receive ETH with the call
    function deposit() external payable {
        counter += msg.value;
    }

    // Named return values (assigned, no explicit return needed)
    function getInfo() external view returns (uint256 value, bool isPositive) {
        value = counter;
        isPositive = counter > 0;
        // Implicit return of named variables
    }

    // Multiple return values
    function multiReturn() external pure returns (uint256, bool, address) {
        return (42, true, address(0));
    }
}
```

### 4.3 Function Selectors

Every external/public function is identified by the first 4 bytes of the keccak256 hash of its signature. This is how the EVM routes calls.

```
+--------------------------------------------------------------+
|  FUNCTION SELECTOR COMPUTATION                               |
+--------------------------------------------------------------+
|                                                              |
|  Signature:  "transfer(address,uint256)"                     |
|  Keccak256:  0xa9059cbb2ab09eb219583f4a59a5d0623ade346d...  |
|  Selector:   0xa9059cbb  (first 4 bytes)                     |
|                                                              |
|  When you call contract.transfer(to, amount):                |
|  Calldata =  0xa9059cbb                                      |
|              0000...{to padded to 32 bytes}                   |
|              0000...{amount padded to 32 bytes}               |
|                                                              |
|  The EVM checks: if calldata[0:4] == 0xa9059cbb             |
|                   then jump to transfer function              |
+--------------------------------------------------------------+
```

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract SelectorDemo {
    // You can compute selectors at compile time
    bytes4 public constant TRANSFER_SELECTOR =
        bytes4(keccak256("transfer(address,uint256)"));
    // Result: 0xa9059cbb

    // Or use the built-in selector property
    function getSelector() external pure returns (bytes4) {
        return this.getSelector.selector;
    }
}
```

---

## 5. Storage Layout and Packing

Understanding how the EVM lays out storage is essential for gas optimization.

### 5.1 Slot Rules

```
+--------------------------------------------------------------------------------+
|                         STORAGE LAYOUT RULES                                    |
+--------------------------------------------------------------------------------+
|                                                                                |
|  Rule 1: Each state variable occupies slots starting from slot 0.              |
|  Rule 2: Each slot is 32 bytes (256 bits).                                     |
|  Rule 3: Variables are packed into a slot if they fit.                          |
|  Rule 4: If a variable does not fit in the remaining slot space,               |
|          it starts a new slot.                                                  |
|  Rule 5: Structs and arrays always start a new slot.                           |
|  Rule 6: Struct members follow the same packing rules internally.              |
|                                                                                |
|  EXAMPLE — Unpacked (3 slots = 3 x 20,000 gas on cold write):                 |
|                                                                                |
|  Slot 0: [uint256 balance____________________________________________]         |
|  Slot 1: [uint8 status__|_______________255 bits wasted_____________]          |
|  Slot 2: [address owner_|_____________96 bits wasted________________]          |
|                                                                                |
|  EXAMPLE — Packed (2 slots = saves 20,000 gas):                                |
|                                                                                |
|  Slot 0: [uint256 balance____________________________________________]         |
|  Slot 1: [address owner (160)|uint8 status (8)|___88 bits padding___]          |
|                                                                                |
+--------------------------------------------------------------------------------+
```

### 5.2 Dynamic Types in Storage

```
+--------------------------------------------------------------+
|  DYNAMIC ARRAY STORAGE:                                      |
|                                                              |
|  State declaration: uint256[] public arr;  (at slot p)       |
|                                                              |
|  Slot p:          stores arr.length                          |
|  keccak256(p):    stores arr[0]                              |
|  keccak256(p)+1:  stores arr[1]                              |
|  keccak256(p)+n:  stores arr[n]                              |
+--------------------------------------------------------------+
|  MAPPING STORAGE:                                            |
|                                                              |
|  State declaration: mapping(K => V) map; (at slot p)        |
|                                                              |
|  Slot p:          UNUSED (nothing stored here)               |
|  keccak256(key . p):  stores map[key]                        |
|                                                              |
|  For nested mapping(K1 => mapping(K2 => V)):                 |
|  keccak256(key2 . keccak256(key1 . p))                       |
+--------------------------------------------------------------+
```

### 5.3 Gas Savings from Storage Packing

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// BAD: Uses 3 storage slots
contract UnpackedStorage {
    uint8 public status;     // Slot 0 — wastes 31 bytes
    uint256 public balance;  // Slot 1 — full slot (cannot pack with uint8 above)
    address public owner;    // Slot 2

    // Writing all three: ~60,000+ gas (3 cold SSTORE)
    function initialize(uint8 _status, uint256 _balance, address _owner) external {
        status = _status;
        balance = _balance;
        owner = _owner;
    }
}

// GOOD: Uses 2 storage slots
contract PackedStorage {
    uint256 public balance;  // Slot 0 — full slot
    address public owner;    // Slot 1 — 20 bytes
    uint8 public status;     // Slot 1 — 1 byte (packed with owner)

    // Writing all three: ~40,000+ gas (2 cold SSTORE)
    function initialize(uint256 _balance, address _owner, uint8 _status) external {
        balance = _balance;
        owner = _owner;
        status = _status;
    }
}

// STRUCT PACKING
contract StructPacking {
    // BAD: 3 slots per struct
    struct UserBad {
        uint8 role;        // Slot N
        uint256 balance;   // Slot N+1 (cannot fit with uint8)
        address wallet;    // Slot N+2
    }

    // GOOD: 2 slots per struct
    struct UserGood {
        uint256 balance;   // Slot N — full slot
        address wallet;    // Slot N+1 — 20 bytes
        uint8 role;        // Slot N+1 — packed with wallet (1 byte)
    }

    mapping(uint256 => UserGood) public users;
}
```

---

## 6. Control Flow

### 6.1 Conditionals and Loops

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract ControlFlowDemo {
    // Standard if/else
    function classify(uint256 value) external pure returns (string memory) {
        if (value == 0) {
            return "zero";
        } else if (value < 100) {
            return "small";
        } else {
            return "large";
        }
    }

    // Ternary operator
    function max(uint256 a, uint256 b) external pure returns (uint256) {
        return a > b ? a : b;
    }

    // For loop with gas-efficient counter
    function sumArray(uint256[] calldata values) external pure returns (uint256 total) {
        uint256 length = values.length;  // Cache length to avoid repeated CALLDATALOAD
        for (uint256 i = 0; i < length;) {
            total += values[i];
            unchecked { ++i; }  // Pre-increment in unchecked — saves ~60 gas/iteration
        }
    }

    // While loop
    function findFirstNonZero(uint256[] calldata arr) external pure returns (uint256 index) {
        uint256 i = 0;
        while (i < arr.length && arr[i] == 0) {
            unchecked { ++i; }
        }
        return i;
    }
}
```

### 6.2 Require, Revert, and Assert

```
+--------------------------------------------------------------+
|  VALIDATION FUNCTIONS — When to use which                    |
+--------------------------------------------------------------+
|                                                              |
|  require(condition, "message")                               |
|    - Validate inputs and preconditions                       |
|    - Reverts with Error(string)                              |
|    - Refunds remaining gas                                   |
|    - Use for: input validation, access control               |
|                                                              |
|  revert("message")  /  revert CustomError()                  |
|    - Unconditional revert                                    |
|    - Use for: complex conditional logic                      |
|    - Custom errors save gas                                  |
|                                                              |
|  assert(condition)                                           |
|    - Check invariants that should NEVER be false             |
|    - Reverts with Panic(uint256) error code                  |
|    - Use for: internal logic errors, post-conditions         |
|    - If assert fails, you have a BUG                         |
|                                                              |
+--------------------------------------------------------------+
```

### 6.3 Custom Errors vs String Errors (Gas Comparison)

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract ErrorDemo {
    // Custom error — stores only 4-byte selector + parameters
    error Unauthorized(address caller, address required);
    error InsufficientBalance(uint256 available, uint256 required);
    error ZeroAddress();

    address public owner;
    mapping(address => uint256) public balances;

    constructor() {
        owner = msg.sender;
    }

    // STRING ERROR: require with string message
    // Gas cost: ~2,500+ gas for the string encoding
    // Stores: Error(string) = 0x08c379a0 + ABI-encoded string
    function withdrawString(uint256 amount) external {
        require(msg.sender == owner, "Unauthorized: caller is not the owner");
        require(balances[msg.sender] >= amount, "Insufficient balance for withdrawal");
        balances[msg.sender] -= amount;
    }

    // CUSTOM ERROR: revert with custom error
    // Gas cost: ~100-200 gas for the error encoding
    // Stores: Just the 4-byte selector + packed parameters
    function withdrawCustom(uint256 amount) external {
        if (msg.sender != owner) {
            revert Unauthorized(msg.sender, owner);
        }
        if (balances[msg.sender] < amount) {
            revert InsufficientBalance(balances[msg.sender], amount);
        }
        balances[msg.sender] -= amount;
    }
}
```

```
+--------------------------------------------------------------+
|  GAS COMPARISON: String vs Custom Error                      |
+--------------------------------------------------------------+
|                                                              |
|  String error "Unauthorized: caller is not the owner"        |
|    Deployment:  More bytecode (~40 bytes for the string)     |
|    Revert data: 0x08c379a0 + offset + length + string bytes  |
|    Encoding:    ~2,500 gas                                   |
|                                                              |
|  Custom error Unauthorized(address, address)                 |
|    Deployment:  Less bytecode (~4 bytes selector)            |
|    Revert data: 0x... (4 bytes) + 2 * 32 bytes params       |
|    Encoding:    ~100-200 gas                                 |
|                                                              |
|  SAVINGS: Custom errors save gas on BOTH deployment          |
|           AND on every revert. Use them everywhere.          |
+--------------------------------------------------------------+
```

---

## 7. Events and Logs

Events are the cheapest way to store data that does not need to be read by on-chain contracts. They are stored in transaction logs (not in contract storage) and are accessible off-chain via node RPC.

### 7.1 Event Declaration and Emission

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract EventDemo {
    // Up to 3 indexed parameters (stored as topics for efficient filtering)
    // Non-indexed parameters are ABI-encoded in the data field
    event Transfer(
        address indexed from,
        address indexed to,
        uint256 amount          // Not indexed — stored in data
    );

    event Approval(
        address indexed owner,
        address indexed spender,
        uint256 value
    );

    // Anonymous event — no topic[0] signature hash, allows 4 indexed params
    event Debug(uint256 indexed value) anonymous;

    mapping(address => uint256) public balances;

    function transfer(address to, uint256 amount) external {
        require(balances[msg.sender] >= amount, "Insufficient balance");
        balances[msg.sender] -= amount;
        balances[to] += amount;

        // Emit writes to the transaction log
        emit Transfer(msg.sender, to, amount);
    }
}
```

### 7.2 Log Costs vs Storage Costs

```
+--------------------------------------------------------------+
|  COST COMPARISON: Events vs Storage                          |
+--------------------------------------------------------------+
|                                                              |
|  EVENT (LOG):                                                |
|    Base cost:           375 gas                              |
|    Per topic:           375 gas                              |
|    Per byte of data:      8 gas                              |
|    Total for Transfer:  ~1,500 gas                           |
|                                                              |
|  STORAGE (SSTORE):                                           |
|    Cold write (0 -> non-zero):   20,000 gas                  |
|    Warm write (non-zero change):  5,000 gas                  |
|    Cold read (SLOAD):             2,100 gas                  |
|                                                              |
|  CONCLUSION: Events are 10-100x cheaper than storage.        |
|  Use events for historical data, audit trails, and anything  |
|  that does not need to be read by other contracts.           |
+--------------------------------------------------------------+
```

### 7.3 Indexed Parameters and Topics

```
+--------------------------------------------------------------+
|  EVENT LOG STRUCTURE                                         |
+--------------------------------------------------------------+
|                                                              |
|  topics[0] = keccak256("Transfer(address,address,uint256)")  |
|  topics[1] = from address (indexed)                          |
|  topics[2] = to address (indexed)                            |
|  data       = ABI-encoded amount (not indexed)               |
|                                                              |
|  Indexing rules:                                             |
|  - Value types (address, uint, bool): stored directly        |
|  - Reference types (string, bytes, arrays): keccak256 hash   |
|    stored as topic (original value lost — use data instead)  |
|  - Maximum 3 indexed params (4 for anonymous events)         |
|  - topic[0] is always the event signature hash               |
|    (unless the event is anonymous)                           |
+--------------------------------------------------------------+
```

---

## 8. Inheritance and Interfaces

### 8.1 Single and Multiple Inheritance

Solidity supports multiple inheritance with **C3 linearization** to resolve diamond inheritance conflicts.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Base contract
contract Ownable {
    address public owner;

    error NotOwner(address caller);

    modifier onlyOwner() {
        if (msg.sender != owner) {
            revert NotOwner(msg.sender);
        }
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    // virtual — can be overridden by child contracts
    function transferOwnership(address newOwner) public virtual onlyOwner {
        owner = newOwner;
    }
}

// Another base contract
contract Pausable {
    bool public paused;

    error ContractPaused();
    error ContractNotPaused();

    event Paused(address account);
    event Unpaused(address account);

    modifier whenNotPaused() {
        if (paused) revert ContractPaused();
        _;
    }

    modifier whenPaused() {
        if (!paused) revert ContractNotPaused();
        _;
    }

    function _pause() internal virtual {
        paused = true;
        emit Paused(msg.sender);
    }

    function _unpause() internal virtual {
        paused = false;
        emit Unpaused(msg.sender);
    }
}

// Multiple inheritance — order matters for C3 linearization
// Most base-like to most derived: Ownable, Pausable, MyContract
contract MyContract is Ownable, Pausable {
    uint256 public value;

    // override — must specify all base contracts being overridden
    function transferOwnership(address newOwner) public override onlyOwner {
        require(newOwner != address(0), "Zero address");
        owner = newOwner;
    }

    function setValue(uint256 _value) external onlyOwner whenNotPaused {
        value = _value;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
```

### 8.2 C3 Linearization

```
+--------------------------------------------------------------+
|  C3 LINEARIZATION — Method Resolution Order (MRO)           |
+--------------------------------------------------------------+
|                                                              |
|  contract A { function f() virtual ... }                     |
|  contract B is A { function f() override virtual ... }       |
|  contract C is A { function f() override virtual ... }       |
|  contract D is B, C { function f() override(B, C) ... }     |
|                                                              |
|  Linearization of D:  D -> C -> B -> A                       |
|                                                              |
|  Rule: List parents right-to-left, most base-like first.    |
|  "is B, C" means C is checked before B.                     |
|                                                              |
|  super.f() in D calls C.f()                                 |
|  super.f() in C calls B.f()                                 |
|  super.f() in B calls A.f()                                 |
+--------------------------------------------------------------+
```

### 8.3 Abstract Contracts and Interfaces

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Abstract contract — cannot be deployed, has unimplemented functions
abstract contract ERC20Base {
    function name() public view virtual returns (string memory);
    function symbol() public view virtual returns (string memory);
    function decimals() public view virtual returns (uint8) {
        return 18;  // Default implementation — can be overridden
    }
}

// Interface — pure contract specification
// No state variables, no constructor, no function bodies
// All functions are implicitly external and virtual
interface IERC20 {
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    function totalSupply() external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

// Concrete implementation
contract MyToken is ERC20Base, IERC20 {
    mapping(address => uint256) private _balances;
    mapping(address => mapping(address => uint256)) private _allowances;
    uint256 private _totalSupply;

    constructor(uint256 initialSupply) {
        _totalSupply = initialSupply;
        _balances[msg.sender] = initialSupply;
        emit Transfer(address(0), msg.sender, initialSupply);
    }

    function name() public pure override returns (string memory) {
        return "MyToken";
    }

    function symbol() public pure override returns (string memory) {
        return "MTK";
    }

    function totalSupply() external view override returns (uint256) {
        return _totalSupply;
    }

    function balanceOf(address account) external view override returns (uint256) {
        return _balances[account];
    }

    function transfer(address to, uint256 amount) external override returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function allowance(address _owner, address spender) external view override returns (uint256) {
        return _allowances[_owner][spender];
    }

    function approve(address spender, uint256 amount) external override returns (bool) {
        _allowances[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external override returns (bool) {
        uint256 currentAllowance = _allowances[from][msg.sender];
        require(currentAllowance >= amount, "Insufficient allowance");
        _allowances[from][msg.sender] = currentAllowance - amount;
        _transfer(from, to, amount);
        return true;
    }

    function _transfer(address from, address to, uint256 amount) internal {
        require(from != address(0), "Transfer from zero");
        require(to != address(0), "Transfer to zero");
        require(_balances[from] >= amount, "Insufficient balance");
        _balances[from] -= amount;
        _balances[to] += amount;
        emit Transfer(from, to, amount);
    }
}
```

---

## 9. Special Functions

### 9.1 Constructor

The constructor runs once during contract deployment. It is not stored as part of the deployed bytecode.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract ConstructorDemo {
    address public immutable owner;
    uint256 public immutable createdAt;
    string public name;

    // Constructor — runs once at deployment
    // immutable variables MUST be set here
    constructor(string memory _name) {
        owner = msg.sender;
        createdAt = block.timestamp;
        name = _name;
    }
}

// Constructor with inheritance
contract Base {
    uint256 public baseValue;
    constructor(uint256 _val) {
        baseValue = _val;
    }
}

contract Child is Base {
    // Pass arguments to parent constructor
    constructor(uint256 _val) Base(_val * 2) {
        // Child-specific initialization
    }
}
```

### 9.2 receive() and fallback()

```
+--------------------------------------------------------------+
|  RECEIVE AND FALLBACK — ETH Receiving Logic                  |
+--------------------------------------------------------------+
|                                                              |
|  Transaction arrives at contract                              |
|        |                                                     |
|        v                                                     |
|  Is msg.data empty?                                          |
|   /          \                                               |
|  YES          NO                                             |
|   |            |                                             |
|   v            v                                             |
|  receive()   Does function selector match?                   |
|  exists?      /            \                                 |
|  /    \      YES            NO                               |
| YES   NO      |             |                                |
|  |     |      v             v                                |
|  v     |   Execute        fallback()                         |
| Run    |   matched        exists?                            |
| receive|   function       /     \                            |
|        v                YES      NO                          |
|     fallback()           |        |                          |
|     exists?              v        v                          |
|     /     \            Run      REVERT                       |
|   YES      NO         fallback                               |
|    |        |                                                |
|    v        v                                                |
|  Run      REVERT                                             |
|  fallback                                                    |
+--------------------------------------------------------------+
```

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract EtherReceiver {
    event Received(address sender, uint256 amount);
    event FallbackCalled(address sender, uint256 amount, bytes data);

    // receive() — called when msg.data is empty and ETH is sent
    // Must be external payable, cannot have arguments or return values
    receive() external payable {
        emit Received(msg.sender, msg.value);
    }

    // fallback() — called when no function matches or msg.data is non-empty
    // Can optionally be payable to accept ETH with unknown calldata
    fallback(bytes calldata input) external payable returns (bytes memory) {
        emit FallbackCalled(msg.sender, msg.value, input);
        return "";
    }

    function getBalance() external view returns (uint256) {
        return address(this).balance;
    }
}
```

### 9.3 Comparison of Special Functions

```
+--------------------------------------------------------------+
|  SPECIAL FUNCTION COMPARISON                                 |
+--------------------------------------------------------------+
|  Function      | When Called           | Can Receive ETH?    |
|  --------------|----------------------|---------------------|
|  constructor() | Deployment only       | Yes (if payable)    |
|  receive()     | Empty calldata + ETH  | Yes (always payable)|
|  fallback()    | No match / non-empty  | Only if payable     |
|                | calldata              |                     |
+--------------------------------------------------------------+
|                                                              |
|  IMPORTANT NOTES:                                            |
|  - A contract without receive() or payable fallback()        |
|    CANNOT receive plain ETH transfers.                       |
|  - It CAN still receive ETH via selfdestruct() from another |
|    contract or as coinbase reward (block.coinbase).          |
|  - receive() has 2300 gas limit when called via .transfer()  |
|    or .send() — avoid state changes in receive().            |
+--------------------------------------------------------------+
```

---

## 10. Error Handling

### 10.1 try/catch for External Calls

The `try/catch` mechanism only works with **external function calls** and **contract creation**.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IExternalContract {
    function riskyOperation(uint256 value) external returns (uint256);
}

contract ErrorHandlingDemo {
    event OperationSucceeded(uint256 result);
    event OperationFailed(string reason);
    event OperationPanicked(uint256 errorCode);
    event OperationFailedLowLevel(bytes data);

    function safeCall(
        address target,
        uint256 value
    ) external returns (bool success) {
        try IExternalContract(target).riskyOperation(value) returns (uint256 result) {
            // Success path
            emit OperationSucceeded(result);
            return true;
        } catch Error(string memory reason) {
            // Catches require(false, "reason") and revert("reason")
            emit OperationFailed(reason);
            return false;
        } catch Panic(uint256 errorCode) {
            // Catches assert failures, overflow, division by zero
            // Error codes: 0x01=assert, 0x11=overflow, 0x12=div-by-zero
            //              0x21=invalid enum, 0x22=bad storage encoding
            //              0x31=pop on empty, 0x32=out-of-bounds
            //              0x41=too much memory, 0x51=zero-initialized fn ptr
            emit OperationPanicked(errorCode);
            return false;
        } catch (bytes memory lowLevelData) {
            // Catches custom errors and anything else
            emit OperationFailedLowLevel(lowLevelData);
            return false;
        }
    }
}
```

### 10.2 Panic Error Codes

```
+--------------------------------------------------------------+
|  PANIC ERROR CODES                                           |
+--------------------------------------------------------------+
|  Code   | Cause                                              |
|  -------|---------------------------------------------------|
|  0x00   | Generic / compiler-inserted panic                  |
|  0x01   | assert(false) — invariant violation                |
|  0x11   | Arithmetic overflow/underflow                      |
|  0x12   | Division or modulo by zero                         |
|  0x21   | Converting invalid value to enum                   |
|  0x22   | Incorrectly encoded storage byte array             |
|  0x31   | .pop() on an empty array                           |
|  0x32   | Array/bytes index out of bounds                    |
|  0x41   | Allocating too much memory                         |
|  0x51   | Calling zero-initialized internal function pointer |
+--------------------------------------------------------------+
```

### 10.3 ABI Encoding of Revert Data

```
+--------------------------------------------------------------+
|  REVERT DATA ENCODING                                        |
+--------------------------------------------------------------+
|                                                              |
|  Error(string):                                              |
|  0x08c379a0                              (4-byte selector)   |
|  + ABI-encoded string                                        |
|                                                              |
|  Panic(uint256):                                             |
|  0x4e487b71                              (4-byte selector)   |
|  + ABI-encoded uint256 error code                            |
|                                                              |
|  Custom error Unauthorized(address):                         |
|  0x8e4a23d6                              (4-byte selector)   |
|  + ABI-encoded address parameter                             |
|                                                              |
|  The 4-byte selector is the first 4 bytes of:               |
|  keccak256("Error(string)")        = 0x08c379a0             |
|  keccak256("Panic(uint256)")       = 0x4e487b71             |
|  keccak256("Unauthorized(address)")= 0x8e4a23d6             |
+--------------------------------------------------------------+
```

---

## 11. Worked Problems

These are common Solidity bugs that appear in real audits and interviews. Each demonstrates a fundamental misunderstanding of how Solidity works.

### Problem 1: The Reentrancy Trap

**Bug**: Updating state after an external call allows the called contract to re-enter and drain funds.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// VULNERABLE — DO NOT USE
contract VulnerableVault {
    mapping(address => uint256) public balances;

    function deposit() external payable {
        balances[msg.sender] += msg.value;
    }

    function withdraw() external {
        uint256 amount = balances[msg.sender];
        require(amount > 0, "No balance");

        // BUG: External call BEFORE state update
        (bool success, ) = msg.sender.call{value: amount}("");
        require(success, "Transfer failed");

        // This runs AFTER the external call
        // If msg.sender is a contract with a receive() that calls withdraw() again,
        // balances[msg.sender] is still the original amount — drained repeatedly
        balances[msg.sender] = 0;
    }
}

// FIXED — Checks-Effects-Interactions pattern
contract SafeVault {
    mapping(address => uint256) public balances;

    function deposit() external payable {
        balances[msg.sender] += msg.value;
    }

    function withdraw() external {
        uint256 amount = balances[msg.sender];
        require(amount > 0, "No balance");

        // EFFECT: Update state BEFORE external call
        balances[msg.sender] = 0;

        // INTERACTION: External call AFTER state update
        (bool success, ) = msg.sender.call{value: amount}("");
        require(success, "Transfer failed");
    }
}
```

**Explanation**: The Checks-Effects-Interactions (CEI) pattern requires: (1) check preconditions, (2) update all state, (3) then make external calls. If the attacker re-enters, the state already reflects the withdrawal and the second call to `withdraw()` sees a zero balance.

### Problem 2: Wrong Visibility

**Bug**: A function meant to be internal is accidentally left as `public`, allowing anyone to call it.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// VULNERABLE
contract BrokenMint {
    mapping(address => uint256) public balances;
    uint256 public totalSupply;
    address public owner;

    constructor() {
        owner = msg.sender;
    }

    // BUG: _mint should be internal but is public
    // Anyone can call this and mint tokens to themselves
    function _mint(address to, uint256 amount) public {
        balances[to] += amount;
        totalSupply += amount;
    }

    function adminMint(address to, uint256 amount) external {
        require(msg.sender == owner, "Not owner");
        _mint(to, amount);
    }
}

// FIXED
contract FixedMint {
    mapping(address => uint256) public balances;
    uint256 public totalSupply;
    address public owner;

    constructor() {
        owner = msg.sender;
    }

    // FIXED: internal visibility — only callable from this contract and children
    function _mint(address to, uint256 amount) internal {
        balances[to] += amount;
        totalSupply += amount;
    }

    function adminMint(address to, uint256 amount) external {
        require(msg.sender == owner, "Not owner");
        _mint(to, amount);
    }
}
```

**Explanation**: The underscore prefix `_mint` is a naming convention suggesting internal/private use, but Solidity does not enforce this. If you forget the `internal` keyword, the default visibility for functions is `public`, making the function callable by anyone.

### Problem 3: Storage vs Memory Confusion

**Bug**: Reading a struct into `memory` instead of getting a `storage` reference, then modifying the copy without writing it back.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract StorageVsMemory {
    struct Proposal {
        uint256 votes;
        bool executed;
        string description;
    }

    Proposal[] public proposals;

    function createProposal(string calldata desc) external {
        proposals.push(Proposal({
            votes: 0,
            executed: false,
            description: desc
        }));
    }

    // BUG: memory copy — votes are never actually updated in storage
    function voteBroken(uint256 proposalId) external {
        Proposal memory proposal = proposals[proposalId];  // COPY
        proposal.votes += 1;  // Modifies the copy
        // The storage array is unchanged — vote is lost
    }

    // FIXED: storage reference — directly modifies the array element
    function voteFixed(uint256 proposalId) external {
        Proposal storage proposal = proposals[proposalId];  // REFERENCE
        proposal.votes += 1;  // Modifies storage directly
    }
}
```

**Explanation**: `Proposal memory proposal = proposals[proposalId]` copies the entire struct from storage to memory. Modifications to the memory copy do not affect storage. Using `Proposal storage proposal` creates a pointer to the original storage location. This is the single most common bug for Solidity beginners.

### Problem 4: Unchecked Return Value

**Bug**: Ignoring the return value of a low-level `.call()`.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract UncheckedReturn {
    // BUG: not checking success — if transfer fails, execution continues
    function sendEtherBroken(address payable to, uint256 amount) external {
        to.call{value: amount}("");
        // If call fails, the function still succeeds
        // The ETH stays in this contract but the caller thinks it was sent
    }

    // FIXED: always check the return value
    function sendEtherFixed(address payable to, uint256 amount) external {
        (bool success, ) = to.call{value: amount}("");
        require(success, "ETH transfer failed");
    }
}
```

**Explanation**: Low-level `.call()` returns a boolean success flag. Unlike `.transfer()`, it does not automatically revert on failure. Always check the return value.

### Problem 5: Incorrect Loop with Deletion

**Bug**: Deleting array elements in a loop with incorrect index management.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract ArrayDeletion {
    uint256[] public values;

    // BUG: After removing an element, the array shrinks
    // but the loop counter still increments — elements are skipped
    function removeZerosBroken() external {
        for (uint256 i = 0; i < values.length; i++) {
            if (values[i] == 0) {
                // Swap with last element and pop
                values[i] = values[values.length - 1];
                values.pop();
                // BUG: The swapped element at index i is never checked
                // because i increments on the next iteration
            }
        }
    }

    // FIXED: Do not increment i when an element is removed
    function removeZerosFixed() external {
        uint256 i = 0;
        while (i < values.length) {
            if (values[i] == 0) {
                values[i] = values[values.length - 1];
                values.pop();
                // Do NOT increment i — check the swapped element
            } else {
                unchecked { ++i; }
            }
        }
    }
}
```

**Explanation**: When you swap-and-pop to remove an array element, the element that was at the end is now at position `i`. If you increment `i`, you skip checking that element. The fix is to only increment when no deletion occurs.

---

## Appendix: Solidity Quick Reference

### Value Types

```
+--------------------------------------------------------------+
|  TYPE            | SIZE     | DEFAULT VALUE                  |
|  ----------------|----------|-------------------------------|
|  bool            | 1 byte   | false                         |
|  uint8           | 1 byte   | 0                             |
|  uint16          | 2 bytes  | 0                             |
|  uint32          | 4 bytes  | 0                             |
|  uint64          | 8 bytes  | 0                             |
|  uint128         | 16 bytes | 0                             |
|  uint256 (uint)  | 32 bytes | 0                             |
|  int8            | 1 byte   | 0                             |
|  int256 (int)    | 32 bytes | 0                             |
|  address         | 20 bytes | 0x0000...0000 (zero address)  |
|  address payable | 20 bytes | 0x0000...0000 (zero address)  |
|  bytes1          | 1 byte   | 0x00                          |
|  bytes32         | 32 bytes | 0x0000...0000                 |
|  enum            | 1 byte*  | First member (index 0)        |
+--------------------------------------------------------------+
|  * Enums use uint8 internally (max 256 members)              |
+--------------------------------------------------------------+
```

### Reference Types

```
+--------------------------------------------------------------+
|  TYPE              | DEFAULT VALUE     | DATA LOCATIONS      |
|  ------------------|-------------------|---------------------|
|  bytes             | empty (length 0)  | storage/memory/cd   |
|  string            | empty ("")        | storage/memory/cd   |
|  T[]               | empty (length 0)  | storage/memory/cd   |
|  T[N]              | N default values  | storage/memory/cd   |
|  mapping(K => V)   | all keys -> default| storage only       |
|  struct            | all fields default| storage/memory/cd   |
+--------------------------------------------------------------+
|  cd = calldata (read-only, external function params only)    |
+--------------------------------------------------------------+
```

### Gas Costs Reference

```
+--------------------------------------------------------------+
|  OPERATION                          | GAS COST               |
|  -----------------------------------|------------------------|
|  SSTORE (0 -> non-zero, cold)       | 22,100                 |
|  SSTORE (non-zero -> non-zero)      |  5,000                 |
|  SSTORE (non-zero -> 0, refund)     |  5,000 - 4,800 refund  |
|  SLOAD (cold)                        |  2,100                 |
|  SLOAD (warm)                        |    100                 |
|  MSTORE / MLOAD                      |      3                 |
|  CALLDATALOAD                        |      3                 |
|  LOG0 (base)                         |    375                 |
|  LOG per topic                       |    375                 |
|  LOG per byte                        |      8                 |
|  CALL (cold address)                 |  2,600                 |
|  CALL (warm address)                 |    100                 |
|  CREATE                              | 32,000                 |
|  Transaction base cost               | 21,000                 |
|  Calldata zero byte                  |      4                 |
|  Calldata non-zero byte              |     16                 |
+--------------------------------------------------------------+
```

### State Mutability Summary

```
+--------------------------------------------------------------+
|  KEYWORD   | READS STATE | WRITES STATE | RECEIVES ETH      |
|  ----------|-------------|--------------|-------------------|
|  (default) | Yes         | Yes          | No                |
|  view      | Yes         | No           | No                |
|  pure      | No          | No           | No                |
|  payable   | Yes         | Yes          | Yes               |
+--------------------------------------------------------------+
```

### Visibility Summary

```
+--------------------------------------------------------------+
|  VISIBILITY | ABI  | External | Internal | Derived          |
|  -----------|------|----------|----------|------------------|
|  public     | Yes  | Yes      | Yes      | Yes              |
|  external   | Yes  | Yes      | No*      | No*              |
|  internal   | No   | No       | Yes      | Yes              |
|  private    | No   | No       | Yes      | No               |
+--------------------------------------------------------------+
|  * external functions can be called via this.func() but      |
|    this costs extra gas due to the external call mechanism.   |
+--------------------------------------------------------------+
```

### Global Variables

```
+--------------------------------------------------------------+
|  VARIABLE                | TYPE      | DESCRIPTION           |
|  ------------------------|-----------|------------------------|
|  msg.sender              | address   | Caller of the function |
|  msg.value               | uint256   | ETH sent (in wei)      |
|  msg.data                | bytes     | Full calldata          |
|  msg.sig                 | bytes4    | Function selector      |
|  block.timestamp         | uint256   | Current block timestamp|
|  block.number            | uint256   | Current block number   |
|  block.prevrandao        | uint256   | Previous RANDAO value  |
|  block.chainid           | uint256   | Chain ID               |
|  block.basefee           | uint256   | Current base fee       |
|  block.gaslimit          | uint256   | Block gas limit        |
|  block.coinbase          | address   | Block miner/proposer   |
|  tx.origin               | address   | Original sender (EOA)  |
|  tx.gasprice             | uint256   | Gas price of tx        |
|  gasleft()               | uint256   | Remaining gas          |
+--------------------------------------------------------------+
```
