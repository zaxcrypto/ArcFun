export function getEvmFallbacks(chainName: string): string[] {
  const blockscoutKey = process.env.NEXT_PUBLIC_BLOCKSCOUT_API_KEY || process.env.NEXT_PUBLIC_ARC_API_KEY || "";
  const fallbacks: Record<string, string[]> = {
    "Arc Testnet": [
      process.env.NEXT_PUBLIC_ARC_TESTNET_RPC_URL || "https://5042002.rpc.thirdweb.com",
      "https://5042002.rpc.thirdweb.com", // Thirdweb Fallback (verified 600ms)
    ],
    "Arc Mainnet": [
      process.env.NEXT_PUBLIC_ARC_MAINNET_RPC_URL || "https://rpc.arc.io",
      "https://arc-mainnet.infura.io/v3/b6bf7d3508c941499b10025c0776eaf8",
      "https://mainnet.arc.network"
    ],
    "Ethereum Sepolia": [
      process.env.NEXT_PUBLIC_ETH_SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com",
      "https://ethereum-sepolia-rpc.publicnode.com",
      "https://rpc.sepolia.org",
      `https://eth-sepolia.blockscout.com/api/eth-rpc?apikey=${blockscoutKey}`
    ],
    "Arbitrum Sepolia": [
      process.env.NEXT_PUBLIC_ARB_SEPOLIA_RPC_URL || "https://sepolia.arbitrum.io/rpc", // Alchemy Primary
      "https://sepolia-rollup.arbitrum.io/rpc", // Official Arbitrum
      "https://arbitrum-sepolia-rpc.publicnode.com",
    ],
    "Base Sepolia": [
      process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org", // Alchemy Primary
      "https://sepolia.base.org", // Official
      "https://base-sepolia-rpc.publicnode.com",
    ],
    "Base Mainnet": [
      process.env.NEXT_PUBLIC_BASE_MAINNET_RPC_URL || "https://mainnet.base.org", // Alchemy Primary
      "https://mainnet.base.org",
      "https://base-rpc.publicnode.com"
    ],
    "Arbitrum Mainnet": [
      process.env.NEXT_PUBLIC_ARB_MAINNET_RPC_URL || "https://arb1.arbitrum.io/rpc", // Alchemy Primary
      "https://arb1.arbitrum.io/rpc",                                // Official Arbitrum
      "https://arbitrum-one.publicnode.com"                          // PublicNode fallback
    ],
    "HyperEVM Testnet": [
      process.env.NEXT_PUBLIC_HYPEREVM_TESTNET_RPC_URL || "https://rpc.hyperliquid-testnet.xyz/evm",
      "https://rpc.hyperliquid-testnet.xyz/evm"
    ],
    "Injective EVM Testnet": [
      process.env.NEXT_PUBLIC_INJECTIVE_TESTNET_RPC_URL || "https://k8s.testnet.json-rpc.injective.network/",
      "https://injectiveevm-testnet-rpc.polkachu.com"
    ],
    "Ink Sepolia": [
      process.env.NEXT_PUBLIC_INK_SEPOLIA_RPC_URL || "https://rpc-gel-sepolia.inkonchain.com", // Alchemy Primary
      "https://rpc-gel-sepolia.inkonchain.com", // Official
    ],
    "Linea Sepolia": [
      process.env.NEXT_PUBLIC_LINEA_SEPOLIA_RPC_URL || "https://rpc.sepolia.linea.build", // Alchemy Primary
      "https://rpc.sepolia.linea.build"
    ],
    "Monad Testnet": [
      process.env.NEXT_PUBLIC_MONAD_TESTNET_RPC_URL || "https://testnet-rpc.monad.xyz", // Alchemy Primary
      "https://testnet-rpc.monad.xyz"
    ],
    "Sonic Testnet": [
      process.env.NEXT_PUBLIC_SONIC_TESTNET_RPC_URL || "https://rpc.blaze.soniclabs.com", // Alchemy Primary
      "https://rpc.testnet.soniclabs.com"
    ],
    "Unichain Sepolia": [
      process.env.NEXT_PUBLIC_UNICHAIN_SEPOLIA_RPC_URL || "https://sepolia.unichain.org", // Alchemy Primary
      "https://unichain-sepolia-rpc.publicnode.com",
      "https://sepolia.unichain.org",
    ],
    "Optimism Sepolia": [
      process.env.NEXT_PUBLIC_OP_SEPOLIA_RPC_URL || "https://sepolia.optimism.io", // Alchemy Primary
      "https://sepolia.optimism.io",
      "https://optimism-sepolia-rpc.publicnode.com",
    ],
    "Avalanche Fuji": [
      process.env.NEXT_PUBLIC_AVALANCHE_FUJI_RPC_URL || "https://api.avax-test.network/ext/bc/C/rpc", // Alchemy Primary
      "https://api.avax-test.network/ext/bc/C/rpc",
    ],
    "Polygon Amoy Testnet": [
      process.env.NEXT_PUBLIC_POLYGON_AMOY_RPC_URL || "https://rpc-amoy.polygon.technology",
      "https://polygon-amoy-bor-rpc.publicnode.com"
    ],
    "X Layer Testnet": [
      process.env.NEXT_PUBLIC_XLAYER_TESTNET_RPC_URL || "https://testrpc.xlayer.tech"
    ]
  };
  return fallbacks[chainName] || [];
}

