/**
 * ArcFunSwap Contract Config
 *
 * DEPLOYED TO ARC TESTNET — Phase 5E Live Integration
 * Auto-updated by scripts/deploy-swap.mjs after each deployment.
 *
 * Bridge remains in Recorder Mode (NOT deployed, no fund movement).
 */

// ── Deployed Contract Addresses ──────────────────────────────────────────────
// Updated by deploy-swap.mjs after each successful deployment.
export const ARCFUN_SWAP_ADDRESS = "0xb81f957A499Db2F2680E5CaD74eb8839Bc3421C5" as `0x${string}`;
export const ARCFUN_SWAP_VAULT_ADDRESS = "0xF90765318A917b3B343bCe3CCdecBD36545467b2" as `0x${string}`;
export const ARCFUN_SETTLEMENT_ADDRESS = "0xe3b60781058C2dD5c2f9Fd26fEE82dF73201f60B" as `0x${string}`;

// ── Token Addresses (Arc Testnet) ─────────────────────────────────────────────
// Source: arc-ecosystem-registry.ts — update with live addresses post-validation
export const USDC_ADDRESS = "0x3600000000000000000000000000000000000000" as const;
export const EURC_ADDRESS = "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a" as const;

export const MAX_SWAPS_PER_DAY = 1000;
export const MAX_SWAP_AMOUNT = 1000000000000n; // 1,000,000 USDC (6 decimals)

// ── ArcFunSwap ABI (Phase 5A Production) ─────────────────────────────────────
export const ARCFUN_SWAP_ABI = [
  // Core swap
  {
    inputs: [
      { internalType: "address", name: "tokenIn", type: "address" },
      { internalType: "address", name: "tokenOut", type: "address" },
      { internalType: "uint256", name: "amount", type: "uint256" }
    ],
    name: "swap",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  // Views
  {
    inputs: [
      { internalType: "address", name: "user", type: "address" },
      { internalType: "uint256", name: "day", type: "uint256" }
    ],
    name: "dailySwapCount",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [{ internalType: "address", name: "user", type: "address" }],
    name: "isWhitelisted",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "paused",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "scoreRequirementEnabled",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "usdcAddress",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "eurcAddress",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      { internalType: "bytes32", name: "role", type: "bytes32" },
      { internalType: "address", name: "account", type: "address" }
    ],
    name: "hasRole",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function"
  },
  // Events
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "user", type: "address" },
      { indexed: false, name: "tokenIn", type: "address" },
      { indexed: false, name: "tokenOut", type: "address" },
      { indexed: false, name: "amountIn", type: "uint256" },
      { indexed: false, name: "amountOut", type: "uint256" }
    ],
    name: "SwapExecuted",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "user", type: "address" },
      { indexed: false, name: "reason", type: "string" }
    ],
    name: "SwapRejected",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "user", type: "address" },
      { indexed: false, name: "reason", type: "string" }
    ],
    name: "LimitExceeded",
    type: "event"
  }
] as const;

// ── ERC-20 Approve ABI (minimal, for pre-swap approval) ──────────────────────
export const ERC20_APPROVE_ABI = [
  {
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" }
    ],
    name: "approve",
    outputs: [{ type: "bool" }],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" }
    ],
    name: "allowance",
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [{ name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "decimals",
    outputs: [{ type: "uint8" }],
    stateMutability: "view",
    type: "function"
  }
] as const;

// ── Constants ─────────────────────────────────────────────────────────────────
export const MAX_BRIDGE_AMOUNT = 1000000n; // 1 USDC (6 decimals)
export const CHAIN_ID = 5042002; // Arc Testnet

// ── Bridge Mapping ────────────────────────────────────────────────────────────
export const CHAIN_ID_MAP: Record<string, number> = {
  "Arc Mainnet": 5042,
  "Arc Testnet": 5042002,
  "Ethereum Sepolia": 11155111,
  "Arbitrum Mainnet": 42161,
  "Arbitrum Sepolia": 421614,
  "Base Mainnet": 8453,
  "Base Sepolia": 84532,
  "Ink Sepolia": 763373,
  "Linea Sepolia": 59141,
  "Monad Testnet": 10143,
  "Sonic Testnet": 14601,
  "Unichain Sepolia": 1301,
  "Optimism Sepolia": 11155420,
  "Injective EVM Testnet": 1439,
  "Robinhood Mainnet": 4663,
  "Polygon Amoy Testnet": 80002,
  "X Layer Testnet": 1952,
};

