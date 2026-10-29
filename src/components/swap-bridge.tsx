"use client";
import "./swap-bridge.css";

import React, { useState, useCallback, useEffect, useRef, Fragment } from "react";
import { createPortal } from "react-dom";
import { useAccount, useReadContract, useWriteContract, usePublicClient, useBalance, useWatchContractEvent, useWalletClient, useChainId, useSwitchChain, useGasPrice, useEstimateGas, useConfig } from "wagmi";
import { encodeFunctionData } from "viem";
import { parseUnits, formatUnits, createPublicClient, http, fallback, parseAbiItem } from "viem";
import { ArrowUpDown, Settings, History, Activity, Loader2, CheckCircle, XCircle, ExternalLink, RefreshCw, Info, Copy, Search, Wallet, ChevronUp, ChevronDown, Lock, AlertTriangle, Shield } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Asset as StellarAsset, Operation, TransactionBuilder, Networks, Account, Horizon } from "@stellar/stellar-sdk";
import {
  ARCFUN_SWAP_ADDRESS, ARCFUN_SWAP_ABI,
  ARCFUN_SWAP_VAULT_ADDRESS,
  CHAIN_ID_MAP, MAX_BRIDGE_AMOUNT,
  ARCFUN_SETTLEMENT_ADDRESS,
  ERC20_APPROVE_ABI, USDC_ADDRESS, EURC_ADDRESS, MAX_SWAP_AMOUNT, MAX_SWAPS_PER_DAY,
  getSupportedChains, TESTNET_SUPPORTED_CHAINS, MAINNET_SUPPORTED_CHAINS, isMainnetChain, isTestnetChain
} from "@/config/swap-contract";
import { FACTORY_ADDRESS } from "@/config/contracts";
import { supabase } from "@/lib/supabase";
import { useTxEngine, EngineState, Milestone } from "@/hooks/use-tx-engine";
import { useOnChainHistory } from "@/hooks/use-onchain-history";
import { TxTracker, TxTrackerRef } from "./tx-tracker";
import { RecoverManager } from "./recover-manager";
import { useTheme } from "next-themes";
import { CCTP_DOMAINS, getCctpDomains, resolveCctpDomain, CCTS_TOKEN_MANAGER_ADDRESS } from "@/lib/bridge/cctp-provider";
import { TxHistoryEntry, getTxHistory, saveTxHistory } from "@/lib/tx-history-store";
import { OnchainScoreGate } from "./onchain-score-gate";
import { SlideButton } from "./slide-button";

interface SwapQuoteResult {
  expectedAmountOut: number;
  rate: number;
  exchangeRate?: number;
  networkFeeEth?: number;
  priceImpactPct?: number;
  fee?: number;
  priceImpact?: number;
  tokenIn?: string;
  tokenOut?: string;
  amountIn?: number;
}
import { AppKit } from "@circle-fin/app-kit";
import { createViemAdapterFromProvider } from "@circle-fin/adapter-viem-v2";
import { rateLimitedFetch } from "@/lib/rpc-queue";
import { ChainRegistry } from "@/lib/bridge/chain-registry";
import { withSolanaFailover } from "@/lib/solana-rpc";
import { withEvmFailover } from "@/lib/evm-rpc";
import { useWallet } from "@solana/wallet-adapter-react";
import { useStellar } from "@/lib/stellar-provider";
import { fetchLiveStellarUsdcBalance } from "@/lib/stellar/stellar-rpc";
import { useSuiWallet } from "@/lib/sui-provider";
import { fetchSuiUsdcBalance } from "@/lib/bridge/sui-balance";
import { useEnvironment } from "@/contexts/EnvironmentContext";
import { getWalletClient, switchChain } from "@wagmi/core";
import { arcFunQuoteEngine } from "@/lib/quote-engine";
import { ExecutionEngine } from "@/lib/quote-engine/execution-engine";
import { ArcFunRoute } from "@/lib/quote-engine/types";
import { tokenMetadataService } from "@/lib/tokens/TokenMetadataService";
import { LiveFeedHistoryView } from "@/components/live-bridge-feed";
import { LiveToastNotification } from "@/components/live-toast-notification";
import { TokenPriceChart } from "@/components/charts/token-price-chart";
const kit = new AppKit();
const workingArcRpc = process.env.NEXT_PUBLIC_ARC_TESTNET_RPC_URL || "https://5042002.rpc.thirdweb.com";
const arcChainInKit = kit.getSupportedChains().find((c: any) => c.id === 5042002 || c.chain?.toLowerCase().includes("arc"));
if (arcChainInKit) {
  (arcChainInKit as any).rpcEndpoints = [
    workingArcRpc,
    "https://5042002.rpc.thirdweb.com"
  ];
  if ((arcChainInKit as any).rpcUrls) {
    (arcChainInKit as any).rpcUrls.default = { http: [workingArcRpc] };
    (arcChainInKit as any).rpcUrls.public = { http: [workingArcRpc] };
  }
}
const injTestnet = kit.getSupportedChains().find(c => c.chain === "Injective_Testnet");
if (injTestnet) {
  injTestnet.rpcEndpoints = [
    "https://k8s.testnet.json-rpc.injective.network/",
    "https://injectiveevm-testnet-rpc.polkachu.com"
  ];
}

type Asset = "USDC" | "EURC" | "cirBTC";
type Chain = "Arc Testnet" | "Arc Mainnet" | "Ethereum Sepolia" | "Arbitrum Sepolia" | "Arbitrum Mainnet" | "Base Sepolia" | "Base Mainnet" | "Ink Sepolia" | "Linea Sepolia" | "Monad Testnet" | "Sonic Testnet" | "Unichain Sepolia" | "Optimism Sepolia" | "Solana Devnet" | "Solana Mainnet" | "Injective EVM Testnet" | "Stellar Testnet" | "Avalanche Fuji" | "HyperEVM Testnet" | "Polygon Amoy Testnet" | "X Layer Testnet" | "Sui Testnet";

const TOKEN_ADDRESSES: Record<string, `0x${string}`> = {
  USDC: USDC_ADDRESS,
  EURC: EURC_ADDRESS,
};

const TOKEN_LOGOS: Record<string, string> = {
  USDC: "/usdc.png",
  EURC: "/eurc.png",
  cirBTC: "/cirbtc.png",
};

const CHAIN_LOGOS: Record<Chain, string> = {
  "Arc Testnet": "/arc-logo.png",
  "Arc Mainnet": "/arc-logo.png",
  "Ethereum Sepolia": "/icons/ethereum.svg",
  "Arbitrum Sepolia": "/icons/arbitrum.svg",
  "Arbitrum Mainnet": "/icons/arbitrum.svg",
  "Base Sepolia": "/icons/base.svg",
  "Base Mainnet": "/icons/base.svg",
  "Ink Sepolia": "/icons/ink.svg",
  "Linea Sepolia": "/icons/linea.svg",
  "Monad Testnet": "/icons/monad.svg",
  "Sonic Testnet": "/icons/sonic.png",
  "Unichain Sepolia": "/icons/unichain.svg",
  "Optimism Sepolia": "/icons/optimism.svg",
  "Solana Devnet": "/icons/solana.png",
  "Solana Mainnet": "/icons/solana.png",
  "Injective EVM Testnet": "/icons/injective.png",
  "Stellar Testnet": "/icons/stellar.png",
  "Avalanche Fuji": "/icons/avalanche.png",
  "HyperEVM Testnet": "/icons/hyperevm.png",
  "Polygon Amoy Testnet": "/icons/polygon.png",
  "X Layer Testnet": "/icons/xlayer.png",
  "Sui Testnet": "/icons/sui.png",
};

// All USDC chains (L1s at top, followed by L2s)
const CHAINS: Chain[] = [
  "Arc Testnet", "Ethereum Sepolia", "Solana Devnet", "Sui Testnet",
  "Avalanche Fuji", "Monad Testnet", "Sonic Testnet", "HyperEVM Testnet",
  "Injective EVM Testnet", "Stellar Testnet",
  "Arbitrum Sepolia", "Base Sepolia", "Optimism Sepolia", "Ink Sepolia",
  "Linea Sepolia", "Unichain Sepolia", "X Layer Testnet", "Polygon Amoy Testnet"
];

// EURC is only deployed on these chains (Circle official + Arc Testnet)
const EURC_CHAINS: Chain[] = ["Arc Testnet", "Base Sepolia", "Ethereum Sepolia", "Avalanche Fuji"];

// cirBTC is only deployed on these chains (Circle CCTPx official)
const CIRBTC_CHAINS: Chain[] = ["Arc Testnet", "Ethereum Sepolia"];

// Official supported CCTP chains (L1s at top, followed by L2s)
const CCTP_CHAINS: Chain[] = [
  "Arc Testnet", "Ethereum Sepolia", "Solana Devnet", "Sui Testnet",
  "Avalanche Fuji", "Monad Testnet", "Sonic Testnet", "HyperEVM Testnet",
  "Injective EVM Testnet", "Stellar Testnet",
  "Arbitrum Sepolia", "Base Sepolia", "Optimism Sepolia", "Ink Sepolia",
  "Linea Sepolia", "Unichain Sepolia", "X Layer Testnet", "Polygon Amoy Testnet"
];

// L1 Chains that display the Fast badge (L1 chains only, no L2 rollups)
const L1_CHAINS: Set<Chain> = new Set([
  "Arc Testnet",
  "Ethereum Sepolia",
  "Solana Devnet",
  "Sui Testnet",
  "Avalanche Fuji",
  "Monad Testnet",
  "Sonic Testnet",
  "HyperEVM Testnet",
  "Injective EVM Testnet",
  "Stellar Testnet",
]);

const CHAIN_TOKEN_MATRIX: Record<Chain, Asset[]> = {
  "Arc Testnet": ["USDC", "EURC", "cirBTC"],
  "Arc Mainnet": ["USDC", "EURC"],
  "Ethereum Sepolia": ["USDC", "EURC", "cirBTC"],
  "Base Sepolia": ["USDC", "EURC"],
  "Base Mainnet": ["USDC"],
  "Arbitrum Mainnet": ["USDC"],
  "Arbitrum Sepolia": ["USDC"],
  "Unichain Sepolia": ["USDC"],
  "Monad Testnet": ["USDC"],
  "Sonic Testnet": ["USDC"],
  "Ink Sepolia": ["USDC"],
  "Linea Sepolia": ["USDC"],
  "Optimism Sepolia": ["USDC"],
  "Injective EVM Testnet": ["USDC"],
  "Solana Devnet": ["USDC"],
  "Solana Mainnet": ["USDC"],
  "Stellar Testnet": ["USDC"],
  "Avalanche Fuji": ["USDC", "EURC"],
  "HyperEVM Testnet": ["USDC"],
  "Polygon Amoy Testnet": ["USDC"],
  "X Layer Testnet": ["USDC"],
  "Sui Testnet": ["USDC"]
};

