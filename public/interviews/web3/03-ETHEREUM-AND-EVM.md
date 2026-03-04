# Chapter 3: Ethereum and the EVM

## Introduction

Ethereum is the programmable blockchain that transformed distributed ledgers from simple payment networks into a general-purpose computation platform. While Bitcoin proved that decentralized value transfer was possible, Ethereum extended that idea by embedding a Turing-complete virtual machine into every node. This means any deterministic program can be deployed once and executed by thousands of independent validators, producing results that all participants can verify without trusting any single party.

Understanding Ethereum at a deep level is non-negotiable for Web3 engineers. Whether you are writing Solidity smart contracts, building indexing infrastructure, designing Layer 2 rollups, or auditing protocols for security vulnerabilities, every layer of the stack rests on the same foundation: accounts, transactions, the Ethereum Virtual Machine (EVM), and the state model that ties them together. Shallow knowledge leads to subtle bugs, gas inefficiencies, and security holes that cost real money.

This chapter dissects Ethereum from the ground up. We start with the account model and transaction types, dive into the EVM's stack-based execution model, examine gas mechanics after EIP-1559, walk through the state trie architecture, cover the post-Merge proof-of-stake consensus, and finish with the ABI encoding and event log systems that form the interface between on-chain and off-chain worlds.

```
+===========================================================================+
|                     ETHEREUM ARCHITECTURE OVERVIEW                        |
+===========================================================================+
|                                                                           |
|  +-----------------------------+    +-------------------------------+     |
|  |     CONSENSUS LAYER         |    |      EXECUTION LAYER          |     |
|  |  (Beacon Chain / PoS)       |    |  (EVM + State Machine)        |     |
|  |                             |    |                               |     |
|  |  +-----------+              |    |  +----------+  +-----------+  |     |
|  |  | Validators|              |    |  |   EVM    |  |  State    |  |     |
|  |  | (32 ETH)  |              |    |  | Executor |  |  Storage  |  |     |
|  |  +-----------+              |    |  +----+-----+  +-----+-----+  |     |
|  |        |                    |    |       |              |         |     |
|  |  +-----v-------+           |    |  +----v--------------v------+  |     |
|  |  | Attestations|           |    |  |   State Transition Fn    |  |     |
|  |  | & Proposals |           |    |  |   S' = F(S, T)           |  |     |
|  |  +-------------+           |    |  +--+--------------------+--+  |     |
|  |        |                   |    |     |                    |      |     |
|  |  +-----v-------+          |    |  +--v--------+  +-------v---+  |     |
|  |  | Slots &     |          |    |  | World     |  | Storage   |  |     |
|  |  | Epochs      |          |    |  | State     |  | Tries     |  |     |
|  |  +-------------+          |    |  | Trie      |  | (per acct)|  |     |
|  |        |                  |    |  +-----------+  +-----------+  |     |
|  |  +-----v-------+         |    |                               |     |
|  |  | Finality    |         |    |  +---------------------------+  |     |
|  |  | (Casper FFG)|         |    |  | Transaction Pool (Mempool)|  |     |
|  |  +-------------+         |    |  +---------------------------+  |     |
|  |        |                  |    |       |                        |     |
|  |  +-----v-------+         |    |  +----v----------------------+  |     |
|  |  | Fork Choice |         |    |  | Transaction Types         |  |     |
|  |  | (LMD-GHOST) |         |    |  | Legacy / 2930 / 1559      |  |     |
|  |  +-------------+         |    |  +---------------------------+  |     |
|  +-----------------------------+    +-------------------------------+     |
|                                                                           |
|  +---------------------------------------------------------------------+ |
|  |                    TRANSACTION LIFECYCLE                              | |
|  |                                                                      | |
|  |  Sign --> Broadcast --> Mempool --> Block Inclusion --> Finalization  | |
|  |   |         |            |              |                  |         | |
|  |   v         v            v              v                  v         | |
|  | Private   P2P          Priority       EVM Exec          2 Epochs    | |
|  | Key       Gossip       Ordering       + State Update    (~12.8min)  | |
|  +---------------------------------------------------------------------+ |
|                                                                           |
|  +---------------------------------------------------------------------+ |
|  |                       EVM EXECUTION MODEL                            | |
|  |                                                                      | |
|  |  +--------+   +--------+   +---------+   +----------+               | |
|  |  | Stack  |   | Memory |   | Storage |   | Calldata |               | |
|  |  | 1024   |   | Byte[] |   | 256->256|   | Immutable|               | |
|  |  | x 256b |   | Volatile|  | Persist |   | Input    |               | |
|  |  +--------+   +--------+   +---------+   +----------+               | |
|  +---------------------------------------------------------------------+ |
+===========================================================================+
```

---

## 1. Ethereum Accounts

Ethereum has two types of accounts that share a common address format but differ fundamentally in capabilities and control mechanisms.

### Externally Owned Accounts (EOAs)

An EOA is controlled by a private key. It has no code, no storage, and can only initiate transactions. The address is derived from the public key:

```
+---------------------------------------------------------------+
|              EOA ADDRESS DERIVATION                            |
|                                                                |
|  Private Key (256 bits)                                        |
|       |                                                        |
|       v                                                        |
|  secp256k1 point multiplication                                |
|       |                                                        |
|       v                                                        |
|  Public Key (512 bits = x || y)                                |
|       |                                                        |
|       v                                                        |
|  keccak256(publicKey)                                          |
|       |                                                        |
|       v                                                        |
|  Take last 20 bytes --> 0x + 40 hex chars = address            |
|                                                                |
|  Example:                                                      |
|  privKey: 0xac0974bec39a17e36ba4a6b4d238ff944bacb478...        |
|  address: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266          |
+---------------------------------------------------------------+
```

### Contract Accounts

A contract account is created by deploying bytecode. It has code, storage, and a balance, but no private key. It cannot initiate transactions on its own -- it can only execute in response to a transaction or an internal call from another contract.

**Account State Fields:**

| Field          | EOA            | Contract Account     |
|----------------|----------------|----------------------|
| `nonce`        | Tx count       | Contracts created    |
| `balance`      | ETH in wei     | ETH in wei           |
| `codeHash`     | keccak256("") | keccak256(bytecode)  |
| `storageRoot`  | Empty trie     | Merkle root of slots |

### Address Derivation: CREATE vs CREATE2

When a contract deploys another contract, the new contract's address is deterministic. The method differs between CREATE and CREATE2.

**CREATE:**

```
address = keccak256(rlp([sender, nonce]))[12:]
```

The address depends on the deployer's address and current nonce. This means the address changes if any prior transaction changes the nonce.

**CREATE2 (EIP-1014):**

```
address = keccak256(0xff ++ sender ++ salt ++ keccak256(initCode))[12:]
```

CREATE2 makes the address independent of the nonce. By choosing a salt, you can precompute the address before deploying. This is critical for:

- **Counterfactual instantiation** -- wallets that exist at a known address before deployment
- **Factory patterns** -- deterministic deployment across chains
- **CREATE2 redeployment** -- deploying to the same address after `SELFDESTRUCT` (deprecated post-Dencun)

```javascript
// Computing a CREATE2 address with ethers.js
const { ethers } = require("ethers");

const factoryAddress = "0x1234567890abcdef1234567890abcdef12345678";
const salt = ethers.zeroPadValue("0x01", 32);
const initCodeHash = ethers.keccak256("0x6000600055"); // example bytecode

const computed = ethers.getCreate2Address(factoryAddress, salt, initCodeHash);
console.log("Predicted address:", computed);
```

---

## 2. Transactions

Every state change in Ethereum originates from a transaction signed by an EOA. Ethereum supports three transaction types, each identified by an envelope type prefix.

### Transaction Types

| Type     | Envelope | EIP     | Key Feature                           |
|----------|----------|---------|---------------------------------------|
| Legacy   | None     | Pre-2930| `gasPrice` field                      |
| Type 1   | `0x01`   | EIP-2930| Access lists for storage warming       |
| Type 2   | `0x02`   | EIP-1559| Base fee + priority tip               |

### EIP-1559 Transaction Fields

```
+------------------------------------------------------------------+
|                   EIP-1559 TRANSACTION                            |
|                                                                   |
|  +-------------------+  +------------------------------------+   |
|  | chainId           |  | Identifies the network (1=mainnet) |   |
|  | nonce             |  | Sender's tx count (replay protect) |   |
|  | maxPriorityFeePerGas| Tip to the validator               |   |
|  | maxFeePerGas      |  | Maximum total fee per gas unit     |   |
|  | gasLimit          |  | Max gas units this tx can consume  |   |
|  | to                |  | Recipient (null = contract create) |   |
|  | value             |  | ETH transferred in wei             |   |
|  | data              |  | Calldata (function selector + args)|   |
|  | accessList        |  | Pre-warmed storage slots           |   |
|  | v, r, s           |  | ECDSA signature components         |   |
|  +-------------------+  +------------------------------------+   |
+------------------------------------------------------------------+
```

**Fee Calculation:**

```
effectiveGasPrice = min(maxFeePerGas, baseFee + maxPriorityFeePerGas)
totalFee = gasUsed * effectiveGasPrice
burned = gasUsed * baseFee
validatorTip = gasUsed * (effectiveGasPrice - baseFee)
```

### Transaction Lifecycle

```
+--------+     +-----------+     +----------+     +---------+     +----------+
|  Sign  |---->| Broadcast |---->|  Mempool |---->| Include |---->| Finalize |
+--------+     +-----------+     +----------+     +---------+     +----------+
    |               |                 |                |                |
    v               v                 v                v                v
 ECDSA sig      P2P gossip       Sorted by        Validator        2 epochs
 with           to peers         priority fee     executes tx      (~12.8 min)
 private key                     (and MEV)        in EVM           Casper FFG
```

1. **Sign** -- The sender constructs the transaction, RLP-encodes it, and signs with their private key.
2. **Broadcast** -- The signed transaction is submitted to a node, which gossips it to peers via the devp2p protocol.
3. **Mempool** -- Each node maintains a local pool of pending transactions, ordered by effective gas price (and MEV considerations via Flashbots/MEV-Boost).
4. **Include** -- A validator proposes a block containing ordered transactions. The EVM executes each one sequentially, updating the state.
5. **Finalize** -- After two epochs (~12.8 minutes), the block is finalized through Casper FFG. Finalized blocks cannot be reverted without slashing at least one-third of validators.

### Transaction Receipts

After execution, each transaction produces a receipt containing:

| Field               | Description                                |
|---------------------|--------------------------------------------|
| `status`            | 1 (success) or 0 (revert)                 |
| `cumulativeGasUsed` | Total gas used up to this tx in the block  |
| `logs`              | Array of event logs emitted                |
| `logsBloom`         | 256-byte bloom filter for log topics       |
| `transactionHash`   | Hash of the original transaction           |
| `blockNumber`       | Block in which the transaction was included|
| `gasUsed`           | Gas consumed by this specific transaction  |

```javascript
// Sending an EIP-1559 transaction and reading the receipt with ethers.js
const { ethers } = require("ethers");

const provider = new ethers.JsonRpcProvider("https://rpc.ankr.com/eth");
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

async function sendTransaction() {
  const tx = await wallet.sendTransaction({
    to: "0xRecipientAddress",
    value: ethers.parseEther("0.01"),
    maxFeePerGas: ethers.parseUnits("30", "gwei"),
    maxPriorityFeePerGas: ethers.parseUnits("2", "gwei"),
    gasLimit: 21000n,
  });

  console.log("Tx hash:", tx.hash);

  const receipt = await tx.wait();
  console.log("Status:", receipt.status); // 1 = success
  console.log("Gas used:", receipt.gasUsed.toString());
  console.log("Block:", receipt.blockNumber);
}
```

---

## 3. The EVM in Depth

The Ethereum Virtual Machine is a quasi-Turing-complete, stack-based state machine. Every node runs the same EVM implementation to deterministically execute transactions and arrive at the same post-state.

### Stack Machine Architecture

```
+======================================================================+
|                        EVM EXECUTION CONTEXT                          |
|                                                                       |
|  +------------------+    +---------------------+                      |
|  |     STACK        |    |      MEMORY          |                     |
|  |  Max 1024 items  |    |  Byte-addressable    |                     |
|  |  256 bits each   |    |  Volatile per call   |                     |
|  |                  |    |  Grows dynamically    |                     |
|  |  [top]    0x...  |    |  Quadratic expansion  |                     |
|  |  [top-1]  0x...  |    |  cost                 |                     |
|  |  [top-2]  0x...  |    |                       |                     |
|  |  ...             |    |  +--+--+--+--+--+--+  |                     |
|  |  [1023]   0x...  |    |  |00|01|02|03|...|xx|  |                     |
|  +------------------+    |  +--+--+--+--+--+--+  |                     |
|                          +---------------------+                      |
|  +------------------+    +---------------------+                      |
|  |    STORAGE       |    |     CALLDATA         |                     |
|  |  Persistent      |    |  Immutable input     |                     |
|  |  256-bit key     |    |  Read-only bytes     |                     |
|  |  256-bit value   |    |  Passed by caller    |                     |
|  |  Per-contract    |    |                       |                     |
|  |  Merkle trie     |    |  [selector][arg0]    |                     |
|  |                  |    |  [arg1][arg2]...     |                     |
|  +------------------+    +---------------------+                      |
|                                                                       |
|  Program Counter: 0x0000    Gas Remaining: 29,000,000                 |
+======================================================================+
```

