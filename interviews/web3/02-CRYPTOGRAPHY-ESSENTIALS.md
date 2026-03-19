# Chapter 2: Cryptography Essentials

## Introduction

Every wallet address, every transaction signature, every Merkle proof, and every zero-knowledge rollup is built on cryptographic primitives. You do not need to implement these algorithms from scratch, but you must understand exactly how they work and — critically — how they can be misused. A single misunderstanding about hash collision domains or signature malleability can create a vulnerability worth millions.

This chapter covers the cryptographic building blocks that secure the entire Web3 ecosystem: hash functions, elliptic curve cryptography, digital signatures, Merkle proofs, key management, and the conceptual foundations of zero-knowledge proofs.

```
+------------------------------------------------------------------------+
|                   CRYPTOGRAPHY IN WEB3                                  |
+------------------------------------------------------------------------+
|                                                                        |
|  HASH FUNCTIONS              ASYMMETRIC CRYPTO     DIGITAL SIGNATURES  |
|  +----------------------+   +------------------+  +------------------+ |
|  | SHA-256 (Bitcoin)      |   | secp256k1 curve  |  | ECDSA (Ethereum) | |
|  | Keccak-256 (Ethereum)  |   | ed25519 (Solana)  |  | EdDSA (Solana)   | |
|  | BLAKE2b (ZCash)        |   | BN254 (ZK proofs) |  | BLS (aggregation)| |
|  | Poseidon (ZK-friendly) |   | Private -> Public |  | EIP-712 typed    | |
|  | Pedersen (commitments) |   | Public -> Address |  | Schnorr (Bitcoin)| |
|  +----------------------+   +------------------+  +------------------+ |
|                                                                        |
|  MERKLE STRUCTURES           KEY MANAGEMENT        ZERO-KNOWLEDGE      |
|  +----------------------+   +------------------+  +------------------+ |
|  | Binary Merkle trees   |   | BIP-39 mnemonics |  | SNARKs (Groth16) | |
|  | Patricia Tries (ETH)  |   | BIP-32 HD wallets|  | STARKs           | |
|  | Verkle trees (future)  |   | BIP-44 derivation|  | PLONK            | |
|  | Inclusion/exclusion    |   | Hardware wallets  |  | Bulletproofs     | |
|  | proofs                |   | MPC wallets       |  | KZG commitments  | |
|  +----------------------+   +------------------+  +------------------+ |
|                                                                        |
+------------------------------------------------------------------------+
```

---

## 1. Hash Functions

### 1.1 Properties of Cryptographic Hash Functions

A cryptographic hash function `H(x)` maps arbitrary-length input to fixed-length output with these properties:

```
1. DETERMINISTIC:       Same input always produces same output
2. FAST:                Computing H(x) is efficient
3. PREIMAGE RESISTANT:  Given H(x), cannot find x
4. SECOND PREIMAGE:     Given x, cannot find y != x where H(x) = H(y)
5. COLLISION RESISTANT: Cannot find any x, y where H(x) = H(y)
6. AVALANCHE EFFECT:    Changing 1 bit of input changes ~50% of output bits
```

### 1.2 Keccak-256 (Ethereum's Hash Function)