const CROSS_CHAIN_REGISTRY: Record<Chain, { rpc: string; USDC: `0x${string}`; EURC: `0x${string}`; cirBTC: `0x${string}` }> = {
  "Arc Testnet": { rpc: process.env.NEXT_PUBLIC_ARC_TESTNET_RPC_URL || "https://5042002.rpc.thirdweb.com", USDC: USDC_ADDRESS, EURC: EURC_ADDRESS, cirBTC: "0xf0c4a4ce82a5746abaad9425360ab04fbba432bf" },
  "Arc Mainnet": { rpc: process.env.NEXT_PUBLIC_ARC_MAINNET_RPC_URL || "https://arc-mainnet.infura.io/v3/b6bf7d3508c941499b10025c0776eaf8", USDC: "0x3600000000000000000000000000000000000000", EURC: "0x0", cirBTC: "0x0" },
  "Ethereum Sepolia": { rpc: process.env.NEXT_PUBLIC_ETH_SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com", USDC: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238", EURC: "0x08210F9170F89Ab7658F0B5E3fF39b0E03C594D4", cirBTC: "0x3a3fe695f684bf9b9e43cf43c2b895ea5e392bb3" },
  "Arbitrum Mainnet": { rpc: process.env.NEXT_PUBLIC_ARB_MAINNET_RPC_URL || "https://arb1.arbitrum.io/rpc", USDC: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", EURC: "0x0", cirBTC: "0x0" },
  "Arbitrum Sepolia": { rpc: "https://sepolia-rollup.arbitrum.io/rpc", USDC: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d", EURC: "0x0", cirBTC: "0x0" },
  "Base Sepolia": { rpc: "https://sepolia.base.org", USDC: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", EURC: "0x808456652fdb597867f38412077A9182bf77359F", cirBTC: "0x0" },
  "Base Mainnet": { rpc: process.env.NEXT_PUBLIC_BASE_MAINNET_RPC_URL || "https://mainnet.base.org", USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", EURC: "0x0", cirBTC: "0x0" },
  "Ink Sepolia": { rpc: process.env.NEXT_PUBLIC_INK_SEPOLIA_RPC_URL || process.env.INK_SEPOLIA_RPC_URL || "https://rpc-gel-sepolia.inkonchain.com", USDC: "0xFabab97dCE620294D2B0b0e46C68964e326300Ac", EURC: "0x0", cirBTC: "0x0" },
  "Linea Sepolia": { rpc: process.env.NEXT_PUBLIC_LINEA_SEPOLIA_RPC_URL || process.env.LINEA_SEPOLIA_RPC_URL || "https://rpc.sepolia.linea.build", USDC: "0xFEce4462D57bD51A6A552365A011b95f0E16d9B7", EURC: "0x0", cirBTC: "0x0" },
  "Monad Testnet": { rpc: process.env.NEXT_PUBLIC_MONAD_TESTNET_RPC_URL || process.env.MONAD_TESTNET_RPC_URL || "https://testnet-rpc.monad.xyz", USDC: "0x534b2f3A21130d7a60830c2Df862319e593943A3", EURC: "0x0", cirBTC: "0x0" },
  "Sonic Testnet": { rpc: "https://rpc.testnet.soniclabs.com", USDC: "0x0BA304580ee7c9a980CF72e55f5Ed2E9fd30Bc51", EURC: "0x0", cirBTC: "0x0" },
  "Unichain Sepolia": { rpc: process.env.NEXT_PUBLIC_UNICHAIN_SEPOLIA_RPC_URL || process.env.UNICHAIN_SEPOLIA_RPC_URL || "https://sepolia.unichain.org", USDC: "0x31d0220469e10c4E71834a79b1f276d740d3768F", EURC: "0x0", cirBTC: "0x0" },
  "Optimism Sepolia": { rpc: "https://sepolia.optimism.io", USDC: "0x5fd84259d66Cd46123540766Be93DFE6D43130D7", EURC: "0x0", cirBTC: "0x0" },
  "Injective EVM Testnet": { rpc: process.env.NEXT_PUBLIC_INJECTIVE_TESTNET_RPC_URL || "https://sentry.evm-rpc.injective.network", USDC: "0x0C382e685bbeeFE5d3d9C29e29E341fEE8E84C5d", EURC: "0x0", cirBTC: "0x0" },
  "Solana Devnet": { rpc: "", USDC: "0x0", EURC: "0x0", cirBTC: "0x0" },
  "Solana Mainnet": { rpc: "", USDC: "0x0", EURC: "0x0", cirBTC: "0x0" },
  "Stellar Testnet": { rpc: process.env.NEXT_PUBLIC_STELLAR_RPC_URL || "https://stellar-testnet.g.alchemy.com/v2/Vt9_fvDipTI7hEZdMc950", USDC: "0x0", EURC: "0x0", cirBTC: "0x0" },
  "Avalanche Fuji": { rpc: process.env.NEXT_PUBLIC_AVALANCHE_FUJI_RPC_URL || "https://api.avax-test.network/ext/bc/C/rpc", USDC: "0x5425890298aed601595a70ab815c96711a31bc65", EURC: "0x5E44db7996c682E92a960b65AC713a54AD815c6B", cirBTC: "0x0" },
  "HyperEVM Testnet": { rpc: process.env.NEXT_PUBLIC_HYPEREVM_TESTNET_RPC_URL || "https://rpc.hyperliquid-testnet.xyz/evm", USDC: "0x2B3370eE501B4a559b57D449569354196457D8Ab", EURC: "0x0", cirBTC: "0x0" },
  "Polygon Amoy Testnet": { rpc: process.env.NEXT_PUBLIC_POLYGON_AMOY_RPC_URL || "https://rpc-amoy.polygon.technology", USDC: "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582", EURC: "0x0", cirBTC: "0x0" },
  "X Layer Testnet": { rpc: process.env.NEXT_PUBLIC_XLAYER_TESTNET_RPC_URL || "https://testrpc.xlayer.tech", USDC: "0xDec90b78111Ba2fc6FC6d84d8B9ec159A2d4b9B3", EURC: "0x0", cirBTC: "0x0" },
  "Sui Testnet": { rpc: process.env.NEXT_PUBLIC_SUI_RPC_URL || "https://fullnode.testnet.sui.io:443", USDC: "0x0", EURC: "0x0", cirBTC: "0x0" }
};

const formatAssetBalance = (val: string, asset?: string) => {
  const n = Number(val);
  if (isNaN(n) || n === 0) return "0";
  if (asset === "cirBTC") {
    const str = n.toFixed(8);
    return str.replace(/(\.\d{4,}?)0+$/, "$1");
  }
  return n.toFixed(4);
};

const limitsPromiseCache = new Map<string, { promise: Promise<any>, timestamp: number }>();
const CACHE_TTL = 10000; // 10 seconds

function fetchWalletLimitsDeduped(token: string) {
  const now = Date.now();
  const cached = limitsPromiseCache.get(token);

  if (cached && (now - cached.timestamp < CACHE_TTL)) {
    return cached.promise;
  }

  const promise = fetch("/api/wallet/limits", {
    headers: { 'Authorization': `Bearer ${token}` },
    cache: 'no-store'
  }).then(res => {
    if (!res.ok) throw new Error("Limits fetch failed");
    return res.json();
  }).catch(err => {
    limitsPromiseCache.delete(token); // Clear cache on error so next attempt tries again
    throw err;
  });

  limitsPromiseCache.set(token, { promise, timestamp: now });
  return promise;
}

type SwapStep = "idle" | "approving" | "swapping" | "success" | "error";

// Admin wallets - access granted on ALL chains, not just Arc Testnet
const ADMIN_WALLETS = [
  "0xe2ED006Dbb1726e0f577733F65d30a94D34bDD77",
  "0xd448777940dFaBF65FD259fA8a9903e60E1FF178",
  "0x4a6b6887e6f0dd99ea9cc1a36a6bc02c14c80d5a",
  "0xdd1c0bdefce4e5ca334753b58cf7009d97473df0",
].map(a => a.toLowerCase());
const ROBINHOOD_TOKENS = [
  {
    chainId: 4663,
    address: '0x0000000000000000000000000000000000000000',
    symbol: 'ETH',
    name: 'Ethereum',
    decimals: 18,
    logoURI: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/logo.png',
  },
  {
    chainId: 4663,
    address: '0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73',
    symbol: 'WETH',
    name: 'Wrapped ETH',
    decimals: 18,
    logoURI: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/logo.png',
  },
  {
    chainId: 4663,
    address: '0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34',
    symbol: 'USDe',
    name: 'Ethena USDe',
    decimals: 18,
    logoURI: 'https://static.debank.com/image/eth_token/logo_url/0x4c9edd5852cd905f086c759e8383e09bff1e68b3/734064e545eabfc501b9d0e752644b7d.png',
  },
  {
    chainId: 4663,
    address: '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168',
    symbol: 'USDG',
    name: 'USDG',
    decimals: 6,
    logoURI: 'https://s2.coinmarketcap.com/static/img/coins/64x64/33793.png',
  },
  {
    chainId: 4663,
    address: '0xC72c01AAB5f5678dc1d6f5C6d2B417d91D402Ba3',
    symbol: 'HOODIE',
    name: 'HOODIE',
    decimals: 18,
    logoURI: 'https://cdn.dexscreener.com/cms/images/lPw_YhoFA-ThjIWZ?width=128&height=128&quality=95&format=auto',
  }
];

const ARC_MAINNET_TOKENS = [
  {
    chainId: 5042,
    address: '0x3600000000000000000000000000000000000000',
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    logoURI: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png',
  }
];

function ConnectWalletButton({ text, onClick }: { text: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-[calc(100%-24px)] mx-auto block mt-2 mb-2 h-[56px] rounded-full font-semibold text-[16px] transition-all duration-200 focus:outline-none active:scale-95 hover:opacity-90 bg-gray-600 dark:bg-gray-200 text-white dark:text-gray-900 border border-gray-500 dark:border-gray-300"
      style={{
        cursor: "pointer",
        letterSpacing: "0.01em"
      }}
    >
      {text}
    </button>
  );
}

export function SwapBridgeManager({
  onOpenFaucetHub,
  sidebarCollapsed = false,
}: {
  onOpenFaucetHub?: () => void;
  sidebarCollapsed?: boolean;
}) {
  const { address } = useAccount();
  const suiWallet = useSuiWallet();
  const { mode } = useEnvironment();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme !== "light";
  const publicClient = usePublicClient();
  const robinhoodClient = usePublicClient({ chainId: 4663 });
  const arcMainnetClient = usePublicClient({ chainId: 5042 });
  const walletChainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const wagmiConfig = useConfig();

  const [activeTab, setActiveTab] = useState<"bridge" | "recover" | "admin" | "history">("bridge");
  const [swapUnlocked, setSwapUnlocked] = useState(false);
  const [bridgeUnlocked, setBridgeUnlocked] = useState(false);
  const [swapFrom, setSwapFrom] = useState<Asset | null>(null);
  const [swapTo, setSwapTo] = useState<Asset | null>(null);
  const [swapAmount, setSwapAmount] = useState("");

  const [bridgeFromAsset, setBridgeFromAsset] = useState<Asset | null>("USDC");
  const [bridgeToAsset, setBridgeToAsset] = useState<Asset | null>("USDC");
  const [bridgeFromChain, setBridgeFromChain] = useState<Chain | null>(null);
  const [bridgeToChain, setBridgeToChain] = useState<Chain | null>(null);
  const [bridgeAmount, setBridgeAmount] = useState("");
  const [showFromChainPicker, setShowFromChainPicker] = useState(false);
  const [showToChainPicker, setShowToChainPicker] = useState(false);
  const [showBridgeTokenDropdown, setShowBridgeTokenDropdown] = useState(false);
  const [showBridgeToTokenDropdown, setShowBridgeToTokenDropdown] = useState(false);

  const isFromTokenDropdownAvailable =
    bridgeFromChain ? ((CHAIN_TOKEN_MATRIX[bridgeFromChain] || []).length > 1) : false;
  const isToTokenDropdownAvailable =
    bridgeToChain ? ((CHAIN_TOKEN_MATRIX[bridgeToChain] || []).length > 1) : false;

  const isEurcSupportedRoute =
    !!bridgeFromChain &&
    !!bridgeToChain &&
    bridgeFromChain !== bridgeToChain &&
    EURC_CHAINS.includes(bridgeFromChain) &&
    EURC_CHAINS.includes(bridgeToChain);

  const handleSelectFromToken = useCallback((asset: Asset) => {
    setBridgeFromAsset(asset);
    setBridgeToAsset(asset);
    setShowBridgeTokenDropdown(false);
  }, []);

  const handleSelectToToken = useCallback((asset: Asset) => {
    setBridgeFromAsset(asset);
    setBridgeToAsset(asset);
    setShowBridgeToTokenDropdown(false);
  }, []);

  const [executionMode, setExecutionMode] = useState<"browser" | "arcfun">("browser");
  const [showExecutionSelector, setShowExecutionSelector] = useState(false);

  useEffect(() => {
    if ((activeTab === "bridge" || mode === "mainnet") && executionMode === "arcfun") {
      setExecutionMode("browser");
    }
  }, [activeTab, executionMode, mode]);

  useEffect(() => {
    // If activeTab is stuck on an invalid value (like "swap" from hot reload memory), force it to "bridge"
    if (activeTab !== "bridge" && activeTab !== "recover" && activeTab !== "admin" && activeTab !== "history") {
      setActiveTab("bridge");
    }
  }, [activeTab]);
  const [isAwaitingTx, setIsAwaitingTx] = useState(false);
  const [walletLimits, setWalletLimits] = useState<{
    dailyLimit: number;
    maxPerTransaction: number;
    completedSpentToday: number;
    pendingReservedToday: number;
    remainingAvailableToday: number;
  } | null>(null);
  const [isLimitsLoading, setIsLimitsLoading] = useState(false);
  const [arcWalletAddress, setArcWalletAddress] = useState<string | null>(null);
  const [hasCheckedArcWallet, setHasCheckedArcWallet] = useState(false);

  const fetchWalletLimits = useCallback(() => {
    if (executionMode === "arcfun" && arcWalletAddress) {
      setIsLimitsLoading(true);
      import("@/lib/supabase").then(({ supabase }) => {
        supabase.auth.getSession().then(({ data: { session } }) => {
          if (!session) {
            setIsLimitsLoading(false);
            return;
          }
          fetchWalletLimitsDeduped(session.access_token)
            .then(data => {
              if (data && data.dailyLimit !== undefined) setWalletLimits(data);
            })
            .catch(console.error)
            .finally(() => setIsLimitsLoading(false));
        });
      });
    } else if (executionMode !== "arcfun") {
      setWalletLimits(null);
    }
  }, [executionMode, arcWalletAddress]);

  useEffect(() => {
    fetchWalletLimits();
  }, [fetchWalletLimits, isAwaitingTx]);

  const txEngine = useTxEngine();
  const txTrackerRef = useRef<TxTrackerRef>(null);

  const [quoteData, setQuoteData] = useState<SwapQuoteResult | null>(null);
  const [isQuoting, setIsQuoting] = useState(false);
  const [customTokenMeta, setCustomTokenMeta] = useState<any | null>(null);

  // LI.FI Mainnet State
  const [lifiFromToken, setLifiFromToken] = useState<any | null>(null);
  const [lifiToToken, setLifiToToken] = useState<any | null>(null);
  // UI State purely driven by the Quote Engine
  const [activeRoute, setActiveRoute] = useState<ArcFunRoute | null>(null);
  const activeMainnetProvider = activeRoute?.providerId;
  const activeMainnetAmount = (activeRoute?.toAmount ?? "0");
  const executionEngine = React.useMemo(() => new ExecutionEngine(), []);

  const [lifiTxState, setLifiTxState] = useState<EngineState>("idle");
  const [lifiTxHash, setLifiTxHash] = useState<string | null>(null);
  const [lifiError, setLifiError] = useState<string | null>(null);
  const [lifiMilestones, setLifiMilestones] = useState<Milestone[]>([]);

  const [showTokenSelect, setShowTokenSelect] = useState<"from" | "to" | "bridgeFrom" | "bridgeTo" | null>(null);
  const [tokenSearch, setTokenSearch] = useState("");

  useEffect(() => {
    setLifiFromToken(null);
    setLifiToToken(null);
  }, [mode, walletChainId]);

  const [fromTokenFiat, setFromTokenFiat] = useState<number>(0);
  const [toTokenFiat, setToTokenFiat] = useState<number>(0);
  const [quoteCountdown, setQuoteCountdown] = useState(10);
  const [quoteRefreshTrigger, setQuoteRefreshTrigger] = useState(0);
  const [showFromInfo, setShowFromInfo] = useState(false);
  const [showToInfo, setShowToInfo] = useState(false);
  const [tokenBalances, setTokenBalances] = useState<Record<string, { balance: number, fiat: number }>>({});
  const [isTokensLoading, setIsTokensLoading] = useState(false);
  const [dynamicRobinhoodTokens, setDynamicRobinhoodTokens] = useState<typeof ROBINHOOD_TOKENS>(ROBINHOOD_TOKENS);
  const [dynamicArcMainnetTokens, setDynamicArcMainnetTokens] = useState<typeof ARC_MAINNET_TOKENS>(ARC_MAINNET_TOKENS);
  const [lastTokenRefresh, setLastTokenRefresh] = useState(0);
  const [isTokenRefreshing, setIsTokenRefreshing] = useState(false);

  useEffect(() => {
    if (mode === "mainnet" && publicClient) {
      const fetchDeployedTokens = async () => {
        try {
          const logs = await publicClient.getLogs({
            address: FACTORY_ADDRESS as `0x${string}`,
            event: parseAbiItem("event TokenDeployed(address indexed tokenAddress, address indexed owner, string name, string symbol, uint256 totalSupply)"),
            fromBlock: "earliest",
            toBlock: "latest"
          });
          const fetchedTokens = logs.map(log => ({
            chainId: 4663,
            address: log.args.tokenAddress as string,
            symbol: log.args.symbol as string,
            name: log.args.name as string,
            decimals: 18,
            logoURI: `https://ui-avatars.com/api/?name=${log.args.symbol}&background=random&color=fff&rounded=true&font-size=0.45`
          }));
          const newTokens = fetchedTokens.filter(t => !ROBINHOOD_TOKENS.some(r => r.address.toLowerCase() === t.address.toLowerCase()));
          setDynamicRobinhoodTokens([...ROBINHOOD_TOKENS, ...newTokens]);
        } catch (e) {
          // Fallback to defaults
        }
      };
      fetchDeployedTokens();
    }
  }, [mode, publicClient]);

  useEffect(() => {
    if (!showTokenSelect || mode !== "mainnet" || !address || !publicClient) return;
    const fetchBalances = async () => {
      setIsTokensLoading(true);
      const newBalances: Record<string, { balance: number, fiat: number }> = {};
      const targetMainnetChainId = walletChainId === 4663 ? 4663 : 5042;
      const tokensToFetch = targetMainnetChainId === 5042 ? dynamicArcMainnetTokens : dynamicRobinhoodTokens;
      await Promise.all(tokensToFetch.map(async (token) => {
        try {
          const clientToUse = targetMainnetChainId === 5042 ? arcMainnetClient : robinhoodClient;
          let bal = 0;
          if (token.address === "0x0000000000000000000000000000000000000000") {
            const ethBal = await clientToUse?.getBalance({ address: address as any });
            if (ethBal !== undefined) bal = Number(formatUnits(ethBal, 18));
          } else {
            const tokenBal = await clientToUse?.readContract({
              address: token.address as `0x${string}`,
              abi: ERC20_APPROVE_ABI,
              functionName: "balanceOf",
              args: [address as any]
            });
            if (tokenBal !== undefined) bal = Number(formatUnits(tokenBal as bigint, token.decimals || 18));
          }
          let price = 0;
          try {
            const meta = await tokenMetadataService.getTokenMetadata(token.address, targetMainnetChainId, clientToUse as any);
            price = meta.priceUsd || 0;
          } catch (e) { }
          newBalances[token.address] = { balance: bal, fiat: bal * price };
        } catch (e) {
          newBalances[token.address] = { balance: 0, fiat: 0 };
        }
      }));
      setTokenBalances(newBalances);
      setIsTokensLoading(false);
    };
    fetchBalances();
  }, [showTokenSelect, mode, address, publicClient, walletChainId, dynamicArcMainnetTokens, dynamicRobinhoodTokens]);

  useEffect(() => {
    if (mode === "mainnet" && lifiFromToken?.address) {
      const targetMainnetChainId = walletChainId === 4663 ? 4663 : 5042;
      const clientToUse = targetMainnetChainId === 5042 ? arcMainnetClient : robinhoodClient;
      tokenMetadataService.getTokenMetadata(lifiFromToken.address, targetMainnetChainId, clientToUse as any)
        .then(meta => setFromTokenFiat(meta.priceUsd || 0))
        .catch(() => setFromTokenFiat(0));
    }
  }, [lifiFromToken, mode, publicClient, walletChainId]);

  useEffect(() => {
    if (mode === "mainnet" && lifiToToken?.address) {
      const targetMainnetChainId = walletChainId === 4663 ? 4663 : 5042;
      const clientToUse = targetMainnetChainId === 5042 ? arcMainnetClient : robinhoodClient;
      tokenMetadataService.getTokenMetadata(lifiToToken.address, targetMainnetChainId, clientToUse as any)
        .then(meta => setToTokenFiat(meta.priceUsd || 0))
        .catch(() => setToTokenFiat(0));
    }
  }, [lifiToToken, mode, publicClient, walletChainId]);

  useEffect(() => {
    if (false && Number(swapAmount) > 0 && activeRoute) {
      const timer = setInterval(() => {
        setQuoteCountdown((prev) => {
          if (prev <= 1) {
            setQuoteRefreshTrigger(t => t + 1);
            return 10;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    } else {
      setQuoteCountdown(10);
    }
  }, [activeTab, swapAmount, activeRoute]);

  useEffect(() => {
    let active = true;
    if (tokenSearch && tokenSearch.startsWith("0x") && tokenSearch.length === 42) {
      const isArcMainnet = mode === "mainnet";
      const targetMainnetChainId = walletChainId === 4663 ? 4663 : 5042;
      const cId = isArcMainnet ? targetMainnetChainId : 4663;
      const clientToUse = (isArcMainnet ? (cId === 5042 ? arcMainnetClient : robinhoodClient) : publicClient) || publicClient;

      tokenMetadataService.getTokenMetadata(tokenSearch, cId, clientToUse as any)
        .then(async meta => {
          if (!active) return;
          if (address && meta) {
            try {
              const bal: any = await (clientToUse as any).readContract({
                address: meta.address as `0x${string}`,
                abi: [{ name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] }],
                functionName: 'balanceOf',
                args: [address]
              });
              meta.balance = (Number(bal) / (10 ** meta.decimals)).toString();

              if (!meta.priceUsd && cId === 5042) {
                const amountIn = BigInt(10 ** meta.decimals);
                const QUOTER_V2 = "0x7dfd4f31be6814d2906bde155c3e1b146eac1468";
                const USDC = "0x3600000000000000000000000000000000000000";
                const fees = [10000, 3000, 500, 100];
                for (const fee of fees) {
                  try {
                    const quote: any = await (clientToUse as any).readContract({
                      address: QUOTER_V2 as `0x${string}`,
                      abi: [{ name: 'quoteExactInputSingle', type: 'function', stateMutability: 'nonpayable', inputs: [{ components: [{ name: 'tokenIn', type: 'address' }, { name: 'tokenOut', type: 'address' }, { name: 'amountIn', type: 'uint256' }, { name: 'fee', type: 'uint24' }, { name: 'sqrtPriceLimitX96', type: 'uint160' }], name: 'params', type: 'tuple' }], outputs: [{ name: 'amountOut', type: 'uint256' }, { name: 'sqrtPriceX96After', type: 'uint160' }, { name: 'initializedTicksCrossed', type: 'uint32' }, { name: 'gasEstimate', type: 'uint256' }] }],
                      functionName: 'quoteExactInputSingle',
                      args: [{ tokenIn: meta.address, tokenOut: USDC, amountIn, fee, sqrtPriceLimitX96: 0n }]
                    });
                    if (quote && quote[0]) {
                      meta.priceUsd = Number(quote[0]) / 1e6;
                      break;
                    }
                  } catch (e) { /* Try next fee */ }
                }
              }
            } catch (e) { }
          }
          if (active) setCustomTokenMeta(meta);
        })
        .catch(() => {
          if (active) setCustomTokenMeta(null);
        });
    } else {
      setCustomTokenMeta(null);
    }
    return () => { active = false; };
  }, [tokenSearch, publicClient, address, mode, walletChainId]);

  useEffect(() => {
    if (false && Number(swapAmount) > 0 && swapFrom && swapTo) {
      if (mode === "mainnet" && lifiFromToken && lifiToToken) {
        setIsQuoting(true);
        const timer = setTimeout(async () => {
          try {
            const amountInWei = parseUnits(swapAmount, lifiFromToken.decimals).toString();

            const targetMainnetChainId = walletChainId === 4663 ? 4663 : 5042;
            const optimalRoutes = await arcFunQuoteEngine.getOptimalQuotes({
              fromChainId: targetMainnetChainId,
              toChainId: targetMainnetChainId,
              fromTokenAddress: lifiFromToken.address.toLowerCase(),
              toTokenAddress: lifiToToken.address.toLowerCase(),
              fromAmount: amountInWei,
              userAddress: address || "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
              slippageTolerance: 0.05
            });

            if (optimalRoutes && optimalRoutes.length > 0) {
              setActiveRoute(optimalRoutes[0]);
              setQuoteCountdown(10);
            } else {
              setActiveRoute(null);
            }
          } catch (e) {
            setActiveRoute(null);
          } finally {
            setIsQuoting(false);
          }
        }, 500);
        return () => clearTimeout(timer);
      } else if (mode === "testnet") {
        const amtIn = Number(swapAmount);
        if (amtIn > 0 && swapFrom !== swapTo) {
          let rate = 1;
          if (swapFrom === "USDC" && swapTo === "EURC") rate = 0.6;
          else if (swapFrom === "EURC" && swapTo === "USDC") rate = 10 / 6;

          setQuoteData({
            tokenIn: swapFrom as string,
            tokenOut: swapTo as string,
            amountIn: amtIn,
            expectedAmountOut: amtIn * rate,
            rate: rate,
            fee: 0,
            priceImpact: 0
          });
        } else if (amtIn > 0 && swapFrom === swapTo) {
          setQuoteData({
            tokenIn: swapFrom as string,
            tokenOut: swapTo as string,
            amountIn: amtIn,
            expectedAmountOut: amtIn,
            rate: 1,
            fee: 0,
            priceImpact: 0
          });
        } else {
          setQuoteData(null);
        }
      }
    } else {
      setQuoteData(null);
      setActiveRoute(null);
    }
  }, [activeTab, swapFrom, swapTo, swapAmount, mode, lifiFromToken, lifiToToken, address, quoteRefreshTrigger, walletChainId]);

  const handleInputFocus = () => {
    if (txEngine.state === "success" || txEngine.state === "failed") {
      txTrackerRef.current?.dismiss();
    }
  };

  useEffect(() => {
    if (bridgeAmount && Number(bridgeAmount) > 0) {
      window.dispatchEvent(new CustomEvent("arc-hide-bottom-nav"));
    } else {
      window.dispatchEvent(new CustomEvent("arc-show-bottom-nav"));
    }
  }, [bridgeAmount]);


  const [transferId, setTransferId] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ title: string, message: string, type: "success" | "error" } | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);
  const [historyFilter, setHistoryFilter] = useState<"all" | "success" | "pending" | "failed">("all");
  // Cursor-stack for server-side pagination:
  //   cursorStack[0] = null (page 1 always starts with no cursor)
  //   cursorStack[1] = nextCursor returned after page 1 (used to fetch page 2)
  //   cursorStack[N] = nextCursor for page N+1
  const [cursorStack, setCursorStack] = useState<(string | null)[]>([null]);
  const currentCursor = cursorStack[cursorStack.length - 1]; // cursor for the currently-visible page
  const currentPageNumber = cursorStack.length; // 1-indexed
  const [expandedHistoryIds, setExpandedHistoryIds] = useState<Set<string>>(new Set());
  const [historyUpdateMsg, setHistoryUpdateMsg] = useState<string | null>(null);
  const prevHistoryRef = useRef<string>("");
  const isManualRefreshRef = useRef<boolean>(false);

  const toggleHistoryExpand = (id: string) => {
    setExpandedHistoryIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };


  // ── Access Control State ────────────────────────────────────────────────────
  const DEFAULT_ADMIN_ROLE = "0x0000000000000000000000000000000000000000000000000000000000000000" as const;
  const { data: isAdminOnChain = false } = useReadContract({
    address: ARCFUN_SWAP_ADDRESS,
    abi: ARCFUN_SWAP_ABI,
    functionName: "hasRole",
    args: address ? [DEFAULT_ADMIN_ROLE, address] : undefined,
    chainId: CHAIN_ID_MAP["Arc Testnet"],
    // Only fire once the user is actually on the swap tab — prevents RPC call on wallet connect
    query: { enabled: !!address && (activeTab === "bridge" || activeTab === "admin") },
  });

  const isAdmin = isAdminOnChain || (!!address && ADMIN_WALLETS.includes(address.toLowerCase()));
  const hasAccess = isAdmin || swapUnlocked;
  const hasBridgeAccess = isAdmin || bridgeUnlocked;

  const { history: historyItems, isLoading: isHistoryLoading, refetchHistory, hasMore: historyHasMore, nextCursor: historyNextCursor } = useOnChainHistory({
    hasAccess: hasAccess || hasBridgeAccess,
    cursor: currentCursor,
    statusFilter: historyFilter,
  });

  // ── Bridge Route Control (EVM / Solana <-> Sui) ─────────────────────────────
  const [routeSettings, setRouteSettings] = useState<{
    evmToSui: boolean;
    suiToEvm: boolean;
    solanaToSui: boolean;
    suiToSolana: boolean;
  }>({
    evmToSui: true,
    suiToEvm: true,
    solanaToSui: true,
    suiToSolana: true,
  });

  const lastRouteFetchRef = useRef<number>(0);
  const fetchRouteSettings = useCallback(async (force = false) => {
    const now = Date.now();
    if (!force && now - lastRouteFetchRef.current < 30_000) return;
    lastRouteFetchRef.current = now;

    try {
      const { data } = await supabase
        .from("onchain_access_settings")
        .select("*")
        .in("module", ["bridge_evm_to_sui", "bridge_sui_to_evm", "bridge_solana_to_sui", "bridge_sui_to_solana"]);

      if (data) {
        let evmToSui = true;
        let suiToEvm = true;
        let solanaToSui = true;
        let suiToSolana = true;
        data.forEach((row: any) => {
          if (row.module === "bridge_evm_to_sui" && row.mode === "paused") evmToSui = false;
          if (row.module === "bridge_sui_to_evm" && row.mode === "paused") suiToEvm = false;
          if (row.module === "bridge_solana_to_sui" && row.mode === "paused") solanaToSui = false;
          if (row.module === "bridge_sui_to_solana" && row.mode === "paused") suiToSolana = false;
        });
        setRouteSettings((prev) => {
          if (
            prev.evmToSui === evmToSui &&
            prev.suiToEvm === suiToEvm &&
            prev.solanaToSui === solanaToSui &&
            prev.suiToSolana === suiToSolana
          ) {
            return prev;
          }
          return { evmToSui, suiToEvm, solanaToSui, suiToSolana };
        });
      }
    } catch (e) {
      console.error("Error fetching route settings:", e);
    }
  }, []);

  useEffect(() => {
    fetchRouteSettings(true);
    const onFocus = () => fetchRouteSettings();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [fetchRouteSettings]);

  const isEvmToSuiRoute = !!bridgeFromChain && !!bridgeToChain && !bridgeFromChain.includes("Solana") && bridgeFromChain !== "Sui Testnet" && bridgeToChain === "Sui Testnet";
  const isSuiToEvmRoute = !!bridgeFromChain && !!bridgeToChain && bridgeFromChain === "Sui Testnet" && !bridgeToChain.includes("Solana") && bridgeToChain !== "Sui Testnet";
  const isSolanaToSuiRoute = !!bridgeFromChain && !!bridgeToChain && bridgeFromChain.includes("Solana") && bridgeToChain === "Sui Testnet";
  const isSuiToSolanaRoute = !!bridgeFromChain && !!bridgeToChain && bridgeFromChain === "Sui Testnet" && bridgeToChain.includes("Solana");

  const isCurrentRoutePaused =
    (isEvmToSuiRoute && routeSettings.evmToSui === false) ||
    (isSuiToEvmRoute && routeSettings.suiToEvm === false) ||
    (isSolanaToSuiRoute && routeSettings.solanaToSui === false) ||
    (isSuiToSolanaRoute && routeSettings.suiToSolana === false);

  const isRouteBlocked = isCurrentRoutePaused && !isAdmin;

  // Cross-chain bridge balance state
  const [crossChainBal, setCrossChainBal] = useState<bigint>(0n);
  const [crossChainToBal, setCrossChainToBal] = useState<bigint>(0n);
  const [crossChainToDecimals, setCrossChainToDecimals] = useState<number>(6);
  const [isCrossChainLoading, setIsCrossChainLoading] = useState(false);
  const [isRotated, setIsRotated] = useState(false);
  const [bridgeEstimate, setBridgeEstimate] = useState<any>(null);
  const [hasPendingBridge, setHasPendingBridge] = useState(false);

  const handleHistoryRefresh = async () => {
    if (isHistoryLoading || isRefreshing) return;
    setIsRefreshing(true);
    setHistoryUpdateMsg(null);
    prevHistoryRef.current = JSON.stringify(historyItems);
    isManualRefreshRef.current = true;
    await refetchHistory(true);
    setLastUpdated(new Date());
    setIsRefreshing(false);
  };

  useEffect(() => {
    if (isManualRefreshRef.current && !isRefreshing) {
      isManualRefreshRef.current = false;
      const currentStr = JSON.stringify(historyItems);
      if (currentStr !== prevHistoryRef.current) {
        setHistoryUpdateMsg("History updated");
      } else {
        setHistoryUpdateMsg("Already up to date");
      }
      setTimeout(() => setHistoryUpdateMsg(null), 2500);
    }
  }, [historyItems, isRefreshing]);

  useEffect(() => {
    if (typeof window === "undefined" || !address) {
      setHasPendingBridge(false);
      return;
    }
    const checkPendingStatus = () => {
      const pendingItems = historyItems.filter(
        tx => tx.userAddress?.toLowerCase() === address.toLowerCase() && tx.status === "pending"
      );
      // Strict UI Binding: Dot ONLY shows if it is visible in the Pending Tab
      setHasPendingBridge(pendingItems.length > 0);
    };
    checkPendingStatus();
  }, [address, historyItems]);
  const { data: walletClient } = useWalletClient();
  const solanaWallet = useWallet();
  const solanaConnected = solanaWallet.connected;
  const stellarWallet = useStellar();


  // ── On-chain reads (Arc Testnet / Swap Only) ────────────────────────────────
  const currentDay = BigInt(Math.floor(Date.now() / 86400000));

  const { data: swapsUsedToday = 0n, refetch: refetchSwapsUsedToday } = useReadContract({
    address: ARCFUN_SWAP_ADDRESS,
    abi: ARCFUN_SWAP_ABI,
    functionName: "dailySwapCount",
    args: address ? [address, currentDay] : undefined,
    chainId: CHAIN_ID_MAP["Arc Testnet"],
    query: { enabled: !!address && hasAccess && false && !!swapFrom && !!swapTo },
  });

  const { data: isWhitelisted = false } = useReadContract({
    address: ARCFUN_SWAP_ADDRESS,
    abi: ARCFUN_SWAP_ABI,
    functionName: "isWhitelisted",
    args: address ? [address] : undefined,
    chainId: CHAIN_ID_MAP["Arc Testnet"],
    query: { enabled: !!address && hasAccess && false && !!swapFrom && !!swapTo },
  });

  const { data: isPaused = false } = useReadContract({
    address: ARCFUN_SWAP_ADDRESS,
    abi: ARCFUN_SWAP_ABI,
    functionName: "paused",
    chainId: CHAIN_ID_MAP["Arc Testnet"],
    query: { enabled: hasAccess && false && !!swapFrom && !!swapTo },
  });

  const { data: scoreRequired = true } = useReadContract({
    address: ARCFUN_SWAP_ADDRESS,
    abi: ARCFUN_SWAP_ABI,
    functionName: "scoreRequirementEnabled",
    chainId: CHAIN_ID_MAP["Arc Testnet"],
    query: { enabled: hasAccess && false && !!swapFrom && !!swapTo },
  });


  const activeFromAsset = false ? swapFrom : bridgeFromAsset;
  const tokenInAddr = (activeFromAsset ? TOKEN_ADDRESSES[activeFromAsset] : undefined) as `0x${string}`;
  const tokenOutAddr = (swapTo ? TOKEN_ADDRESSES[swapTo as any] : undefined) as `0x${string}`;



  useEffect(() => {
    if (executionMode === "arcfun" && !arcWalletAddress) {
      import("@/lib/supabase").then(({ supabase }) => {
        supabase.auth.getSession().then(({ data: { session } }) => {
          if (!session) {
            setHasCheckedArcWallet(true);
            return;
          }
          fetch("/api/wallet/health", {
            headers: { 'Authorization': `Bearer ${session.access_token}` }
          })
            .then(res => res.json())
            .then(data => {
              if (data.wallet) setArcWalletAddress(data.wallet);
            })
            .catch(console.error)
            .finally(() => setHasCheckedArcWallet(true));
        });
      });
    }

    const handleArcWalletConnected = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail && customEvent.detail.address) {
        setArcWalletAddress(customEvent.detail.address);
        setHasCheckedArcWallet(true);
      }
    };

    if (typeof window !== "undefined") {
      window.addEventListener('arc-wallet-connected', handleArcWalletConnected);
    }

    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener('arc-wallet-connected', handleArcWalletConnected);
      }
    };
  }, [executionMode, arcWalletAddress]);

  const effectiveAddress = executionMode === "arcfun" ? (arcWalletAddress as `0x${string}` | undefined) : address;

  // ── Arc Testnet USDC ERC20 Balance ──
  // The contract uses the ERC20 USDC (6 decimals), NOT the native gas token (18 decimals).
  const { data: nativeBalData, isLoading: isLoadingNative, refetch: refetchNative } = useBalance({
    address: effectiveAddress,
    token: USDC_ADDRESS,
    chainId: CHAIN_ID_MAP["Arc Testnet"],
    query: { enabled: mode === "testnet" && !!effectiveAddress && (activeFromAsset === "USDC" || showTokenSelect !== null) && (hasAccess || hasBridgeAccess) },
  });

  // ── Arc Testnet EURC Balance ──
  const { data: eurcBalRaw = 0n, isLoading: isLoadingEurc, refetch: refetchEurc } = useReadContract({
    address: EURC_ADDRESS as `0x${string}`,
    abi: ERC20_APPROVE_ABI,
    functionName: "balanceOf",
    args: effectiveAddress ? [effectiveAddress] : undefined,
    chainId: CHAIN_ID_MAP["Arc Testnet"],
    query: { enabled: mode === "testnet" && !!effectiveAddress && (activeFromAsset === "EURC" || showTokenSelect !== null) && (hasAccess || hasBridgeAccess) },
  });

  const { data: eurcDecimals = 6 } = useReadContract({
    address: EURC_ADDRESS as `0x${string}`,
    abi: ERC20_APPROVE_ABI,
    functionName: "decimals",
    chainId: CHAIN_ID_MAP["Arc Testnet"],
    query: { enabled: mode === "testnet" && (hasAccess || hasBridgeAccess) && (activeFromAsset === "EURC" || swapTo === "EURC" || bridgeToAsset === "EURC") },
  });

  // Swap allowance — always checks against Swap contract
  const { data: allowance = 0n, refetch: refetchAllowance } = useReadContract({
    address: tokenInAddr,
    abi: ERC20_APPROVE_ABI,
    functionName: "allowance",
    args: effectiveAddress ? [effectiveAddress, ARCFUN_SWAP_ADDRESS] : undefined,
    chainId: CHAIN_ID_MAP["Arc Testnet"],
    query: { enabled: mode === "testnet" && !!effectiveAddress && activeFromAsset !== "cirBTC" && hasAccess && Number(swapAmount) > 0 },
  });

  // Bridge allowance — checks against the correct spender based on selected route
  // CCTP: TokenMessengerV2 on src chain for USDC, or CCTS TokenManager for EURC
  const cctpDomains = getCctpDomains(mode);
  const bridgeSourceDomain = bridgeFromChain ? (cctpDomains[bridgeFromChain] || resolveCctpDomain(bridgeFromChain, mode)) : undefined;
  const isEurcBridge = bridgeFromAsset === "EURC";
  const isCirBtcBridge = bridgeFromAsset === "cirBTC";
  const bridgeSpender: `0x${string}` = isCirBtcBridge
    ? ("0xb995f4060c38b7608626d0ccabe547cdc2c7390a" as `0x${string}`)
    : isEurcBridge
    ? (CCTS_TOKEN_MANAGER_ADDRESS as `0x${string}`)
    : ((bridgeSourceDomain?.tokenMessenger as `0x${string}` | undefined) ?? (mode === "mainnet" ? "0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d" : "0x8fe6b999dc680ccfdd5bf7eb0974218be2542daa"));
  const bridgeTokenAddress: `0x${string}` = isCirBtcBridge
    ? (((CROSS_CHAIN_REGISTRY as any)[bridgeFromChain || ""]?.cirBTC) || "0x0" as `0x${string}`)
    : isEurcBridge
    ? (((bridgeSourceDomain as any)?.eurc || ((CROSS_CHAIN_REGISTRY as any)[bridgeFromChain || ""]?.EURC) || EURC_ADDRESS) as `0x${string}`)
    : ((bridgeSourceDomain?.usdc as `0x${string}` | undefined) ?? tokenInAddr);
  const bridgeSourceChainId = bridgeFromChain ? CHAIN_ID_MAP[bridgeFromChain] : undefined;

  const { data: bridgeAllowance = 0n } = useReadContract({
    address: bridgeTokenAddress,
    abi: ERC20_APPROVE_ABI,
    functionName: "allowance",
    args: effectiveAddress ? [effectiveAddress, bridgeSpender] : undefined,
    chainId: bridgeSourceChainId,
    query: { enabled: !!effectiveAddress && activeTab === "bridge" && Number(bridgeAmount) > 0 && !!bridgeSourceChainId && bridgeTokenAddress !== "0x0" },
  });

  // ── Cross Chain Balance Fetcher (For Bridge Tab) ──
  const [crossChainDecimals, setCrossChainDecimals] = useState<number>(6);

  const [viemAdapter, setViemAdapter] = useState<any>(null);

  useEffect(() => {
    let active = true;
    if (walletClient) {
      const provider = (walletClient as any).transport;
      createViemAdapterFromProvider({
        provider,
        // @ts-ignore - Viem v1/v2 PublicClient mismatch with adapter
        getPublicClient: ({ chain }: any) => {
          let transport;
          if (chain.id === 5042002) {
            transport = fallback([
              http(process.env.NEXT_PUBLIC_ARC_TESTNET_RPC_URL || "https://5042002.rpc.thirdweb.com", { retryCount: 2, retryDelay: 500, batch: true }),
              http("https://5042002.rpc.thirdweb.com", { retryCount: 2, retryDelay: 500, batch: true })
            ]);
          } else {
            const rpcUrl = chain.rpcEndpoints?.[0] || chain.rpcUrls?.default?.http[0];
            transport = http(rpcUrl, { retryCount: 3, retryDelay: 1000, batch: true });
          }

          const effectiveChain = chain.id === 5042002 ? {
            ...chain,
            rpcUrls: {
              default: { http: [process.env.NEXT_PUBLIC_ARC_TESTNET_RPC_URL || "https://5042002.rpc.thirdweb.com"] },
              public: { http: [process.env.NEXT_PUBLIC_ARC_TESTNET_RPC_URL || "https://5042002.rpc.thirdweb.com"] }
            },
            rpcEndpoints: [process.env.NEXT_PUBLIC_ARC_TESTNET_RPC_URL || "https://5042002.rpc.thirdweb.com"]
          } : chain;

          return createPublicClient({
            chain: effectiveChain,
            transport,
            pollingInterval: 5000
          });
        },
        capabilities: {
          supportedChains: kit.getSupportedChains().filter((c: any) => c.type === 'evm') as any
        }
      }).then(adapter => {
        if (active) setViemAdapter(adapter);
      }).catch(console.error);
    } else {
      setViemAdapter(null);
    }
    return () => { active = false; };
  }, [walletClient]);

  useEffect(() => {
    if (activeTab === "bridge" && bridgeFromChain && bridgeToChain && bridgeFromAsset && bridgeToAsset && Number(bridgeAmount) > 0 && viemAdapter) {
      const timer = setTimeout(async () => {
        try {
          const formatChain = (chainName: string) => {
            if (chainName === "Base Mainnet") return "Base";
            if (chainName === "Arbitrum Mainnet") return "Arbitrum";
            if (chainName === "Ink Sepolia") return "Ink_Testnet";
            if (chainName === "Injective EVM Testnet") return "Injective_Testnet";
            return chainName.replaceAll(" ", "_");
          };

          if (
            bridgeToChain?.includes("Solana") || bridgeFromChain?.includes("Solana") ||
            bridgeToChain?.includes("Sui") || bridgeFromChain?.includes("Sui")
          ) {
            setBridgeEstimate({ gasFees: [] });
            return;
          }

          const est = await kit.estimateBridge({
            from: { adapter: viemAdapter, chain: formatChain(bridgeFromChain) as any },
            to: { adapter: viemAdapter, chain: formatChain(bridgeToChain) as any },
            amount: bridgeAmount
          });
          setBridgeEstimate(est);
        } catch (e) {
          console.warn("[BridgeKit Estimation]", e);
          setBridgeEstimate({ gasFees: [] });
        }
      }, 1500); // Increased debounce to 1500ms
      return () => clearTimeout(timer);
    } else {
      setBridgeEstimate(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, bridgeAmount, bridgeFromChain, bridgeToChain]);



  const suiAddress = suiWallet.address;
  const suiIsConnected = suiWallet.isConnected;
  const stellarAddress = stellarWallet.address;
  const stellarIsConnected = stellarWallet.isConnected;
  const stellarUsdcBal = stellarWallet.usdcBalance;
  const solanaPubkeyStr = solanaWallet.publicKey?.toBase58();

  const fetchSingleChainBalance = useCallback(async (chainName: string | undefined, assetName: string | undefined): Promise<{ balance: bigint; decimals: number }> => {
    if (!chainName || !assetName) return { balance: 0n, decimals: 6 };

    const userAddr = (effectiveAddress || address) as `0x${string}`;

    if (chainName === "Arc Testnet") {
      if (!userAddr) return { balance: 0n, decimals: assetName === "cirBTC" ? 8 : 6 };
      try {
        const primaryRpc = process.env.NEXT_PUBLIC_ARC_TESTNET_RPC_URL || "https://5042002.rpc.thirdweb.com";
        const assetAddr = assetName === "cirBTC"
          ? (CROSS_CHAIN_REGISTRY["Arc Testnet"]?.cirBTC || "0xf0c4a4ce82a5746abaad9425360ab04fbba432bf")
          : assetName === "EURC"
          ? EURC_ADDRESS
          : USDC_ADDRESS;
        const defaultDecimals = assetName === "cirBTC" ? 8 : 6;
        let res = { balance: 0n, decimals: defaultDecimals };
        await withEvmFailover(chainName, primaryRpc, async (rpcUrl) => {
          const pc = createPublicClient({ transport: http(rpcUrl) });
          const [b, d] = await Promise.all([
            pc.readContract({
              address: assetAddr as `0x${string}`,
              abi: ERC20_APPROVE_ABI,
              functionName: "balanceOf",
              args: [userAddr]
            }),
            pc.readContract({
              address: assetAddr as `0x${string}`,
              abi: ERC20_APPROVE_ABI,
              functionName: "decimals"
            }).catch(() => defaultDecimals)
          ]);
          res = { balance: b as bigint, decimals: Number(d) || defaultDecimals };
        }, "fetchSingleChainBalance");
        return res;
      } catch (err) {
        console.error("Failed to fetch Arc Testnet balance:", err);
        return { balance: 0n, decimals: assetName === "cirBTC" ? 8 : 6 };
      }
    }

    if (chainName === "Arc Mainnet") {
      if (!userAddr) return { balance: 0n, decimals: 6 };
      try {
        const primaryRpc = process.env.NEXT_PUBLIC_ARC_MAINNET_RPC_URL || "https://arc-mainnet.infura.io/v3/b6bf7d3508c941499b10025c0776eaf8";
        let res = { balance: 0n, decimals: 6 };
        await withEvmFailover(chainName, primaryRpc, async (rpcUrl) => {
          const pc = createPublicClient({ transport: http(rpcUrl) });
          const b = await pc.readContract({
            address: "0x3600000000000000000000000000000000000000" as `0x${string}`,
            abi: ERC20_APPROVE_ABI,
            functionName: "balanceOf",
            args: [userAddr]
          });
          res = { balance: b as bigint, decimals: 6 };
        }, "fetchSingleChainBalance");
        return res;
      } catch {
        return { balance: 0n, decimals: 6 };
      }
    }

    if (chainName.includes("Solana")) {
      if (!solanaConnected || !solanaPubkeyStr) return { balance: 0n, decimals: 6 };
      try {
        const { Connection, PublicKey } = await import("@solana/web3.js");
        const mintAddress = chainName === "Solana Devnet"
          ? "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"
          : "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

        let res = { balance: 0n, decimals: 6 };
        await withSolanaFailover(async (rpcUrl) => {
          const connection = new Connection(rpcUrl);
          const accounts = await connection.getParsedTokenAccountsByOwner(
            new PublicKey(solanaPubkeyStr),
            { mint: new PublicKey(mintAddress) }
          );

          if (accounts.value.length > 0) {
            const balanceInfo = accounts.value[0].account.data.parsed.info.tokenAmount;
            res = { balance: BigInt(balanceInfo.amount), decimals: balanceInfo.decimals || 6 };
          }
        }, "fetchSingleChainBalance");
        return res;
      } catch (e) {
        console.error("Failed to fetch Solana balance", e);
        return { balance: 0n, decimals: 6 };
      }
    }

    if (chainName === "Stellar Testnet") {
      const activeStellarAddr = stellarAddress || (stellarWallet?.address ?? null) || (typeof window !== "undefined" ? localStorage.getItem("arc_stellar_address") : null);
      if (!activeStellarAddr) return { balance: 0n, decimals: 7 };
      try {
        const live = await fetchLiveStellarUsdcBalance(activeStellarAddr);
        if (stellarWallet?.refreshBalances) {
          stellarWallet.refreshBalances(activeStellarAddr).catch(() => {});
        }
        return { balance: live.balance, decimals: live.decimals };
      } catch (e) {
        console.warn("Direct live Stellar fetch failed, falling back to cached balance:", e);
        const balStr = assetName === "USDC" ? stellarUsdcBal : "0";
        const balBigInt = BigInt(Math.round(parseFloat(balStr || "0") * 1e7));
        return { balance: balBigInt, decimals: 7 };
      }
    }

    if (chainName.includes("Sui")) {
      const suiOwner = suiAddress || (suiIsConnected ? suiAddress : null);
      if (!suiOwner) return { balance: 0n, decimals: 6 };
      try {
        return await fetchSuiUsdcBalance(suiOwner, chainName);
      } catch (e) {
        console.error("Failed to fetch Sui USDC balance", e);
        return { balance: 0n, decimals: 6 };
      }
    }

    if (!userAddr) return { balance: 0n, decimals: assetName === "cirBTC" ? 8 : 6 };
    const conf = (CROSS_CHAIN_REGISTRY as any)[chainName];
    const assetAddr = conf?.[assetName];
    if (!conf?.rpc || !assetAddr || assetAddr === "0x0") return { balance: 0n, decimals: assetName === "cirBTC" ? 8 : 6 };

    try {
      const defaultDecimals = assetName === "cirBTC" ? 8 : 6;
      let res = { balance: 0n, decimals: defaultDecimals };
      await withEvmFailover(chainName, conf.rpc, async (rpcUrl) => {
        const pc = createPublicClient({ transport: http(rpcUrl) });
        const [b, d] = await Promise.all([
          pc.readContract({
            address: assetAddr as `0x${string}`,
            abi: ERC20_APPROVE_ABI,
            functionName: "balanceOf",
            args: [userAddr]
          }),
          pc.readContract({
            address: assetAddr as `0x${string}`,
            abi: ERC20_APPROVE_ABI,
            functionName: "decimals"
          }).catch(() => defaultDecimals)
        ]);
        res = { balance: b as bigint, decimals: Number(d) || defaultDecimals };
      }, "fetchSingleChainBalance");
      return res;
    } catch {
      console.error(`Failed to fetch EVM balance for ${chainName}`);
      return { balance: 0n, decimals: assetName === "cirBTC" ? 8 : 6 };
    }
  }, [address, effectiveAddress, solanaConnected, solanaPubkeyStr, stellarIsConnected, stellarAddress, stellarUsdcBal, suiIsConnected, suiAddress]);

  const [hasCrossChainLoaded, setHasCrossChainLoaded] = useState(false);
  const crossChainRequestIdRef = useRef<number>(0);

  const fetchCrossChainBalance = useCallback(async () => {
    if (!bridgeFromChain || !bridgeToChain || !bridgeFromAsset || !bridgeToAsset || bridgeFromChain === bridgeToChain) {
      setIsCrossChainLoading(false);
      setHasCrossChainLoaded(true);
      return;
    }
    const currentReqId = ++crossChainRequestIdRef.current;
    setIsCrossChainLoading(true);
    try {
      const fromChainTarget = bridgeFromChain;
      const toChainTarget = bridgeToChain;
      const fromAssetTarget = bridgeFromAsset;
      const toAssetTarget = bridgeToAsset;

      const [fromData, toData] = await Promise.all([
        fetchSingleChainBalance(fromChainTarget, fromAssetTarget),
        fetchSingleChainBalance(toChainTarget, toAssetTarget)
      ]);

      // Guard against stale async responses if chains/assets changed during fetch
      if (crossChainRequestIdRef.current !== currentReqId) return;

      setCrossChainBal(fromData.balance);
      setCrossChainDecimals(fromData.decimals);

      setCrossChainToBal(toData.balance);
      setCrossChainToDecimals(toData.decimals);
    } catch (err) {
      console.error("[Bridge Balance] Failed to fetch cross-chain balances:", err);
    } finally {
      if (crossChainRequestIdRef.current === currentReqId) {
        setIsCrossChainLoading(false);
        setHasCrossChainLoaded(true);
      }
    }
  }, [bridgeFromChain, bridgeToChain, bridgeFromAsset, bridgeToAsset, fetchSingleChainBalance]);

  useEffect(() => {
    fetchCrossChainBalance();
  }, [bridgeFromChain, bridgeToChain, bridgeFromAsset, bridgeToAsset, effectiveAddress, address, suiIsConnected, suiAddress, solanaConnected, solanaPubkeyStr, stellarIsConnected, stellarAddress]);

  // ── Admin Stats & Liquidity Monitors ──
  // IMPORTANT: Read from the Vault contract (ARCFUN_SWAP_VAULT_ADDRESS), NOT the Swap contract.
  // ── Smart Watcher State ────────────────────────────────────────────────────

  // LI.FI Balance Hook
  const { data: lifiBalanceData, refetch: refetchLifiBalance } = useBalance({
    address,
    token: lifiFromToken?.address !== "0x0000000000000000000000000000000000000000" ? lifiFromToken?.address : undefined,
    chainId: walletChainId === 5042 ? 5042 : 4663,
    query: { enabled: mode === "mainnet" && !!address && !!lifiFromToken }
  });

  // ── Admin Stats & Liquidity Monitors ──
  // Vault liquidity balance: eagerly fetch so it's ready before user types
  const { data: swapVaultUSDCData, isLoading: isUSDCVaultLoading } = useBalance({ address: ARCFUN_SWAP_VAULT_ADDRESS, token: USDC_ADDRESS, query: { enabled: false && hasAccess && swapTo === "USDC" } });
  const { data: swapVaultEURCData, isLoading: isEURCVaultLoading } = useBalance({ address: ARCFUN_SWAP_VAULT_ADDRESS, token: EURC_ADDRESS, query: { enabled: false && hasAccess && swapTo === "EURC" } });
  const swapVaultUSDC = swapVaultUSDCData?.value ?? 0n;
  const swapVaultEURC = swapVaultEURCData?.value ?? 0n;
  const activeSwapVaultLiquidity = swapTo === "USDC" ? swapVaultUSDC : swapVaultEURC;
  const isVaultLiquidityLoading = swapTo === "USDC" ? isUSDCVaultLoading : isEURCVaultLoading;

  // ── Derived values ─────────────────────────────────────────────────────────
  const isArcNative = bridgeFromChain === "Arc Testnet";

  const decimalsFrom = activeTab === "bridge"
    ? crossChainDecimals
    : (isArcNative
      ? (activeFromAsset === "USDC" ? (nativeBalData?.decimals ?? 18) : eurcDecimals)
      : crossChainDecimals);

  const isFetchingArcAddress = executionMode === "arcfun" && !arcWalletAddress && !hasCheckedArcWallet;

  const isLoadingBalance = isFetchingArcAddress || isRefreshing || (
    !!effectiveAddress && (
      activeTab === "bridge"
        ? (isCrossChainLoading && !hasCrossChainLoaded)
        : (isArcNative
          ? (activeFromAsset === "USDC" ? isLoadingNative : isLoadingEurc)
          : (isCrossChainLoading && !hasCrossChainLoaded))
    )
  );

  // ── Rate-limited refetch (max once per 60 s; pass force=true to bypass) ──
  const REFETCH_COOLDOWN_MS = 60_000;
  const lastRefetchRef = useRef<number>(0);


  const refetchBalance = useCallback(async (force = false) => {
    const now = Date.now();
    if (!force && now - lastRefetchRef.current < REFETCH_COOLDOWN_MS) return;
    lastRefetchRef.current = now;

    setIsRefreshing(true);
    if (activeTab === "bridge") {
      await fetchCrossChainBalance();
    } else if (mode === "mainnet") {
      await refetchLifiBalance();
    } else {
      if (isArcNative) {
        await refetchNative();
        await refetchEurc();
        await refetchAllowance();
        await refetchSwapsUsedToday();
        fetchWalletLimits();
      } else {
        await fetchCrossChainBalance();
      }
    }
    setLastUpdated(new Date());
    setIsRefreshing(false);
  }, [activeTab, mode, isArcNative, activeFromAsset, refetchNative, refetchEurc, refetchAllowance, refetchSwapsUsedToday, fetchCrossChainBalance, refetchLifiBalance, fetchWalletLimits]);

  useEffect(() => {
    if (!isLoadingBalance) {
      setLastUpdated(new Date());
    }
  }, [isLoadingBalance, nativeBalData, eurcBalRaw, crossChainBal]);

  // After a successful tx: force one immediate refetch (bypasses cooldown)
  useEffect(() => {
    if (txEngine.state === "success") {
      const timer = setTimeout(() => {
        refetchBalance(true);
        window.dispatchEvent(new Event('refresh-portfolio'));
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [txEngine.state, refetchBalance]);

  // Unified balance logic
  const balanceFromRaw: bigint = activeTab === "bridge"
    ? crossChainBal
    : (mode === "mainnet"
      ? (lifiBalanceData?.value ?? 0n)
      : (isArcNative
        ? (activeFromAsset === "USDC" ? (nativeBalData?.value ?? 0n) : (eurcBalRaw ?? 0n))
        : crossChainBal));

  const fromBalFormatted = activeTab === "bridge"
    ? formatUnits(crossChainBal, crossChainDecimals)
    : (mode === "mainnet"
      ? (lifiBalanceData?.formatted ?? "0")
      : (isArcNative && activeFromAsset === "USDC"
        ? nativeBalData?.formatted ?? "0"
        : formatUnits(balanceFromRaw, decimalsFrom)));

  const toBalFormatted = formatUnits(crossChainToBal, crossChainToDecimals);

  const amountNum = Number(swapAmount) || 0;
  const amountRaw = swapAmount ? parseUnits(swapAmount, decimalsFrom) : 0n;
  const decimalsTo = isArcNative
    ? (swapTo === "USDC" ? (nativeBalData?.decimals ?? 18) : eurcDecimals)
    : crossChainDecimals;
  const amountOutRaw = quoteData?.expectedAmountOut
    ? parseUnits(quoteData?.expectedAmountOut.toFixed(decimalsTo), decimalsTo)
    : 0n;
  // Bridge uses its own amount — NEVER use swapAmount for bridge
  const bridgeAmountNum = Number(bridgeAmount) || 0;
  const bridgeAmountRaw = bridgeAmount ? parseUnits(bridgeAmount, decimalsFrom) : 0n;

  const swapsLeft = Math.max(0, MAX_SWAPS_PER_DAY - Number(swapsUsedToday));

  const handleMaxSwap = () => {
    let safeMax = Math.floor(Number(fromBalFormatted) * 10000) / 10000;
    if (mode === "mainnet" && lifiFromToken?.symbol === "ETH" && lifiFromToken?.address === "0x0000000000000000000000000000000000000000") {
      safeMax = safeMax > 0.005 ? safeMax - 0.005 : safeMax;
    }
    setSwapAmount(safeMax > 0 ? safeMax.toString() : "0");
    handleInputFocus();
  };

  const handleHalfSwap = () => {
    let safeMax = Math.floor(Number(fromBalFormatted) * 10000) / 10000;
    if (mode === "mainnet" && lifiFromToken?.symbol === "ETH" && lifiFromToken?.address === "0x0000000000000000000000000000000000000000") {
      safeMax = safeMax > 0.005 ? safeMax - 0.005 : safeMax;
    }
    const half = safeMax > 0 ? (safeMax / 2) : 0;
    setSwapAmount(half > 0 ? half.toString() : "0");
    handleInputFocus();
  };
  const handleMaxBridge = () => {
    if (bridgeFromAsset === "cirBTC") {
      setBridgeAmount(fromBalFormatted);
    } else {
      const safeMax = Math.floor(Number(fromBalFormatted) * 10000) / 10000;
      setBridgeAmount(safeMax.toString());
    }
    handleInputFocus();
  };

  const isRouteSupported = (fromChain: string | null, toChain: string | null): boolean => {
    if (!fromChain || !toChain) return true;
    if (fromChain === toChain) return false;

    // EURC Route Validation: Both source and destination must be in EURC_CHAINS
    if (bridgeFromAsset === "EURC" || bridgeToAsset === "EURC") {
      if (!EURC_CHAINS.includes(fromChain as Chain) || !EURC_CHAINS.includes(toChain as Chain)) {
        return false;
      }
    }

    // cirBTC Route Validation: Both source and destination must be in CIRBTC_CHAINS
    if (bridgeFromAsset === "cirBTC" || bridgeToAsset === "cirBTC") {
      if (!CIRBTC_CHAINS.includes(fromChain as Chain) || !CIRBTC_CHAINS.includes(toChain as Chain)) {
        return false;
      }
    }

    const isFromSui = fromChain === "Sui Testnet";
    const isToSui = toChain === "Sui Testnet";

    const isFromStellar = fromChain === "Stellar Testnet";
    const isToStellar = toChain === "Stellar Testnet";

    const isFromSolana = fromChain.includes("Solana");
    const isToSolana = toChain.includes("Solana");

    // 0. Sui <-> Solana is NOT linked by Circle in CCTP v2 on Solana Devnet/Mainnet
    // Solana CCTP TokenMessenger fails with AnchorError 3012 (token_pair AccountNotInitialized)
    // Circle only supports Sui <-> EVM (Arc, Ethereum, Arbitrum, Base, Avalanche, etc.)
    if ((isFromSui && isToSolana) || (isFromSolana && isToSui)) {
      return false;
    }

    // 1. Sui (Circle CCTP V2 routes)
    if (isFromSui) {
      const toConfig = resolveCctpDomain(toChain, mode);
      if (!toConfig) return false;
    }
    if (isToSui) {
      const fromConfig = resolveCctpDomain(fromChain, mode);
      if (!fromConfig) return false;
    }

    // 2. Stellar Testnet
    if ((isFromStellar && (isToSolana || isToSui)) || (isToStellar && (isFromSolana || isFromSui))) {
      return false;
    }

    return true;
  };

  // Dynamic chain lists based on selected bridge asset and environment mode
  const getChains = (dir: "from" | "to"): Chain[] => {
    const allowed = getSupportedChains(mode) as readonly Chain[];
    return allowed.filter((c) => (dir === "to" ? c !== bridgeFromChain : true));
  };

  const supportedFromChains = getChains("from");
  const validDestinations = getChains("to");

  // Environment Switch Reset: completely isolate mainnet/testnet chains
  useEffect(() => {
    const allowed = getSupportedChains(mode) as readonly Chain[];
    setBridgeFromChain(allowed[0] || null);
    setBridgeToChain(allowed.length > 1 ? allowed[1] : null);
    setBridgeAmount("");
    setQuoteData(null);
    setActiveRoute(null);
    setCrossChainBal(0n);
    setCrossChainToBal(0n);
    setHasCrossChainLoaded(false);
    setIsCrossChainLoading(true);
  }, [mode]);

  // Auto-correction: Route Guards
  useEffect(() => {
    const allowed = getSupportedChains(mode) as readonly Chain[];
    if (!bridgeFromChain || !allowed.includes(bridgeFromChain)) {
      setBridgeFromChain(allowed[0]);
    }
    if (!bridgeToChain || !allowed.includes(bridgeToChain) || bridgeToChain === bridgeFromChain) {
      const nextTo = allowed.find(c => c !== bridgeFromChain) || null;
      setBridgeToChain(nextTo as any);
    }
  }, [mode, bridgeFromChain, bridgeToChain]);

  // Auto-correction: Invalid token guard after chain switch
  useEffect(() => {
    if (!bridgeFromChain) return;

    const validFromTokens = CHAIN_TOKEN_MATRIX[bridgeFromChain] || ["USDC"];
    if (!validFromTokens.includes(bridgeFromAsset as any)) {
      setBridgeFromAsset(validFromTokens[0]); // fallback to USDC only if current source chain doesn't support the token at all
    }
  }, [bridgeFromChain, bridgeFromAsset]);

  // Keep fromAsset and toAsset always in sync for cross-chain bridging
  useEffect(() => {
    if (bridgeFromAsset && bridgeToAsset && bridgeFromAsset !== bridgeToAsset) {
      setBridgeToAsset(bridgeFromAsset);
    }
  }, [bridgeFromAsset, bridgeToAsset]);

  const handleFromChainChange = useCallback((newChain: Chain) => {
    if (newChain === bridgeFromChain) return;
    setBridgeFromChain(newChain);

    // Auto-correction to prevent Same Chain Bridge atomically
    if (newChain === bridgeToChain) {
      const allowed = getSupportedChains(mode) as readonly Chain[];
      const validDest = allowed.filter(c => c !== newChain);
      setBridgeToChain(validDest[0] || null);
    }

    const activeDomains = getCctpDomains(mode);
    // Auto-switch wallet (Phase 3)
    const requiredChainId = CHAIN_ID_MAP[newChain] ?? activeDomains[newChain]?.chainId;
    if (requiredChainId && walletChainId !== requiredChainId && switchChainAsync) {
      switchChainAsync({ chainId: requiredChainId }).catch((err) => {
        console.error("Auto-switch failed or rejected:", err);
      });
    }
  }, [bridgeFromChain, bridgeToChain, mode, walletChainId, switchChainAsync]);

  const handleToChainChange = useCallback((newChain: Chain) => {
    if (newChain === bridgeToChain) return;
    setBridgeToChain(newChain);

    // Auto-correction to prevent Same Chain Bridge atomically
    if (newChain === bridgeFromChain) {
      const allowed = getSupportedChains(mode) as readonly Chain[];
      const validSrc = allowed.filter(c => c !== newChain);
      setBridgeFromChain(validSrc[0] || null);
    }
  }, [bridgeFromChain, bridgeToChain, mode]);

  const handleFlipChains = useCallback(() => {
    if (!bridgeFromChain || !bridgeToChain) return;
    const newFrom = bridgeToChain;
    const newTo = bridgeFromChain;
    const newFromAsset = bridgeToAsset;
    const newToAsset = bridgeFromAsset;

    setBridgeFromChain(newFrom);
    setBridgeToChain(newTo);
    setBridgeFromAsset(newFromAsset);
    setBridgeToAsset(newToAsset);

    // Instantly swap in-memory balances for zero UI flicker / no same-balance bug
    setCrossChainBal(crossChainToBal);
    setCrossChainDecimals(crossChainToDecimals);
    setCrossChainToBal(crossChainBal);
    setCrossChainToDecimals(crossChainDecimals);

    setIsRotated(r => !r);

    const activeDomains = getCctpDomains(mode);
    const requiredChainId = CHAIN_ID_MAP[newFrom] ?? activeDomains[newFrom]?.chainId;
    if (requiredChainId && walletChainId !== requiredChainId && switchChainAsync) {
      switchChainAsync({ chainId: requiredChainId }).catch((err) => {
        console.error("Auto-switch failed or rejected:", err);
      });
    }
  }, [bridgeFromChain, bridgeToChain, bridgeFromAsset, bridgeToAsset, crossChainBal, crossChainDecimals, crossChainToBal, crossChainToDecimals, mode, walletChainId, switchChainAsync]);

  // Gas price: only fetch when on swap tab, only refresh every 30s, and only if amount > 0
  const { data: gasPriceData } = useGasPrice({ chainId: CHAIN_ID_MAP["Arc Testnet"], query: { enabled: false && hasAccess && Number(swapAmount) > 0 } });
  const arcGasGwei = gasPriceData ? Number(formatUnits(gasPriceData, 9)) : null;

  const { data: robinhoodGasPriceData } = useGasPrice({ chainId: 4663, query: { enabled: false && mode === "mainnet" && Number(swapAmount) > 0 } });
  const robinhoodGasGwei = robinhoodGasPriceData ? Number(formatUnits(robinhoodGasPriceData, 9)) : null;

  useEffect(() => {
    if (activeTab === "bridge" && (isAdmin || bridgeUnlocked)) {
      fetchCrossChainBalance();
    }
  }, [fetchCrossChainBalance, activeTab, isAdmin, bridgeUnlocked]);

  // ── Write contracts (kept for event listeners, engine has its own) ──────────
  const { writeContractAsync: approve } = useWriteContract();
  const { writeContractAsync: swap } = useWriteContract();
  const { writeContractAsync: bridgeDeposit } = useWriteContract();

  // ── Event Listeners (Smart Watchers) ─────────────────────────────────────────
  // Watchers ONLY run when the user has actually submitted a transaction.
  // Use undefined address to disable the watcher in wagmi v2, and strictly bind to Arc Testnet chainId.
  const arcPublicClient = usePublicClient({ chainId: CHAIN_ID_MAP["Arc Testnet"] });

  useEffect(() => {
    if (!arcPublicClient || !isAwaitingTx) return;

    if (false) {
      const unwatchExec = arcPublicClient!.watchContractEvent({
        address: ARCFUN_SWAP_ADDRESS,
        abi: ARCFUN_SWAP_ABI,
        eventName: "SwapExecuted",
        onLogs(logs) {
          for (const log of logs) {
            const args = (log as any).args;
            if (args?.user?.toLowerCase() === address?.toLowerCase()) {
              const outAmt = args.amountOut ? formatUnits(args.amountOut, 6) : "?";
              setNotification({ title: "Swap Executed ✓", message: `Received ${Number(outAmt).toFixed(4)} ${swapTo}`, type: "success" });
              refetchBalance();
              setIsAwaitingTx(false);
            }
          }
        }
      });

      const unwatchRej = arcPublicClient!.watchContractEvent({
        address: ARCFUN_SWAP_ADDRESS,
        abi: ARCFUN_SWAP_ABI,
        eventName: "SwapRejected",
        onLogs(logs) {
          for (const log of logs) {
            const args = (log as any).args;
            if (args?.user?.toLowerCase() === address?.toLowerCase()) {
              setNotification({ title: "Swap Rejected", message: args.reason || "Swap was rejected by contract", type: "error" });
              setIsAwaitingTx(false);
            }
          }
        }
      });

      return () => { unwatchExec(); unwatchRej(); };
    }
  }, [arcPublicClient, isAwaitingTx, activeTab, address, swapTo, refetchBalance]);

  // Dynamic Gas Estimation
  const swapData = (swapFrom !== "cirBTC" && swapTo !== "cirBTC" && amountRaw > 0n) ? encodeFunctionData({
    abi: ARCFUN_SWAP_ABI,
    functionName: "swap",
    args: [
      swapFrom === "USDC" ? USDC_ADDRESS : EURC_ADDRESS,
      swapTo === "USDC" ? USDC_ADDRESS : EURC_ADDRESS,
      amountRaw
    ]
  }) : undefined;

  const { data: estimatedGasData } = useEstimateGas({
    chainId: CHAIN_ID_MAP["Arc Testnet"],
    to: ARCFUN_SWAP_ADDRESS,
    data: swapData,
    query: {
      enabled: false && hasAccess && !!swapData && amountRaw <= allowance && amountRaw <= balanceFromRaw,
    }
  });

  // Fallbacks: 140k for Swap (audited ~132k), 300k for Bridge
  const swapGasUnits = false
    ? (estimatedGasData ? Number(estimatedGasData) : 140000)
    : 300000;

  // Arc gas fee in USDC: gas_units * gasPrice (Gwei) / 1e9 * 1 (USDC per native = 1 on Arc testnet)
  const gasFeeUSDC = arcGasGwei !== null
    ? (swapGasUnits * arcGasGwei * 1e-9).toFixed(4)
    : null;

  // ── Swap Engine Logic ──────────────────────────────────────────────────────
  const getSwapButtonState = (): { text: string; disabled: boolean; isSwitch?: boolean; loading?: boolean; isArcLogin?: boolean } => {

    if (!address) return { text: "Connect Wallet", disabled: true };
    if (mode === "mainnet") {
      if (walletChainId !== 4663 && walletChainId !== 5042) return { text: "Switch to Arc/Robinhood", disabled: false, isSwitch: true };
      if (!lifiFromToken || !lifiToToken) return { text: "Loading tokens...", disabled: true };
      if (!swapAmount || amountNum <= 0) return { text: "Enter an amount", disabled: true };
      const amtInWei = parseUnits(swapAmount, lifiFromToken.decimals);
      if (amtInWei > balanceFromRaw) return { text: "Insufficient Balance", disabled: true };
      if (isQuoting) return { text: "Quoting...", disabled: true, loading: true };
      if (!activeRoute) return { text: "No Route Found", disabled: true };
      if (lifiTxState === "running") return { text: "Processing…", disabled: true, loading: true };
      if (lifiTxState === "success") return { text: "Success!", disabled: true, loading: false };
      return { text: "Swap", disabled: false };
    }

    if (mode === "testnet" && walletChainId !== CHAIN_ID_MAP["Arc Testnet"]) return { text: "Switch to Arc Testnet", disabled: false, isSwitch: true };
    if (!swapFrom || !swapTo) return { text: "Select a token", disabled: true };
    if (swapFrom === "cirBTC" || swapTo === "cirBTC") return { text: "cirBTC Coming Soon", disabled: true };
    if (!swapAmount || amountNum <= 0) return { text: "Enter an amount", disabled: true };
    if (amountRaw > balanceFromRaw) return { text: "Insufficient Balance", disabled: true };
    if (isVaultLiquidityLoading) return { text: "Checking liquidity...", disabled: true, loading: true };
    if (amountOutRaw > activeSwapVaultLiquidity) return { text: "Insufficient vault liquidity", disabled: true };
    if (txEngine.state === "running") return { text: "Processing…", disabled: true, loading: true };
    if (txEngine.state === "success") return { text: "Success!", disabled: true, loading: false };

    if (!isAdmin) {
      const maxSwapAmountNum = Number(formatUnits(MAX_SWAP_AMOUNT, 6));
      if (isPaused) return { text: "Contract Paused", disabled: true };
      if (amountNum > maxSwapAmountNum) return { text: `Exceeds ${maxSwapAmountNum} Token Limit`, disabled: true };
      if (swapsLeft <= 0) return { text: `Daily Limit Reached (${MAX_SWAPS_PER_DAY}/${MAX_SWAPS_PER_DAY})`, disabled: true };
    }

    const btnText = isAdmin ? "Swap +" : "Swap";
    if (amountRaw > allowance) return { text: `Approve & ${btnText}`, disabled: false };
    return { text: btnText, disabled: false };
  };

  const getBridgeButtonState = (): { text: string; disabled: boolean; isSwitch?: boolean; isTrustlineMissing?: boolean; loading?: boolean } => {
    if (!bridgeFromChain || !bridgeToChain) return { text: "Select a chain", disabled: true };

    const isSourceSolana = bridgeFromChain?.includes("Solana");
    const isDestSolana = bridgeToChain?.includes("Solana");
    const isSourceStellar = bridgeFromChain === "Stellar Testnet";
    const isDestStellar = bridgeToChain === "Stellar Testnet";
    const isSourceSui = bridgeFromChain?.includes("Sui");
    const isDestSui = bridgeToChain?.includes("Sui");
    const isSourceEVMC = !isSourceSolana && !isSourceStellar && !isSourceSui;
    const isDestEVMC = !isDestSolana && !isDestStellar && !isDestSui;

    if (!isRouteSupported(bridgeFromChain, bridgeToChain) || bridgeFromChain === bridgeToChain) {
      return { text: "Unsupported Route", disabled: true };
    }

    if (isSourceSolana && !solanaConnected) {
      return { text: "Connect Solana Wallet", disabled: false };
    }
    if (isSourceStellar && !stellarWallet.isConnected) {
      return { text: "Connect Stellar Wallet", disabled: false };
    }
    if (isSourceSui && !suiWallet.isConnected) {
      return { text: "Connect Sui Wallet", disabled: false };
    }
    if (isSourceEVMC && !address) {
      return { text: "Connect EVM Wallet", disabled: false };
    }
    if (isDestSolana && !solanaConnected) {
      return { text: "Connect Solana Wallet", disabled: false };
    }
    if (isDestStellar && !stellarWallet.isConnected) {
      return { text: "Connect Stellar Wallet", disabled: false };
    }
    if (isDestSui && !suiWallet.isConnected) {
      return { text: "Connect Sui Wallet", disabled: false };
    }
    if (isDestEVMC && !address) {
      return { text: "Connect EVM Wallet", disabled: false };
    }
    if (isDestStellar && stellarWallet.isConnected && !stellarWallet.hasUsdcTrustline) {
      return { text: "USDC Trustline Missing", disabled: true, isTrustlineMissing: true };
    }

    // ── Network safety: wallet must be on the FROM chain ──────────────────
    if (!isSourceSolana && !isSourceStellar && !isSourceSui) {
      const activeDomains = getCctpDomains(mode);
      const requiredChainId = bridgeFromChain ? (CHAIN_ID_MAP[bridgeFromChain] ?? activeDomains[bridgeFromChain]?.chainId) : undefined;
      if (requiredChainId && walletChainId !== requiredChainId) {
        return { text: `Switch to ${bridgeFromChain}`, disabled: false, isSwitch: true };
      }
    }

    if (isRouteBlocked) {
      return { text: "Temporary Unavailable", disabled: true };
    }

    if (!bridgeFromAsset || !bridgeToAsset) return { text: "Select a token", disabled: true };
    if (!bridgeAmount || bridgeAmountNum <= 0) return { text: "Enter an amount", disabled: true };
    if (bridgeAmountRaw > balanceFromRaw) return { text: "Insufficient Balance", disabled: true };
    if (txEngine.state === "running") return { text: "Processing…", disabled: true, loading: true };
    if (txEngine.state === "pending") return { text: "Finalizing…", disabled: true, loading: true };
    if (txEngine.state === "claim_manual_required") return { text: "Manual Claim Required", disabled: true };
    if (txEngine.state === "success") return { text: "Success!", disabled: true, loading: false };

    const btnText = isAdmin ? "Bridge +" : "Bridge";
    if (!isSourceSolana && !isSourceStellar && !isSourceSui && bridgeAmountRaw > bridgeAllowance) return { text: `Approve & ${btnText}`, disabled: false };
    return { text: btnText, disabled: false };
  };

  const handleSwap = useCallback(async () => {
    if (executionMode === "arcfun" && !arcWalletAddress) {
      if (window.innerWidth < 768) {
        window.dispatchEvent(new CustomEvent('arc-navigate', { detail: 'wallet' }));
      } else {
        window.dispatchEvent(new Event('open-arc-wallet'));
      }
      return;
    }

    if (executionMode === "browser" && !address) {
      document.getElementById('wallet-dropdown-trigger')?.click();
      return;
    }

    if (mode === "mainnet") {
      if (walletChainId !== 4663 && walletChainId !== 5042) {
        try { await switchChainAsync({ chainId: 5042 }); } catch (e) { console.error(e); }
        return;
      }
      if (!activeRoute || !lifiFromToken || !lifiToToken) return;

      try {
        setLifiTxState("pending");
        setLifiMilestones([{ id: "approval", label: "Requesting Approval...", status: "active" }, { id: "exec", label: "Executing Route", status: "pending" }]);
        setNotification({ title: "Initiating Swap", message: "Fetching fresh execution route...", type: "success" });

        let finalHash = "";

        if (activeRoute) {
          setNotification({ title: "Preparing Swap", message: `Fetching fresh ${activeRoute?.providerName} quote...`, type: "success" });

          const amountInWei = parseUnits(swapAmount, lifiFromToken.decimals).toString();

          // STEP 4: Before EVERY swap, discard cached quote, request fresh quote
          const freshRoutes = await arcFunQuoteEngine.getOptimalQuotes({
            fromChainId: 4663,
            toChainId: 4663,
            fromTokenAddress: lifiFromToken.address.toLowerCase(),
            toTokenAddress: lifiToToken.address.toLowerCase(),
            fromAmount: amountInWei,
            userAddress: address || "",
            slippageTolerance: 0.05
          });

          if (!freshRoutes || freshRoutes.length === 0) {
            throw new Error("Quote expired. No routes available. Please try again.");
          }
          const executionRoute = freshRoutes[0];

          setNotification({ title: "Preparing Swap", message: "Simulating route safety...", type: "success" });

          const walletClient = await getWalletClient(wagmiConfig);
          if (!walletClient) throw new Error("Wallet client not found");

          const result = await executionEngine.executeRoute(
            executionRoute,
            publicClient as any,
            walletClient as any,
            {
              onApprovalRequested: () => setLifiMilestones(prev => prev.map(m => m.id === "approval" ? { ...m, status: "active" } : m)),
              onApprovalSuccess: () => setLifiMilestones(prev => prev.map(m => m.id === "approval" ? { ...m, status: "done", completedAt: Date.now() } : m)),
              onSignatureRequested: () => setLifiMilestones(prev => prev.map(m => m.id === "approval" ? { ...m, label: "Requesting Signature...", status: "active" } : m)),
              onSignatureSuccess: () => setLifiMilestones(prev => prev.map(m => m.id === "approval" ? { ...m, status: "done", completedAt: Date.now() } : m)),
              onExecutionRequested: () => setLifiMilestones(prev => prev.map(m => m.id === "exec" ? { ...m, status: "active" } : m))
            }
          );

          if (result.status !== "SUCCESS") throw new Error("Transaction Reverted on Chain");
          finalHash = result.transactionHash;
        } else {
          throw new Error("No executable route available.");
        }

        (process.env.NODE_ENV === "development" ? console.log : () => { })("Success Hash: ", finalHash);

        setLifiTxHash(finalHash);
        setLifiTxState("success");
        setLifiMilestones(prev => prev.map(m => m.status === "active" ? { ...m, status: "done", completedAt: Date.now() } : m));

        // Store Swap History
        const finalOutput = (activeRoute?.toAmount ?? "0") || "0";
        const decimals = lifiToToken?.decimals || 18;
        const formattedOut = formatUnits(BigInt(finalOutput), decimals).toString();

        saveTxHistory({
          id: finalHash,
          txHash: finalHash,
          type: "swap",
          status: "success",
          amount: swapAmount,
          fromAsset: lifiFromToken.symbol,
          toAsset: lifiToToken.symbol,
          sourceChain: walletChainId === 5042 ? "Arc Mainnet" : "Robinhood Mainnet",
          timestamp: Date.now(),
          userAddress: address || "",
          provider: activeRoute?.providerName || "Unknown",
          executionRoute: activeRoute?.routePath || [],
          gasCostUSD: activeRoute?.gasCostUSD || 0,
          feesUSD: activeRoute?.platformFeeUSD || 0
        });

        setNotification({ title: "Swap Successful", message: `Transaction confirmed!`, type: "success" });
        refetchBalance(true);
        window.dispatchEvent(new Event('refresh-portfolio'));
      } catch (error: any) {
        console.error("Swap Execution Error:", error);

        const errorMsg = error?.message?.toLowerCase() || "";
        const isUserCanceled = errorMsg.includes("rejected") || errorMsg.includes("user denied") || errorMsg.includes("cancelled");

        setLifiTxState("failed");
        setLifiMilestones(prev => prev.map(m => m.status === "pending" || m.status === "active" ? { ...m, status: "failed" } : m));

        if (isUserCanceled) {
          setLifiError("User Canceled");
          setNotification({ title: "Swap Canceled", message: "Transaction was rejected by user.", type: "error" });
          setTimeout(() => {
            setLifiTxState("idle");
          }, 2000);
        } else {
          setLifiError(error?.message || "Execution failed.");
          setNotification({ title: "Swap Failed", message: error?.message || "Execution failed.", type: "error" });
        }
      } finally {
        setIsAwaitingTx(false);
      }
      return;
    }

    if (walletChainId !== CHAIN_ID_MAP["Arc Testnet"]) {
      try {
        await switchChainAsync({ chainId: CHAIN_ID_MAP["Arc Testnet"] });
      } catch (e) {
        console.error(e);
      }
      return;
    }
    if (!amountRaw) return;
    await txEngine.executeSwap({
      tokenIn: tokenInAddr,
      tokenOut: tokenOutAddr,
      amount: amountRaw,
      allowance,
      fromAsset: swapFrom as any,
      toAsset: swapTo as any,
      formattedAmount: swapAmount,
    });
  }, [address, mode, activeRoute, lifiFromToken, lifiToToken, swapAmount, amountRaw, allowance, tokenInAddr, tokenOutAddr, swapFrom, swapTo, txEngine, refetchBalance, walletChainId, switchChainAsync, wagmiConfig]);

  const handleBridge = useCallback(async () => {
    if (!bridgeFromChain || !bridgeToChain || !bridgeFromAsset || !bridgeToAsset) return;
    const btnState = getBridgeButtonState();
    if (btnState.disabled && !btnState.isSwitch) return;
    const isSourceSolana = bridgeFromChain.includes("Solana");
    const isDestSolana = bridgeToChain.includes("Solana");
    const isSourceStellar = bridgeFromChain === "Stellar Testnet";
    const isDestStellar = bridgeToChain === "Stellar Testnet";
    const isSourceSui = bridgeFromChain?.includes("Sui");
    const isDestSui = bridgeToChain?.includes("Sui");

    const isSourceEVMC = !isSourceSolana && !isSourceStellar && !isSourceSui;
    const isDestEVMC = !isDestSolana && !isDestStellar && !isDestSui;

    if (isSourceSolana && !solanaConnected) {
      (window as any).__openSolanaNext = true;
      document.getElementById('wallet-dropdown-trigger')?.click();
      return;
    }
    if (isSourceStellar && !stellarWallet.isConnected) {
      (window as any).__openStellarNext = true;
      document.getElementById('wallet-dropdown-trigger')?.click();
      return;
    }
    if (isSourceSui && !suiWallet.isConnected) {
      if (suiWallet.wallets && suiWallet.wallets.length > 0) {
        suiWallet.connectWallet({ wallet: suiWallet.wallets[0] });
      } else {
        alert("Please install a Sui wallet extension (e.g. Sloth / Sui Wallet).");
      }
      return;
    }
    if (isSourceEVMC && !address) {
      document.getElementById('wallet-dropdown-trigger')?.click();
      return;
    }
    if (isDestSolana && !solanaConnected) {
      (window as any).__openSolanaNext = true;
      document.getElementById('wallet-dropdown-trigger')?.click();
      return;
    }
    if (isDestStellar && !stellarWallet.isConnected) {
      (window as any).__openStellarNext = true;
      document.getElementById('wallet-dropdown-trigger')?.click();
      return;
    }
    if (isDestSui && !suiWallet.isConnected) {
      if (suiWallet.wallets && suiWallet.wallets.length > 0) {
        suiWallet.connectWallet({ wallet: suiWallet.wallets[0] });
      } else {
        alert("Please install a Sui wallet extension (e.g. Sloth / Sui Wallet).");
      }
      return;
    }
    if (isDestEVMC && !address) {
      document.getElementById('wallet-dropdown-trigger')?.click();
      return;
    }

    const activeDomains = getCctpDomains(mode);

    if (!isSourceSolana && !isSourceStellar && !isSourceSui) {
      const requiredChainId = (bridgeFromChain ? CHAIN_ID_MAP[bridgeFromChain] : undefined) ?? (bridgeFromChain ? activeDomains[bridgeFromChain] : undefined)?.chainId;
      if (requiredChainId && walletChainId !== requiredChainId) {
        try {
          await switchChainAsync({ chainId: requiredChainId });
        } catch (e: any) {
          console.warn("switchChainAsync failed, trying window.ethereum fallback:", e);
          if (typeof window !== "undefined" && (window as any).ethereum) {
            const hexChainId = "0x" + requiredChainId.toString(16);
            try {
              await (window as any).ethereum.request({
                method: "wallet_switchEthereumChain",
                params: [{ chainId: hexChainId }],
              });
            } catch (switchError: any) {
              if (switchError.code === 4902 || switchError?.message?.includes("4902") || switchError?.message?.includes("Unrecognized chain")) {
                const chainConfig = ChainRegistry.getChainSafe(bridgeFromChain);
                if (chainConfig) {
                  await (window as any).ethereum.request({
                    method: "wallet_addEthereumChain",
                    params: [{
                      chainId: hexChainId,
                      chainName: chainConfig.name,
                      nativeCurrency: chainConfig.nativeCurrency,
                      rpcUrls: [chainConfig.rpcUrl],
                      blockExplorerUrls: [ChainRegistry.getExplorerTxUrl(bridgeFromChain!, "") || "https://amoy.polygonscan.com"]
                    }]
                  });
                }
              }
            }
          }
        }
        return;
      }
    }

    if (!bridgeAmountRaw) return;
    const destChainId = (bridgeToChain ? CHAIN_ID_MAP[bridgeToChain] : undefined) ?? (bridgeToChain ? activeDomains[bridgeToChain] : undefined)?.chainId ?? (isDestSolana ? 0 : undefined);
    if (destChainId === undefined) return;

    // Removed redundant inline switch chain to prevent double-prompts,
    // it's handled by the button state now.

    await txEngine.executeBridge({
      tokenIn: bridgeTokenAddress,
      amount: bridgeAmountRaw,
      destChainId,
      allowance: bridgeAllowance,
      route: "cctp",
      sourceChain: bridgeFromChain as any,
      destChain: bridgeToChain as any,
      fromAsset: bridgeFromAsset as any,
      toAsset: bridgeToAsset as any,
      formattedAmount: bridgeAmount,
      destAddress: (() => {
        if (bridgeToChain?.includes("Solana")) return solanaWallet?.publicKey?.toBase58() || "";
        if (bridgeToChain?.includes("Sui")) return suiWallet?.address || "";
        if (bridgeToChain?.includes("Stellar")) return stellarWallet?.address || "";
        return address || "";
      })(),
    });
  }, [address, bridgeAmountRaw, bridgeAllowance, bridgeTokenAddress, tokenInAddr, bridgeFromChain, bridgeToChain, bridgeFromAsset, bridgeToAsset, bridgeAmount, txEngine, walletChainId, switchChainAsync, refetchBalance, mode]);

  const handleResumeBridge = useCallback(async () => {
    const targetBurnHash = txEngine.burnHash || txEngine.summary?.burnHash;
    if (!targetBurnHash) return;

    const sourceChainName = bridgeFromChain || txEngine.summary?.sourceChain || "Ethereum Sepolia";
    const destChainName = bridgeToChain || txEngine.summary?.destChain || "Arc Testnet";

    const activeDomains = getCctpDomains(mode);
    const requiredChainId = (sourceChainName ? CHAIN_ID_MAP[sourceChainName] : undefined) ?? (sourceChainName ? activeDomains[sourceChainName] : undefined)?.chainId;
    if (address && requiredChainId && walletChainId !== requiredChainId) {
      try {
        await switchChainAsync({ chainId: requiredChainId });
      } catch (e) {
        console.error(e);
      }
      return;
    }

    const payload = {
      burnTxHash: targetBurnHash,
      sourceChain: sourceChainName as any,
      destChain: destChainName as any,
      amount: txEngine.summary?.fromAmt || bridgeAmount || "0",
      fromAsset: (txEngine.summary?.fromAsset || bridgeFromAsset || "USDC") as any,
      toAsset: (txEngine.summary?.toAsset || bridgeToAsset || "USDC") as any
    };

    (process.env.NODE_ENV === "development" ? console.log : () => { })("[Path A: Bridge Tab -> Try Again] resumePayload.amount:", payload.amount);
    await txEngine.executeResume(payload);
  }, [address, txEngine, bridgeFromChain, bridgeToChain, bridgeAmount, bridgeFromAsset, bridgeToAsset, walletChainId, switchChainAsync]);

  const btnState = getSwapButtonState();
  const statusColor: Record<string, string> = { ACTIVE: "#22c55e", WARNING: "#b30000", CRITICAL: "#ef4444", PAUSED: "#6b7280", DEGRADED: "#b30000", DISABLED: "#ef4444", UNKNOWN: "#6b7280" };
  const isTxActive = txEngine.state !== "idle" || lifiTxState !== "idle";

  const isSwapValid = false && amountNum > 0 && amountRaw <= balanceFromRaw && amountOutRaw <= activeSwapVaultLiquidity;
  const isBridgeValid = activeTab === "bridge" && Number(bridgeAmount) > 0 && bridgeAmountRaw <= balanceFromRaw;
  const showRightPanel = isSwapValid || isBridgeValid || isTxActive;

  useEffect(() => {
    if (txEngine.state === "success" || lifiTxState === "success") {

      const timer = setTimeout(() => {
        if (false) setSwapAmount("");
        else setBridgeAmount("");

        if (lifiTxState === "success") {
          setLifiTxState("idle");
        } else {
          txEngine.dismiss();
        }
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [txEngine.state, lifiTxState, activeTab, txEngine]);

  const isTerminalError = txEngine.error && (
    txEngine.error.toLowerCase().includes("already claimed") ||
    txEngine.error.toLowerCase().includes("nonce already used") ||
    txEngine.error.toLowerCase().includes("message already received") ||
    txEngine.error.toLowerCase().includes("mint already executed") ||
    txEngine.error.toLowerCase().includes("bridge completed")
  );

  const isRecoverable = (txEngine.state === "failed" || txEngine.state === "mint_rejected") && !!txEngine.burnHash && !txEngine.mintHash && !isTerminalError;

  const { connector } = useAccount();


  return (
    <>
      <div className={`swap-bridge-container ${activeTab === "bridge" || activeTab === "recover" ? "has-right-panel" : ""}`}>
        {/* ── LEFT SIDEBAR ── */}
        <div className="swap-bridge-sidebar pt-2 md:pt-[5vh]" style={{ width: 220, display: "none", flexDirection: "column", flexShrink: 0 }}>

          {/* Brand title */}
          <div className="sb-title">
            <div style={{ fontSize: 20, fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>ArcFun Bridge</div>
          </div>

          {/* Nav items */}
          {(
            [
              { id: "bridge", label: "Bridge" },
              { id: "recover", label: "Recover" },
              { id: "history", label: "History" },
            ] as const
          ).filter(item => {
            if (mode === "mainnet") {
              return false;
            }
            return true;
          }).map((item, idx, arr) => (
            <Fragment key={item.id}>
              {idx > 0 && item.id === "history" && <div className="sb-divider" />}
              <button
                className={`sb-nav-btn ${activeTab === item.id ? "active" : ""}`}
                onClick={() => { setActiveTab(item.id as any); txEngine.dismiss(); }}
              >
                {item.label}
                {item.id === "history" && hasPendingBridge && (
                  <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", backgroundColor: "#ef4444", marginLeft: 8, transform: "translateY(-1px)" }} />
                )}
              </button>
              {item.id === "bridge" && (
                <button
                  className="sb-nav-btn"
                  onClick={() => onOpenFaucetHub && onOpenFaucetHub()}
                >
                  Faucet Hub
                </button>
              )}
            </Fragment>
          ))}
        </div>

        {/* ── MAIN CONTENT ── */}
        <div
          className="swap-main-content pt-4 md:pt-[10vh] lg:pt-[14vh]"
          style={{
            flex: 1,
            width: "100%",
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            justifyContent: "flex-start",
            position: "relative",
            transition: "padding-left 0.3s cubic-bezier(0.22, 1, 0.36, 1)",
            paddingLeft: sidebarCollapsed ? "clamp(24px, 5.5vw, 96px)" : "0px",
          }}
        >

          {/* ── Sub-navigation Pill Bar (Bridge / Recover / History / Faucet Hub) ── */}
          <div
            className="subnav-pill-bar"
            style={{
              width: "100%",
              maxWidth: 424,
              display: "flex",
              justifyContent: "center",
              marginBottom: activeTab === "history" ? 4 : 20,
              zIndex: 20,
            }}
          >
            {/* Left: Sub-navigation Pill Bar (Bridge / Recover / History / Faucet Hub) */}
            <div
              className="subnav-pill-bar-box"
              style={{
                background: isDark ? "#151922" : "var(--surface-soft, #f1f5f9)",
                border: isDark ? "1px solid rgba(255, 255, 255, 0.08)" : "1px solid var(--border, #e2e8f0)",
                boxShadow: isDark ? "none" : "0 1px 2px rgba(0,0,0,0.02)",
              }}
            >
              <button
                onClick={() => { setActiveTab("bridge"); txEngine.dismiss(); }}
                className="subnav-pill-item hover:text-[var(--text-primary)]"
                style={{
                  fontWeight: activeTab === "bridge" ? 700 : 500,
                  background: activeTab === "bridge"
                    ? (isDark ? "#283040" : "#ffffff")
                    : "transparent",
                  color: activeTab === "bridge"
                    ? (isDark ? "#ffffff" : "#0f172a")
                    : (isDark ? "#94a3b8" : "#64748b"),
                  border: activeTab === "bridge"
                    ? (isDark ? "1px solid rgba(255, 255, 255, 0.12)" : "1px solid rgba(0, 0, 0, 0.08)")
                    : "1px solid transparent",
                  boxShadow: activeTab === "bridge"
                    ? (isDark ? "none" : "0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.04)")
                    : "none",
                }}
              >
                Bridge
              </button>

              <button
                onClick={() => { setActiveTab("recover"); txEngine.dismiss(); }}
                className="subnav-pill-item hover:text-[var(--text-primary)]"
                style={{
                  fontWeight: activeTab === "recover" ? 700 : 500,
                  background: activeTab === "recover"
                    ? (isDark ? "#283040" : "#ffffff")
                    : "transparent",
                  color: activeTab === "recover"
                    ? (isDark ? "#ffffff" : "#0f172a")
                    : (isDark ? "#94a3b8" : "#64748b"),
                  border: activeTab === "recover"
                    ? (isDark ? "1px solid rgba(255, 255, 255, 0.12)" : "1px solid rgba(0, 0, 0, 0.08)")
                    : "1px solid transparent",
                  boxShadow: activeTab === "recover"
                    ? (isDark ? "none" : "0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.04)")
                    : "none",
                }}
              >
                Recover
              </button>

              <button
                onClick={() => { setActiveTab("history"); txEngine.dismiss(); }}
                className="subnav-pill-item hover:text-[var(--text-primary)]"
                style={{
                  fontWeight: activeTab === "history" ? 700 : 500,
                  background: activeTab === "history"
                    ? (isDark ? "#283040" : "#ffffff")
                    : "transparent",
                  color: activeTab === "history"
                    ? (isDark ? "#ffffff" : "#0f172a")
                    : (isDark ? "#94a3b8" : "#64748b"),
                  border: activeTab === "history"
                    ? (isDark ? "1px solid rgba(255, 255, 255, 0.12)" : "1px solid rgba(0, 0, 0, 0.08)")
                    : "1px solid transparent",
                  boxShadow: activeTab === "history"
                    ? (isDark ? "none" : "0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.04)")
                    : "none",
                }}
              >
                <span>History</span>
                {hasPendingBridge && (
                  <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", backgroundColor: "#ef4444" }} />
                )}
              </button>

              {mode !== "mainnet" && onOpenFaucetHub && (
                <button
                  onClick={() => onOpenFaucetHub()}
                  className="subnav-pill-item hover:text-[var(--text-primary)]"
                  style={{
                    background: "transparent",
                    color: isDark ? "#94a3b8" : "#64748b",
                    border: "1px solid transparent",
                  }}
                >
                  Faucet Hub
                </button>
              )}
            </div>
          </div>

          {/* Main Bridge Workspace (2-Column >1150px, stacked <1150px) */}
          {activeTab !== "history" && (
            <div className="w-full max-w-[1440px] flex flex-col min-[1150px]:flex-row items-start justify-start gap-8 min-[1150px]:gap-12">
              {/* LEFT: Bridge Card & Details */}
              <div
                className="swap-card-wrapper"
                style={{
                  position: "relative",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-start",
                  gap: 16,
                  width: "100%",
                  maxWidth: 424,
                  margin: 0,
                  flexShrink: 0,
                }}
              >
                {activeTab !== "recover" && (
                  <div
                    className="lf-card swap-main-card"
                    style={{
                      overflow: activeTab === "admin" ? "hidden" : "visible",
                      padding: 24,
                      display: "flex",
                      flexDirection: "column",
                      gap: 20,
                      borderRadius: 24,
                      background: "var(--surface-glass)",
                      border: "1px solid var(--border)",
                      boxShadow: "0 8px 30px rgba(0, 0, 0, 0.06), 0 1px 3px rgba(0, 0, 0, 0.04)",
                      ...(activeTab === "bridge"
                        ? {
                          width: "100%",
                          maxWidth: 424,
                          flexShrink: 0,
                          position: "relative",
                          zIndex: (showFromChainPicker || showToChainPicker) ? 100 : 10,
                        }
                        : activeTab === "admin"
                          ? { width: "100%", height: "calc(100vh - 140px)", maxHeight: "calc(100vh - 140px)" }
                          : { width: "100%" })
                    }}
                  >
                    {(activeTab === "admin" || activeTab === "bridge") && (
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
                        <div className="bridge-header-title" style={{ fontSize: 13, color: "var(--text-muted)", fontWeight: 600 }}>
                          {activeTab === "bridge" ? (
                            <>
                              <span className="hidden md:inline">Cross-chain transfers</span>
                              <span className="md:hidden">Bridge</span>
                            </>
                          ) : "Protocol Liquidity & Health"}
                        </div>
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          {lastUpdated && (
                            <span className="bridge-header-time" style={{ fontSize: 11, color: "var(--text-muted)" }}>
                              <span className="hidden md:inline">Last updated: </span>
                              {lastUpdated.toLocaleTimeString()}
                            </span>
                          )}
                          <button onClick={() => refetchBalance(isAdmin)} disabled={isRefreshing}
                            className="bridge-refresh-btn"
                            style={{ width: 32, height: 32, borderRadius: 10, background: "var(--surface)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--text-muted)" }}>
                            <RefreshCw size={14} style={{ animation: isRefreshing ? "spin 1s linear infinite" : "none" }} />
                          </button>
                        </div>
                      </div>
                    )}



                    {/* ── BRIDGE TAB ── */}
                    {activeTab === "bridge" && !isAdmin && !bridgeUnlocked && (
                      <OnchainScoreGate moduleName="bridge" onSuccess={() => setBridgeUnlocked(true)} />
                    )}
                    {activeTab === "bridge" && (isAdmin || bridgeUnlocked) && (
                      <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 8 }}>

                        {isRecoverable && (
                          <div
                            className="lf-card"
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              padding: "10px 14px",
                              gap: 10,
                              background: "rgba(59, 130, 246, 0.08)",
                              border: "1px solid rgba(59, 130, 246, 0.25)",
                              borderRadius: 14,
                              marginBottom: 4,
                              width: "100%"
                            }}
                          >
                            <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                              <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text-primary)" }}>
                                Pending Funds Available
                              </div>
                              <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.2 }}>
                                Recover funds in one click
                              </div>
                            </div>
                            <button
                              onClick={async () => {
                                if (isClaiming) return;
                                setIsClaiming(true);
                                await refetchHistory(true);
                                setActiveTab("history");
                                setHistoryFilter("pending");
                                txEngine.dismiss();
                                setIsClaiming(false);
                              }}
                              disabled={isClaiming}
                              style={{
                                background: "var(--text-primary)",
                                color: "var(--bg)",
                                border: "none",
                                borderRadius: 8,
                                padding: "5px 10px",
                                fontSize: 11.5,
                                fontWeight: 700,
                                cursor: isClaiming ? "not-allowed" : "pointer",
                                whiteSpace: "nowrap",
                                flexShrink: 0,
                                opacity: isClaiming ? 0.7 : 1
                              }}
                            >
                              {isClaiming ? "Loading..." : "Claim Funds"}
                            </button>
                          </div>
                        )}


                        <div className="swap-input-box" style={{ padding: 14, borderRadius: 20, border: bridgeAmountRaw > balanceFromRaw ? "1px solid rgba(239,68,68,0.5)" : undefined }}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                            <span style={{ fontSize: 13, color: "var(--text-muted)", fontWeight: 600 }}>From</span>
                            <div style={{ fontSize: 12, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 6 }}>
                              {(isRefreshing || (isCrossChainLoading && !hasCrossChainLoaded)) && !!bridgeFromAsset ? <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} /> : null}
                              {!!bridgeFromAsset && (
                                <>
                                  Balance: {formatAssetBalance(fromBalFormatted, bridgeFromAsset)}
                                  <button onClick={handleMaxBridge} style={{ background: "transparent", border: "none", padding: 0, fontSize: 11, fontWeight: 700, color: "var(--text-primary)", cursor: "pointer" }}>MAX</button>
                                </>
                              )}
                            </div>
                          </div>
                          {/* Custom From-Chain Picker */}
                          <div style={{ position: "relative", marginBottom: 8 }}>
                            <button
                              className="chain-picker-btn"
                              onClick={() => { setShowFromChainPicker(p => !p); setShowToChainPicker(false); }}
                              style={{
                                width: "100%", display: "flex", alignItems: "center", gap: 10,
                                borderRadius: 14, padding: "10px 14px", cursor: "pointer",
                                color: "var(--text-primary)", fontWeight: 700, fontSize: 15,
                                justifyContent: "space-between",
                              }}
                            >
                              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                {bridgeFromChain && (
                                  <img src={bridgeFromChain ? CHAIN_LOGOS[bridgeFromChain as Chain] : undefined} alt={bridgeFromChain || "Chain"}
                                    style={{ width: 24, height: 24, borderRadius: "50%", objectFit: "cover" }}
                                    onError={e => { e.currentTarget.src = "/globe.svg"; }} />
                                )}
                                {bridgeFromChain || "Select chain"}
                              </div>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                                style={{ opacity: 0.5, transform: showFromChainPicker ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>
                                <polyline points="6 9 12 15 18 9" />
                              </svg>
                            </button>

                            {showFromChainPicker && (
                              <>
                                <div className="chain-picker-backdrop" onClick={(e) => { e.stopPropagation(); setShowFromChainPicker(false); }} />
                                <div className="chain-picker-dropdown" style={{
                                  position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0,
                                  background: "var(--surface)", border: "1px solid var(--border)",
                                  borderRadius: 18, padding: 6, overflowY: "auto", overflowX: "hidden", maxHeight: 280, zIndex: 9999,
                                  boxShadow: "0 16px 36px -4px rgba(0,0,0,0.24), 0 0 0 1px var(--border-soft)",
                                  animation: "txIn 0.18s cubic-bezier(0,0,0.2,1)",
                                }}>
                                  {supportedFromChains.map(c => {
                                    const isSelected = c === bridgeFromChain;
                                    return (
                                      <button key={c}
                                        onClick={() => {
                                          handleFromChainChange(c);
                                          setShowFromChainPicker(false);
                                        }}
                                        style={{
                                          width: "100%", display: "flex", alignItems: "center", gap: 12,
                                          padding: "10px 14px", borderRadius: 12,
                                          background: isSelected ? "var(--bg-default, rgba(128,128,128,0.08))" : "transparent",
                                          border: "none", cursor: "pointer",
                                          color: "var(--text-primary)",
                                          fontWeight: isSelected ? 700 : 500, fontSize: 14,
                                          fontFamily: "var(--font-geist), var(--font-inter), sans-serif",
                                          textAlign: "left", transition: "background 0.15s",
                                        }}
                                      >
                                        <img src={CHAIN_LOGOS[c]} alt={c}
                                          style={{ width: 22, height: 22, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
                                          onError={e => { e.currentTarget.src = "/globe.svg"; }} />
                                        <span>{c}</span>
                                        <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
                                          {L1_CHAINS.has(c) && (
                                            <span style={{
                                              fontSize: 10,
                                              fontWeight: 600,
                                              letterSpacing: "0.02em",
                                              color: "#ffffff",
                                              background: "rgba(255, 255, 255, 0.07)",
                                              border: "1px solid rgba(255, 255, 255, 0.16)",
                                              borderRadius: 9999,
                                              padding: "2px 8px",
                                              lineHeight: 1.4,
                                            }}>Fast</span>
                                          )}
                                        </span>
                                      </button>
                                    );
                                  })}
                                </div>
                              </>
                            )}
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <div style={{ position: "relative" }}>
                              <button
                                type="button"
                                onClick={() => {
                                  if (isFromTokenDropdownAvailable) {
                                    setShowBridgeTokenDropdown(prev => !prev);
                                    setShowBridgeToTokenDropdown(false);
                                  }
                                }}
                                className="token-selector-box"
                                style={{
                                  display: "flex", alignItems: "center", gap: 8, borderRadius: 99, padding: "8px 16px",
                                  cursor: isFromTokenDropdownAvailable ? "pointer" : "default",
                                  fontWeight: 700, fontSize: 16, whiteSpace: "nowrap", flexShrink: 0,
                                  background: isFromTokenDropdownAvailable ? "var(--border-soft)" : undefined,
                                  border: isFromTokenDropdownAvailable ? "1px solid var(--border)" : "1px solid transparent",
                                  color: "var(--text-primary)",
                                  transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)"
                                }}
                              >
                                <img
                                  src={bridgeFromAsset ? (TOKEN_LOGOS[bridgeFromAsset] || "/usdc.png") : "/usdc.png"}
                                  alt={(bridgeFromAsset || "USDC") as string}
                                  style={{ width: 24, height: 24, borderRadius: "50%" }}
                                  onError={(e) => { e.currentTarget.src = "/globe.svg"; }}
                                />
                                <span>{(bridgeFromAsset || "USDC") as string}</span>
                                {isFromTokenDropdownAvailable && (
                                  <ChevronDown
                                    size={14}
                                    style={{
                                      opacity: 0.6,
                                      transform: showBridgeTokenDropdown ? "rotate(180deg)" : "none",
                                      transition: "transform 0.2s"
                                    }}
                                  />
                                )}
                              </button>

                              {showBridgeTokenDropdown && isFromTokenDropdownAvailable && (
                                <>
                                  <div
                                    className="chain-picker-backdrop"
                                    onClick={(e) => { e.stopPropagation(); setShowBridgeTokenDropdown(false); }}
                                  />
                                  <div
                                    style={{
                                      position: "absolute",
                                      top: "calc(100% + 6px)",
                                      left: 0,
                                      minWidth: 160,
                                      background: "var(--surface)",
                                      border: "1px solid var(--border)",
                                      borderRadius: 16,
                                      padding: 6,
                                      zIndex: 9999,
                                      boxShadow: "0 16px 36px -4px rgba(0,0,0,0.3), 0 0 0 1px var(--border-soft)",
                                      animation: "txIn 0.18s cubic-bezier(0,0,0.2,1)",
                                    }}
                                  >
                                    {((bridgeFromChain ? CHAIN_TOKEN_MATRIX[bridgeFromChain] : (["USDC", "EURC", "cirBTC"] as Asset[])) || (["USDC"] as Asset[])).map(asset => {
                                      const isSelected = bridgeFromAsset === asset;
                                      return (
                                        <button
                                          key={asset}
                                          type="button"
                                          onClick={() => handleSelectFromToken(asset)}
                                          style={{
                                            width: "100%",
                                            display: "flex",
                                            alignItems: "center",
                                            gap: 10,
                                            padding: "8px 12px",
                                            borderRadius: 12,
                                            border: "none",
                                            background: isSelected ? "var(--border-soft)" : "transparent",
                                            cursor: "pointer",
                                            color: "var(--text-primary)",
                                            fontWeight: isSelected ? 800 : 600,
                                            fontSize: 14,
                                            textAlign: "left",
                                            transition: "background 0.15s"
                                          }}
                                          onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = "var(--border-soft)"; }}
                                          onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = "transparent"; }}
                                        >
                                          <img
                                            src={TOKEN_LOGOS[asset]}
                                            alt={asset}
                                            style={{ width: 22, height: 22, borderRadius: "50%" }}
                                            onError={(e) => { e.currentTarget.src = "/globe.svg"; }}
                                          />
                                          <div style={{ display: "flex", flexDirection: "column" }}>
                                            <span>{asset}</span>
                                            <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 500 }}>
                                              {asset === "USDC" ? "USD Coin" : "Euro Coin"}
                                            </span>
                                          </div>
                                        </button>
                                      );
                                    })}
                                  </div>
                                </>
                              )}
                            </div>
                            <input className="swap-input-text" type="number" placeholder="0" value={bridgeAmount}
                              onChange={e => {
                                const val = e.target.value;
                                if (val === "" || parseFloat(val) >= 0) setBridgeAmount(val);
                              }}
                              onKeyDown={e => { if (e.key === "-" || e.key === "e") e.preventDefault(); }}
                              onFocus={handleInputFocus}
                              style={{ background: "transparent", border: "none", fontSize: 36, fontWeight: 800, color: "var(--text-primary)", outline: "none", width: "50%", textAlign: "right" }} />
                          </div>
                        </div>

                        <div className="swap-center-btn" style={{ display: "flex", justifyContent: "center", margin: "-14px 0", position: "relative", zIndex: 20 }}>
                          <button onClick={handleFlipChains}
                            className="swap-flip-btn"
                            style={{ borderRadius: "50%", width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", zIndex: 10, color: "var(--text-primary)", transition: "transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), background 0.2s, color 0.2s", transform: isRotated ? "rotate(180deg)" : "rotate(0deg)" }}
                          >
                            <ArrowUpDown size={16} />
                          </button>
                        </div>

                        <div className="swap-input-box" style={{ padding: 14, borderRadius: 20 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                            <span style={{ fontSize: 13, color: "var(--text-muted)", fontWeight: 600 }}>To</span>
                            <div style={{ fontSize: 12, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 6 }}>
                              {(isRefreshing || (isCrossChainLoading && !hasCrossChainLoaded)) && !!bridgeToAsset ? <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} /> : null}
                              {!!bridgeToAsset && (
                                <span>
                                  Balance: {formatAssetBalance(toBalFormatted, bridgeToAsset)}
                                </span>
                              )}
                            </div>
                          </div>
                          {/* Custom To-Chain Picker */}
                          <div style={{ position: "relative", marginBottom: 8 }}>
                            <button
                              className="chain-picker-btn"
                              onClick={() => { setShowToChainPicker(p => !p); setShowFromChainPicker(false); }}
                              style={{
                                width: "100%", display: "flex", alignItems: "center", gap: 10,
                                borderRadius: 14, padding: "10px 14px", cursor: "pointer",
                                color: "var(--text-primary)", fontWeight: 700, fontSize: 15,
                                justifyContent: "space-between",
                              }}
                            >
                              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                {bridgeToChain && (
                                  <img src={bridgeToChain ? CHAIN_LOGOS[bridgeToChain as Chain] : undefined} alt={bridgeToChain || "Chain"}
                                    style={{ width: 24, height: 24, borderRadius: "50%", objectFit: "cover" }}
                                    onError={e => { e.currentTarget.src = "/globe.svg"; }} />
                                )}
                                {bridgeToChain || "Select chain"}
                              </div>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                                style={{ opacity: 0.5, transform: showToChainPicker ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>
                                <polyline points="6 9 12 15 18 9" />
                              </svg>
                            </button>

                            {showToChainPicker && (
                              <>
                                <div className="chain-picker-backdrop" onClick={(e) => { e.stopPropagation(); setShowToChainPicker(false); }} />
                                <div className="chain-picker-dropdown" style={{
                                  position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0,
                                  background: "var(--surface)", border: "1px solid var(--border)",
                                  borderRadius: 18, padding: 6, overflowY: "auto", overflowX: "hidden", maxHeight: 280, zIndex: 9999,
                                  boxShadow: "0 16px 36px -4px rgba(0,0,0,0.24), 0 0 0 1px var(--border-soft)",
                                  animation: "txIn 0.18s cubic-bezier(0,0,0.2,1)",
                                }}>
                                  {validDestinations.map(c => {
                                    const isSelected = c === bridgeToChain;
                                    return (
                                      <button key={c}
                                        onClick={() => {
                                          handleToChainChange(c as Chain);
                                          setShowToChainPicker(false);
                                        }}
                                        style={{
                                          width: "100%", display: "flex", alignItems: "center", gap: 12,
                                          padding: "10px 14px", borderRadius: 12,
                                          background: isSelected ? "var(--bg-default, rgba(128,128,128,0.08))" : "transparent",
                                          border: "none", cursor: "pointer",
                                          color: "var(--text-primary)",
                                          fontWeight: isSelected ? 700 : 500, fontSize: 14,
                                          fontFamily: "var(--font-geist), var(--font-inter), sans-serif",
                                          textAlign: "left", transition: "background 0.15s",
                                        }}
                                      >
                                        <img src={CHAIN_LOGOS[c]} alt={c}
                                          style={{ width: 22, height: 22, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
                                          onError={e => { e.currentTarget.src = "/globe.svg"; }} />
                                        <span>{c}</span>
                                        <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
                                          {L1_CHAINS.has(c) && (
                                            <span style={{
                                              fontSize: 10,
                                              fontWeight: 600,
                                              letterSpacing: "0.02em",
                                              color: "#ffffff",
                                              background: "rgba(255, 255, 255, 0.07)",
                                              border: "1px solid rgba(255, 255, 255, 0.16)",
                                              borderRadius: 9999,
                                              padding: "2px 8px",
                                              lineHeight: 1.4,
                                            }}>Fast</span>
                                          )}
                                        </span>
                                      </button>
                                    );
                                  })}
                                </div>
                              </>
                            )}
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <div style={{ position: "relative" }}>
                              <button
                                type="button"
                                onClick={() => {
                                  if (isToTokenDropdownAvailable) {
                                    setShowBridgeToTokenDropdown(prev => !prev);
                                    setShowBridgeTokenDropdown(false);
                                  }
                                }}
                                className="token-selector-box"
                                style={{
                                  display: "flex", alignItems: "center", gap: 8, borderRadius: 99, padding: "8px 16px",
                                  cursor: isToTokenDropdownAvailable ? "pointer" : "default",
                                  fontWeight: 700, fontSize: 16, whiteSpace: "nowrap", flexShrink: 0,
                                  background: isToTokenDropdownAvailable ? "var(--border-soft)" : undefined,
                                  border: isToTokenDropdownAvailable ? "1px solid var(--border)" : "1px solid transparent",
                                  color: "var(--text-primary)",
                                  transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)"
                                }}
                              >
                                <img
                                  src={bridgeToAsset ? (TOKEN_LOGOS[bridgeToAsset] || "/usdc.png") : "/usdc.png"}
                                  alt={(bridgeToAsset || "USDC") as string}
                                  style={{ width: 24, height: 24, borderRadius: "50%" }}
                                  onError={(e) => { e.currentTarget.src = "/globe.svg"; }}
                                />
                                <span>{(bridgeToAsset || "USDC") as string}</span>
                                {isToTokenDropdownAvailable && (
                                  <ChevronDown
                                    size={14}
                                    style={{
                                      opacity: 0.6,
                                      transform: showBridgeToTokenDropdown ? "rotate(180deg)" : "none",
                                      transition: "transform 0.2s"
                                    }}
                                  />
                                )}
                              </button>

                              {showBridgeToTokenDropdown && isToTokenDropdownAvailable && (
                                <>
                                  <div
                                    className="chain-picker-backdrop"
                                    onClick={(e) => { e.stopPropagation(); setShowBridgeToTokenDropdown(false); }}
                                  />
                                  <div
                                    style={{
                                      position: "absolute",
                                      top: "calc(100% + 6px)",
                                      left: 0,
                                      minWidth: 160,
                                      background: "var(--surface)",
                                      border: "1px solid var(--border)",
                                      borderRadius: 16,
                                      padding: 6,
                                      zIndex: 9999,
                                      boxShadow: "0 16px 36px -4px rgba(0,0,0,0.3), 0 0 0 1px var(--border-soft)",
                                      animation: "txIn 0.18s cubic-bezier(0,0,0.2,1)",
                                    }}
                                  >
                                    {((bridgeToChain ? CHAIN_TOKEN_MATRIX[bridgeToChain] : (["USDC", "EURC", "cirBTC"] as Asset[])) || (["USDC"] as Asset[])).map(asset => {
                                      const isSelected = bridgeToAsset === asset;
                                      return (
                                        <button
                                          key={asset}
                                          type="button"
                                          onClick={() => handleSelectToToken(asset)}
                                          style={{
                                            width: "100%",
                                            display: "flex",
                                            alignItems: "center",
                                            gap: 10,
                                            padding: "8px 12px",
                                            borderRadius: 12,
                                            border: "none",
                                            background: isSelected ? "var(--border-soft)" : "transparent",
                                            cursor: "pointer",
                                            color: "var(--text-primary)",
                                            fontWeight: isSelected ? 800 : 600,
                                            fontSize: 14,
                                            textAlign: "left",
                                            transition: "background 0.15s"
                                          }}
                                          onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = "var(--border-soft)"; }}
                                          onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = "transparent"; }}
                                        >
                                          <img
                                            src={TOKEN_LOGOS[asset]}
                                            alt={asset}
                                            style={{ width: 22, height: 22, borderRadius: "50%" }}
                                            onError={(e) => { e.currentTarget.src = "/globe.svg"; }}
                                          />
                                          <div style={{ display: "flex", flexDirection: "column" }}>
                                            <span>{asset}</span>
                                            <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 500 }}>
                                              {asset === "USDC" ? "USD Coin" : "Euro Coin"}
                                            </span>
                                          </div>
                                        </button>
                                      );
                                    })}
                                  </div>
                                </>
                              )}
                            </div>
                            <input className="swap-input-text" type="number" readOnly value={bridgeAmount}
                              style={{ background: "transparent", border: "none", fontSize: 36, fontWeight: 800, color: "var(--text-muted)", outline: "none", width: "50%", textAlign: "right" }} />
                          </div>
                        </div>

                        {/* Percentage Slider */}
                        {(() => {
                          const sliderPercent = Number(fromBalFormatted) > 0
                            ? Math.min(100, Math.max(0, Math.round((Number(bridgeAmount) / Number(fromBalFormatted)) * 100)))
                            : 0;
                          return (
                            <div style={{ margin: "14px 6px 4px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14 }}>
                              <input
                                type="range"
                                min="0"
                                max="100"
                                className="bridge-slider"
                                value={sliderPercent}
                                onChange={(e) => {
                                  const percent = Number(e.target.value);
                                  const totalBal = Number(fromBalFormatted);
                                  if (totalBal > 0) {
                                    const precision = bridgeFromAsset === "cirBTC" ? 100000000 : 10000;
                                    let val = Math.floor(totalBal * (percent / 100) * precision) / precision;
                                    setBridgeAmount(val > 0 ? val.toString() : (percent === 0 ? "" : "0"));
                                  }
                                }}
                                style={{
                                  flex: 1,
                                  cursor: "pointer",
                                  accentColor: "#2563eb",
                                  height: 5,
                                  borderRadius: 99,
                                  outline: "none",
                                  background: `linear-gradient(to right, var(--slider-fill, #2563eb) 0%, var(--slider-fill, #2563eb) ${sliderPercent}%, var(--slider-track, rgba(0, 0, 0, 0.08)) ${sliderPercent}%, var(--slider-track, rgba(0, 0, 0, 0.08)) 100%)`,
                                  ['--slider-pct' as any]: `${sliderPercent}%`
                                }}
                              />
                              <span style={{
                                fontSize: 13,
                                color: "var(--text-primary)",
                                fontWeight: 700,
                                minWidth: "36px",
                                textAlign: "right"
                              }}>
                                {sliderPercent}%
                              </span>
                            </div>
                          );
                        })()}

                        {getBridgeButtonState().isTrustlineMissing ? (
                          <div style={{ marginTop: 12 }}>
                            <StellarTrustlineAction
                              stellarWallet={stellarWallet}
                              onVerify={async () => {
                                await stellarWallet.refreshBalances();
                              }}
                            />
                          </div>
                        ) : (
                          <div style={{ marginTop: 12 }}>
                            {getBridgeButtonState().isSwitch || getBridgeButtonState().text.includes("Connect") ? (
                              <ConnectWalletButton text={getBridgeButtonState().text} onClick={handleBridge} />
                            ) : (
                              <SlideButton
                                disabled={getBridgeButtonState().disabled}
                                onComplete={handleBridge}
                                loading={getBridgeButtonState().loading || false}
                                text={getBridgeButtonState().text}
                                loadingText={getBridgeButtonState().text}
                              />
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* ── QUOTE / ROUTE DETAILS / TX TRACKER (DOWN SIDE) ── */}
                {(activeTab === "bridge") && showRightPanel && (
                  <div
                    className={`lf-card right-panel-card w-full shrink-0 flex flex-col gap-4 ${showRightPanel ? "is-visible" : ""}`}
                    style={{
                      position: "relative",
                      width: "100%",
                      maxWidth: 424,
                      padding: isTxActive ? 20 : 24,
                      background: "var(--surface-glass)",
                      border: "1px solid var(--border)",
                      borderRadius: 24,
                      boxShadow: "none",
                      zIndex: 10,
                    }}
                  >
                    {isTxActive ? (
                      <TxTracker
                        ref={txTrackerRef}
                        state={mode === "mainnet" && false ? lifiTxState : txEngine.state}
                        milestones={mode === "mainnet" && false ? lifiMilestones : txEngine.milestones}
                        txHash={mode === "mainnet" && false ? lifiTxHash : txEngine.txHash}
                        burnHash={txEngine.burnHash}
                        mintHash={txEngine.mintHash}
                        error={mode === "mainnet" && false ? lifiError : txEngine.error}
                        totalMs={mode === "mainnet" && false ? null : txEngine.totalMs}
                        blockNumber={mode === "mainnet" && false ? null : txEngine.blockNumber}
                        summary={txEngine.summary || (mode === "mainnet" ? {
                          fromAmt: bridgeAmount || swapAmount,
                          fromAsset: bridgeFromAsset || lifiFromToken?.symbol || swapFrom,
                          toAmt: bridgeAmount || ((activeRoute?.toAmount ?? "0") ? Number(formatUnits(BigInt((activeRoute?.toAmount ?? "0")), lifiToToken?.decimals || 18)).toLocaleString(undefined, { maximumFractionDigits: 4 }) : undefined),
                          toAsset: bridgeToAsset || lifiToToken?.symbol || swapTo,
                          type: "bridge" as const,
                          sourceChain: bridgeFromChain ?? undefined,
                          destChain: bridgeToChain ?? undefined
                        } : null)}
                        gasUsed={mode === "mainnet" && false ? null : txEngine.gasUsed}
                        gasPricePaid={mode === "mainnet" && false ? null : txEngine.gasPricePaid}
                        onDismiss={() => {
                          if (mode === "mainnet" && false) {
                            setLifiTxState("idle");
                            setSwapAmount("");
                          } else {
                            txEngine.dismiss();
                          }
                        }}
                        onViewHistory={() => {
                          if (mode === "mainnet" && false) {
                            setLifiTxState("idle");
                            setSwapAmount("");
                          } else {
                            txEngine.dismiss();
                          }
                          setHistoryFilter("pending");
                          refetchHistory();
                          setActiveTab("history");
                        }}
                        onRetry={() => {
                          if (mode === "mainnet" && false) {
                            setLifiTxState("idle");
                          } else {
                            if (txEngine.burnHash) handleResumeBridge();
                            else handleBridge();
                          }
                        }}
                        flat={true}
                      />
                    ) : (
                      <>
                        <h3 style={{ fontSize: 15, fontWeight: 800, color: "var(--text-primary)", margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
                          Route Details
                        </h3>

                        <div className="route-details-table" style={{ display: "flex", flexDirection: "column", gap: 0, background: "var(--surface)", borderRadius: 16, border: "1px solid var(--border)", overflow: "hidden" }}>

                          {/* Expected Output */}
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", borderBottom: "1px solid var(--border-soft)" }}>
                            <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600 }}>Expected Output</span>
                            <span style={{ fontSize: 14, fontWeight: 800, color: "var(--text-primary)" }}>
                              {false ? (
                                mode === "mainnet" ? (
                                  (activeRoute?.toAmount ?? "0") ? `${Number(formatUnits(BigInt((activeRoute?.toAmount ?? "0")), lifiToToken?.decimals || 18)).toLocaleString(undefined, { maximumFractionDigits: 4 })} ${lifiToToken?.symbol}` : "0.00"
                                ) : (
                                  quoteData?.expectedAmountOut
                                    ? `${quoteData?.expectedAmountOut.toFixed(4)} ${swapTo}`
                                    : (swapFrom && swapTo && Number(swapAmount) > 0 ? "Calculating..." : "0.00")
                                )
                              ) : bridgeAmount + " " + bridgeToAsset}
                            </span>
                          </div>

                          {false ? (
                            <>
                              {/* Route */}
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", borderBottom: "1px solid var(--border-soft)" }}>
                                <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600 }}>Route</span>
                                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: 6 }}>
                                  {mode === "mainnet" ? (
                                    activeRoute ? (
                                      <>
                                        <img
                                          src={activeRoute?.providerLogoUrl}
                                          style={{ width: 16, height: 16, borderRadius: "50%", objectFit: "contain" }}
                                          onError={(e) => { e.currentTarget.src = "/globe.svg"; }}
                                        />
                                        <span>{activeRoute?.providerName}</span>
                                      </>
                                    ) : (
                                      <span>Searching...</span>
                                    )
                                  ) : (
                                    <>
                                      <img src="/arc-fun-logo.jpg" style={{ width: 16, height: 16, borderRadius: "50%", objectFit: "contain" }} />
                                      <span>ArcFun Bridge</span>
                                    </>
                                  )}
                                </span>
                              </div>

                              {/* Path */}
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", borderBottom: "1px solid var(--border-soft)" }}>
                                <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600 }}>Path</span>
                                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: 6 }}>
                                  {mode === "mainnet" ? (
                                    <>
                                      <img src={lifiFromToken?.logoURI && !lifiFromToken.logoURI.includes("unknown.svg") ? lifiFromToken.logoURI : `https://ui-avatars.com/api/?name=${lifiFromToken?.symbol || "T"}&background=random&color=fff&rounded=true&font-size=0.45`} alt={lifiFromToken?.symbol} style={{ width: 14, height: 14, borderRadius: "50%" }} onError={(e) => { e.currentTarget.src = "/globe.svg"; }} />
                                      {lifiFromToken?.symbol || "Unknown"}
                                      <span style={{ color: "var(--text-muted)", margin: "0 2px" }}>→</span>
                                      <img src={lifiToToken?.logoURI && !lifiToToken.logoURI.includes("unknown.svg") ? lifiToToken.logoURI : `https://ui-avatars.com/api/?name=${lifiToToken?.symbol || "T"}&background=random&color=fff&rounded=true&font-size=0.45`} alt={lifiToToken?.symbol} style={{ width: 14, height: 14, borderRadius: "50%" }} onError={(e) => { e.currentTarget.src = "/globe.svg"; }} />
                                      {lifiToToken?.symbol || "Unknown"}
                                    </>
                                  ) : (
                                    <>
                                      <img src={TOKEN_LOGOS[swapFrom as any]} style={{ width: 14, height: 14, borderRadius: "50%" }} />
                                      {swapFrom}
                                      <span style={{ color: "var(--text-muted)", margin: "0 2px" }}>→</span>
                                      <img src={TOKEN_LOGOS[swapTo as any]} style={{ width: 14, height: 14, borderRadius: "50%" }} />
                                      {swapTo}
                                    </>
                                  )}
                                </span>
                              </div>

                              {mode === "mainnet" && activeRoute?.toAmountMin && (
                                <>
                                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", borderBottom: "1px solid var(--border-soft)" }}>
                                    <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600 }}>Rate</span>
                                    <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: 6 }}>
                                      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 14, height: 14, borderRadius: "50%", border: "2px solid #10b981", color: "#10b981", fontSize: 8, fontWeight: 800 }}>{quoteCountdown}</div>
                                      1 {lifiFromToken?.symbol} = {(Number(formatUnits(BigInt((activeRoute?.toAmount ?? "0")), lifiToToken?.decimals || 18)) / Number(swapAmount)).toFixed(6)} {lifiToToken?.symbol}
                                    </span>
                                  </div>
                                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", borderBottom: "1px solid var(--border-soft)" }}>
                                    <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600 }}>Minimum Received</span>
                                    <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>
                                      {Number(formatUnits(BigInt(activeRoute?.toAmountMin ?? "0"), lifiToToken?.decimals || 18)).toLocaleString(undefined, { maximumFractionDigits: 4 })} {lifiToToken?.symbol}
                                    </span>
                                  </div>
                                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", borderBottom: "1px solid var(--border-soft)" }}>
                                    <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600 }}>Price Impact</span>
                                    {/* @ts-ignore */}
                                    <span style={{ fontSize: 12, fontWeight: 700, color: (Number(activeRoute?.estimatedPriceImpact) > 5 ? "var(--accent-red)" : (Number(activeRoute?.estimatedPriceImpact) > 2 ? "orange" : "#10b981")) }}>
                                      {/* @ts-ignore */}
                                      {Number(activeRoute?.estimatedPriceImpact) > 0 ? `${Number(activeRoute?.estimatedPriceImpact).toFixed(2)}%` : "< 0.01%"}
                                    </span>
                                  </div>
                                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", borderBottom: "1px solid var(--border-soft)" }}>
                                    <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600 }}>Max Slippage</span>
                                    <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>
                                      5.0%
                                    </span>
                                  </div>
                                </>
                              )}

                              {mode === "testnet" && quoteData && (
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", borderBottom: "1px solid var(--border-soft)" }}>
                                  <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600 }}>Rate</span>
                                  <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>
                                    1 {swapFrom} = {quoteData?.rate.toFixed(4)} {swapTo}
                                  </span>
                                </div>
                              )}

                              {/* Est. Network Fee */}
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", borderBottom: "1px solid var(--border-soft)" }}>
                                <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600 }}>Est. Network Fee</span>
                                {mode === "mainnet" ? (
                                  <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>
                                    {(robinhoodGasGwei ?? 0) !== null ? `~${(300000 * (robinhoodGasGwei ?? 0) * 1e-9).toFixed(6)} ETH` : <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Fetching…</span>}
                                  </span>
                                ) : gasFeeUSDC !== null ? (
                                  <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: 5 }}>
                                    <img src="/usdc.png" alt="USDC" style={{ width: 14, height: 14, borderRadius: "50%" }} />
                                    ~${gasFeeUSDC} USDC
                                  </span>
                                ) : (
                                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Fetching…</span>
                                )}
                              </div>

                              {/* Gas Price */}
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", borderBottom: "1px solid var(--border-soft)" }}>
                                <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600 }}>Gas Price</span>
                                <span style={{ fontSize: 12, fontWeight: 700, color: "#3b82f6" }}>
                                  {mode === "mainnet" ? ((robinhoodGasGwei ?? 0) !== null ? `${(robinhoodGasGwei ?? 0).toFixed(1)} Gwei` : "—") : (arcGasGwei !== null ? `${(arcGasGwei ?? 0).toFixed(1)} Gwei` : "—")}
                                </span>
                              </div>
                            </>
                          ) : (
                            <>
                              {/* Via — Circle CCTP V2 (replaces separate Provider + Bridge Type rows) */}
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", borderBottom: "1px solid var(--border-soft)" }}>
                                <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600 }}>Via</span>
                                <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                                  <img
                                    src="/circle-brand.png"
                                    alt="Circle"
                                    style={{ width: 20, height: 20, objectFit: "contain", flexShrink: 0 }}
                                    onError={(e) => { e.currentTarget.style.display = "none"; }}
                                  />
                                  <span style={{
                                    fontSize: 10, fontWeight: 800, letterSpacing: "0.03em",
                                    background: "linear-gradient(90deg, #3b82f6, #6366f1)",
                                    color: "white",
                                    borderRadius: 5, padding: "2px 7px",
                                  }}>
                                    CCTP V2
                                  </span>
                                </div>
                              </div>

                              {/* Route — with chain logos */}
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", borderBottom: "1px solid var(--border-soft)", gap: 8 }}>
                                <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600, flexShrink: 0 }}>Route</span>
                                <div style={{ display: "flex", alignItems: "center", gap: 5, whiteSpace: "nowrap", flexWrap: "nowrap", flexShrink: 0 }}>
                                  <img src={(bridgeFromChain ? (bridgeFromChain ? CHAIN_LOGOS[bridgeFromChain as Chain] : undefined) : undefined)} alt={bridgeFromChain || "Chain"}
                                    style={{ width: 14, height: 14, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
                                    onError={(e) => { e.currentTarget.src = "/globe.svg"; }} />
                                  <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)", whiteSpace: "nowrap" }}>
                                    {bridgeFromChain?.replace(" Mainnet", "").replace(" Sepolia", "").replace(" Testnet", "").replace(" Devnet", "")}
                                  </span>
                                  <span style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 2px", flexShrink: 0 }}>→</span>
                                  <img src={(bridgeToChain ? (bridgeToChain ? CHAIN_LOGOS[bridgeToChain as Chain] : undefined) : undefined)} alt={bridgeToChain || "Chain"}
                                    style={{ width: 14, height: 14, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
                                    onError={(e) => { e.currentTarget.src = "/globe.svg"; }} />
                                  <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)", whiteSpace: "nowrap" }}>
                                    {bridgeToChain?.replace(" Mainnet", "").replace(" Sepolia", "").replace(" Testnet", "").replace(" Devnet", "")}
                                  </span>
                                </div>
                              </div>

                              {/* Estimated Time */}
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", borderBottom: "1px solid var(--border-soft)" }}>
                                <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600 }}>Estimated Time</span>
                                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>
                                  ~ 2 - 5 mins
                                </span>
                              </div>

                              {/* Est. Network Fee */}
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "12px 14px", borderBottom: "1px solid var(--border-soft)" }}>
                                <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600 }}>Est. Network Fee</span>
                                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                                  {bridgeEstimate && bridgeEstimate.gasFees && bridgeEstimate.gasFees.length > 0 ? (
                                    bridgeEstimate.gasFees.map((gf: any, i: number) => {
                                      const feeVal = gf.fees?.fee ?? gf.fee ?? gf.amount;
                                      const formattedVal = (feeVal !== undefined && feeVal !== null && !isNaN(Number(feeVal)))
                                        ? Number(feeVal).toFixed(5)
                                        : null;
                                      return (
                                        <span key={i} style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600 }}>
                                          {gf.name}: {formattedVal ?? "Sponsored (0.00)"} {gf.token}
                                        </span>
                                      );
                                    })
                                  ) : bridgeAmountRaw > 0n ? (
                                    <span style={{ fontSize: 12, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 4 }}>
                                      Estimating route...
                                    </span>
                                  ) : (
                                    <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Enter amount to estimate</span>
                                  )}
                                </div>
                              </div>
                            </>
                          )}

                          {/* Platform Fee */}
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px" }}>
                            <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600 }}>Platform Fee</span>
                            <span style={{
                              fontSize: 12,
                              fontWeight: 700,
                              color: "var(--text-primary)",
                              fontFamily: "var(--font-geist), var(--font-inter), sans-serif",
                              fontVariantNumeric: "tabular-nums",
                              letterSpacing: "-0.01em"
                            }}>$0</span>
                          </div>

                        </div>
                      </>
                    )}
                  </div>
                )}
                {activeTab === "recover" && <RecoverManager />}
              </div>

              {/* RIGHT: Live Market Price Chart (Desktop dual-panel only) */}
              {(activeTab === "bridge" || activeTab === "recover") && (
                <div className="hidden min-[1150px]:flex w-full flex-1 min-w-0 flex-col pt-1">
                  <TokenPriceChart key={bridgeFromAsset || "USDC"} asset={(bridgeFromAsset as any) || "USDC"} height={465} />
                </div>
              )}
            </div>
          )}

          {/* ── HISTORY TAB ── sibling to dual-panel-wrapper, inside main-content column */}
          {activeTab === "history" && (() => {
            // Group current page items (<= 10 items) by day
            const grouped: Record<string, TxHistoryEntry[]> = {};
            historyItems.forEach(item => {
              const day = new Date(item.timestamp).toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "short", day: "numeric" });
              if (!grouped[day]) grouped[day] = [];
              grouped[day].push(item);
            });
            const days = Object.keys(grouped);

            const typeLabel = (type: string) =>
              type === "swap" ? "SWAP" : type === "bridge_cctp" ? "CCTP BRIDGE" : "BRIDGE";

            const statusStyle = (status: string) => ({
              fontSize: 11.5,
              fontWeight: 600,
              letterSpacing: "-0.01em",
              fontFamily: "var(--font-geist), var(--font-inter), sans-serif",
              padding: "4px 12px",
              borderRadius: 9999,
              color: status === "success" ? "#16a34a" : status === "failed" ? "#dc2626" : "#d97706",
              background: status === "success" ? "rgba(22,163,74,0.10)" : status === "failed" ? "rgba(220,38,38,0.10)" : "rgba(217,119,6,0.10)",
            });


            return (
              <div className="w-full flex flex-col items-center pb-12 gap-5 -mt-2">
                {/* Centered Filter Bar (All / Success / Pending / Failed) */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    background: isDark ? "#151922" : "var(--surface-soft, #f1f5f9)",
                    padding: 3,
                    borderRadius: 9999,
                    border: isDark ? "1px solid rgba(255, 255, 255, 0.08)" : "1px solid var(--border, #e2e8f0)",
                    gap: 2,
                    width: "fit-content",
                    boxShadow: isDark ? "none" : "0 1px 2px rgba(0,0,0,0.02)",
                  }}
                >
                  {(["all", "success", "pending", "failed"] as const).map(f => (
                    <button
                      key={f}
                      onClick={() => { setHistoryFilter(f); setCursorStack([null]); }}
                      style={{
                        padding: "7px 20px",
                        minWidth: 78,
                        borderRadius: 9999,
                        fontSize: 13,
                        fontWeight: historyFilter === f ? 700 : 500,
                        background: historyFilter === f
                          ? (isDark ? "#283040" : "#ffffff")
                          : "transparent",
                        color: historyFilter === f
                          ? (isDark ? "#ffffff" : "#0f172a")
                          : (isDark ? "#94a3b8" : "#64748b"),
                        border: historyFilter === f
                          ? (isDark ? "1px solid rgba(255, 255, 255, 0.12)" : "1px solid rgba(0, 0, 0, 0.08)")
                          : "1px solid transparent",
                        boxShadow: historyFilter === f
                          ? (isDark ? "none" : "0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.04)")
                          : "none",
                        cursor: "pointer",
                        transition: "all 0.2s ease",
                        textTransform: "capitalize",
                        fontFamily: "var(--font-geist), var(--font-inter), sans-serif",
                        letterSpacing: "-0.015em",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 6,
                      }}
                    >
                      {f}
                      {f === "pending" && hasPendingBridge && (
                        <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", backgroundColor: "#ef4444", transform: "translateY(-0.5px)" }} />
                      )}
                    </button>
                  ))}
                </div>

                <div className="history-container w-full max-w-[860px] flex flex-col gap-7">
                  {isHistoryLoading ? (
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, padding: "80px 20px", color: "var(--text-muted)" }}>
                      <div style={{ width: 52, height: 52, borderRadius: "50%", background: "var(--bg-default)", border: "1px solid var(--border-soft)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <svg className="animate-spin" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2.2" strokeLinecap="round"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" /></svg>
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 600, fontFamily: "var(--font-geist), var(--font-inter), sans-serif", letterSpacing: "-0.015em" }}>Fetching on-chain history…</div>
                      <div style={{ fontSize: 12.5, color: "var(--text-secondary, #8E8E93)", opacity: 0.8, fontFamily: "var(--font-geist), var(--font-inter), sans-serif", letterSpacing: "-0.01em" }}>Reading events from Arc Testnet</div>
                    </div>
                  ) : historyItems.length === 0 ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary, #8E8E93)", fontFamily: "var(--font-geist), var(--font-inter), sans-serif", letterSpacing: "-0.01em", textTransform: "uppercase" }}>History</span>
                        <div style={{ flex: 1, height: 1, background: "var(--border-soft)" }} />
                        <div className="flex gap-2 items-center pl-2">
                          {historyUpdateMsg && (
                            <span style={{ fontSize: 11, color: historyUpdateMsg === "History updated" ? "#16a34a" : "var(--text-muted)", fontWeight: 600, fontFamily: "var(--font-geist), var(--font-inter), sans-serif", letterSpacing: "-0.01em" }}>
                              {historyUpdateMsg}
                            </span>
                          )}
                          {lastUpdated && <span style={{ fontSize: 11, color: "var(--text-secondary, #8E8E93)", fontFamily: "var(--font-geist), var(--font-inter), sans-serif", letterSpacing: "-0.01em" }}>Last updated: {lastUpdated.toLocaleTimeString()}</span>}
                          <button onClick={handleHistoryRefresh} disabled={isRefreshing || isHistoryLoading}
                            style={{ width: 28, height: 28, borderRadius: 8, background: "var(--surface)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", cursor: (isRefreshing || isHistoryLoading) ? "not-allowed" : "pointer", color: "var(--text-muted)", flexShrink: 0 }}>
                            <RefreshCw size={12} style={{ animation: (isRefreshing || isHistoryLoading) ? "spin 1s linear infinite" : "none" }} />
                          </button>
                        </div>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, padding: "60px 20px", color: "var(--text-muted)" }}>
                        <div style={{ width: 52, height: 52, borderRadius: "50%", background: "var(--bg-default)", border: "1px solid var(--border-soft)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></svg>
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 600, fontFamily: "var(--font-geist), var(--font-inter), sans-serif", letterSpacing: "-0.015em" }}>No on-chain transactions found</div>
                        <div style={{ fontSize: 12.5, color: "var(--text-secondary, #8E8E93)", opacity: 0.8, fontFamily: "var(--font-geist), var(--font-inter), sans-serif", letterSpacing: "-0.01em" }}>Your swap and bridge history will appear here</div>
                      </div>
                    </div>
                  ) : (
                    <>
                      {days.map((day, idx) => (
                        <div key={day} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                          {/* Day header */}
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text-secondary, #8E8E93)", fontFamily: "var(--font-geist), var(--font-inter), sans-serif", letterSpacing: "-0.01em", textTransform: "uppercase", whiteSpace: "nowrap" }}>{day}</span>
                            <div style={{ flex: 1, height: 1, background: "var(--border-soft)" }} />
                            {idx === 0 && (
                              <div className="flex gap-2 items-center pl-2">
                                {historyUpdateMsg && (
                                  <span style={{ fontSize: 11, color: historyUpdateMsg === "History updated" ? "#16a34a" : "var(--text-muted)", fontWeight: 600, fontFamily: "var(--font-geist), var(--font-inter), sans-serif", letterSpacing: "-0.01em" }}>
                                    {historyUpdateMsg}
                                  </span>
                                )}
                                {lastUpdated && <span style={{ fontSize: 11, color: "var(--text-secondary, #8E8E93)", fontFamily: "var(--font-geist), var(--font-inter), sans-serif", letterSpacing: "-0.01em" }}>Last updated: {lastUpdated.toLocaleTimeString()}</span>}
                                <button onClick={handleHistoryRefresh} disabled={isRefreshing || isHistoryLoading}
                                  style={{ width: 28, height: 28, borderRadius: 8, background: "var(--surface)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", cursor: (isRefreshing || isHistoryLoading) ? "not-allowed" : "pointer", color: "var(--text-muted)", flexShrink: 0 }}>
                                  <RefreshCw size={12} style={{ animation: (isRefreshing || isHistoryLoading) ? "spin 1s linear infinite" : "none" }} />
                                </button>
                              </div>
                            )}
                          </div>

                          {/* Cards */}
                          {grouped[day].map(item => {
                            const isExpanded = expandedHistoryIds.has(item.id);
                            return (
                              <div key={item.id} style={{
                                background: "var(--surface-soft, rgba(255, 255, 255, 0.03))",
                                borderRadius: 22,
                                border: "1px solid var(--border)",
                                padding: "18px 22px",
                                display: "flex",
                                flexDirection: "column",
                                gap: 14,
                                boxShadow: "0 2px 8px rgba(0, 0, 0, 0.02), inset 0 1px 0 rgba(255, 255, 255, 0.04)",
                                transition: "all 0.2s ease",
                              }}>
                                {/* Top row */}
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                    {/* Token pair icons */}
                                    <div style={{ position: "relative", width: 40, height: 28, flexShrink: 0 }}>
                                      <img src={TOKEN_LOGOS[item.fromAsset as Asset] ?? "/globe.svg"} alt={item.fromAsset}
                                        style={{ width: 26, height: 26, borderRadius: "50%", position: "absolute", left: 0, top: 0, border: "2px solid var(--surface)" }}
                                        onError={e => { e.currentTarget.src = "/globe.svg"; }} />
                                      {item.toAsset && (
                                        <img src={TOKEN_LOGOS[item.toAsset as Asset] ?? "/globe.svg"} alt={item.toAsset}
                                          style={{ width: 22, height: 22, borderRadius: "50%", position: "absolute", right: 0, bottom: 0, border: "2px solid var(--surface)" }}
                                          onError={e => { e.currentTarget.src = "/globe.svg"; }} />
                                      )}
                                    </div>
                                    <div>
                                      <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text-secondary, #8E8E93)", fontFamily: "var(--font-geist), var(--font-inter), sans-serif", letterSpacing: "-0.01em" }}>{typeLabel(item.type)}</div>
                                      <div style={{
                                        fontSize: 20,
                                        fontWeight: 700,
                                        color: "var(--text-primary)",
                                        lineHeight: 1.15,
                                        fontFamily: "var(--font-geist), var(--font-inter), sans-serif",
                                        letterSpacing: "-0.03em",
                                        fontVariantNumeric: "tabular-nums"
                                      }}>
                                        {item.amount} {item.fromAsset}{item.toAsset ? ` → ${item.toAsset}` : ""}
                                      </div>
                                    </div>
                                  </div>
                                  <span style={statusStyle(item.status)}>{item.status.toUpperCase()}</span>
                                </div>

                                {/* Bottom row */}
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                  <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                                    <span style={{ fontSize: 12.5, color: "var(--text-secondary, #8E8E93)", fontWeight: 400, fontFamily: "var(--font-geist), var(--font-inter), sans-serif", letterSpacing: "-0.01em" }}>
                                      {new Date(item.timestamp).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                                    </span>
                                    {item.destChain ? (
                                      <span style={{ fontSize: 12.5, color: "var(--text-secondary, #8E8E93)", fontWeight: 400, fontFamily: "var(--font-geist), var(--font-inter), sans-serif", letterSpacing: "-0.01em" }}>{item.sourceChain} → {item.destChain}</span>
                                    ) : (
                                      <span style={{ fontSize: 12.5, color: "var(--text-secondary, #8E8E93)", fontWeight: 400, fontFamily: "var(--font-geist), var(--font-inter), sans-serif", letterSpacing: "-0.01em" }}>{item.sourceChain}</span>
                                    )}

                                  </div>
                                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                    {(item.status === "pending" ||
                                      (((item.status as any) === "claiming" || item.status === "failed") &&
                                        (item.destChain?.toLowerCase().includes("solana") ||
                                          item.destChain?.toLowerCase().includes("stellar")))
                                    ) && item.type === "bridge_cctp" && (
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            if (!item.destChain || !item.toAsset) return;
                                            const payload = {
                                              burnTxHash: item.burnHash || item.txHash,
                                              sourceChain: item.sourceChain,
                                              destChain: item.destChain,
                                              amount: item.amount,
                                              fromAsset: item.fromAsset,
                                              toAsset: item.toAsset
                                            };
                                            (process.env.NODE_ENV === "development" ? console.log : () => { })("[Path B: History Tab -> Claim Pending] resumePayload.amount:", payload.amount);
                                            txEngine.executeResume(payload);
                                            setActiveTab("bridge");
                                          }}
                                          style={{
                                            display: "flex", alignItems: "center", gap: 4, padding: "6px 14px",
                                            fontSize: 12, fontWeight: 600, color: "var(--text-primary)",
                                            background: "var(--surface-soft, rgba(255,255,255,0.05))", border: "1px solid var(--border)",
                                            borderRadius: 12, cursor: "pointer", transition: "all 0.15s ease",
                                            fontFamily: "var(--font-geist), var(--font-inter), sans-serif",
                                            letterSpacing: "-0.01em",
                                          }}
                                          onMouseEnter={(e) => e.currentTarget.style.background = "var(--bg-default)"}
                                          onMouseLeave={(e) => e.currentTarget.style.background = "var(--surface-soft, rgba(255,255,255,0.05))"}
                                        >
                                          Claim Pending
                                        </button>
                                      )}
                                    <button
                                      onClick={() => toggleHistoryExpand(item.id)}
                                      style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 4,
                                        padding: "6px 14px",
                                        fontSize: 12,
                                        fontWeight: 600,
                                        color: isExpanded ? "var(--text-primary)" : "var(--text-secondary, #8E8E93)",
                                        background: isExpanded ? "var(--bg-default)" : "var(--surface-soft, rgba(255,255,255,0.05))",
                                        border: "1px solid var(--border)",
                                        borderRadius: 12,
                                        cursor: "pointer",
                                        transition: "all 0.15s ease",
                                        fontFamily: "var(--font-geist), var(--font-inter), sans-serif",
                                        letterSpacing: "-0.01em",
                                      }}
                                    >
                                      <span>Details</span>
                                      {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                    </button>
                                  </div>
                                </div>

                                {/* Expanded Details */}
                                {isExpanded && (
                                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4, paddingTop: 16, borderTop: "1px dashed var(--border-soft)" }}>
                                    {(item.burnHash || item.txHash) && (() => {
                                      const burnTx = item.burnHash || item.txHash;
                                      const burnUrl = item.sourceChain && burnTx ? ChainRegistry.getExplorerTxUrl(item.sourceChain, burnTx) : null;
                                      return (
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--bg-default)", padding: "10px 14px", borderRadius: 12, border: "1px solid var(--border-soft)" }}>
                                          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                                            <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{item.burnHash ? "Burn Tx" : "Swap Tx"}</span>
                                            <span style={{ fontSize: 12, fontFamily: "monospace", color: "var(--text-primary)" }}>{burnTx?.slice(0, 16)}…{burnTx?.slice(-12)}</span>
                                          </div>
                                          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                                            {burnUrl && (
                                              <a
                                                href={burnUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", fontSize: 11, fontWeight: 700, color: "var(--text-primary)", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, textDecoration: "none", cursor: "pointer" }}
                                              >
                                                <ExternalLink size={11} /> Explorer
                                              </a>
                                            )}
                                            <button
                                              onClick={async () => { try { await navigator.clipboard.writeText(burnTx!); } catch { } }}
                                              style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", fontSize: 11, fontWeight: 700, color: "var(--text-primary)", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, cursor: "pointer" }}
                                            >
                                              <Copy size={11} /> Copy
                                            </button>
                                          </div>
                                        </div>
                                      );
                                    })()}

                                    {item.mintHash && (() => {
                                      const mintUrl = item.destChain && item.mintHash && item.mintHash !== "ALREADY_CLAIMED_ON_CHAIN" ? ChainRegistry.getExplorerTxUrl(item.destChain, item.mintHash) : null;
                                      return (
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--bg-default)", padding: "10px 14px", borderRadius: 12, border: "1px solid var(--border-soft)" }}>
                                          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                                            <span style={{ fontSize: 10, fontWeight: 700, color: "#059669", textTransform: "uppercase", letterSpacing: "0.05em" }}>Mint Tx</span>
                                            <span style={{ fontSize: 12, fontFamily: "monospace", color: "var(--text-primary)" }}>{item.mintHash.slice(0, 16)}…{item.mintHash.slice(-12)}</span>
                                          </div>
                                          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                                            {mintUrl && (
                                              <a
                                                href={mintUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", fontSize: 11, fontWeight: 700, color: "#059669", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, textDecoration: "none", cursor: "pointer" }}
                                              >
                                                <ExternalLink size={11} /> Explorer
                                              </a>
                                            )}
                                            <button
                                              onClick={async () => { try { await navigator.clipboard.writeText(item.mintHash as string); } catch { } }}
                                              style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", fontSize: 11, fontWeight: 700, color: "var(--text-primary)", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, cursor: "pointer" }}
                                            >
                                              <Copy size={11} /> Copy
                                            </button>
                                          </div>
                                        </div>
                                      );
                                    })()}

                                    {item.failureReason && (
                                      <div style={{ display: "flex", flexDirection: "column", gap: 4, background: "rgba(220,38,38,0.06)", padding: "10px 14px", borderRadius: 12, border: "1px solid rgba(220,38,38,0.15)" }}>
                                        <span style={{ fontSize: 10, fontWeight: 800, color: "#dc2626", textTransform: "uppercase", letterSpacing: "0.05em" }}>Failure Reason</span>
                                        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>{item.failureReason}</span>
                                      </div>
                                    )}

                                    {item.status === "pending" && item.type === "bridge_cctp" && (
                                      <button
                                        onClick={() => {
                                          if (!item.destChain || !item.toAsset) return;
                                          const payload = {
                                            burnTxHash: item.burnHash || item.txHash,
                                            sourceChain: item.sourceChain,
                                            destChain: item.destChain,
                                            amount: item.amount,
                                            fromAsset: item.fromAsset,
                                            toAsset: item.toAsset
                                          };
                                          (process.env.NODE_ENV === "development" ? console.log : () => { })("[Path B: History Tab -> Resume / Retry Mint] resumePayload.amount:", payload.amount);
                                          txEngine.executeResume(payload);
                                          // Switch back to bridge tab to show the tracker
                                          setActiveTab("bridge");
                                        }}
                                        style={{
                                          marginTop: 4, width: "100%", background: "transparent", color: "var(--text-primary)",
                                          border: "1px solid var(--border)", borderRadius: 8, padding: "10px", fontSize: 12, fontWeight: 700,
                                          cursor: "pointer", transition: "all 0.2s"
                                        }}
                                        onMouseEnter={(e) => e.currentTarget.style.background = "var(--surface)"}
                                        onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                                      >
                                        Resume / Retry Mint
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ))}

                      {/* True Server-Side Pagination Controls (Shown ONLY when not loading) */}
                      {(cursorStack.length > 1 || historyHasMore) && (
                        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-6 mt-2 border-t border-[var(--border-soft)] w-full text-xs" style={{ fontFamily: "var(--font-geist), var(--font-inter), sans-serif" }}>
                          <div className="text-[var(--text-secondary,#8E8E93)] font-normal">
                            Page <span className="font-semibold text-[var(--text-primary)]">{currentPageNumber}</span>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              disabled={currentPageNumber === 1 || isHistoryLoading}
                              onClick={() => {
                                if (currentPageNumber > 1) {
                                  setCursorStack(prev => prev.slice(0, -1));
                                }
                              }}
                              style={{
                                padding: "7px 16px",
                                borderRadius: 12,
                                fontSize: 12,
                                fontWeight: 600,
                                background: "var(--surface-soft, rgba(255,255,255,0.05))",
                                border: "1px solid var(--border)",
                                color: currentPageNumber === 1 ? "var(--text-muted)" : "var(--text-primary)",
                                cursor: currentPageNumber === 1 ? "not-allowed" : "pointer",
                                opacity: currentPageNumber === 1 ? 0.4 : 1,
                                transition: "all 0.15s ease",
                                fontFamily: "var(--font-geist), var(--font-inter), sans-serif",
                              }}
                            >
                              Previous
                            </button>

                            <div
                              style={{
                                minWidth: 32,
                                height: 32,
                                padding: "0 10px",
                                borderRadius: 12,
                                fontSize: 12.5,
                                fontWeight: 700,
                                background: isDark ? "#283040" : "var(--surface)",
                                color: "var(--text-primary)",
                                border: "1px solid var(--border)",
                                boxShadow: isDark ? "none" : "0 1px 2px rgba(0, 0, 0, 0.04)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontFamily: "var(--font-geist), var(--font-inter), sans-serif",
                                fontVariantNumeric: "tabular-nums",
                              }}
                            >
                              {currentPageNumber}
                            </div>

                            <button
                              disabled={!historyHasMore || isHistoryLoading}
                              onClick={() => {
                                if (historyNextCursor) {
                                  setCursorStack(prev => [...prev, historyNextCursor]);
                                }
                              }}
                              style={{
                                padding: "7px 16px",
                                borderRadius: 12,
                                fontSize: 12,
                                fontWeight: 600,
                                background: "var(--surface-soft, rgba(255,255,255,0.05))",
                                border: "1px solid var(--border)",
                                color: !historyHasMore ? "var(--text-muted)" : "var(--text-primary)",
                                cursor: !historyHasMore ? "not-allowed" : "pointer",
                                opacity: !historyHasMore ? 0.4 : 1,
                                transition: "all 0.15s ease",
                                fontFamily: "var(--font-geist), var(--font-inter), sans-serif",
                              }}
                            >
                              Next
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })()}

          {showTokenSelect && typeof document !== "undefined" && createPortal(
            <div onClick={() => setShowTokenSelect(null)}
              style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", zIndex: 999999, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
              <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 400, padding: 20, display: "flex", flexDirection: "column", gap: 16, minHeight: 520, maxHeight: "90vh", borderRadius: 24, boxShadow: "0 24px 64px rgba(0,0,0,0.5)", background: "var(--surface)", border: "1px solid var(--border)", overflow: "hidden" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <h3 style={{ fontSize: 18, fontWeight: 800, color: "var(--text-primary)", margin: 0, display: "flex", alignItems: "center", gap: 6 }}>
                    Select a token
                    <Info size={14} color="var(--text-muted)" />
                  </h3>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <button
                      onClick={async () => {
                        const now = Date.now();
                        if (now - lastTokenRefresh < 60000) return; // 1 min rate limit
                        setIsTokenRefreshing(true);
                        setLastTokenRefresh(now);
                        if (mode !== "mainnet") {
                          await Promise.all([refetchNative(), refetchEurc()]);
                        }
                        setTimeout(() => setIsTokenRefreshing(false), 500); // Visual spin
                      }}
                      style={{
                        background: "none", border: "none", cursor: "pointer",
                        color: "var(--text-muted)",
                        padding: 4, transition: "all 0.2s"
                      }}
                      title="Refresh Balances (Max 1/min)"
                    >
                      <RefreshCw size={16} className={isTokenRefreshing ? "animate-spin" : ""} style={{ opacity: isTokenRefreshing ? 0.5 : 1 }} />
                    </button>
                    <button onClick={() => { setShowTokenSelect(null); setTokenSearch(""); }} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: 20, padding: 4 }}>✕</button>
                  </div>
                </div>

                <div style={{ position: "relative" }}>
                  <input
                    type="text"
                    placeholder="Search by token name, token symbol or address"
                    value={tokenSearch}
                    onChange={(e) => setTokenSearch(e.target.value)}
                    style={{ width: "100%", padding: "14px 40px 14px 16px", borderRadius: 16, border: "1px solid var(--border)", background: "var(--bg-default)", color: "var(--text-primary)", fontSize: 14, outline: "none", fontWeight: 500 }}
                  />
                  <div style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }}>
                    <Search size={16} />
                  </div>
                </div>

                {/* Quick Select Pills */}
                {mode === "mainnet" && (
                  <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4, scrollbarWidth: "none" }}>
                    {(walletChainId === 4663 ? ["ETH", "WETH", "USDG", "USDe"] : ["USDC"]).map(sym => {
                      const tokenList = walletChainId === 4663 ? dynamicRobinhoodTokens : dynamicArcMainnetTokens;
                      const t = tokenList.find(rt => rt.symbol === sym);
                      if (!t) return null;
                      return (
                        <button key={sym} onClick={() => {
                          const usdcToken = tokenList.find((rt: any) => rt.symbol === "USDC");
                          if (showTokenSelect === "from") {
                            setLifiFromToken(t);
                            if (t.symbol !== "USDC") {
                              if (usdcToken) setLifiToToken(usdcToken);
                            } else if (lifiToToken?.symbol === "USDC") {
                              setLifiToToken(lifiFromToken);
                            }
                          } else if (showTokenSelect === "to") {
                            setLifiToToken(t);
                            if (t.symbol !== "USDC") {
                              if (usdcToken) setLifiFromToken(usdcToken);
                            } else if (lifiFromToken?.symbol === "USDC") {
                              setLifiFromToken(lifiToToken);
                            }
                          }
                          setShowTokenSelect(null);
                          setTokenSearch("");
                          setSwapAmount(""); txTrackerRef.current?.dismiss();
                        }}
                          style={{ display: "flex", alignItems: "center", gap: 6, background: "transparent", border: "1px solid var(--border-soft)", borderRadius: 12, padding: "6px 12px", cursor: "pointer", whiteSpace: "nowrap" }}
                          onMouseEnter={e => e.currentTarget.style.background = "var(--bg-default)"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                          <img src={t.logoURI} alt={sym} style={{ width: 16, height: 16, borderRadius: "50%" }} />
                          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>{sym}</span>
                        </button>
                      )
                    })}
                  </div>
                )}

                <div style={{ display: "flex", flexDirection: "column", flex: 1, overflowY: "auto", paddingRight: 4, gap: 4 }}>
                  {/* Render Custom Token if searched */}
                  {mode === "mainnet" && customTokenMeta && (
                    <button onClick={() => {
                      const targetMainnetChainId = walletChainId === 4663 ? 4663 : 5042;
                      const usdcToken = (targetMainnetChainId === 5042 ? dynamicArcMainnetTokens : dynamicRobinhoodTokens).find((rt: any) => rt.symbol === "USDC");
                      if (showTokenSelect === "from") {
                        setLifiFromToken(customTokenMeta);
                        if (usdcToken) setLifiToToken(usdcToken);
                      } else if (showTokenSelect === "to") {
                        setLifiToToken(customTokenMeta);
                        if (usdcToken) setLifiFromToken(usdcToken);
                      }
                      setShowTokenSelect(null);
                      setTokenSearch("");
                      setCustomTokenMeta(null);
                      setSwapAmount(""); txTrackerRef.current?.dismiss();
                    }}
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", borderRadius: 12,
                        background: "rgba(99, 102, 241, 0.1)", border: "1px solid rgba(99, 102, 241, 0.3)", cursor: "pointer", transition: "background 0.2s"
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = "rgba(99, 102, 241, 0.15)"; }}
                      onMouseLeave={e => { e.currentTarget.style.background = "rgba(99, 102, 241, 0.1)"; }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{ position: "relative" }}>
                          <img src={customTokenMeta.logoURI || `https://ui-avatars.com/api/?name=${customTokenMeta.symbol || "T"}&background=random&color=fff&rounded=true&font-size=0.45`} alt={customTokenMeta.symbol} style={{ width: 32, height: 32, borderRadius: "50%" }} onError={(e) => { e.currentTarget.src = "/globe.svg"; }} />
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ fontSize: 15, fontWeight: 800, color: "var(--text-primary)" }}>{customTokenMeta.symbol}</span>
                          </div>
                          <div style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 500 }}>{customTokenMeta.name}</div>
                        </div>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{customTokenMeta.balance ? Number(customTokenMeta.balance).toLocaleString(undefined, { maximumFractionDigits: 4 }) : "0"}</span>
                        <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 500 }}>{customTokenMeta.priceUsd ? `$${customTokenMeta.priceUsd.toFixed(customTokenMeta.priceUsd < 0.01 ? 6 : 2)}` : "$0.00"}</span>
                      </div>
                    </button>
                  )}

                  {(mode === "mainnet" ? (walletChainId === 4663 ? dynamicRobinhoodTokens : dynamicArcMainnetTokens) : [
                    { id: "USDC", label: "USD Coin", comingSoon: false, address: USDC_ADDRESS },
                    { id: "EURC", label: "Euro Coin", comingSoon: false, address: EURC_ADDRESS },
                    { id: "cirBTC", label: "Circular BTC", comingSoon: true, address: "" },
                  ]).filter(token => {
                    if (mode !== "mainnet") {
                      const asset = token as any;
                      let ctxChain: Chain | null = null;
                      if (showTokenSelect === "from" || showTokenSelect === "to") ctxChain = "Arc Testnet";
                      else if (showTokenSelect === "bridgeFrom") ctxChain = bridgeFromChain;
                      else if (showTokenSelect === "bridgeTo") ctxChain = bridgeToChain;
                      if (ctxChain && !CHAIN_TOKEN_MATRIX[ctxChain].includes(asset.id as Asset)) return false;
                    }
                    const t = token as any;
                    const search = tokenSearch.toLowerCase();
                    return (t.symbol || t.id)?.toLowerCase().includes(search) || t.address?.toLowerCase() === search;
                  }).sort((a, b) => {
                    if (mode !== "mainnet") return 0;
                    const aFiat = tokenBalances[(a as any).address]?.fiat || 0;
                    const bFiat = tokenBalances[(b as any).address]?.fiat || 0;
                    return bFiat - aFiat;
                  }).map(token => (
                    <button key={mode === "mainnet" ? (token as any).address : (token as any).id} onClick={() => {
                      if ((token as any).comingSoon) return;
                      if (mode === "mainnet") {
                        const targetMainnetChainId = walletChainId === 4663 ? 4663 : 5042;
                        const usdcToken = (targetMainnetChainId === 5042 ? dynamicArcMainnetTokens : dynamicRobinhoodTokens).find((rt: any) => rt.symbol === "USDC");
                        const t = token as any;
                        if (showTokenSelect === "from") {
                          setLifiFromToken(t);
                          if (t.symbol !== "USDC") {
                            if (usdcToken) setLifiToToken(usdcToken);
                          } else if (lifiToToken?.symbol === "USDC") {
                            setLifiToToken(lifiFromToken);
                          }
                        } else if (showTokenSelect === "to") {
                          setLifiToToken(t);
                          if (t.symbol !== "USDC") {
                            if (usdcToken) setLifiFromToken(usdcToken);
                          } else if (lifiFromToken?.symbol === "USDC") {
                            setLifiFromToken(lifiToToken);
                          }
                        }
                      } else {
                        const asset = (token as any).id as Asset;
                        if (showTokenSelect === "from") {
                          setSwapFrom(asset);
                          setSwapTo(asset === "USDC" ? "EURC" : "USDC");
                        } else if (showTokenSelect === "to") {
                          setSwapTo(asset);
                          setSwapFrom(asset === "USDC" ? "EURC" : "USDC");
                        } else if (showTokenSelect === "bridgeFrom" || showTokenSelect === "bridgeTo") {
                          setBridgeFromAsset(asset);
                          setBridgeToAsset(asset);
                        }
                      }
                      setShowTokenSelect(null);
                      setTokenSearch("");
                      setSwapAmount(""); txTrackerRef.current?.dismiss();
                    }}
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", borderRadius: 12,
                        background: "transparent", border: "1px solid transparent", cursor: (token as any).comingSoon ? "not-allowed" : "pointer", opacity: (token as any).comingSoon ? 0.5 : (mode === "mainnet" && (token as any).address === (showTokenSelect === "from" ? lifiFromToken?.address : lifiToToken?.address) ? 0.5 : 1), transition: "background 0.2s"
                      }}
                      onMouseEnter={e => { if (!(token as any).comingSoon) { e.currentTarget.style.background = "var(--border-soft)"; } }}
                      onMouseLeave={e => { if (!(token as any).comingSoon) { e.currentTarget.style.background = "transparent"; } }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{ position: "relative" }}>
                          <img src={(token as any).logoURI || TOKEN_LOGOS[(token as any).id] || `https://ui-avatars.com/api/?name=${(token as any).symbol || (token as any).id || "T"}&background=random&color=fff&rounded=true&font-size=0.45`} alt={(token as any).symbol || (token as any).id} style={{ width: 32, height: 32, borderRadius: "50%" }} onError={(e) => { e.currentTarget.src = "/globe.svg"; }} />
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ fontSize: 15, fontWeight: 800, color: "var(--text-primary)" }}>{(token as any).symbol || (token as any).id || "Unknown"}</span>
                          </div>
                          <div style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 500 }}>{(token as any).name || (token as any).label || "Unknown Token"}</div>
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        {!(token as any).comingSoon && (
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
                            <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>
                              {mode === "mainnet" ? (
                                isTokensLoading && !tokenBalances[(token as any).address] ? <Loader2 size={12} className="animate-spin" /> :
                                  tokenBalances[(token as any).address] ? (tokenBalances[(token as any).address].balance > 0 ? tokenBalances[(token as any).address].balance.toLocaleString(undefined, { maximumFractionDigits: 6 }) : "0") : "0"
                              ) : (
                                (token as any).id === "USDC" ? (nativeBalData ? (Number(nativeBalData.value) / 10 ** nativeBalData.decimals).toLocaleString(undefined, { maximumFractionDigits: 6 }) : "0") :
                                  (token as any).id === "EURC" ? (eurcBalRaw ? (Number(eurcBalRaw) / 10 ** Number(eurcDecimals)).toLocaleString(undefined, { maximumFractionDigits: 6 }) : "0") : "0"
                              )}
                            </span>
                            <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 500 }}>
                              {mode === "mainnet" ? (
                                isTokensLoading && !tokenBalances[(token as any).address] ? "" :
                                  tokenBalances[(token as any).address] && tokenBalances[(token as any).address].fiat > 0 ? `$${tokenBalances[(token as any).address].fiat.toFixed(4)}` : "$0.00"
                              ) : (
                                (token as any).id === "USDC" ? (nativeBalData ? `$${(Number(nativeBalData.value) / 10 ** nativeBalData.decimals).toFixed(2)}` : "$0.00") :
                                  (token as any).id === "EURC" ? (eurcBalRaw ? `€${(Number(eurcBalRaw) / 10 ** Number(eurcDecimals)).toFixed(2)}` : "€0.00") : "$0.00"
                              )}
                            </span>
                          </div>
                        )}
                        <div onClick={(e) => {
                          e.stopPropagation();
                          if ((token as any).address) {
                            const url = mode === "mainnet"
                              ? `https://etherscan.io/address/${(token as any).address}`
                              : `https://testnet.arcscan.app/token/${(token as any).address}`;
                            window.open(url, "_blank");
                          }
                        }}>
                          <Info size={14} color="var(--text-muted)" style={{ cursor: "pointer" }} />
                        </div>
                      </div>
                      {(token as any).comingSoon && (
                        <span style={{ fontSize: 11, fontWeight: 800, color: "var(--accent-red)", background: "rgba(179, 0, 0,0.15)", padding: "4px 10px", borderRadius: 8 }}>SOON</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </div>,
            document.body
          )}
        </div> {/* end main content */}


      </div>
    </>
  );
}

