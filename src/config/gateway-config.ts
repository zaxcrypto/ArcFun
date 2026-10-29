import { pad } from "viem";

/**
 * Circle Gateway V1 Configuration (TESTNET ONLY)
 * 
 * Single source of truth for Circle Gateway integration on ArcFun.
 * Verified against official Circle Gateway Documentation:
 * https://developers.circle.com/gateway
 */

export interface GatewayNetworkConfig {
  name: string;
  shortName: string;
  domainId: number;
  chainId: number;
  usdcAddress: `0x${string}`;
  gatewayWallet: `0x${string}`;
  gatewayMinter: `0x${string}`;
  rpcUrl: string;
  fallbackRpcUrls?: string[];
  explorerUrl: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  icon: string;
  isTestnet: boolean;
}

// Universal EVM Testnet Vanity Contract Addresses (Deterministic across all testnets)
export const GATEWAY_WALLET_TESTNET = "0x0077777d7EBA4688BDeF3E311b846F25870A19B9" as const;
export const GATEWAY_MINTER_TESTNET = "0x0022222ABE238Cc2C7Bb1f21003F0a260052475B" as const;

export const CIRCLE_GATEWAY_API_TESTNET = "https://gateway-api-testnet.circle.com";

// ─── ArcFun Platform Fee Treasury Configuration ──────────────────────────────
export const ARCFUN_FEE_TREASURY_WALLET = "0xC1753399Fb68Cce753d5b51Bb22e4d79de13Fd2e" as const;
export const ARCFUN_PLATFORM_FEE_PERCENT = 1; // 1%
export const ARCFUN_PLATFORM_FEE_BPS = 100n;   // 1% = 100 basis points (out of 10,000)
export const ARCFUN_MANUAL_FEE_BPS = 50n;       // 0.5% = 50 basis points (out of 10,000)

/**
 * Explicit server-side allowlist of supported Gateway V1 domains
 */
export const GATEWAY_SUPPORTED_DOMAINS = [26, 6, 3, 1, 2, 0] as const;
export type GatewayDomainId = typeof GATEWAY_SUPPORTED_DOMAINS[number];

export function isGatewayDomainSupported(domainId: number): domainId is GatewayDomainId {
  return GATEWAY_SUPPORTED_DOMAINS.includes(domainId as GatewayDomainId);
}

/**
 * Supported Gateway Networks (Fast L2 Testnets & L1 Testnets)
 */
export const GATEWAY_NETWORKS: Record<number, GatewayNetworkConfig> = {
  // Arc Testnet
  26: {
    name: "Arc Testnet",
    shortName: "Arc",
    domainId: 26,
    chainId: 5042002,
    usdcAddress: "0x3600000000000000000000000000000000000000",
    gatewayWallet: GATEWAY_WALLET_TESTNET,
    gatewayMinter: GATEWAY_MINTER_TESTNET,
    rpcUrl: process.env.NEXT_PUBLIC_ARC_TESTNET_RPC_URL || "https://5042002.rpc.thirdweb.com",
    fallbackRpcUrls: ["https://5042002.rpc.thirdweb.com"],
    explorerUrl: "https://testnet.arcscan.app",
    nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
    icon: "/arc-logo.png",
    isTestnet: true,
  },
  // Base Sepolia
  6: {
    name: "Base Sepolia",
    shortName: "Base",
    domainId: 6,
    chainId: 84532,
    usdcAddress: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    gatewayWallet: GATEWAY_WALLET_TESTNET,
    gatewayMinter: GATEWAY_MINTER_TESTNET,
    rpcUrl: process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org",
    fallbackRpcUrls: ["https://base-sepolia-rpc.publicnode.com", "https://1rpc.io/base-sepolia"],
    explorerUrl: "https://sepolia.basescan.org",
    nativeCurrency: { name: "Ethereum", symbol: "ETH", decimals: 18 },
    icon: "/icons/base.svg",
    isTestnet: true,
  },
  // Arbitrum Sepolia
  3: {
    name: "Arbitrum Sepolia",
    shortName: "Arbitrum",
    domainId: 3,
    chainId: 421614,
    usdcAddress: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
    gatewayWallet: GATEWAY_WALLET_TESTNET,
    gatewayMinter: GATEWAY_MINTER_TESTNET,
    rpcUrl: process.env.NEXT_PUBLIC_ARB_SEPOLIA_RPC_URL || process.env.NEXT_PUBLIC_ARBITRUM_SEPOLIA_RPC_URL || "https://sepolia-rollup.arbitrum.io/rpc",
    fallbackRpcUrls: ["https://arbitrum-sepolia-rpc.publicnode.com"],
    explorerUrl: "https://sepolia.arbiscan.io",
    nativeCurrency: { name: "Ethereum", symbol: "ETH", decimals: 18 },
    icon: "/icons/arbitrum.svg",
    isTestnet: true,
  },
  // Avalanche Fuji
  1: {
    name: "Avalanche Fuji",
    shortName: "Avalanche",
    domainId: 1,
    chainId: 43113,
    usdcAddress: "0x5425890298aed601595a70AB815c96711a31Bc65",
    gatewayWallet: GATEWAY_WALLET_TESTNET,
    gatewayMinter: GATEWAY_MINTER_TESTNET,
    rpcUrl: process.env.NEXT_PUBLIC_AVALANCHE_FUJI_RPC_URL || "https://api.avax-test.network/ext/bc/C/rpc",
    fallbackRpcUrls: ["https://avalanche-fuji-c-chain-rpc.publicnode.com"],
    explorerUrl: "https://testnet.snowtrace.io",
    nativeCurrency: { name: "Avalanche", symbol: "AVAX", decimals: 18 },
    icon: "/icons/avalanche.png",
    isTestnet: true,
  },
  // Optimism Sepolia
  2: {
    name: "Optimism Sepolia",
    shortName: "Optimism",
    domainId: 2,
    chainId: 11155420,
    usdcAddress: "0x5fd84259d66Cd46123540766Be93DFE6D43130D7",
    gatewayWallet: GATEWAY_WALLET_TESTNET,
    gatewayMinter: GATEWAY_MINTER_TESTNET,
    rpcUrl: process.env.NEXT_PUBLIC_OP_SEPOLIA_RPC_URL || process.env.NEXT_PUBLIC_OPTIMISM_SEPOLIA_RPC_URL || "https://sepolia.optimism.io",
    fallbackRpcUrls: ["https://optimism-sepolia-rpc.publicnode.com"],
    explorerUrl: "https://sepolia-optimism.etherscan.io",
    nativeCurrency: { name: "Ethereum", symbol: "ETH", decimals: 18 },
    icon: "/icons/optimism.svg",
    isTestnet: true,
  },
  // Ethereum Sepolia
  0: {
    name: "Ethereum Sepolia",
    shortName: "Ethereum",
    domainId: 0,
    chainId: 11155111,
    usdcAddress: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
    gatewayWallet: GATEWAY_WALLET_TESTNET,
    gatewayMinter: GATEWAY_MINTER_TESTNET,
    rpcUrl: process.env.NEXT_PUBLIC_ETH_SEPOLIA_RPC_URL || process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com",
    fallbackRpcUrls: ["https://rpc.sepolia.org", "https://1rpc.io/sepolia"],
    explorerUrl: "https://sepolia.etherscan.io",
    nativeCurrency: { name: "Ethereum", symbol: "ETH", decimals: 18 },
    icon: "/icons/ethereum.svg",
    isTestnet: true,
  },
};