Ethereum uses Keccak-256 (the original SHA-3 submission, slightly different from NIST's final SHA-3 standard). It appears everywhere in Ethereum:

```
Where Keccak-256 is used in Ethereum:

1. Address derivation:    address = keccak256(publicKey)[12:32]
2. Function selectors:    selector = keccak256("transfer(address,uint256)")[0:4]
3. Storage slots:         slot = keccak256(key . mappingSlot)
4. Event topic[0]:        topic = keccak256("Transfer(address,address,uint256)")
5. CREATE2 address:       addr = keccak256(0xff . deployer . salt . initCodeHash)
6. Block hashing:         blockHash = keccak256(rlp(blockHeader))
7. Transaction hashing:   txHash = keccak256(rlp(transaction))
```

```javascript
// Computing keccak256 with ethers.js
const { keccak256, toUtf8Bytes, AbiCoder } = require('ethers');

// Hash a string
const hash = keccak256(toUtf8Bytes('Hello, Web3!'));
console.log(hash);
// 0x5c8b7be8b59e0bce...

// Compute a function selector
const signature = 'transfer(address,uint256)';
const selector = keccak256(toUtf8Bytes(signature)).slice(0, 10);
console.log(selector);
// 0xa9059cbb

// Compute a storage slot for mapping(address => uint256) at slot 1
const coder = new AbiCoder();
const key = '0x1234567890AbCdEf1234567890AbCdEf12345678';
const slot = keccak256(coder.encode(['address', 'uint256'], [key, 1]));
console.log('Storage slot:', slot);
```

### 1.3 SHA-256 (Bitcoin's Hash Function)

Bitcoin uses SHA-256 (double SHA-256 for block hashing: `SHA256(SHA256(block_header))`). It is also used in Bitcoin's address derivation chain: `RIPEMD160(SHA256(publicKey))`.

### 1.4 ZK-Friendly Hash Functions

Traditional hash functions like SHA-256 and Keccak-256 are expensive to compute inside zero-knowledge circuits. Special "ZK-friendly" hash functions are designed for efficient circuit representation:

| Hash Function | Used In                   | ZK Circuit Cost                  |
| ------------- | ------------------------- | -------------------------------- |
| Poseidon      | zkSync, StarkNet circuits | Very low (~300 constraints)      |
| Pedersen      | ZCash, older ZK systems   | Low (~1000 constraints)          |
| Rescue        | Academic research         | Low                              |
| SHA-256       | Compatibility when needed | Very high (~30,000 constraints)  |
| Keccak-256    | Compatibility when needed | Very high (~150,000 constraints) |

---

## 2. Elliptic Curve Cryptography (ECC)

### 2.1 The Core Idea

An elliptic curve is defined by an equation like `y² = x³ + ax + b` over a finite field. We define a "point addition" operation on this curve that has a special property: given points `P` and `Q`, computing `P + Q` is easy, but given `P` and `R = kP` (scalar multiplication), finding `k` is computationally infeasible. This is the **Elliptic Curve Discrete Logarithm Problem (ECDLP)**.

```
Elliptic Curve Point Addition (simplified):

    |        *P
    |       / |
    |      /  |
    |     /   |
    |    * Q  |
    |   /     |
    |  /      |
    | *-------+---- Line through P and Q intersects curve at R'
    |         |     Reflect R' over x-axis to get R = P + Q
    |    * R  |
    |         |
    +---------+----------

Scalar Multiplication: kP = P + P + P + ... (k times)
  - Forward: Given k and P, computing kP is fast (O(log k) via double-and-add)
  - Reverse: Given P and kP, finding k is infeasible (no known efficient algorithm)
```

### 2.2 secp256k1: The Ethereum Curve

Both Bitcoin and Ethereum use the `secp256k1` curve:

```
secp256k1 parameters:

Equation:  y² = x³ + 7 (mod p)

p = 0xFFFFFFFF FFFFFFFF FFFFFFFF FFFFFFFF
    FFFFFFFF FFFFFFFF FFFFFFFE FFFFFC2F
  = 2²⁵⁶ - 2³² - 977  (a 256-bit prime)

Order n = 0xFFFFFFFF FFFFFFFF FFFFFFFF FFFFFFFE
          BAAEDCE6 AF48A03B BFD25E8C D0364141

Generator point G = (
  0x79BE667E F9DCBBAC 55A06295 CE870B07 029BFCDB 2DCE28D9 59F2815B 16F81798,
  0x483ADA77 26A3C465 5DA4FBFC 0E1108A8 FD17B448 A6855419 9C47D08F FB10D4B8
)

Private key:  256-bit integer k (1 < k < n)
Public key:   Point Q = kG (uncompressed: 64 bytes, compressed: 33 bytes)
Address:      keccak256(Q)[12:] (last 20 bytes)
```

### 2.3 Private Key to Address Derivation

```
Step-by-step Ethereum address derivation:

1. Generate private key (256 bits of randomness):
   k = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

2. Compute public key (point on secp256k1):
   Q = k * G
   Q = (x, y)  where x and y are each 256-bit integers
   Uncompressed: 0x04 + x (32 bytes) + y (32 bytes) = 65 bytes

3. Hash the public key (exclude the 0x04 prefix):
   hash = keccak256(x || y)   // 32 bytes

4. Take the last 20 bytes:
   address = hash[12:32]
   address = 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
```

```javascript
const { Wallet } = require('ethers');

// Derive address from private key
const privateKey =
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const wallet = new Wallet(privateKey);

console.log('Address:', wallet.address);
// 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266

console.log('Public Key:', wallet.signingKey.publicKey);
// 0x04 + 64 bytes (uncompressed)

// Generate a random wallet
const randomWallet = Wallet.createRandom();
console.log('New address:', randomWallet.address);
console.log('Mnemonic:', randomWallet.mnemonic.phrase);
```

---

## 3. Digital Signatures (ECDSA)

### 3.1 How ECDSA Works

ECDSA (Elliptic Curve Digital Signature Algorithm) proves that the holder of a private key authorized a message without revealing the private key itself.

```
ECDSA Signing (simplified):

Input: message m, private key k
Output: signature (r, s, v)

1. Hash the message:          z = keccak256(m)
2. Pick random nonce:         j (must be truly random and secret!)
3. Compute ephemeral point:   R = j * G
4. r = R.x mod n              (x-coordinate of R)
5. s = j⁻¹ * (z + r * k) mod n
6. v = recovery id (27 or 28, tells which of 2 possible public keys)

ECDSA Verification:

Input: message m, signature (r, s, v), claimed public key Q
Output: valid or invalid

1. Hash the message:    z = keccak256(m)
2. Compute:             u1 = z * s⁻¹ mod n
3. Compute:             u2 = r * s⁻¹ mod n
4. Compute point:       R' = u1 * G + u2 * Q
5. Check:               R'.x mod n == r ?
```

**Critical**: If the nonce `j` is reused for two different messages, the private key can be computed. This happened to the Sony PlayStation 3 signing key in 2010.

### 3.2 Ethereum Signatures in Practice

```javascript
const { Wallet, hashMessage, verifyMessage } = require('ethers');

const wallet = new Wallet(
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
);

// Sign a message
const message = 'I authorize this action';
const signature = await wallet.signMessage(message);
console.log('Signature:', signature);
// 0x + 65 bytes (r: 32 bytes, s: 32 bytes, v: 1 byte)

// Verify the signature (recover the signer's address)
const recoveredAddress = verifyMessage(message, signature);
console.log('Signer:', recoveredAddress);
// 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266

// In Solidity, this is done with ecrecover:
// address signer = ecrecover(messageHash, v, r, s);
```

### 3.3 EIP-712: Typed Structured Data

EIP-712 defines a standard for signing structured data (not just raw bytes), making signatures human-readable in wallets:

```javascript
const { Wallet } = require('ethers');

const wallet = new Wallet('0xac0974bec...');

// Define the domain separator
const domain = {
  name: 'MyDApp',
  version: '1',
  chainId: 1,
  verifyingContract: '0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC',
};

// Define the types
const types = {
  Transfer: [
    { name: 'to', type: 'address' },
    { name: 'amount', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
  ],
};

// Sign structured data
const value = {
  to: '0x1234567890AbCdEf1234567890AbCdEf12345678',
  amount: 1000000n,
  nonce: 0n,
};

const signature = await wallet.signTypedData(domain, types, value);
console.log('EIP-712 Signature:', signature);
```

### 3.4 EIP-155: Replay Protection

Before EIP-155, a transaction signed on Ethereum mainnet could be replayed on Ethereum Classic (or any fork). EIP-155 includes the chain ID in the transaction signing hash:

```
Pre EIP-155:  sign(rlp(nonce, gasPrice, gasLimit, to, value, data))
Post EIP-155: sign(rlp(nonce, gasPrice, gasLimit, to, value, data, chainId, 0, 0))

Chain IDs:
  1    = Ethereum Mainnet
  11155111 = Sepolia Testnet
  42161 = Arbitrum One
  10    = Optimism
  137   = Polygon
  8453  = Base
```

---

## 4. BLS Signatures

### 4.1 Why Ethereum PoS Uses BLS

BLS (Boneh-Lynn-Shacham) signatures have a unique property: **aggregation**. Multiple signatures on different messages by different signers can be combined into a single signature that is verified in one operation.

```
BLS Aggregation:

Without BLS (ECDSA):
  Validator 1 signs block -> sig1 (64 bytes)
  Validator 2 signs block -> sig2 (64 bytes)
  ...
  Validator 1000 signs block -> sig1000 (64 bytes)
  Total: 1000 * 64 = 64,000 bytes
  Verification: 1000 separate verifications

With BLS:
  Validator 1 signs block -> sig1
  Validator 2 signs block -> sig2
  ...
  Validator 1000 signs block -> sig1000
  Aggregate: aggSig = sig1 + sig2 + ... + sig1000 (48 bytes!)
  Total: 48 bytes
  Verification: 1 aggregated verification

This is critical for Ethereum PoS where 300,000+ validators must attest per epoch.
```

### 4.2 BLS Uses in Web3

| Application               | Why BLS                                             |
| ------------------------- | --------------------------------------------------- |
| Ethereum PoS attestations | Aggregate 300K+ validator votes into compact proofs |
| Threshold signatures      | M-of-N signing without revealing individual keys    |
| Cross-chain bridges       | Compact multi-validator proofs                      |
| Account abstraction       | Aggregate multiple UserOps into one verification    |

---

## 5. Merkle Proofs On-Chain

### 5.1 Airdrop Whitelists with Merkle Trees

One of the most common on-chain uses of Merkle proofs: efficiently verifying that an address is in a large whitelist without storing the entire list on-chain.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

contract MerkleAirdrop {
    bytes32 public immutable merkleRoot;
    mapping(address => bool) public hasClaimed;

    constructor(bytes32 _merkleRoot) {
        merkleRoot = _merkleRoot;
    }

    function claim(uint256 amount, bytes32[] calldata proof) external {
        require(!hasClaimed[msg.sender], "Already claimed");

        // Compute the leaf hash
        bytes32 leaf = keccak256(
            bytes.concat(keccak256(abi.encode(msg.sender, amount)))
        );

        // Verify the Merkle proof
        require(
            MerkleProof.verify(proof, merkleRoot, leaf),
            "Invalid proof"
        );

        hasClaimed[msg.sender] = true;
        // Transfer tokens to msg.sender...
    }
}
```

```javascript
// Generate Merkle tree off-chain
const { StandardMerkleTree } = require('@openzeppelin/merkle-tree');

const values = [
  ['0xAlice...', '1000000000000000000'], // 1 ETH
  ['0xBob...', '2000000000000000000'], // 2 ETH
  ['0xCharlie...', '500000000000000000'], // 0.5 ETH
];

const tree = StandardMerkleTree.of(values, ['address', 'uint256']);
console.log('Root:', tree.root);

// Get proof for Alice
for (const [i, v] of tree.entries()) {
  if (v[0] === '0xAlice...') {
    const proof = tree.getProof(i);
    console.log('Proof for Alice:', proof);
  }
}
```

### 5.2 Gas Costs: Merkle Proof vs Direct Storage

```
Storing 10,000 addresses on-chain:
  SSTORE per address: 20,000 gas
  Total: 10,000 * 20,000 = 200,000,000 gas (~$1,000+ at 30 gwei)

Merkle proof verification:
  Store 1 root: 20,000 gas (one-time)
  Verify proof: ~25,000 gas per claim (log2(10000) ≈ 14 hash operations)
  Savings: 99.99% less storage gas
```

---

## 6. Ethereum's State Data Structures

### 6.1 Merkle Patricia Trie (MPT)

Ethereum stores all account state in a **Modified Merkle Patricia Trie** — a tree that combines the properties of a Merkle tree (cryptographic verification) with a Patricia trie (efficient key-value storage with prefix compression).

```
Ethereum State Tries:

Block Header contains 3 trie roots:
+------------------------------------------+
| stateRoot:       Root of world state trie |
| transactionsRoot: Root of transaction trie|
| receiptsRoot:    Root of receipts trie    |
+------------------------------------------+

World State Trie:
  Key:   keccak256(address)
  Value: RLP(nonce, balance, storageRoot, codeHash)

Storage Trie (per contract):
  Key:   keccak256(storage_slot)
  Value: value stored at that slot

Each trie is a 16-ary tree with 4 node types:
  - Branch node:    16 children + optional value
  - Extension node: shared prefix + next node
  - Leaf node:      remaining path + value
  - Empty node:     null
```

### 6.2 Verkle Trees (Future Upgrade)

Verkle trees (Vector commitment + Merkle) use polynomial commitments instead of hashes, enabling much smaller proofs:

```
Merkle proof size:  O(k * log(n))   where k = branching factor
Verkle proof size:  O(log(n))        regardless of branching factor

Impact: Enables "stateless clients" that can verify blocks without
storing the full state trie (~1 TB savings for full nodes)
```

---

## 7. Zero-Knowledge Proofs (Conceptual)

### 7.1 What ZK Proofs Prove

A zero-knowledge proof lets a prover convince a verifier that a statement is true without revealing any information beyond the truth of the statement itself.

```
Classic example: "Where's Waldo?"

Without ZK:  "Waldo is at coordinates (x=347, y=212)"
              Reveals Waldo's exact location

With ZK:     Cut a hole in a large piece of cardboard
             Position cardboard over the page so only Waldo is visible
             Verifier sees Waldo exists on this page
             Verifier learns NOTHING about where Waldo is
```

### 7.2 Real Web3 Applications

```
ZK PROOF APPLICATIONS IN WEB3

+------------------------------------------------------------------------+
|                                                                        |
|  SCALING (ZK Rollups)                                                  |
|  "I processed 10,000 transactions correctly"                           |
|  Prove all state transitions are valid without re-executing them       |
|  Used by: zkSync Era, StarkNet, Polygon zkEVM, Scroll                 |
|                                                                        |
|  PRIVACY                                                               |
|  "I have enough balance" (without revealing my balance)                |
|  "I am in the allowed set" (without revealing which member I am)       |
|  Used by: Tornado Cash (deprecated), Zcash, Aztec                     |
|                                                                        |
|  IDENTITY                                                              |
|  "I am over 18" (without revealing my birthday)                        |
|  "I am a US citizen" (without revealing my passport number)            |
|  Used by: Polygon ID, Worldcoin, Sismo                                |
|                                                                        |
|  BRIDGES                                                               |
|  "This block was finalized on Ethereum" (light client proof)           |
|  Used by: Succinct, Polyhedra                                          |
|                                                                        |
+------------------------------------------------------------------------+
```

### 7.3 SNARKs vs STARKs

| Property           | SNARKs                                          | STARKs                                      |
| ------------------ | ----------------------------------------------- | ------------------------------------------- |
| Full name          | Succinct Non-interactive Arguments of Knowledge | Scalable Transparent Arguments of Knowledge |
| Trusted setup      | Required (ceremony)                             | Not required (transparent)                  |
| Proof size         | ~200 bytes (very small)                         | ~50-200 KB (larger)                         |
| Verification time  | Very fast (~5ms)                                | Fast (~50ms)                                |
| Proving time       | Moderate                                        | Slower for small circuits                   |
| Quantum resistance | No (relies on elliptic curves)                  | Yes (relies on hash functions)              |
| Used by            | zkSync, Scroll, Polygon zkEVM                   | StarkNet, StarkEx                           |
| Key scheme         | Groth16, PLONK, KZG                             | FRI (Fast Reed-Solomon IOP)                 |

---

## 8. Key Management and Wallets

### 8.1 HD Wallets: BIP-32 / BIP-39 / BIP-44

**Hierarchical Deterministic (HD) wallets** derive an unlimited number of key pairs from a single seed, organized in a tree structure.

```
BIP-39: Mnemonic to Seed

1. Generate 128-256 bits of entropy
2. Compute checksum: SHA256(entropy)[0:4 bits]
3. Convert entropy + checksum to 12-24 words from a 2048-word list

Example mnemonic (12 words):
"abandon abandon abandon abandon abandon abandon
 abandon abandon abandon abandon abandon about"

4. Derive seed: PBKDF2(mnemonic, "mnemonic" + passphrase, 2048 rounds, HMAC-SHA512)
   Result: 512-bit seed
```

```
BIP-32/44: Derivation Path

Seed -> Master Key -> Child Keys (tree structure)

Standard path: m / purpose' / coin_type' / account' / change / address_index

Ethereum:      m / 44' / 60' / 0' / 0 / 0    (first address)
               m / 44' / 60' / 0' / 0 / 1    (second address)
               m / 44' / 60' / 0' / 0 / 2    (third address)

Bitcoin:       m / 44' / 0'  / 0' / 0 / 0

' means hardened derivation (uses private key, more secure)
```

```javascript
const { Mnemonic, HDNodeWallet } = require('ethers');

// Generate a new mnemonic
const mnemonic = Mnemonic.fromEntropy(
  crypto.getRandomValues(new Uint8Array(16))
);
console.log('Mnemonic:', mnemonic.phrase);

// Derive wallets from mnemonic
const hdNode = HDNodeWallet.fromMnemonic(mnemonic);

// Derive first 5 addresses (standard Ethereum path)
for (let i = 0; i < 5; i++) {
  const child = hdNode.deriveChild(i);
  console.log(`Address ${i}: ${child.address}`);
}
```

### 8.2 Wallet Types Comparison

```
+------------------------------------------------------------------------+
|                      WALLET TYPES                                       |
+------------------------------------------------------------------------+
|                                                                        |
|  HOT WALLETS (connected to internet)                                   |
|  +----------------------------+   +----------------------------+       |
|  | Browser Extension           |   | Mobile Wallet              |       |
|  | MetaMask, Rabby, Coinbase  |   | Rainbow, Trust Wallet      |       |
|  | Pro: Convenient, fast      |   | Pro: Always accessible     |       |
|  | Con: Vulnerable to phishing|   | Con: Phone compromise risk |       |
|  +----------------------------+   +----------------------------+       |
|                                                                        |
|  COLD WALLETS (offline)                                                |
|  +----------------------------+   +----------------------------+       |
|  | Hardware Wallet             |   | Paper / Steel              |       |
|  | Ledger, Trezor, GridPlus   |   | Mnemonic on metal plate    |       |
|  | Pro: Keys never touch net  |   | Pro: Impervious to hacks   |       |
|  | Con: $80-200 cost          |   | Con: Physical theft risk   |       |
|  +----------------------------+   +----------------------------+       |
|                                                                        |
|  SMART WALLETS (contract-based)                                        |
|  +----------------------------+   +----------------------------+       |
|  | Multisig (Safe/Gnosis)     |   | Account Abstraction (4337) |       |
|  | M-of-N approval required   |   | Social recovery, sessions  |       |
|  | Pro: No single point of    |   | Pro: UX like Web2          |       |
|  |   failure                  |   | Con: Higher gas costs      |       |
|  +----------------------------+   +----------------------------+       |
|                                                                        |
|  MPC WALLETS (distributed key)                                         |
|  +------------------------------------------------------------+       |
|  | Key split across multiple parties (no single party has key) |       |
|  | Fireblocks, Fordefi, Lit Protocol                           |       |
|  | Pro: Institutional-grade security without hardware wallets  |       |
|  | Con: Complex setup, vendor dependence                       |       |
|  +------------------------------------------------------------+       |
|                                                                        |
+------------------------------------------------------------------------+
```

---

## 9. Worked Problems

### Problem 1: Address Derivation Verification

**Question**: Given private key `0x1`, what is the Ethereum address? Walk through each step.

**Solution**:

```
1. Private key: k = 1

2. Public key: Q = 1 * G = G (the generator point itself)
   Q.x = 0x79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798
   Q.y = 0x483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8

3. Concatenate x and y (64 bytes total):
   pubKeyBytes = Q.x || Q.y

4. Hash: keccak256(pubKeyBytes) = 0x...

5. Take last 20 bytes: 0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf
```

**Security note**: Private key `0x1` is well-known. Anyone who sends funds to this address will lose them to bots that monitor known weak keys.

### Problem 2: Signature Malleability

**Question**: Given a valid ECDSA signature `(r, s, v)`, can you produce a different valid signature for the same message without knowing the private key?

**Solution**: Yes! Given `(r, s, v)`, the signature `(r, n - s, v ^ 1)` is also valid (where `n` is the curve order). This is **signature malleability**.

```
Original:   (r, s, v=27)    -> ecrecover returns address A
Malleable:  (r, n-s, v=28)  -> ecrecover also returns address A!

This can break contracts that use signature hashes as unique identifiers.

Fix: EIP-2 (Homestead) requires s to be in the lower half of the curve order:
  require(s <= 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0)

OpenZeppelin's ECDSA.sol enforces this check automatically.
```

### Problem 3: Merkle Proof Gas Estimation

**Question**: You have a Merkle tree with 100,000 leaves. How many hashes are needed to verify a proof, and approximately how much gas does verification cost?

**Solution**:

```
Proof depth = ceil(log2(100,000)) = 17 levels

Each level requires:
  - 1 keccak256 hash (30 gas base + 6 gas per 32 bytes = ~66 gas)
  - Plus memory operations (~100 gas per level)

Total: 17 * ~166 = ~2,822 gas for hashing
Plus overhead (CALLDATALOAD, stack operations): ~20,000 gas

Approximate total: ~25,000 gas for proof verification

At 30 gwei gas price and ETH = $3,000:
  Cost = 25,000 * 30 * 10⁻⁹ * 3000 = ~$0.002
```

---

## Appendix: Cryptography Cheat Sheet

```
CRYPTOGRAPHY ESSENTIALS CHEAT SHEET

Hash Functions:
  keccak256(x)     Ethereum's hash function (32 bytes output)
  SHA-256(x)       Bitcoin's hash function
  Poseidon(x)      ZK-friendly hash (efficient in circuits)

Elliptic Curve (secp256k1):
  Private key:     k, a random 256-bit integer
  Public key:      Q = k * G (point on curve, 64 bytes uncompressed)
  Address:         keccak256(Q)[12:] (last 20 bytes)

ECDSA Signature:
  Sign:            (r, s, v) = sign(keccak256(message), privateKey)
  Verify:          address = ecrecover(hash, v, r, s)
  EIP-712:         Typed structured data signing (human-readable in wallet)
  EIP-155:         Chain ID in signature prevents cross-chain replay

BLS Signatures:
  Aggregation:     aggSig = sig1 + sig2 + ... (single verification!)
  Used in:         Ethereum PoS validator attestations

Merkle Proofs:
  Proof size:      O(log n) hashes for n leaves
  On-chain cost:   ~25,000 gas to verify
  Use case:        Airdrops, whitelists, state verification

Key Derivation (HD Wallets):
  BIP-39:          Entropy -> Mnemonic (12-24 words) -> Seed (512 bits)
  BIP-32:          Seed -> Master Key -> Child Keys (tree structure)
  BIP-44:          m/44'/60'/0'/0/index (standard Ethereum path)

ZK Proofs:
  SNARKs:          Small proofs (~200B), need trusted setup, not quantum-safe
  STARKs:          Larger proofs (~50KB), no trusted setup, quantum-safe
  Use cases:       Scaling (rollups), privacy, identity, bridges
```