function StellarTrustlineAction({ stellarWallet, onVerify }: { stellarWallet: any, onVerify: () => Promise<void> }) {
  const [isSigning, setIsSigning] = React.useState(false);
  const [err, setErr] = React.useState("");
  const [success, setSuccess] = React.useState(false);

  const getFriendlyError = (code: string) => {
    if (code.includes("ERR_STELLAR_ACCOUNT_NOT_FOUND")) return "Destination Stellar account does not exist.";
    if (code.includes("ERR_STELLAR_INSUFFICIENT_XLM")) return "Insufficient XLM to establish a trustline. Minimum 1.5 XLM required.";
    if (code.includes("ERR_STELLAR_UNAUTHORIZED_TRUSTLINE")) return "Wallet is not authorized to hold this asset.";
    if (code.includes("ERR_STELLAR_MISSING_TRUSTLINE")) return "Destination wallet is missing a USDC trustline.";
    if (code.includes("ERR_TRANSACTION_EXPIRED")) return "Transaction expired. Please approve faster in Freighter.";
    if (code.includes("ERR_USER_REJECTED")) return "Transaction rejected by user.";
    if (code.includes("ERR_TRANSACTION_FAILED")) return "Transaction failed on the Stellar network.";
    if (code.includes("ERR_NETWORK_UNAVAILABLE")) return "Unable to connect to the Stellar network.";
    return code;
  };

  const handleAdd = async () => {
    try {
      setIsSigning(true);
      setErr("");

      const horizon = new Horizon.Server("https://horizon-testnet.stellar.org");
      let accountRes;
      try {
        accountRes = await horizon.loadAccount(stellarWallet.address);
      } catch (e: any) {
        if (e?.response?.status === 404) {
          throw new Error("ERR_STELLAR_ACCOUNT_NOT_FOUND");
        }
        throw e;
      }

      const nativeAsset = accountRes.balances.find(b => b.asset_type === "native");
      const nativeBalance = nativeAsset ? Number(nativeAsset.balance) : 0;
      const sellingLiabilities = nativeAsset && "selling_liabilities" in nativeAsset ? Number(nativeAsset.selling_liabilities || 0) : 0;

      const requiredReserve = (2 + (accountRes.subentry_count || 0) + 1) * 0.5;

      if ((nativeBalance - sellingLiabilities) < requiredReserve) {
        setErr("ERR_STELLAR_INSUFFICIENT_XLM");
        setIsSigning(false);
        return;
      }

      const usdcIssuer = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
      const usdcAsset = new StellarAsset("USDC", usdcIssuer);

      const feeStats = await horizon.feeStats();
      const recommendedFee = feeStats?.fee_charged?.p90 || "10000";

      const sourceAccount = new Account(stellarWallet.address, accountRes.sequence);
      const tx = new TransactionBuilder(sourceAccount, {
        fee: String(recommendedFee),
        networkPassphrase: Networks.TESTNET,
      })
        .addOperation(Operation.changeTrust({ asset: usdcAsset }))
        .setTimeout(300)
        .build();

      const xdr = tx.toXDR();
      const signedXdr = await stellarWallet.signTransaction(xdr);

      if (!signedXdr) {
        setErr("ERR_USER_REJECTED");
        setIsSigning(false);
        return;
      }

      const signedTx = TransactionBuilder.fromXDR(signedXdr, Networks.TESTNET);
      const result = await horizon.submitTransaction(signedTx);

      if (result.successful) {
        setSuccess(true);
        setTimeout(() => {
          onVerify();
        }, 3000);
      }
    } catch (e: any) {
      console.error(e);
      let errMsg = "ERR_TRANSACTION_FAILED";
      if (e?.response?.data?.extras?.result_codes) {
        const codes = e.response.data.extras.result_codes;
        if (codes.transaction === "tx_too_late") {
          errMsg = "ERR_TRANSACTION_EXPIRED";
        } else if (codes.operations && codes.operations.includes("op_no_trust")) {
          errMsg = "ERR_STELLAR_MISSING_TRUSTLINE";
        } else if (codes.operations && codes.operations.includes("op_not_authorized")) {
          errMsg = "ERR_STELLAR_UNAUTHORIZED_TRUSTLINE";
        } else if (codes.operations && codes.operations.includes("op_no_account")) {
          errMsg = "ERR_STELLAR_ACCOUNT_NOT_FOUND";
        }
      }
      setErr(errMsg);
    } finally {
      setIsSigning(false);
    }
  };

  return (
    <div style={{ padding: "16px", background: "rgba(220,38,38,0.04)", border: "1px solid rgba(220,38,38,0.15)", borderRadius: 12, marginBottom: 16 }}>
      <h4 style={{ margin: "0 0 8px 0", color: "#dc2626", fontSize: 14 }}>USDC Trustline Missing</h4>
      <p style={{ margin: "0 0 16px 0", fontSize: 12, color: "var(--text-primary)", lineHeight: 1.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        Authorize wallet to receive bridged USDC.
      </p>

      {err && <div style={{ color: "#dc2626", fontSize: 12, marginBottom: 12, fontWeight: 500 }}>{getFriendlyError(err)}</div>}
      {success && <div style={{ color: "#10b981", fontSize: 12, marginBottom: 12, fontWeight: 600 }}>✓ Trustline added! Verifying...</div>}

      {!success && (
        <button
          onClick={handleAdd}
          disabled={isSigning}
          className="cyber-button swap-action-btn"
          style={{ width: "100%", padding: "10px", minHeight: 40, fontSize: 13 }}
        >
          {isSigning ? "Signing..." : "Add USDC Trustline"}
        </button>
      )}
    </div>
  );
}
