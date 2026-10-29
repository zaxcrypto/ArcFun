/**
 * Chain Registry
 * 
 * Centralized registry for all supported chains. 
 * Prevents hardcoding of networks in UI and validation logic.
 */

import { isMainnetChain, isTestnetChain } from "@/config/swap-contract";

export type ChainStatus = "ACTIVE" | "MAINTENANCE" | "DISABLED";

export interface ChainConfig {
  name: string;
  chainId: number;
  rpcUrl: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  status: ChainStatus;
}

export class ChainRegistry {
  private static chains: Map<string, ChainConfig> = new Map([
    // Testnet Chains - L1 Chains (Top)
    ["Arc Testnet", { name: "Arc Testnet", chainId: 5042002, rpcUrl: (process.env.NEXT_PUBLIC_ARC_TESTNET_RPC_URL || "https://5042002.rpc.thirdweb.com"), nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 }, status: "ACTIVE" }],
    ["Ethereum Sepolia", { name: "Ethereum Sepolia", chainId: 11155111, rpcUrl: process.env.NEXT_PUBLIC_ETH_SEPOLIA_RPC_URL || process.env.ETH_SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com", nativeCurrency: { name: "Ethereum", symbol: "ETH", decimals: 18 }, status: "ACTIVE" }],
    ["Solana Devnet", { name: "Solana Devnet", chainId: 0, rpcUrl: process.env.NEXT_PUBLIC_SOLANA_RPC_URL || process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com", nativeCurrency: { name: "Solana", symbol: "SOL", decimals: 9 }, status: "ACTIVE" }],
    ["Sui Testnet", { name: "Sui Testnet", chainId: 0, rpcUrl: process.env.NEXT_PUBLIC_SUI_RPC_URL || "https://fullnode.testnet.sui.io:443", nativeCurrency: { name: "Sui", symbol: "SUI", decimals: 9 }, status: "ACTIVE" }],
    ["Avalanche Fuji", { name: "Avalanche Fuji", chainId: 43113, rpcUrl: process.env.NEXT_PUBLIC_AVALANCHE_FUJI_RPC_URL || "https://api.avax-test.network/ext/bc/C/rpc", nativeCurrency: { name: "Avalanche", symbol: "AVAX", decimals: 18 }, status: "ACTIVE" }],
    ["Monad Testnet", { name: "Monad Testnet", chainId: 10143, rpcUrl: process.env.NEXT_PUBLIC_MONAD_TESTNET_RPC_URL || process.env.MONAD_TESTNET_RPC_URL || "https://testnet-rpc.monad.xyz" || "https://testnet-rpc.monad.xyz", nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 }, status: "ACTIVE" }],
    ["Sonic Testnet", { name: "Sonic Testnet", chainId: 14601, rpcUrl: process.env.NEXT_PUBLIC_SONIC_TESTNET_RPC_URL || "https://rpc.testnet.soniclabs.com", nativeCurrency: { name: "Sonic", symbol: "S", decimals: 18 }, status: "ACTIVE" }],
    ["HyperEVM Testnet", { name: "HyperEVM Testnet", chainId: 998, rpcUrl: process.env.NEXT_PUBLIC_HYPEREVM_TESTNET_RPC_URL || "https://rpc.hyperliquid-testnet.xyz/evm", nativeCurrency: { name: "Hyper", symbol: "HYPE", decimals: 18 }, status: "ACTIVE" }],
    ["Injective EVM Testnet", { name: "Injective EVM Testnet", chainId: 1439, rpcUrl: process.env.NEXT_PUBLIC_INJECTIVE_TESTNET_RPC_URL || "https://k8s.testnet.json-rpc.injective.network/", nativeCurrency: { name: "Injective", symbol: "INJ", decimals: 18 }, status: "ACTIVE" }],
    ["Stellar Testnet", { name: "Stellar Testnet", chainId: 0, rpcUrl: process.env.NEXT_PUBLIC_STELLAR_RPC_URL || "https://stellar-testnet.g.alchemy.com/v2/Vt9_fvDipTI7hEZdMc950", nativeCurrency: { name: "Lumen", symbol: "XLM", decimals: 7 }, status: "ACTIVE" }],
    
    // Testnet Chains - L2 Chains (Rollups)
    ["Arbitrum Sepolia", { name: "Arbitrum Sepolia", chainId: 421614, rpcUrl: process.env.NEXT_PUBLIC_ARB_SEPOLIA_RPC_URL || "https://sepolia-rollup.arbitrum.io/rpc", nativeCurrency: { name: "Ethereum", symbol: "ETH", decimals: 18 }, status: "ACTIVE" }],
    ["Base Sepolia", { name: "Base Sepolia", chainId: 84532, rpcUrl: process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org", nativeCurrency: { name: "Ethereum", symbol: "ETH", decimals: 18 }, status: "ACTIVE" }],
    ["Optimism Sepolia", { name: "Optimism Sepolia", chainId: 11155420, rpcUrl: process.env.NEXT_PUBLIC_OP_SEPOLIA_RPC_URL || "https://sepolia.optimism.io", nativeCurrency: { name: "Ethereum", symbol: "ETH", decimals: 18 }, status: "ACTIVE" }],
    ["Ink Sepolia", { name: "Ink Sepolia", chainId: 763373, rpcUrl: process.env.NEXT_PUBLIC_INK_SEPOLIA_RPC_URL || process.env.INK_SEPOLIA_RPC_URL || "https://rpc-gel-sepolia.inkonchain.com", nativeCurrency: { name: "Ethereum", symbol: "ETH", decimals: 18 }, status: "ACTIVE" }],
    ["Linea Sepolia", { name: "Linea Sepolia", chainId: 59141, rpcUrl: process.env.NEXT_PUBLIC_LINEA_SEPOLIA_RPC_URL || process.env.LINEA_SEPOLIA_RPC_URL || "https://rpc.sepolia.linea.build", nativeCurrency: { name: "Ethereum", symbol: "ETH", decimals: 18 }, status: "ACTIVE" }],
    ["Unichain Sepolia", { name: "Unichain Sepolia", chainId: 1301, rpcUrl: process.env.NEXT_PUBLIC_UNICHAIN_SEPOLIA_RPC_URL || process.env.UNICHAIN_SEPOLIA_RPC_URL || "https://sepolia.unichain.org", nativeCurrency: { name: "Ethereum", symbol: "ETH", decimals: 18 }, status: "ACTIVE" }],
    ["X Layer Testnet", { name: "X Layer Testnet", chainId: 1952, rpcUrl: process.env.NEXT_PUBLIC_XLAYER_TESTNET_RPC_URL || "https://testrpc.xlayer.tech", nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 }, status: "ACTIVE" }],
    ["Polygon Amoy Testnet", { name: "Polygon Amoy Testnet", chainId: 80002, rpcUrl: process.env.NEXT_PUBLIC_POLYGON_AMOY_RPC_URL || "https://rpc-amoy.polygon.technology", nativeCurrency: { name: "Polygon", symbol: "POL", decimals: 18 }, status: "ACTIVE" }],
    
    // Mainnet Chains
    ["Arc Mainnet", { name: "Arc Mainnet", chainId: 5042, rpcUrl: process.env.NEXT_PUBLIC_ARC_MAINNET_RPC_URL || process.env.ARC_MAINNET_RPC_URL || "https://rpc.arc.io", nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 }, status: "ACTIVE" }],
    ["Base Mainnet", { name: "Base Mainnet", chainId: 8453, rpcUrl: process.env.NEXT_PUBLIC_BASE_MAINNET_RPC_URL || "https://mainnet.base.org", nativeCurrency: { name: "Ethereum", symbol: "ETH", decimals: 18 }, status: "ACTIVE" }],
    ["Arbitrum Mainnet", { name: "Arbitrum Mainnet", chainId: 42161, rpcUrl: process.env.NEXT_PUBLIC_ARB_MAINNET_RPC_URL || "https://arb1.arbitrum.io/rpc", nativeCurrency: { name: "Ethereum", symbol: "ETH", decimals: 18 }, status: "ACTIVE" }],
  ]);

  /** Retrieves active chains for UI dropdowns, strictly isolated by environment */
  static getActiveChains(mode?: "testnet" | "mainnet"): ChainConfig[] {
    const active = Array.from(this.chains.values()).filter(c => c.status === "ACTIVE");
    if (!mode) return active;
    if (mode === "mainnet") {
      return active.filter(c => isMainnetChain(c.name));
    }
    return active.filter(c => isTestnetChain(c.name));
  }

  /** (Admin) Retrieves all chains regardless of status */
  static getAllChainsAdmin(): ChainConfig[] {
    return Array.from(this.chains.values());
  }

  /** Gets the explorer transaction URL for a given chain */
  static getExplorerTxUrl(chainName: string, txHash: string): string | null {
    switch (chainName) {
      case "Arc":
      case "Arc Mainnet": return `https://explorer.arc.io/tx/${txHash}`;
      case "Base Mainnet": return `https://basescan.org/tx/${txHash}`;
      case "Arbitrum Mainnet": return `https://arbiscan.io/tx/${txHash}`;
      case "Robinhood Mainnet": return `https://robinhoodchain.blockscout.com/tx/${txHash}`;
      case "ARC-TESTNET":
      case "Arc Testnet": return `https://testnet.arcscan.app/tx/${txHash}`;
      case "ETH-SEPOLIA":
      case "Ethereum Sepolia": return `https://sepolia.etherscan.io/tx/${txHash}`;
      case "Arbitrum Sepolia": return `https://sepolia.arbiscan.io/tx/${txHash}`;
      case "Base Sepolia": return `https://sepolia.basescan.org/tx/${txHash}`;
      case "Polygon Amoy Testnet": return `https://amoy.polygonscan.com/tx/${txHash}`;
      case "X Layer Testnet": return `https://web3.okx.com/explorer/x-layer-testnet/tx/${txHash}`;
      case "Sui Testnet": return `https://suiscan.xyz/testnet/tx/${txHash}`;
      case "HyperEVM Testnet": return null; // No public explorer available yet
      case "Injective EVM Testnet": return `https://testnet.explorer.injective.network/transaction/${txHash}`;
      case "Ink Sepolia": return `https://explorer-sepolia.inkonchain.com/tx/${txHash}`;
      case "Linea Sepolia": return `https://sepolia.lineascan.build/tx/${txHash}`;
      case "Monad Testnet": return `https://testnet.monadexplorer.com/tx/${txHash}`;
      case "Sonic Testnet": return `https://testnet.sonicscan.org/tx/${txHash}`;
      case "SOL-DEVNET":
      case "Solana Devnet": return `https://explorer.solana.com/tx/${txHash}?cluster=devnet`;
      case "SOL":
      case "Solana Mainnet": 
      case "Solana": return `https://explorer.solana.com/tx/${txHash}`;
      case "Unichain Sepolia": return `https://sepolia.uniscan.xyz/tx/${txHash}`;
      case "Optimism Sepolia": return `https://sepolia-optimism.etherscan.io/tx/${txHash}`;
      case "Avalanche Fuji": return `https://testnet.snowtrace.io/tx/${txHash}`;
      default: return `https://sepolia.etherscan.io/tx/${txHash}`;
    }
  }

  /** Retrieves chain config by exact name */
  static getChain(name: string): ChainConfig {
    const chain = this.chains.get(name);
    if (!chain) throw new Error(`Chain ${name} is not registered.`);
    return chain;
  }

  /** Retrieves chain config safely without throwing */
  static getChainSafe(name: string | undefined | null): ChainConfig | undefined {
    if (!name) return undefined;
    return this.chains.get(name);
  }

  /** (Admin) Updates the status of a specific chain */
  static updateChainStatus(name: string, status: ChainStatus): void {
    const chain = this.chains.get(name);
    if (chain) chain.status = status;
  }
}