**Stack**: The EVM operates on a last-in-first-out stack of 256-bit (32-byte) words. Most opcodes pop inputs from the stack and push results back. The maximum depth is 1024. Exceeding this causes a stack overflow error and the transaction reverts.

**Memory**: A volatile, byte-addressable array that exists only for the duration of a single call context. It starts at zero length and expands as needed. Memory expansion costs gas quadratically:

```
memory_cost = (memory_size_word^2) / 512 + 3 * memory_size_word
```

This discourages contracts from allocating huge memory regions.

**Storage**: A persistent key-value mapping from 256-bit keys to 256-bit values, stored in each contract's storage trie. Storage operations are the most expensive EVM operations:

| Operation              | Gas Cost (approximate)         |
|------------------------|-------------------------------|
| SLOAD (cold)           | 2,100                         |
| SLOAD (warm)           | 100                           |
| SSTORE (0 -> non-zero) | 20,000                        |
| SSTORE (non-zero -> non-zero) | 2,900              |
| SSTORE (non-zero -> 0) | 2,900 + 4,800 refund         |

**Calldata**: The immutable byte array passed as input to a transaction or internal call. It is read-only. Reading calldata is cheap (3 gas per word via CALLDATALOAD).

### Key Opcodes by Category

**Arithmetic:**

| Opcode    | Hex  | Gas | Description                   |
|-----------|------|-----|-------------------------------|
| ADD       | 0x01 | 3   | Addition                      |
| MUL       | 0x02 | 5   | Multiplication                |
| SUB       | 0x03 | 3   | Subtraction                   |
| DIV       | 0x04 | 5   | Integer division              |
| MOD       | 0x06 | 5   | Modulo                        |
| ADDMOD    | 0x08 | 8   | (a + b) % N                   |
| MULMOD    | 0x09 | 8   | (a * b) % N                   |
| EXP       | 0x0a | 10* | Exponentiation (*+50/byte)    |

**Comparison & Bitwise:**

| Opcode    | Hex  | Gas | Description                   |
|-----------|------|-----|-------------------------------|
| LT        | 0x10 | 3   | Less than                     |
| GT        | 0x11 | 3   | Greater than                  |
| EQ        | 0x14 | 3   | Equality                      |
| ISZERO    | 0x15 | 3   | Boolean not                   |
| AND       | 0x16 | 3   | Bitwise AND                   |
| OR        | 0x17 | 3   | Bitwise OR                    |
| XOR       | 0x18 | 3   | Bitwise XOR                   |
| SHL       | 0x1b | 3   | Shift left                    |
| SHR       | 0x1c | 3   | Shift right                   |

**Stack Operations:**

| Opcode    | Hex  | Gas | Description                   |
|-----------|------|-----|-------------------------------|
| POP       | 0x50 | 2   | Remove top item               |
| PUSH1-32  | 0x60-0x7f | 3 | Push 1-32 bytes           |
| DUP1-16   | 0x80-0x8f | 3 | Duplicate stack item      |
| SWAP1-16  | 0x90-0x9f | 3 | Swap stack items          |

**Memory Operations:**

| Opcode    | Hex  | Gas | Description                   |
|-----------|------|-----|-------------------------------|
| MLOAD     | 0x51 | 3*  | Load 32 bytes from memory     |
| MSTORE    | 0x52 | 3*  | Store 32 bytes to memory      |
| MSTORE8   | 0x53 | 3*  | Store 1 byte to memory        |
| MSIZE     | 0x59 | 2   | Current memory size           |

**Storage Operations:**

| Opcode    | Hex  | Gas     | Description                   |
|-----------|------|---------|-------------------------------|
| SLOAD     | 0x54 | 100-2100| Load from storage             |
| SSTORE    | 0x55 | 100-20000| Store to storage             |

**Control Flow:**

| Opcode    | Hex  | Gas | Description                   |
|-----------|------|-----|-------------------------------|
| JUMP      | 0x56 | 8   | Unconditional jump            |
| JUMPI     | 0x57 | 10  | Conditional jump              |
| JUMPDEST  | 0x5b | 1   | Valid jump destination        |
| STOP      | 0x00 | 0   | Halt execution                |
| RETURN    | 0xf3 | 0*  | Return output data            |
| REVERT    | 0xfd | 0*  | Revert with output data       |

**Environment:**

| Opcode       | Hex  | Gas  | Description                   |
|--------------|------|------|-------------------------------|
| ADDRESS      | 0x30 | 2    | Current contract address      |
| CALLER       | 0x33 | 2    | msg.sender                    |
| CALLVALUE    | 0x34 | 2    | msg.value                     |
| CALLDATALOAD | 0x35 | 3    | Load 32 bytes from calldata   |
| CALLDATASIZE | 0x36 | 2    | Size of calldata              |
| BLOCKHASH    | 0x40 | 20   | Hash of a recent block        |
| TIMESTAMP    | 0x42 | 2    | Current block timestamp       |
| NUMBER       | 0x43 | 2    | Current block number          |
| CHAINID      | 0x46 | 2    | Chain ID (EIP-1344)           |

**External Calls:**

| Opcode       | Hex  | Gas     | Description                   |
|--------------|------|---------|-------------------------------|
| CALL         | 0xf1 | 100+*   | Call another contract         |
| DELEGATECALL | 0xf4 | 100+*   | Call with caller's context    |
| STATICCALL   | 0xfa | 100+*   | Read-only call                |
| CREATE       | 0xf0 | 32000   | Deploy a new contract         |
| CREATE2      | 0xf5 | 32000   | Deploy with deterministic addr|

### EVM Execution Walkthrough

Consider a simple Solidity function:

```solidity
function add(uint256 a, uint256 b) public pure returns (uint256) {
    return a + b;
}
```

The EVM executes roughly:

```
Step  PC   Opcode       Stack (top -> bottom)       Gas
----  ---  ----------   ------------------------    ----
1     0x00 PUSH1 0x04   [0x04]                      3
2     0x02 CALLDATASIZE [calldataSize, 0x04]        2
3     0x03 LT           [0 or 1]                    3
4     0x04 PUSH1 0x0c   [0x0c, result]              3
5     0x06 JUMPI        []  (jump if selector ok)   10
...
N     0x20 CALLDATALOAD [a]                         3
N+1   0x21 CALLDATALOAD [b, a]                      3
N+2   0x22 ADD          [a+b]                       3
N+3   0x23 MSTORE       []  (store result in mem)   3+
N+4   0x24 RETURN       (return 32 bytes)           0
```

---

## 4. Gas Mechanics

### Why Gas Exists

Ethereum is a Turing-complete computation platform. The halting problem tells us that, in general, you cannot determine whether an arbitrary program will terminate. Without a bound on computation, a malicious actor could deploy an infinite loop and permanently stall every node in the network.

Gas is the solution: every opcode has a fixed gas cost, and every transaction specifies a `gasLimit`. When gas runs out, execution reverts. The sender always pays for the gas consumed, even if the transaction fails. This creates an economic cost for computation that prevents denial-of-service attacks.