export const TESTNET_SUPPORTED_CHAINS = [
  // L1 Chains (Top)
  "Arc Testnet", "Ethereum Sepolia", "Solana Devnet", "Sui Testnet",
  "Avalanche Fuji", "Monad Testnet", "Sonic Testnet", "HyperEVM Testnet",
  "Injective EVM Testnet", "Stellar Testnet",
  // L2 Chains (Rollups)
  "Arbitrum Sepolia", "Base Sepolia", "Optimism Sepolia", "Ink Sepolia",
  "Linea Sepolia", "Unichain Sepolia", "X Layer Testnet", "Polygon Amoy Testnet"
] as const;

export const MAINNET_SUPPORTED_CHAINS = [
  "Arc Mainnet", "Base Mainnet", "Arbitrum Mainnet"
] as const;

export const SUPPORTED_CHAINS = [
  ...TESTNET_SUPPORTED_CHAINS,
  ...MAINNET_SUPPORTED_CHAINS
] as const;

export function getSupportedChains(mode: "testnet" | "mainnet" = "testnet") {
  return mode === "mainnet" ? MAINNET_SUPPORTED_CHAINS : TESTNET_SUPPORTED_CHAINS;
}

export function isMainnetChain(chainName: string): boolean {
  if (!chainName) return false;
  return MAINNET_SUPPORTED_CHAINS.some(c => c.toLowerCase() === chainName.toLowerCase()) || chainName.toLowerCase().includes("mainnet");
}

export function isTestnetChain(chainName: string): boolean {
  if (!chainName) return false;
  return !isMainnetChain(chainName);
}