export const GATEWAY_DOMAINS_LIST: GatewayNetworkConfig[] = Object.values(GATEWAY_NETWORKS);

export function getGatewayNetworkByDomain(domainId: number): GatewayNetworkConfig | undefined {
  return GATEWAY_NETWORKS[domainId];
}

export function getGatewayNetworkByChainId(chainId: number): GatewayNetworkConfig | undefined {
  return GATEWAY_DOMAINS_LIST.find((net) => net.chainId === chainId);
}

// ─── EIP-712 Typed Data Schemas ──────────────────────────────────────────────
export const GATEWAY_EIP712_DOMAIN = {
  name: "GatewayWallet",
  version: "1",
} as const;

export const GATEWAY_EIP712_TYPES = {
  EIP712Domain: [
    { name: "name", type: "string" },
    { name: "version", type: "string" },
  ],
  TransferSpec: [
    { name: "version", type: "uint32" },
    { name: "sourceDomain", type: "uint32" },
    { name: "destinationDomain", type: "uint32" },
    { name: "sourceContract", type: "bytes32" },
    { name: "destinationContract", type: "bytes32" },
    { name: "sourceToken", type: "bytes32" },
    { name: "destinationToken", type: "bytes32" },
    { name: "sourceDepositor", type: "bytes32" },
    { name: "destinationRecipient", type: "bytes32" },
    { name: "sourceSigner", type: "bytes32" },
    { name: "destinationCaller", type: "bytes32" },
    { name: "value", type: "uint256" },
    { name: "salt", type: "bytes32" },
    { name: "hookData", type: "bytes" },
  ],
  BurnIntent: [
    { name: "maxBlockHeight", type: "uint256" },
    { name: "maxFee", type: "uint256" },
    { name: "spec", type: "TransferSpec" },
  ],
  BurnIntentSet: [
    { name: "intents", type: "BurnIntent[]" },
  ],
} as const;

// ─── ABIs ────────────────────────────────────────────────────────────────────
export const GATEWAY_WALLET_ABI = [
  {
    type: "function",
    name: "deposit",
    inputs: [
      { name: "token", type: "address" },
      { name: "value", type: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "depositFor",
    inputs: [
      { name: "token", type: "address" },
      { name: "depositor", type: "address" },
      { name: "value", type: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "initiateWithdrawal",
    inputs: [
      { name: "token", type: "address" },
      { name: "value", type: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "withdraw",
    inputs: [
      { name: "token", type: "address" },
      { name: "value", type: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "withdrawalDelay",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "event",
    name: "Deposit",
    inputs: [
      { name: "token", type: "address", indexed: true },
      { name: "depositor", type: "address", indexed: true },
      { name: "value", type: "uint256", indexed: false },
    ],
  },
] as const;

export const GATEWAY_MINTER_ABI = [
  {
    type: "function",
    name: "gatewayMint",
    inputs: [
      { name: "attestationPayload", type: "bytes" },
      { name: "signature", type: "bytes" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "gatewayMintBatch",
    inputs: [
      { name: "attestationPayload", type: "bytes" },
      { name: "signature", type: "bytes" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "event",
    name: "AttestationUsed",
    inputs: [
      { name: "transferSpecHash", type: "bytes32", indexed: true },
      { name: "recipient", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
] as const;

export const ERC20_GATEWAY_ABI = [
  {
    type: "function",
    name: "approve",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "allowance",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "balanceOf",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "decimals",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
    stateMutability: "view",
  },
] as const;

/**
 * Converts a standard 20-byte address to 32-byte hex string required by Gateway TransferSpec
 */
export function toGatewayBytes32(address: string): `0x${string}` {
  const clean = address.toLowerCase().trim() as `0x${string}`;
  return pad(clean, { size: 32 });
}
