# Chapter 6: Smart Contract Development Tools

## Introduction

The difference between a productive Web3 developer and a frustrated one is mastery of the tooling. Hardhat and Foundry are the two dominant smart contract development frameworks; understanding both makes you versatile across teams and projects. This chapter covers the complete local development workflow — from project setup through testing, deployment, verification, and CI/CD.

```
+------------------------------------------------------------------------+
|                 SMART CONTRACT DEV TOOLING                              |
+------------------------------------------------------------------------+
|                                                                        |
|  IDE & EDITING                FRAMEWORKS                               |
|  +----------------------+    +---------------------------+             |
|  | VS Code + Solidity    |    | Hardhat (JS/TS ecosystem) |             |
|  | Remix IDE (browser)   |    | Foundry (Solidity-native) |             |
|  | IntelliJ + Solidity   |    | Truffle (legacy)          |             |
|  +----------------------+    +---------------------------+             |
|                                                                        |
|  TESTING                      DEPLOYMENT & VERIFY                      |
|  +----------------------+    +---------------------------+             |
|  | Unit tests            |    | Hardhat Ignition          |             |
|  | Fork testing           |    | Foundry scripts           |             |
|  | Fuzz testing           |    | Etherscan verification    |             |
|  | Coverage reporting    |    | Sourcify                  |             |
|  +----------------------+    +---------------------------+             |
|                                                                        |
|  LOCAL NODES                  UTILITIES                                |
|  +----------------------+    +---------------------------+             |
|  | Hardhat Network       |    | OpenZeppelin Contracts    |             |
|  | Anvil (Foundry)       |    | Tenderly (simulation)     |             |
|  | Ganache (legacy)      |    | cast (CLI Swiss-army)     |             |
|  +----------------------+    +---------------------------+             |
|                                                                        |
+------------------------------------------------------------------------+
```

---

## 1. Development Environment Setup

### 1.1 Prerequisites

```bash
# Node.js (v18+ recommended)
node --version

# Git
git --version

# VS Code Extensions
# - "Nomic Foundation Solidity" (Hardhat team, best Solidity support)
# - "Even Better TOML" (for foundry.toml)
```

### 1.2 MetaMask Setup

1. Install MetaMask browser extension
2. Create a wallet (store seed phrase securely — NEVER in code or git)
3. Add test networks: Sepolia (chain ID 11155111)
4. Get testnet ETH from faucets:
   - Google Cloud Web3 Faucet
   - Alchemy Sepolia Faucet
   - Infura Sepolia Faucet

---

## 2. Remix IDE

### 2.1 When to Use Remix

Remix is a browser-based IDE — no installation needed. Use it for:

- Quick prototyping and learning
- Testing small contracts
- Deploying to testnets without a local setup
- Debugging transactions step-by-step

### 2.2 Remix Workflow

```
1. Go to remix.ethereum.org
2. Create a new .sol file in the File Explorer
3. Write your contract
4. Compile (Ctrl+S or Solidity Compiler tab)
5. Deploy (Deploy & Run tab):
   - "Remix VM" for local testing
   - "Injected Provider" for MetaMask (testnet/mainnet)
6. Interact with deployed contract in the UI
7. Debug transactions in the Debugger tab
```

---

## 3. Hardhat

### 3.1 Project Setup

```bash
mkdir my-project && cd my-project
npm init -y
npm install --save-dev hardhat @nomicfoundation/hardhat-toolbox

# Initialize a new Hardhat project
npx hardhat init
# Select "Create a TypeScript project"
```

### 3.2 Project Structure

```
my-project/
├── contracts/           # Solidity source files
│   └── Lock.sol
├── ignition/            # Deployment modules
│   └── modules/
│       └── Lock.ts
├── test/                # Test files
│   └── Lock.ts
├── hardhat.config.ts    # Configuration
├── package.json
└── tsconfig.json
```

### 3.3 Configuration

```typescript
// hardhat.config.ts
import { HardhatUserConfig } from 'hardhat/config';
import '@nomicfoundation/hardhat-toolbox';

const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.24',
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL || '',
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
    hardhat: {
      forking: {
        url: process.env.MAINNET_RPC_URL || '',
        // Fork mainnet at a specific block for reproducible tests
        blockNumber: 19000000,
      },
    },
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY,
  },
};

export default config;
```

### 3.4 Common Commands