/**
 * Executes an EVM operation using the primary RPC (Alchemy) first.
 * If it fails, times out, or rate limits, it automatically retries with Official RPC, then Blockscout RPC.
 */
export async function withEvmFailover<T>(
  chainName: string,
  primaryRpc: string,
  operation: (rpcUrl: string) => Promise<T>,
  context: string = "EVM RPC Operation"
): Promise<T> {
  try {
    return await operation(primaryRpc);
  } catch (error) {
    console.warn(`[EVM RPC Failover] ${context} failed on primary RPC (${primaryRpc}).`, error);

    const fallbacks = getEvmFallbacks(chainName).filter(rpc => rpc && rpc !== primaryRpc && !rpc.includes("apikey=")); // wait, apikey='' is fine but let's just filter out same as primary

    // We actually DO want to allow blockscout even if apikey is empty, blockscout allows some free requests
    const validFallbacks = getEvmFallbacks(chainName).filter(rpc => rpc && rpc !== primaryRpc);

    if (validFallbacks.length === 0) {
      console.warn(`[EVM RPC Failover] No distinct fallback available for ${chainName}.`);
      throw error;
    }

    let lastError = error;
    for (let i = 0; i < validFallbacks.length; i++) {
      const fallbackRpc = validFallbacks[i];
      (process.env.NODE_ENV === "development" ? console.log : () => { })(`[EVM RPC Failover] Retrying with fallback RPC ${i + 1}/${validFallbacks.length} (${fallbackRpc.split('?')[0]})...`);
      try {
        return await operation(fallbackRpc);
      } catch (fallbackError) {
        console.warn(`[EVM RPC Failover] ${context} failed on fallback RPC ${i + 1}.`, fallbackError);
        lastError = fallbackError;
      }
    }

    console.error(`[EVM RPC Failover] ${context} failed on all available RPCs for ${chainName}.`);
    throw lastError;
  }
}

/**
 * Triggers wallet_addEthereumChain to update Arc Testnet RPC URL inside Rabby / MetaMask
 * replacing any dead rpc.testnet.arc.network with active Alchemy endpoints.
 */
export async function syncArcTestnetRpcInWallet(): Promise<boolean> {
  if (typeof window === "undefined" || !(window as any).ethereum) return false;
  try {
    await (window as any).ethereum.request({
      method: "wallet_addEthereumChain",
      params: [{
        chainId: "0x4cf052", // 5042002 in hex
        chainName: "Arc Testnet",
        nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
        rpcUrls: [
          process.env.NEXT_PUBLIC_ARC_TESTNET_RPC_URL || "https://5042002.rpc.thirdweb.com",
          "https://5042002.rpc.thirdweb.com"
        ],
        blockExplorerUrls: ["https://testnet.arcscan.app"]
      }]
    });
    return true;
  } catch (err) {
    console.warn("syncArcTestnetRpcInWallet error:", err);
    return false;
  }
}
