# Chapter 9: Frontend DApp Development

## Introduction

A decentralized application (DApp) is only useful if users can interact with it. The frontend connects wallets to smart contracts, reads on-chain state, submits transactions, and handles the asynchronous, error-prone nature of blockchain interactions. Modern Web3 frontend development uses TypeScript libraries like ethers.js, viem, and wagmi to bridge the gap between React/Next.js UIs and Ethereum smart contracts.

```
+------------------------------------------------------------------------+
|                    DAPP FRONTEND STACK                                   |
+------------------------------------------------------------------------+
|                                                                        |
|  USER INTERFACE               WALLET CONNECTION                        |
|  +----------------------+    +---------------------------+             |
|  | React / Next.js       |    | RainbowKit (modal UI)     |             |
|  | Tailwind CSS          |    | ConnectKit (alternative)  |             |
|  | Framer Motion          |    | WalletConnect (protocol)  |             |
|  +----------------------+    +---------------------------+             |
|                                                                        |
|  BLOCKCHAIN INTERACTION       STATE MANAGEMENT                         |
|  +----------------------+    +---------------------------+             |
|  | viem (low-level)      |    | wagmi (React hooks)       |             |
|  | ethers.js v6          |    | TanStack Query (caching)  |             |
|  | ABI encoding/decoding |    | Zustand / Jotai           |             |
|  +----------------------+    +---------------------------+             |
|                                                                        |
|  RPC PROVIDERS                UTILITIES                                |
|  +----------------------+    +---------------------------+             |
|  | Alchemy               |    | ENS resolution            |             |
|  | Infura                |    | IPFS metadata             |             |
|  | QuickNode             |    | Block explorers           |             |
|  +----------------------+    +---------------------------+             |
|                                                                        |
+------------------------------------------------------------------------+
```

---

## 1. Core Libraries

### 1.1 ethers.js vs viem

```
+------------------------------------------------------------------------+
|              ethers.js v6          vs          viem                      |
+------------------------------------------------------------------------+
| Philosophy   | All-in-one, class-based   | Modular, functional          |
| Bundle size  | ~120KB                    | ~35KB (tree-shakeable)       |
| TypeScript   | Good                      | Excellent (strict types)     |
| API style    | OOP (new Contract(...))   | Functions (readContract())   |
| React hooks  | Manual                    | wagmi (official)             |
| Maturity     | Older, more examples      | Newer, growing fast          |
| ABI typing   | Runtime only              | Compile-time type safety     |
+------------------------------------------------------------------------+

Recommendation:
- New projects: viem + wagmi (modern, type-safe)
- Existing projects: ethers.js v6 (stable, familiar)
- Scripts/backend: either works well
```

### 1.2 ethers.js Basics

```typescript
import { ethers } from "ethers";

// Connect to Ethereum via browser wallet
const provider = new ethers.BrowserProvider(window.ethereum);
const signer = await provider.getSigner();

// Connect to a specific RPC
const rpcProvider = new ethers.JsonRpcProvider("https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY");

// Read chain data
const blockNumber = await provider.getBlockNumber();
const balance = await provider.getBalance("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"); // vitalik.eth
console.log(`Balance: ${ethers.formatEther(balance)} ETH`);

// Interact with a contract
const ERC20_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "event Transfer(address indexed from, address indexed to, uint256 value)"
];

const usdc = new ethers.Contract(
  "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", // USDC address
  ERC20_ABI,
  provider // read-only; use signer for write operations
);

const name = await usdc.name();       // "USD Coin"
const symbol = await usdc.symbol();   // "USDC"
const balance = await usdc.balanceOf("0xAlice...");
console.log(`${name}: ${ethers.formatUnits(balance, 6)}`); // USDC has 6 decimals

// Send a transaction (requires signer)
const usdcWithSigner = usdc.connect(signer);
const tx = await usdcWithSigner.transfer("0xBob...", ethers.parseUnits("100", 6));
const receipt = await tx.wait(); // Wait for confirmation
console.log(`Transaction confirmed in block ${receipt.blockNumber}`);
```