export const CROSS_CHAIN_REGISTRY: Record<string, { rpc: string; USDC: string; EURC: string; cirBTC: string; USDG?: string; USDe?: string }> = {
  "Arc Mainnet": { rpc: process.env.NEXT_PUBLIC_ARC_MAINNET_RPC_URL || process.env.ARC_MAINNET_RPC_URL || "https://rpc.arc.io", USDC: "0x3600000000000000000000000000000000000000", EURC: "0x0", cirBTC: "0x0" },
  "Arc Testnet": { rpc: process.env.NEXT_PUBLIC_ARC_TESTNET_RPC_URL || "https://5042002.rpc.thirdweb.com", USDC: USDC_ADDRESS, EURC: EURC_ADDRESS, cirBTC: "0x0" },
  "Ethereum Sepolia": { rpc: process.env.NEXT_PUBLIC_ETH_SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com", USDC: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238", EURC: "0x08210F9170F89Ab7658F0B5E3fF39b0E03C594D4", cirBTC: "0x0" },
  "Arbitrum Mainnet": { rpc: process.env.NEXT_PUBLIC_ARB_MAINNET_RPC_URL || "https://arb1.arbitrum.io/rpc", USDC: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", EURC: "0x0", cirBTC: "0x0" },
  "Arbitrum Sepolia": { rpc: process.env.NEXT_PUBLIC_ARB_SEPOLIA_RPC_URL || "https://sepolia.arbitrum.io/rpc", USDC: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d", EURC: "0x0", cirBTC: "0x0" },
  "Base Mainnet": { rpc: process.env.NEXT_PUBLIC_BASE_MAINNET_RPC_URL || "https://mainnet.base.org", USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", EURC: "0x0", cirBTC: "0x0" },
  "Base Sepolia": { rpc: process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org", USDC: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", EURC: "0x808456652fdb597867f38412077A9182bf77359F", cirBTC: "0x0" },
  "Ink Sepolia": { rpc: process.env.NEXT_PUBLIC_INK_SEPOLIA_RPC_URL || "https://rpc-gel-sepolia.inkonchain.com", USDC: "0xFabab97dCE620294D2B0b0e46C68964e326300Ac", EURC: "0x0", cirBTC: "0x0" },
  "Linea Sepolia": { rpc: process.env.NEXT_PUBLIC_LINEA_SEPOLIA_RPC_URL || "https://rpc.sepolia.linea.build", USDC: "0xFEce4462D57bD51A6A552365A011b95f0E16d9B7", EURC: "0x0", cirBTC: "0x0" },
  "Monad Testnet": { rpc: process.env.NEXT_PUBLIC_MONAD_TESTNET_RPC_URL || "https://testnet-rpc.monad.xyz", USDC: "0x534b2f3A21130d7a60830c2Df862319e593943A3", EURC: "0x0", cirBTC: "0x0" },
  "Sonic Testnet": { rpc: process.env.NEXT_PUBLIC_SONIC_TESTNET_RPC_URL || "https://rpc.blaze.soniclabs.com", USDC: "0x0BA304580ee7c9a980CF72e55f5Ed2E9fd30Bc51", EURC: "0x0", cirBTC: "0x0" },
  "Unichain Sepolia": { rpc: process.env.NEXT_PUBLIC_UNICHAIN_SEPOLIA_RPC_URL || "https://sepolia.unichain.org", USDC: "0x31d0220469e10c4E71834a79b1f276d740d3768F", EURC: "0x0", cirBTC: "0x0" },
  "Optimism Sepolia": { rpc: process.env.NEXT_PUBLIC_OP_SEPOLIA_RPC_URL || "https://sepolia.optimism.io", USDC: "0x5fd84259d66Cd46123540766Be93DFE6D43130D7", EURC: "0x0", cirBTC: "0x0" },
  // Injective EVM Testnet — reused by Chat|Pay. Single source of truth.
  "Injective EVM Testnet": { rpc: process.env.NEXT_PUBLIC_INJECTIVE_TESTNET_RPC_URL || "https://k8s.testnet.json-rpc.injective.network/", USDC: "0x0C382e685bbeeFE5d3d9C29e29E341fEE8E84C5d", EURC: "0x0", cirBTC: "0x0" },
  "Solana Devnet": { rpc: process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.devnet.solana.com", USDC: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU", EURC: "0x0", cirBTC: "0x0" },
  "Solana Mainnet": { rpc: "", USDC: "0x0", EURC: "0x0", cirBTC: "0x0" },
  "Avalanche Fuji": { rpc: process.env.NEXT_PUBLIC_AVALANCHE_FUJI_RPC_URL || "https://api.avax-test.network/ext/bc/C/rpc", USDC: "0x5425890298aed601595a70ab815c96711a31bc65", EURC: "0x0", cirBTC: "0x0" },
  "Robinhood Mainnet": { rpc: process.env.NEXT_PUBLIC_ROBINHOOD_MAINNET_RPC_URL || "", USDC: "0x0", EURC: "0x0", cirBTC: "0x0", USDG: "0x5fc5360d0400a0fd4f2af552add042d716f1d168", USDe: "0x5d3a1ff2b6bab83b63cd9ad0787074081a52ef34" },
  "Polygon Amoy Testnet": { rpc: process.env.NEXT_PUBLIC_POLYGON_AMOY_RPC_URL || "https://rpc-amoy.polygon.technology", USDC: "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582", EURC: "0x0", cirBTC: "0x0" },
  "X Layer Testnet": { rpc: process.env.NEXT_PUBLIC_XLAYER_TESTNET_RPC_URL || "https://testrpc.xlayer.tech", USDC: "0xDec90b78111Ba2fc6FC6d84d8B9ec159A2d4b9B3", EURC: "0x0", cirBTC: "0x0" }
};

export function resolveNetworkRegistry(network: string) {
  if (!network) return null;
  const normalizedInput = network.toUpperCase().replace(/\s+/g, '-');
  const chainKey = Object.keys(CROSS_CHAIN_REGISTRY).find(
    k => k.toUpperCase().replace(/\s+/g, '-') === normalizedInput
  );
  return chainKey ? CROSS_CHAIN_REGISTRY[chainKey] : null;
}

export const EURC_CHAINS = ["Arc Testnet", "Ethereum Sepolia", "Base Sepolia"] as const;



export const ARCFUN_SWAP_VAULT_ABI = [
  {
    "inputs": [{ "internalType": "address", "name": "token", "type": "address" }, { "internalType": "uint256", "name": "amount", "type": "uint256" }],
    "name": "depositLiquidity",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "address", "name": "token", "type": "address" }, { "internalType": "uint256", "name": "amount", "type": "uint256" }],
    "name": "withdrawLiquidity",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "address", "name": "token", "type": "address" }],
    "name": "emergencyWithdraw",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
] as const;