```bash
npx hardhat compile              # Compile contracts
npx hardhat test                 # Run tests
npx hardhat test --grep "mint"   # Run specific tests
npx hardhat node                 # Start local node
npx hardhat coverage             # Generate coverage report

# Deploy with Ignition
npx hardhat ignition deploy ignition/modules/Lock.ts --network sepolia

# Verify on Etherscan
npx hardhat verify --network sepolia <CONTRACT_ADDRESS> <CONSTRUCTOR_ARGS>
```

### 3.5 Hardhat Network Features

```
+------------------------------------------------------------------------+
|                    HARDHAT NETWORK                                       |
+------------------------------------------------------------------------+
|                                                                        |
|  MAINNET FORKING                                                       |
|  - Fork any EVM chain at any block number                              |
|  - Test against real contract state (Uniswap, Aave, etc.)             |
|  - Impersonate any address (even whale wallets)                        |
|                                                                        |
|  CONSOLE.LOG                                                           |
|  - import "hardhat/console.sol"                                        |
|  - console.log() from Solidity (development only!)                    |
|  - Automatically stripped in production builds                         |
|                                                                        |
|  TIME/BLOCK MANIPULATION                                               |
|  - await network.provider.send("evm_increaseTime", [3600])            |
|  - await network.provider.send("evm_mine")                            |
|  - Test time-dependent logic (vesting, locks)                         |
|                                                                        |
+------------------------------------------------------------------------+
```

---

## 4. Foundry

### 4.1 Installation

```bash
# Install foundryup
curl -L https://foundry.paradigm.xyz | bash
foundryup

# Verify installation
forge --version
cast --version
anvil --version
chisel --version
```

### 4.2 Project Setup

```bash
forge init my-project
cd my-project
```

```
my-project/
├── src/                 # Solidity source files
│   └── Counter.sol
├── test/                # Test files (in Solidity!)
│   └── Counter.t.sol
├── script/              # Deployment scripts (in Solidity!)
│   └── Counter.s.sol
├── lib/                 # Dependencies (git submodules)
├── foundry.toml         # Configuration
└── remappings.txt       # Import remappings
```

### 4.3 Configuration

```toml
# foundry.toml
[profile.default]
src = "src"
out = "out"
libs = ["lib"]
solc = "0.8.24"
optimizer = true
optimizer_runs = 200

[profile.default.fuzz]
runs = 256
max_test_rejects = 65536

[rpc_endpoints]
sepolia = "${SEPOLIA_RPC_URL}"
mainnet = "${MAINNET_RPC_URL}"

[etherscan]
sepolia = { key = "${ETHERSCAN_API_KEY}" }
```

### 4.4 Writing Tests in Solidity

```solidity
// test/Counter.t.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/Counter.sol";

contract CounterTest is Test {
    Counter public counter;

    function setUp() public {
        counter = new Counter();
        counter.setNumber(0);
    }

    function test_Increment() public {
        counter.increment();
        assertEq(counter.number(), 1);
    }

    function test_SetNumber() public {
        counter.setNumber(42);
        assertEq(counter.number(), 42);
    }

    // Fuzz testing: Foundry generates random inputs
    function testFuzz_SetNumber(uint256 x) public {
        counter.setNumber(x);
        assertEq(counter.number(), x);
    }

    // Test that a function reverts
    function test_RevertWhen_Unauthorized() public {
        vm.prank(address(0xdead)); // Impersonate another address
        vm.expectRevert("Ownable: caller is not the owner");
        counter.setNumber(999);
    }

    // Fork testing
    function test_ForkMainnet() public {
        // Fork mainnet at latest block
        vm.createSelectFork("mainnet");

        // Interact with real deployed contracts
        address usdc = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;
        uint256 totalSupply = IERC20(usdc).totalSupply();
        assertGt(totalSupply, 0);
    }
}
```

### 4.5 Foundry Cheat Codes (vm)

```solidity
// Time manipulation
vm.warp(block.timestamp + 1 days);     // Set block.timestamp
vm.roll(block.number + 100);            // Set block.number

// Address manipulation
vm.prank(alice);                         // Next call is from alice
vm.startPrank(alice);                    // All subsequent calls from alice
vm.stopPrank();                          // Stop impersonation

// Expecting events and reverts
vm.expectEmit(true, true, false, true);  // Check indexed params
emit Transfer(alice, bob, 100);          // Expected event
vm.expectRevert("Insufficient balance"); // Expect next call to revert

// Deal ETH or tokens
vm.deal(alice, 100 ether);              // Give alice 100 ETH
deal(address(usdc), alice, 1000e6);     // Give alice 1000 USDC

// Snapshots
uint256 snapshot = vm.snapshot();        // Save state
vm.revertTo(snapshot);                   // Restore state

// Labels for trace output
vm.label(alice, "Alice");
vm.label(address(usdc), "USDC");
```