### 1.3 viem Basics

```typescript
import { createPublicClient, createWalletClient, http, parseEther, formatEther } from "viem";
import { mainnet } from "viem/chains";

// Public client (read-only)
const publicClient = createPublicClient({
  chain: mainnet,
  transport: http("https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY"),
});

// Read data
const blockNumber = await publicClient.getBlockNumber();
const balance = await publicClient.getBalance({
  address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
});
console.log(`Balance: ${formatEther(balance)} ETH`);

// Read contract (fully typed with ABI)
const erc20Abi = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

const usdcBalance = await publicClient.readContract({
  address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  abi: erc20Abi,
  functionName: "balanceOf",
  args: ["0xAlice..."],
});
```

---

## 2. Wallet Connection with wagmi + RainbowKit

### 2.1 Project Setup

```bash
npm create wagmi@latest my-dapp
cd my-dapp
npm install @rainbow-me/rainbowkit
npm install
```

### 2.2 Configuration

```typescript
// src/wagmi.ts
import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { mainnet, sepolia, arbitrum, optimism, base } from "wagmi/chains";

export const config = getDefaultConfig({
  appName: "My DApp",
  projectId: "YOUR_WALLETCONNECT_PROJECT_ID", // From cloud.walletconnect.com
  chains: [mainnet, sepolia, arbitrum, optimism, base],
});
```

```tsx
// src/app/providers.tsx
"use client";

import { WagmiProvider } from "wagmi";
import { RainbowKitProvider } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { config } from "../wagmi";
import "@rainbow-me/rainbowkit/styles.css";

const queryClient = new QueryClient();

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
```

### 2.3 Connect Button

```tsx
// src/app/page.tsx
import { ConnectButton } from "@rainbow-me/rainbowkit";

export default function Home() {
  return (
    <div>
      <h1>My DApp</h1>
      <ConnectButton />
    </div>
  );
}
```

---

## 3. Reading Contract State with wagmi Hooks

### 3.1 useReadContract

```tsx
import { useReadContract } from "wagmi";
import { formatUnits } from "viem";

const erc20Abi = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

function TokenBalance({ address }: { address: `0x${string}` }) {
  const { data: balance, isLoading, error } = useReadContract({
    address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [address],
  });

  if (isLoading) return <span>Loading...</span>;
  if (error) return <span>Error: {error.message}</span>;

  return <span>{formatUnits(balance ?? 0n, 6)} USDC</span>;
}
```

### 3.2 useAccount and useBalance

```tsx
import { useAccount, useBalance } from "wagmi";
import { formatEther } from "viem";

function WalletInfo() {
  const { address, isConnected, chain } = useAccount();
  const { data: balance } = useBalance({ address });

  if (!isConnected) return <p>Connect your wallet</p>;

  return (
    <div>
      <p>Address: {address}</p>
      <p>Chain: {chain?.name}</p>
      <p>Balance: {balance ? formatEther(balance.value) : "0"} ETH</p>
    </div>
  );
}
```

---

## 4. Writing Transactions

### 4.1 useWriteContract

```tsx
import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseUnits } from "viem";

const erc20Abi = [
  {
    name: "transfer",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

function TransferForm() {
  const { writeContract, data: hash, isPending } = useWriteContract();

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  });

  function handleTransfer() {
    writeContract({
      address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      abi: erc20Abi,
      functionName: "transfer",
      args: ["0xRecipient...", parseUnits("100", 6)],
    });
  }

  return (
    <div>
      <button onClick={handleTransfer} disabled={isPending}>
        {isPending ? "Confirm in wallet..." : "Send 100 USDC"}
      </button>
      {isConfirming && <p>Waiting for confirmation...</p>}
      {isSuccess && <p>Transaction confirmed!</p>}
      {hash && <p>Tx: {hash}</p>}
    </div>
  );
}
```

