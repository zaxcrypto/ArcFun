import { Chain } from "viem";

export const arcMainnet = {
  id: 5042,
  name: "Arc Mainnet",
  nativeCurrency: { decimals: 18, name: "ETH", symbol: "ETH" },
  rpcUrls: {
    default: { http: ["https://arc-mainnet.infura.io/v3/b6bf7d3508c941499b10025c0776eaf8"] },
    public: { http: ["https://arc-mainnet.infura.io/v3/b6bf7d3508c941499b10025c0776eaf8"] },
  },
  blockExplorers: {
    default: { name: "Blockscout", url: "https://arc-mainnet.cloud.blockscout.com" },
  },
} as const satisfies Chain;

export const sonicTestnet = {
  id: 14601,
  name: "Sonic Testnet",
  nativeCurrency: { decimals: 18, name: "Sonic", symbol: "S" },
  rpcUrls: {
    default: { http: ["https://rpc.testnet.soniclabs.com"] },
    public: { http: ["https://rpc.testnet.soniclabs.com"] },
  },
} as const satisfies Chain;

export const monadTestnet = {
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: { decimals: 18, name: "MON", symbol: "MON" },
  rpcUrls: {
    default: { http: [process.env.NEXT_PUBLIC_MONAD_TESTNET_RPC_URL || "https://testnet-rpc.monad.xyz"] },
    public: { http: [process.env.NEXT_PUBLIC_MONAD_TESTNET_RPC_URL || "https://testnet-rpc.monad.xyz"] },
  },
} as const satisfies Chain;

export const unichainSepolia = {
  id: 1301,
  name: "Unichain Sepolia",
  nativeCurrency: { decimals: 18, name: "ETH", symbol: "ETH" },
  rpcUrls: {
    default: { http: ["https://sepolia.unichain.org"] },
    public: { http: ["https://sepolia.unichain.org"] },
  },
} as const satisfies Chain;

export const inkSepolia = {
  id: 763373,
  name: "Ink Testnet",
  nativeCurrency: { decimals: 18, name: "ETH", symbol: "ETH" },
  rpcUrls: {
    default: { http: ["https://rpc-gel-sepolia.inkonchain.com"] },
    public: { http: ["https://rpc-gel-sepolia.inkonchain.com"] },
  },
} as const satisfies Chain;

export const injectiveTestnet = {
  id: 1439,
  name: "Injective EVM Testnet",
  nativeCurrency: { decimals: 18, name: "INJ", symbol: "INJ" },
  rpcUrls: {
    default: { http: ["https://k8s.testnet.json-rpc.injective.network/", "https://injectiveevm-testnet-rpc.polkachu.com"] },
    public: { http: ["https://k8s.testnet.json-rpc.injective.network/", "https://injectiveevm-testnet-rpc.polkachu.com"] },
  },
} as const satisfies Chain;

export const hyperEVMTestnet = {
  id: 998,
  name: "HyperEVM Testnet",
  nativeCurrency: { decimals: 18, name: "HYPE", symbol: "HYPE" },
  rpcUrls: {
    default: { http: ["https://rpc.hyperliquid-testnet.xyz/evm"] },
    public: { http: ["https://rpc.hyperliquid-testnet.xyz/evm"] },
  },
} as const satisfies Chain;

export const robinhoodChain = {
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { decimals: 18, name: "ETH", symbol: "ETH" },
  rpcUrls: {
    default: { http: ["https://rpc.mainnet.chain.robinhood.com", "https://robinhoodchain.blockscout.com/api/eth-rpc"] },
    public: { http: ["https://rpc.mainnet.chain.robinhood.com", "https://robinhoodchain.blockscout.com/api/eth-rpc"] },
  },
  blockExplorers: {
    default: { name: "Blockscout", url: "https://robinhoodchain.blockscout.com" },
  },
} as const satisfies Chain;

export const giwaSepolia = {
  id: 91342,
  name: "GIWA Sepolia",
  iconUrl: "/giwa-testnet.svg",
  nativeCurrency: { decimals: 18, name: "ETH", symbol: "ETH" },
  rpcUrls: {
    default: { http: ["https://sepolia-rpc.giwa.io"] },
    public: { http: ["https://sepolia-rpc.giwa.io"] },
  },
  blockExplorers: {
    default: { name: "GiwaScan", url: "https://sepolia-explorer.giwa.io" },
  },
} as const;

export const polygonAmoy = {
  id: 80002,
  name: "Polygon Amoy Testnet",
  nativeCurrency: { decimals: 18, name: "Polygon", symbol: "POL" },
  rpcUrls: {
    default: { http: [process.env.NEXT_PUBLIC_POLYGON_AMOY_RPC_URL || "https://rpc-amoy.polygon.technology", "https://polygon-amoy-bor-rpc.publicnode.com", "https://polygon-amoy.drpc.org", "https://rpc-amoy.polygon.technology/"] },
    public: { http: [process.env.NEXT_PUBLIC_POLYGON_AMOY_RPC_URL || "https://rpc-amoy.polygon.technology", "https://polygon-amoy-bor-rpc.publicnode.com", "https://polygon-amoy.drpc.org", "https://rpc-amoy.polygon.technology/"] },
  },
  blockExplorers: {
    default: { name: "PolygonScan", url: "https://amoy.polygonscan.com" },
  },
} as const satisfies Chain;

export const xLayerTestnet = {
  id: 1952,
  name: "X Layer Testnet",
  nativeCurrency: { decimals: 18, name: "OKB", symbol: "OKB" },
  rpcUrls: {
    default: { http: [process.env.NEXT_PUBLIC_XLAYER_TESTNET_RPC_URL || "https://testrpc.xlayer.tech"] },
    public: { http: [process.env.NEXT_PUBLIC_XLAYER_TESTNET_RPC_URL || "https://testrpc.xlayer.tech"] },
  },
  blockExplorers: {
    default: { name: "OKX Explorer", url: "https://www.okx.com/web3/explorer/xlayer-test" },
  },
} as const satisfies Chain;