```
+----------------------------------------------------------------------+
|                     GAS COST MODEL                                    |
|                                                                       |
|  Transaction Base Cost:       21,000 gas                              |
|  Non-zero calldata byte:     16 gas                                   |
|  Zero calldata byte:         4 gas                                    |
|  Contract creation:          32,000 gas + code deposit                |
|  Code deposit:               200 gas per byte                         |
|                                                                       |
|  Execution Cost = Sum of opcode gas costs + memory expansion          |
|                                                                       |
|  Total Gas = Base Cost + Execution Cost                               |
|                                                                       |
|  Total Fee (wei) = gasUsed * effectiveGasPrice                        |
+----------------------------------------------------------------------+
```

### EIP-1559 Fee Model

Before EIP-1559, users bid a single `gasPrice` in a first-price auction. This was inefficient and led to overpaying. EIP-1559 introduced a dual-component fee structure:

```
+-----------------------------------------------------------------+
|              EIP-1559 FEE STRUCTURE                              |
|                                                                  |
|  baseFee (protocol-set)                                          |
|  +----------------------------------------------------------+   |
|  | Adjusts up/down based on block utilization                |   |
|  | Target: 50% full blocks (15M gas target, 30M gas limit)  |   |
|  | If block > 50% full: baseFee increases (up to 12.5%)     |   |
|  | If block < 50% full: baseFee decreases (up to 12.5%)     |   |
|  | THE BASE FEE IS BURNED (removed from supply)             |   |
|  +----------------------------------------------------------+   |
|                                                                  |
|  priorityFee (user-set tip)                                      |
|  +----------------------------------------------------------+   |
|  | Goes directly to the validator                            |   |
|  | Incentivizes inclusion                                    |   |
|  | Higher tip = faster inclusion                             |   |
|  +----------------------------------------------------------+   |
|                                                                  |
|  maxFeePerGas >= baseFee + maxPriorityFeePerGas                  |
|  effectiveGasPrice = min(maxFeePerGas, baseFee + priorityFee)    |
|  refund = (maxFeePerGas - effectiveGasPrice) * gasLimit          |
+-----------------------------------------------------------------+
```

### Gas Estimation with ethers.js

```javascript
const { ethers } = require("ethers");

const provider = new ethers.JsonRpcProvider("https://rpc.ankr.com/eth");

async function estimateGas() {
  // Get current fee data
  const feeData = await provider.getFeeData();
  console.log("Base fee:", ethers.formatUnits(feeData.gasPrice, "gwei"), "gwei");
  console.log("Max fee:", ethers.formatUnits(feeData.maxFeePerGas, "gwei"), "gwei");
  console.log("Priority fee:", ethers.formatUnits(feeData.maxPriorityFeePerGas, "gwei"), "gwei");

  // Estimate gas for a contract call
  const contract = new ethers.Contract(
    "0xContractAddress",
    ["function transfer(address to, uint256 amount) returns (bool)"],
    provider
  );

  const gasEstimate = await contract.transfer.estimateGas(
    "0xRecipientAddress",
    ethers.parseUnits("100", 18)
  );

  console.log("Estimated gas:", gasEstimate.toString());

  // Calculate total cost
  const totalCostWei = gasEstimate * feeData.maxFeePerGas;
  console.log("Max cost:", ethers.formatEther(totalCostWei), "ETH");
}
```

### Gas Optimization Tips

| Technique                        | Savings             |
|----------------------------------|---------------------|
| Pack storage variables           | Up to 50% SSTORE    |
| Use `calldata` over `memory`     | ~60% for read-only  |
| Cache storage reads in local vars| 2,000 gas per re-read|
| Use `++i` over `i++`             | ~5 gas per iteration |
| Short-circuit conditionals       | Variable            |
| Use events instead of storage    | ~95% cheaper        |
| Use `bytes32` over `string`      | ~50% for short text  |
| Batch operations                 | Save base cost/tx    |

---

## 5. Ethereum State

Ethereum's state is organized as a collection of Merkle Patricia Tries (MPTs), enabling efficient verification and compact proofs.

### State Architecture

```
+======================================================================+
|                    ETHEREUM STATE MODEL                                |
|                                                                       |
|  Block Header                                                         |
|  +----------------------------------------------------------------+  |
|  | parentHash | stateRoot | txRoot | receiptRoot | ... | number   |  |
|  +------+----------+----------+-----------+-------------------+---+  |
|         |          |          |           |                          |
|         |    +-----v------+  |     +-----v-------+                  |
|         |    | World State|  |     | Receipt Trie |                  |
|         |    | Trie       |  |     | (per block)  |                  |
|         |    +-----+------+  |     +--------------+                  |
|         |          |         |                                       |
|         |    +-----v----------------------------------+              |
|         |    | Account State (per address)             |              |
|         |    | +----------+----------+--------+------+|              |
|         |    | |  nonce   | balance  |codeHash|stRoot||              |
|         |    | +----------+----------+--------+--+---+|              |
|         |    +----------------------------------------+              |
|         |                                        |                   |
|         |                                  +-----v-------+           |
|         |                                  | Storage Trie |          |
|         |                                  | (per contract)|         |
|         |                                  | slot -> value |          |
|         |                                  +--------------+           |
|         |                                                            |
|   +-----v---------+                                                  |
|   | Transaction    |                                                  |
|   | Trie           |                                                  |
|   | (per block)    |                                                  |
|   +----------------+                                                  |
+======================================================================+
```

### The Four Tries

**World State Trie**: Maps every Ethereum address (160 bits) to the account state (nonce, balance, codeHash, storageRoot). The root hash is stored in the block header as `stateRoot`. This trie is cumulative -- it represents the state of all accounts across all time.

**Storage Trie**: Each contract account has its own storage trie that maps 256-bit slot keys to 256-bit values. The root of this trie is the `storageRoot` field in the account state. Slot assignment follows deterministic rules (e.g., mapping keys are `keccak256(key . slot)`).

**Transaction Trie**: A per-block trie that maps transaction indices (0, 1, 2, ...) to the RLP-encoded transaction data. The root is stored in the block header as `transactionsRoot`.

**Receipt Trie**: A per-block trie mapping transaction indices to the corresponding receipt (status, gas used, logs, bloom filter). The root is stored in the block header as `receiptsRoot`.

### State Transition Function

The core invariant of Ethereum is:

```
S' = F(S, T)
```

Where `S` is the pre-state, `T` is a transaction, and `S'` is the post-state. The function `F` is deterministic. Given the same `S` and `T`, every node must compute the same `S'`.

The transition involves:

1. **Validate** the transaction (signature, nonce, gas limit, balance).
2. **Deduct** the upfront cost: `gasLimit * maxFeePerGas` from the sender's balance.
3. **Execute** the EVM bytecode, consuming gas per opcode.
4. **Apply** state changes (storage writes, balance transfers, contract creation).
5. **Refund** unused gas: `(gasLimit - gasUsed) * effectiveGasPrice` to the sender.
6. **Pay** the validator: `gasUsed * priorityFee`.
7. **Burn** the base fee: `gasUsed * baseFee` is permanently removed.
8. **Emit** logs and construct the receipt.

### Merkle Patricia Trie Structure

The MPT combines a Merkle tree (hash-based integrity) with a Patricia trie (prefix-based compression). Nodes are of three types:

| Node Type   | Description                                      |
|-------------|--------------------------------------------------|
| Branch      | 17-element array (16 hex nibbles + value)        |
| Extension   | Shared prefix + pointer to next node             |
| Leaf        | Remaining path + value                           |

This structure enables **Merkle proofs**: a client can verify that an account has a specific balance by requesting only the path from the state root to the account's leaf, without downloading the entire state.

---

## 6. The Merge and Proof of Stake

On September 15, 2022, Ethereum transitioned from Proof of Work to Proof of Stake in an event called "The Merge." This replaced energy-intensive mining with a validator-based consensus mechanism.

### Validator Lifecycle

```
+----------------------------------------------------------------------+
|                    VALIDATOR LIFECYCLE                                 |
|                                                                       |
|  Deposit 32 ETH --> Activation Queue --> Active Validator             |
|                     (variable wait)     |                             |
|                                         +---> Propose Blocks          |
|                                         |     (1 per slot if chosen)  |
|                                         |                             |
|                                         +---> Attest                  |
|                                         |     (1 per epoch, required) |
|                                         |                             |
|                                         +---> Sync Committee          |
|                                               (256 validators, 27h)   |
|                                                                       |
|  Voluntary Exit --> Exit Queue --> Withdrawable --> Withdrawn          |
|                     (variable)     (256 epochs)     (sweep)           |
|                                                                       |
|  Slashing --> Forced Exit --> Penalty Period --> Withdrawn             |
|               (immediate)    (36 days)          (reduced balance)     |
+----------------------------------------------------------------------+
```

### Slots and Epochs

| Concept    | Duration      | Description                               |
|------------|---------------|-------------------------------------------|
| **Slot**   | 12 seconds    | One opportunity to propose a block         |
| **Epoch**  | 32 slots      | 6.4 minutes; all validators attest once    |
| **Period** | 256 epochs    | ~27.3 hours; sync committee rotation       |

Each slot, one validator is pseudo-randomly selected to propose a block. All other validators in the epoch's committee attest to the block they believe is the head of the chain.

### Attestations

An attestation is a validator's vote on:
- **Source**: The most recent justified checkpoint
- **Target**: The checkpoint at the start of the current epoch
- **Head**: The block the validator believes is the chain head

Attestations serve dual purposes: they feed into both the fork choice rule (LMD-GHOST) and the finality gadget (Casper FFG).

### LMD-GHOST Fork Choice

**Latest Message Driven Greediest Heaviest Observed SubTree** (LMD-GHOST) is the fork choice rule. When choosing between competing forks, the protocol counts the most recent attestation from each validator and follows the branch with the greatest accumulated weight.

```
                    Genesis
                       |
                  +----+----+
                  |         |
               Block A   Block B
              (weight 60) (weight 40)
                  |
             +----+----+
             |         |
          Block C   Block D
         (weight 35) (weight 25)
             |
         Canonical Head
```

### Casper FFG Finality

Casper Friendly Finality Gadget provides **economic finality**. A block is:

- **Justified**: When 2/3 of validators attest to it as a checkpoint target
- **Finalized**: When a justified checkpoint has a direct child that is also justified

Once finalized, reverting a block requires slashing at least 1/3 of all staked ETH -- a catastrophic economic penalty.

```
+-------+         +-------+         +-------+
|Epoch 0|-------->|Epoch 1|-------->|Epoch 2|
|       |         |       |         |       |
|Finalized|<------|Justified|<-----|Current |
| (2/3)  |  link  | (2/3)  |  link |        |
+-------+         +-------+         +-------+
```

### Slashing Conditions

A validator is slashed (loses a portion of their 32 ETH stake and is forcibly exited) for:

1. **Double voting**: Signing two different attestations for the same target epoch
2. **Surround voting**: Creating an attestation that surrounds or is surrounded by a previous attestation (violates Casper FFG safety)
3. **Double proposing**: Proposing two different blocks for the same slot

Slashing penalty = base penalty + correlation penalty (increases if many validators are slashed simultaneously, up to the full 32 ETH).

---

## 7. ABI (Application Binary Interface)

The ABI defines how data is encoded for EVM consumption. It is the contract between off-chain callers and on-chain bytecode.

### Function Selectors

Every function call is identified by the first 4 bytes of the keccak256 hash of its canonical signature.

```
+----------------------------------------------------------------------+
|                    FUNCTION SELECTOR                                   |
|                                                                       |
|  Signature:  "transfer(address,uint256)"                              |
|  keccak256:  0xa9059cbb2ab09eb219583f4a59a5d0623ade346d962bcd4e46b...  |
|  Selector:   0xa9059cbb  (first 4 bytes)                              |
|                                                                       |
|  Calldata Layout:                                                     |
|  +----------+----------------------------------+                      |
|  | 4 bytes  |          N * 32 bytes            |                      |
|  | selector |          arguments               |                      |
|  +----------+----------------------------------+                      |
|  | a9059cbb | 000...recipient (32B) | 000...amount (32B) |           |
|  +----------+----------------------------------+                      |
+----------------------------------------------------------------------+
```

### ABI Encoding Rules

**Fixed-size types** (uint256, address, bool, bytes32) are left-padded to 32 bytes and placed inline.

**Dynamic types** (string, bytes, arrays) use an offset-pointer system:

```
+----------------------------------------------------------------------+
|  Example: function foo(uint256 x, string s, uint256 y)               |
|                                                                       |
|  Offset 0x00:  x (uint256, inline)                  = 0x00...0005    |
|  Offset 0x20:  offset to s data                     = 0x00...0060    |
|  Offset 0x40:  y (uint256, inline)                  = 0x00...0003    |
|  Offset 0x60:  length of s                          = 0x00...0005    |
|  Offset 0x80:  s data ("hello" utf8, right-padded)  = 68656c6c6f0... |
+----------------------------------------------------------------------+
```

### ABI Encoding with ethers.js