### 4.6 Common Foundry Commands

```bash
forge build                          # Compile
forge test                           # Run all tests
forge test -vvvv                     # Verbose output (show traces)
forge test --match-test "testMint"   # Run specific test
forge test --fork-url $RPC_URL       # Fork testing
forge coverage                       # Coverage report
forge snapshot                       # Gas snapshot

# Cast: CLI for interacting with chains
cast call 0x... "balanceOf(address)" 0xAlice --rpc-url $RPC
cast send 0x... "transfer(address,uint256)" 0xBob 100 --private-key $KEY
cast abi-encode "transfer(address,uint256)" 0xBob 100
cast sig "transfer(address,uint256)"  # Returns: 0xa9059cbb
cast block latest --rpc-url $RPC     # Get latest block info

# Anvil: Local node
anvil                                # Start local node at port 8545
anvil --fork-url $MAINNET_RPC        # Fork mainnet locally
```

---

## 5. Testing Strategies

### 5.1 Test Pyramid for Smart Contracts

```
         /\
        /  \         E2E Tests (Tenderly, staging deploy)
       /    \        - Test on real testnet
      /------\       - Full deployment pipeline
     /        \
    / Integr.  \     Integration Tests (fork testing)
   /   Tests    \    - Fork mainnet, test against real state
  /              \   - Test protocol interactions
 /----------------\
/   Unit Tests     \ Unit Tests (local, fast)
/                    \ - Test individual functions
/____________________\ - Mock external contracts
                       - Fuzz with random inputs
```

### 5.2 Hardhat Test (TypeScript)

```typescript
// test/MyToken.test.ts
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { loadFixture } from '@nomicfoundation/hardhat-toolbox/network-helpers';

describe('MyToken', function () {
  async function deployFixture() {
    const [owner, alice, bob] = await ethers.getSigners();
    const MyToken = await ethers.getContractFactory('MyToken');
    const token = await MyToken.deploy('MyToken', 'MTK');
    return { token, owner, alice, bob };
  }

  describe('Deployment', function () {
    it('should set the right name and symbol', async function () {
      const { token } = await loadFixture(deployFixture);
      expect(await token.name()).to.equal('MyToken');
      expect(await token.symbol()).to.equal('MTK');
    });

    it('should mint initial supply to owner', async function () {
      const { token, owner } = await loadFixture(deployFixture);
      const balance = await token.balanceOf(owner.address);
      expect(balance).to.equal(ethers.parseEther('1000000'));
    });
  });

  describe('Transfers', function () {
    it('should transfer tokens between accounts', async function () {
      const { token, owner, alice } = await loadFixture(deployFixture);
      const amount = ethers.parseEther('100');

      await token.transfer(alice.address, amount);
      expect(await token.balanceOf(alice.address)).to.equal(amount);
    });

    it('should revert on insufficient balance', async function () {
      const { token, alice, bob } = await loadFixture(deployFixture);
      await expect(
        token.connect(alice).transfer(bob.address, 1n)
      ).to.be.revertedWithCustomError(token, 'ERC20InsufficientBalance');
    });

    it('should emit Transfer event', async function () {
      const { token, owner, alice } = await loadFixture(deployFixture);
      const amount = ethers.parseEther('50');

      await expect(token.transfer(alice.address, amount))
        .to.emit(token, 'Transfer')
        .withArgs(owner.address, alice.address, amount);
    });
  });
});
```

---

## 6. Deployment and Verification

### 6.1 Hardhat Ignition Module

```typescript
// ignition/modules/MyToken.ts
import { buildModule } from '@nomicfoundation/hardhat-ignition/modules';

const MyTokenModule = buildModule('MyTokenModule', (m) => {
  const initialOwner = m.getParameter('initialOwner');
  const token = m.contract('MyToken', ['MyToken', 'MTK']);
  return { token };
});

export default MyTokenModule;
```