### 4.2 Transaction Lifecycle in UI

```
USER EXPERIENCE FLOW

1. User clicks "Send" button
   -> Show "Confirm in wallet..." state

2. Wallet popup appears (MetaMask/RainbowKit)
   -> User reviews transaction details
   -> User clicks "Confirm" or "Reject"

3. If rejected:
   -> Show "Transaction rejected" message
   -> Reset button state

4. If confirmed:
   -> Transaction submitted to mempool
   -> Show "Pending..." with tx hash link to Etherscan
   -> Show spinner/loading state

5. Transaction included in block:
   -> Show "Confirmed!" with block number
   -> Update UI with new state (new balance, etc.)
   -> Invalidate cached queries to refresh data

6. If transaction reverts:
   -> Show "Transaction failed" with error message
   -> Parse revert reason for user-friendly message
```

---

## 5. Listening to Events

### 5.1 useWatchContractEvent

```tsx
import { useWatchContractEvent } from "wagmi";

function TransferWatcher() {
  useWatchContractEvent({
    address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    abi: [
      {
        name: "Transfer",
        type: "event",
        inputs: [
          { name: "from", type: "address", indexed: true },
          { name: "to", type: "address", indexed: true },
          { name: "value", type: "uint256", indexed: false },
        ],
      },
    ],
    eventName: "Transfer",
    onLogs(logs) {
      for (const log of logs) {
        console.log(`Transfer: ${log.args.from} -> ${log.args.to}: ${log.args.value}`);
      }
    },
  });

  return <p>Watching for USDC transfers...</p>;
}
```

### 5.2 Querying Historical Events with ethers.js

```typescript
const filter = usdc.filters.Transfer(null, "0xAlice..."); // All transfers TO Alice
const events = await usdc.queryFilter(filter, -10000); // Last 10,000 blocks

for (const event of events) {
  console.log(`From: ${event.args.from}`);
  console.log(`Amount: ${ethers.formatUnits(event.args.value, 6)} USDC`);
  console.log(`Block: ${event.blockNumber}`);
}
```

---

## 6. ENS Resolution

```tsx
import { useEnsName, useEnsAvatar, useEnsAddress } from "wagmi";

function ENSProfile({ address }: { address: `0x${string}` }) {
  const { data: ensName } = useEnsName({ address });
  const { data: avatar } = useEnsAvatar({ name: ensName ?? undefined });

  return (
    <div>
      {avatar && <img src={avatar} alt="ENS Avatar" />}
      <p>{ensName ?? `${address.slice(0, 6)}...${address.slice(-4)}`}</p>
    </div>
  );
}

// Reverse: ENS name to address
function ENSLookup() {
  const { data: address } = useEnsAddress({ name: "vitalik.eth" });
  return <p>vitalik.eth = {address}</p>;
}
```

---

## 7. Common DApp Patterns

### 7.1 Approve + Action Pattern

```tsx
function DepositForm({ vaultAddress, tokenAddress }: Props) {
  const { data: allowance } = useReadContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: "allowance",
    args: [userAddress, vaultAddress],
  });

  const { writeContract: approve } = useWriteContract();
  const { writeContract: deposit } = useWriteContract();

  const needsApproval = (allowance ?? 0n) < depositAmount;

  return (
    <div>
      {needsApproval ? (
        <button onClick={() => approve({
          address: tokenAddress,
          abi: erc20Abi,
          functionName: "approve",
          args: [vaultAddress, depositAmount],
        })}>
          Approve USDC
        </button>
      ) : (
        <button onClick={() => deposit({
          address: vaultAddress,
          abi: vaultAbi,
          functionName: "deposit",
          args: [depositAmount],
        })}>
          Deposit
        </button>
      )}
    </div>
  );
}
```

### 7.2 Multi-Chain Support