```javascript
const { ethers } = require("ethers");

// Encode a function call
const iface = new ethers.Interface([
  "function transfer(address to, uint256 amount) returns (bool)"
]);

const calldata = iface.encodeFunctionData("transfer", [
  "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
  ethers.parseUnits("1000", 18)
]);
console.log("Calldata:", calldata);
// 0xa9059cbb000000000000000000000000d8da6bf26964af9d7eed9e03e53415d37aa96045
//           00000000000000000000000000000000000000000000003635c9adc5dea00000

// Decode calldata back
const decoded = iface.decodeFunctionData("transfer", calldata);
console.log("To:", decoded[0]);
console.log("Amount:", ethers.formatUnits(decoded[1], 18));

// Compute function selector manually
const selector = ethers.id("transfer(address,uint256)").slice(0, 10);
console.log("Selector:", selector); // 0xa9059cbb

// Encode with raw ABI coder
const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
  ["address", "uint256"],
  ["0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", ethers.parseUnits("1000", 18)]
);
console.log("ABI encoded args:", encoded);
```

### Encoding Dynamic Types: Tuples and Arrays

```javascript
const { ethers } = require("ethers");

const abiCoder = ethers.AbiCoder.defaultAbiCoder();

// Encode a tuple (struct)
const tupleEncoded = abiCoder.encode(
  ["tuple(address owner, uint256 amount, string memo)"],
  [{
    owner: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
    amount: 1000n,
    memo: "Payment for services"
  }]
);

// Encode a dynamic array
const arrayEncoded = abiCoder.encode(
  ["uint256[]"],
  [[100n, 200n, 300n]]
);

// Decode
const decodedTuple = abiCoder.decode(
  ["tuple(address owner, uint256 amount, string memo)"],
  tupleEncoded
);
console.log("Owner:", decodedTuple[0].owner);
console.log("Memo:", decodedTuple[0].memo);
```

---

## 8. Events and Logs

Events are the primary mechanism for contracts to communicate information to off-chain consumers. They are stored in transaction receipts, not in contract storage, making them significantly cheaper.

### Log Structure

```
+----------------------------------------------------------------------+
|                       LOG ENTRY                                       |
|                                                                       |
|  +-------------------+                                                |
|  | address           |  Contract that emitted the log                 |
|  +-------------------+                                                |
|  | topics[0]         |  keccak256 of event signature                  |
|  | topics[1]         |  First indexed parameter (optional)            |
|  | topics[2]         |  Second indexed parameter (optional)           |
|  | topics[3]         |  Third indexed parameter (optional)            |
|  +-------------------+                                                |
|  | data              |  ABI-encoded non-indexed parameters            |
|  +-------------------+                                                |
|                                                                       |
|  Maximum: 4 topics (topic[0] = event sig + up to 3 indexed params)   |
|  Anonymous events: no topic[0], allows 4 indexed params              |
+----------------------------------------------------------------------+
```

### Indexed vs Non-Indexed Parameters

| Aspect          | Indexed                          | Non-Indexed              |
|-----------------|----------------------------------|--------------------------|
| Storage         | Stored as topics                 | ABI-encoded in data      |
| Filterable      | Yes (bloom filter + topic match) | No                       |
| Max per event   | 3 (or 4 for anonymous events)   | Unlimited                |
| Value types     | Stored directly (32 bytes)       | ABI-encoded              |
| Reference types | keccak256 hash stored            | Full value in data       |
| Gas cost        | 375 per topic                    | 8 per byte of data       |

### Bloom Filters

Each block header contains a 256-byte (2048-bit) bloom filter aggregating all log addresses and topics from the block. This enables efficient filtering: a client can quickly determine that a block definitely does NOT contain a relevant log, avoiding the need to scan every receipt.

```
+----------------------------------------------------------------------+
|                    BLOOM FILTER                                        |
|                                                                       |
|  For each log entry, add to bloom:                                    |
|    1. The emitting contract address                                   |
|    2. Each topic value                                                |
|                                                                       |
|  Hash function: Take keccak256 of the value, extract 3 pairs of      |
|  bytes at positions (0,1), (2,3), (4,5). Each pair mod 2048 gives    |
|  a bit position to set in the bloom filter.                           |
|                                                                       |
|  Query: If ANY bit is NOT set -> value definitely absent              |
|         If ALL bits are set -> value PROBABLY present (false positive) |
+----------------------------------------------------------------------+
```

### Solidity Event Declaration and Emission

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract TokenEvents {
    // Event declaration
    // 'from' and 'to' are indexed (filterable), 'amount' is not
    event Transfer(
        address indexed from,
        address indexed to,
        uint256 amount
    );

    event Approval(
        address indexed owner,
        address indexed spender,
        uint256 amount
    );

    // Anonymous event (no topic[0], allows 4 indexed params)
    event Debug(
        uint256 indexed a,
        uint256 indexed b,
        uint256 indexed c,
        uint256 indexed d
    ) anonymous;

    mapping(address => uint256) public balances;

    function transfer(address to, uint256 amount) external {
        require(balances[msg.sender] >= amount, "Insufficient balance");
        balances[msg.sender] -= amount;
        balances[to] += amount;

        // Emit event -- this creates a log entry
        emit Transfer(msg.sender, to, amount);
    }
}
```

### Parsing Event Logs with ethers.js

```javascript
const { ethers } = require("ethers");

const provider = new ethers.JsonRpcProvider("https://rpc.ankr.com/eth");

const ERC20_ABI = [
  "event Transfer(address indexed from, address indexed to, uint256 amount)",
  "event Approval(address indexed owner, address indexed spender, uint256 amount)"
];

const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const contract = new ethers.Contract(USDC, ERC20_ABI, provider);

async function parseRecentTransfers() {
  // Method 1: Query past events with filters
  const filter = contract.filters.Transfer();
  const latestBlock = await provider.getBlockNumber();
  const events = await contract.queryFilter(filter, latestBlock - 100, latestBlock);

  for (const event of events) {
    console.log({
      from: event.args.from,
      to: event.args.to,
      amount: ethers.formatUnits(event.args.amount, 6),
      block: event.blockNumber,
      txHash: event.transactionHash,
    });
  }

  // Method 2: Filter by specific indexed parameter
  const vitalikAddress = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
  const fromVitalik = contract.filters.Transfer(vitalikAddress);
  const vitalikTxs = await contract.queryFilter(fromVitalik, latestBlock - 10000, latestBlock);
  console.log("Transfers from Vitalik:", vitalikTxs.length);

  // Method 3: Listen for real-time events
  contract.on("Transfer", (from, to, amount, event) => {
    console.log(`Transfer: ${from} -> ${to}: ${ethers.formatUnits(amount, 6)} USDC`);
  });
}

async function parseRawLogs() {
  // Parse raw logs from a transaction receipt
  const txHash = "0xYourTransactionHash";
  const receipt = await provider.getTransactionReceipt(txHash);

  const iface = new ethers.Interface(ERC20_ABI);

  for (const log of receipt.logs) {
    try {
      const parsed = iface.parseLog({
        topics: log.topics,
        data: log.data,
      });
      console.log("Event:", parsed.name);
      console.log("Args:", parsed.args);
    } catch (e) {
      // Log does not match any event in the ABI -- skip
    }
  }
}