```bash
# Deploy to Sepolia
npx hardhat ignition deploy ignition/modules/MyToken.ts \
  --network sepolia \
  --parameters '{"MyTokenModule": {"initialOwner": "0x..."}}'
```

### 6.2 Foundry Deployment Script

```solidity
// script/Deploy.s.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/MyToken.sol";

contract DeployScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        MyToken token = new MyToken("MyToken", "MTK");
        console.log("Token deployed at:", address(token));

        vm.stopBroadcast();
    }
}
```

```bash
# Deploy with Foundry
forge script script/Deploy.s.sol:DeployScript \
  --rpc-url $SEPOLIA_RPC_URL \
  --broadcast \
  --verify \
  --etherscan-api-key $ETHERSCAN_API_KEY
```

---

## 7. OpenZeppelin

### 7.1 Contracts Library

OpenZeppelin provides audited, battle-tested implementations of common patterns:

```bash
# Install for Hardhat
npm install @openzeppelin/contracts

# Install for Foundry
forge install OpenZeppelin/openzeppelin-contracts
```

```
KEY OPENZEPPELIN CONTRACTS

Token Standards:    ERC20, ERC721, ERC1155, ERC4626
Access Control:     Ownable, AccessControl, Governor
Security:           ReentrancyGuard, Pausable, Multicall
Proxy:              TransparentProxy, UUPSUpgradeable, Clones
Utils:              SafeERC20, MerkleProof, ECDSA, Strings
Governance:         Governor, TimelockController, Votes
```

### 7.2 OpenZeppelin Wizard

Use the web-based Wizard at wizard.openzeppelin.com to generate contract boilerplate:

1. Select contract type (ERC-20, ERC-721, Governor, etc.)
2. Toggle features (Mintable, Burnable, Pausable, Permit, etc.)
3. Copy generated code into your project

---

## 8. CI/CD for Smart Contracts

### 8.1 GitHub Actions Workflow

```yaml
# .github/workflows/test.yml
name: Smart Contract CI

on: [push, pull_request]

jobs:
  foundry-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          submodules: recursive

      - name: Install Foundry
        uses: foundry-rs/foundry-toolchain@v1

      - name: Build
        run: forge build --sizes

      - name: Run Tests
        run: forge test -vvv

      - name: Run Coverage
        run: forge coverage

      - name: Gas Snapshot
        run: forge snapshot --check
```

---

## 9. Worked Problems

### Problem 1: Debug a Failing Foundry Test

```solidity
// This test fails. Why?
function test_Transfer() public {
    token.mint(alice, 100);
    vm.prank(alice);
    token.transfer(bob, 50);
    assertEq(token.balanceOf(bob), 50);  // FAILS
}

// Solution: alice was never given approval/minting might require owner role.
// Run with -vvvv to see the full trace:
// forge test --match-test test_Transfer -vvvv
// The trace shows: "Ownable: caller is not the owner" during mint()
// Fix: add vm.prank(owner) before mint
```

---

## Appendix: Tool Comparison Matrix

```
+------------------------------------------------------------------------+
|              HARDHAT vs FOUNDRY vs REMIX                                |
+------------------------------------------------------------------------+
| Feature           | Hardhat        | Foundry         | Remix           |
|-------------------|----------------|-----------------|-----------------|
| Language          | JavaScript/TS  | Solidity         | Browser UI      |
| Test language     | JS/TS (Mocha)  | Solidity         | Solidity/JS     |
| Speed             | Moderate       | Very fast        | N/A             |
| Fuzz testing      | Plugin         | Built-in         | No              |
| Fork testing      | Yes            | Yes              | Limited         |
| Gas reporting     | Plugin         | Built-in         | Per-tx only     |
| Debugging         | console.log    | Traces (-vvvv)   | Step debugger   |
| Deployment        | Ignition       | Scripts          | UI deploy       |
| Verification      | Plugin         | Built-in         | Plugin          |
| Dependencies      | npm            | git submodules   | URL imports     |
| Learning curve    | Lower (JS)    | Higher (Solidity)| Lowest          |
| Best for          | JS/TS teams   | Solidity purists | Learning/proto  |
+------------------------------------------------------------------------+

Recommendation:
- Beginners: Start with Remix, then Hardhat
- Experienced: Use Foundry for testing, Hardhat for deployment/scripts
- Many teams use BOTH: Foundry for tests, Hardhat for TypeScript tooling
```