```tsx
import { useAccount, useSwitchChain } from "wagmi";
import { mainnet, arbitrum, optimism } from "wagmi/chains";

function ChainSwitcher() {
  const { chain } = useAccount();
  const { switchChain } = useSwitchChain();

  return (
    <div>
      <p>Current: {chain?.name ?? "Not connected"}</p>
      <button onClick={() => switchChain({ chainId: mainnet.id })}>Ethereum</button>
      <button onClick={() => switchChain({ chainId: arbitrum.id })}>Arbitrum</button>
      <button onClick={() => switchChain({ chainId: optimism.id })}>Optimism</button>
    </div>
  );
}
```

---

## 8. Error Handling

```tsx
import { BaseError, ContractFunctionRevertedError } from "viem";

function parseContractError(error: unknown): string {
  if (error instanceof BaseError) {
    const revertError = error.walk(
      (err) => err instanceof ContractFunctionRevertedError
    );
    if (revertError instanceof ContractFunctionRevertedError) {
      const errorName = revertError.data?.errorName;
      if (errorName === "InsufficientBalance") return "Not enough tokens";
      if (errorName === "Unauthorized") return "You don't have permission";
      return `Contract error: ${errorName}`;
    }
    if (error.message.includes("User rejected")) return "Transaction cancelled";
    if (error.message.includes("insufficient funds")) return "Not enough ETH for gas";
  }
  return "An unexpected error occurred";
}
```

---

## 9. Worked Problems

### Problem: Build a Token Balance Dashboard

```tsx
// Complete component: Shows balances for multiple tokens
import { useReadContracts, useAccount } from "wagmi";
import { formatUnits } from "viem";

const TOKENS = [
  { address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", symbol: "USDC", decimals: 6 },
  { address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", symbol: "USDT", decimals: 6 },
  { address: "0x6B175474E89094C44Da98b954EedeAC495271d0F", symbol: "DAI", decimals: 18 },
] as const;

const balanceOfAbi = [{
  name: "balanceOf",
  type: "function",
  stateMutability: "view",
  inputs: [{ name: "account", type: "address" }],
  outputs: [{ name: "", type: "uint256" }],
}] as const;

function TokenDashboard() {
  const { address } = useAccount();

  const { data: balances } = useReadContracts({
    contracts: TOKENS.map((token) => ({
      address: token.address,
      abi: balanceOfAbi,
      functionName: "balanceOf",
      args: [address!],
    })),
    query: { enabled: !!address },
  });

  return (
    <table>
      <thead><tr><th>Token</th><th>Balance</th></tr></thead>
      <tbody>
        {TOKENS.map((token, i) => (
          <tr key={token.symbol}>
            <td>{token.symbol}</td>
            <td>
              {balances?.[i]?.result
                ? formatUnits(balances[i].result as bigint, token.decimals)
                : "0"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

---

## Appendix: Frontend DApp Cheat Sheet

```
DAPP FRONTEND CHEAT SHEET

Libraries:
  viem:        Low-level Ethereum client (TypeScript-first)
  wagmi:       React hooks built on viem
  ethers.js:   All-in-one Ethereum library (class-based)
  RainbowKit:  Wallet connection modal UI
  ConnectKit:  Alternative wallet UI

Key wagmi Hooks:
  useAccount()           - Connected wallet address, chain
  useBalance()           - ETH balance
  useReadContract()      - Read contract state (view functions)
  useWriteContract()     - Submit transactions
  useWaitForTxReceipt()  - Wait for confirmation
  useWatchContractEvent() - Listen to events in real-time
  useReadContracts()     - Batch multiple reads
  useSwitchChain()       - Switch networks

Transaction Flow:
  1. writeContract() -> wallet popup
  2. User confirms -> tx submitted
  3. useWaitForTransactionReceipt() -> wait for block
  4. Invalidate queries to refresh UI

Error Handling:
  - User rejected -> "Transaction cancelled"
  - Insufficient funds -> "Not enough ETH for gas"
  - Contract revert -> Parse custom error name
  - RPC error -> Retry or switch provider
```
