import { type Chain } from "viem";

export const arcTestnet = {
  id: 5042002,
  name: "Arc Testnet",
  iconUrl: "/arc-logo.png",
  nativeCurrency: {
    decimals: 18,
    name: "USDC",
    symbol: "USDC",
  },
  rpcUrls: {
    default: { http: [process.env.NEXT_PUBLIC_ARC_TESTNET_RPC_URL || "https://5042002.rpc.thirdweb.com"] },
    public: { http: [process.env.NEXT_PUBLIC_ARC_TESTNET_RPC_URL || "https://5042002.rpc.thirdweb.com"] },
  },
  blockExplorers: {
    default: { name: "ArcScan", url: "https://testnet.arcscan.app" },
  },
  contracts: {
    multicall3: {
      address: "0xcA11bde05977b3631167028862bE2a173976CA11",
    },
  },
  testnet: true,
} as const;