async function buildCustomFilter() {
  // Build a raw filter using topic hashes
  const transferTopic = ethers.id("Transfer(address,address,uint256)");

  const filter = {
    address: USDC,
    topics: [
      transferTopic,
      null, // any 'from' address
      ethers.zeroPadValue("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", 32), // specific 'to'
    ],
    fromBlock: "latest",
  };

  const logs = await provider.getLogs(filter);
  console.log("Matching logs:", logs.length);
}
```

---

## 9. Worked Problems

### Problem 1: Decode Raw Calldata

**Question**: Given the following raw calldata, decode the function call:

```
0xa9059cbb
000000000000000000000000d8da6bf26964af9d7eed9e03e53415d37aa96045
0000000000000000000000000000000000000000000000000de0b6b3a7640000
```

**Solution**:

Step 1: Identify the function selector.
The first 4 bytes are `0xa9059cbb`. This is `keccak256("transfer(address,uint256)")` truncated to 4 bytes.

Step 2: Decode the arguments.
- **Arg 0 (address)**: Strip leading zeros from bytes 4-36. Address = `0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045`
- **Arg 1 (uint256)**: `0x0de0b6b3a7640000` = 1,000,000,000,000,000,000 = 1e18 (1 token with 18 decimals)

Step 3: Verify with ethers.js:

```javascript
const { ethers } = require("ethers");

const iface = new ethers.Interface([
  "function transfer(address to, uint256 amount) returns (bool)"
]);

const calldata = "0xa9059cbb000000000000000000000000d8da6bf26964af9d7eed9e03e53415d37aa960450000000000000000000000000000000000000000000000000de0b6b3a7640000";

const decoded = iface.decodeFunctionData("transfer", calldata);
console.log("To:", decoded[0]);
// 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045
console.log("Amount:", ethers.formatEther(decoded[1]));
// 1.0
```

---

### Problem 2: Compute a CREATE2 Address

**Question**: A factory at `0x1111111111111111111111111111111111111111` deploys a contract with init code `0x600a600055` using salt `0x00...01` (32 bytes, value 1). What is the deployed contract's address?

**Solution**:

```
address = keccak256(0xff ++ factory ++ salt ++ keccak256(initCode))[12:]
```

Step 1: Compute `keccak256(initCode)`:

```javascript
const { ethers } = require("ethers");

const factory = "0x1111111111111111111111111111111111111111";
const salt = ethers.zeroPadValue("0x01", 32);
const initCode = "0x600a600055";
const initCodeHash = ethers.keccak256(initCode);

console.log("Init code hash:", initCodeHash);

// Use ethers helper
const predicted = ethers.getCreate2Address(factory, salt, initCodeHash);
console.log("Predicted address:", predicted);
```

Step 2: Manual computation:

```
keccak256(0xff ++ 1111...1111 ++ 0000...0001 ++ keccak256(600a600055))
= keccak256(0xff1111111111111111111111111111111111111111
            00000000000000000000000000000000000000000000000000000000000000001
            <initCodeHash>)
Take bytes [12:32] of the result = deployed address
```

The key insight is that CREATE2 addresses are fully deterministic and can be computed before deployment. This enables counterfactual patterns where you can send funds to an address before the contract exists.

---

### Problem 3: Calculate Transaction Cost After EIP-1559

**Question**: A block has a `baseFee` of 20 gwei. A user submits a transaction with `maxFeePerGas = 50 gwei`, `maxPriorityFeePerGas = 3 gwei`, and `gasLimit = 100,000`. The transaction consumes 65,000 gas. Calculate:
1. The effective gas price
2. Total fee paid by the user
3. Amount burned
4. Amount paid to the validator
5. Amount refunded

**Solution**:

```
1. effectiveGasPrice = min(maxFeePerGas, baseFee + maxPriorityFeePerGas)
                     = min(50, 20 + 3)
                     = min(50, 23)
                     = 23 gwei

2. totalFee = gasUsed * effectiveGasPrice
            = 65,000 * 23 gwei
            = 1,495,000 gwei
            = 0.001495 ETH

3. burned = gasUsed * baseFee
          = 65,000 * 20 gwei
          = 1,300,000 gwei
          = 0.0013 ETH

4. validatorTip = gasUsed * (effectiveGasPrice - baseFee)
                = 65,000 * (23 - 20) gwei
                = 65,000 * 3 gwei
                = 195,000 gwei
                = 0.000195 ETH

5. refund = (gasLimit - gasUsed) * effectiveGasPrice
            (from the maxFeePerGas escrow perspective)
          = upfrontCost - totalFee
          = (100,000 * 50 gwei) - (65,000 * 23 gwei)
          = 5,000,000 - 1,495,000
          = 3,505,000 gwei
          = 0.003505 ETH
```

Verification:

```javascript
const { ethers } = require("ethers");

const baseFee = 20n;
const maxFeePerGas = 50n;
const maxPriorityFeePerGas = 3n;
const gasLimit = 100000n;
const gasUsed = 65000n;

const effectiveGasPrice = maxFeePerGas < baseFee + maxPriorityFeePerGas
  ? maxFeePerGas
  : baseFee + maxPriorityFeePerGas;

const totalFee = gasUsed * effectiveGasPrice;
const burned = gasUsed * baseFee;
const validatorTip = gasUsed * (effectiveGasPrice - baseFee);
const upfrontCost = gasLimit * maxFeePerGas;
const refund = upfrontCost - totalFee;

console.log("Effective gas price:", effectiveGasPrice.toString(), "gwei");
console.log("Total fee:", ethers.formatUnits(totalFee, "gwei"), "gwei");
console.log("Burned:", ethers.formatUnits(burned, "gwei"), "gwei");
console.log("Validator tip:", ethers.formatUnits(validatorTip, "gwei"), "gwei");
console.log("Refund:", ethers.formatUnits(refund, "gwei"), "gwei");
```

---

## Appendix: EVM Opcode Reference

A reference table of commonly encountered opcodes with their gas costs and stack effects.

| Opcode       | Hex  | Gas       | Stack In | Stack Out | Description                          |
|--------------|------|-----------|----------|-----------|--------------------------------------|
| STOP         | 0x00 | 0         | 0        | 0         | Halt execution                       |
| ADD          | 0x01 | 3         | 2        | 1         | a + b                                |
| MUL          | 0x02 | 5         | 2        | 1         | a * b                                |
| SUB          | 0x03 | 3         | 2        | 1         | a - b                                |
| DIV          | 0x04 | 5         | 2        | 1         | a / b (integer)                      |
| SDIV         | 0x05 | 5         | 2        | 1         | Signed a / b                         |
| MOD          | 0x06 | 5         | 2        | 1         | a % b                                |
| SMOD         | 0x07 | 5         | 2        | 1         | Signed a % b                         |
| ADDMOD       | 0x08 | 8         | 3        | 1         | (a + b) % N                          |
| MULMOD       | 0x09 | 8         | 3        | 1         | (a * b) % N                          |
| EXP          | 0x0a | 10+50/B   | 2        | 1         | a ** b                               |
| SIGNEXTEND   | 0x0b | 5         | 2        | 1         | Sign extend                          |
| LT           | 0x10 | 3         | 2        | 1         | a < b                                |
| GT           | 0x11 | 3         | 2        | 1         | a > b                                |
| SLT          | 0x12 | 3         | 2        | 1         | Signed a < b                         |
| SGT          | 0x13 | 3         | 2        | 1         | Signed a > b                         |
| EQ           | 0x14 | 3         | 2        | 1         | a == b                               |
| ISZERO       | 0x15 | 3         | 1        | 1         | a == 0                               |
| AND          | 0x16 | 3         | 2        | 1         | Bitwise AND                          |
| OR           | 0x17 | 3         | 2        | 1         | Bitwise OR                           |
| XOR          | 0x18 | 3         | 2        | 1         | Bitwise XOR                          |
| NOT          | 0x19 | 3         | 1        | 1         | Bitwise NOT                          |
| BYTE         | 0x1a | 3         | 2        | 1         | Extract byte from word               |
| SHL          | 0x1b | 3         | 2        | 1         | Shift left                           |
| SHR          | 0x1c | 3         | 2        | 1         | Logical shift right                  |
| SAR          | 0x1d | 3         | 2        | 1         | Arithmetic shift right               |
| SHA3         | 0x20 | 30+6/W   | 2        | 1         | keccak256 hash                       |
| ADDRESS      | 0x30 | 2         | 0        | 1         | Current contract address             |
| BALANCE      | 0x31 | 100-2600 | 1        | 1         | Address balance                      |
| ORIGIN       | 0x32 | 2         | 0        | 1         | tx.origin                            |
| CALLER       | 0x33 | 2         | 0        | 1         | msg.sender                           |
| CALLVALUE    | 0x34 | 2         | 0        | 1         | msg.value                            |
| CALLDATALOAD | 0x35 | 3         | 1        | 1         | Load 32 bytes from calldata          |
| CALLDATASIZE | 0x36 | 2         | 0        | 1         | Size of calldata in bytes            |
| CALLDATACOPY | 0x37 | 3+3/W    | 3        | 0         | Copy calldata to memory              |
| CODESIZE     | 0x38 | 2         | 0        | 1         | Size of contract code                |
| CODECOPY     | 0x39 | 3+3/W    | 3        | 0         | Copy code to memory                  |
| GASPRICE     | 0x3a | 2         | 0        | 1         | Transaction gas price                |
| RETURNDATASIZE| 0x3d| 2         | 0        | 1         | Size of last return data             |
| RETURNDATACOPY| 0x3e| 3+3/W    | 3        | 0         | Copy return data to memory           |
| BLOCKHASH    | 0x40 | 20        | 1        | 1         | Hash of a recent block               |
| COINBASE     | 0x41 | 2         | 0        | 1         | Block validator address              |
| TIMESTAMP    | 0x42 | 2         | 0        | 1         | Block timestamp                      |
| NUMBER       | 0x43 | 2         | 0        | 1         | Block number                         |
| PREVRANDAO   | 0x44 | 2         | 0        | 1         | Randomness beacon (post-Merge)       |
| GASLIMIT     | 0x45 | 2         | 0        | 1         | Block gas limit                      |
| CHAINID      | 0x46 | 2         | 0        | 1         | Chain ID                             |
| SELFBALANCE  | 0x47 | 5         | 0        | 1         | Current contract balance             |
| BASEFEE      | 0x48 | 2         | 0        | 1         | Block base fee (EIP-1559)            |
| POP          | 0x50 | 2         | 1        | 0         | Remove top stack item                |
| MLOAD        | 0x51 | 3*        | 1        | 1         | Load 32 bytes from memory            |
| MSTORE       | 0x52 | 3*        | 2        | 0         | Store 32 bytes to memory             |
| MSTORE8      | 0x53 | 3*        | 2        | 0         | Store 1 byte to memory               |
| SLOAD        | 0x54 | 100-2100 | 1        | 1         | Load from storage                    |
| SSTORE       | 0x55 | 100-20000| 2        | 0         | Store to storage                     |
| JUMP         | 0x56 | 8         | 1        | 0         | Unconditional jump                   |
| JUMPI        | 0x57 | 10        | 2        | 0         | Conditional jump                     |
| PC           | 0x58 | 2         | 0        | 1         | Program counter                      |
| MSIZE        | 0x59 | 2         | 0        | 1         | Current memory size                  |
| GAS          | 0x5a | 2         | 0        | 1         | Remaining gas                        |
| JUMPDEST     | 0x5b | 1         | 0        | 0         | Valid jump destination               |
| PUSH1-PUSH32 | 0x60-0x7f | 3  | 0        | 1         | Push 1-32 bytes onto stack           |
| DUP1-DUP16   | 0x80-0x8f | 3  | N        | N+1       | Duplicate Nth stack item             |
| SWAP1-SWAP16 | 0x90-0x9f | 3  | N+1      | N+1       | Swap top with Nth item               |
| LOG0         | 0xa0 | 375       | 2        | 0         | Log with 0 topics                    |
| LOG1         | 0xa1 | 750       | 3        | 0         | Log with 1 topic                     |
| LOG2         | 0xa2 | 1125      | 4        | 0         | Log with 2 topics                    |
| LOG3         | 0xa3 | 1500      | 5        | 0         | Log with 3 topics                    |
| LOG4         | 0xa4 | 1875      | 6        | 0         | Log with 4 topics                    |
| CREATE       | 0xf0 | 32000     | 3        | 1         | Create new contract                  |
| CALL         | 0xf1 | 100+*     | 7        | 1         | Call another contract                |
| CALLCODE     | 0xf2 | 100+*     | 7        | 1         | Call with own storage (deprecated)   |
| RETURN       | 0xf3 | 0*        | 2        | 0         | Return output data                   |
| DELEGATECALL | 0xf4 | 100+*     | 6        | 1         | Call with caller's context           |
| CREATE2      | 0xf5 | 32000     | 4        | 1         | Create with deterministic address    |
| STATICCALL   | 0xfa | 100+*     | 6        | 1         | Read-only external call              |
| REVERT       | 0xfd | 0*        | 2        | 0         | Revert with return data              |
| INVALID      | 0xfe | All       | 0        | 0         | Designated invalid opcode            |
| SELFDESTRUCT | 0xff | 5000+*    | 1        | 0         | Deprecated (EIP-6780)                |

**Gas notation**: `*` indicates additional memory expansion cost may apply. `+*` indicates variable cost depending on cold/warm access and value transfer. `/B` means per byte of exponent. `/W` means per 32-byte word.
