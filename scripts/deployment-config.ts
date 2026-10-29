import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

export interface NetworkConfig {
  name: string;
  chainId: number;
  rpcUrl: string;
  explorerUrl: string;
  usdcAddress: string;
  eurcAddress: string;
}

export const NETWORKS: Record<string, NetworkConfig> = {
  arc_testnet: {
    name: "Arc Testnet",
    chainId: 5042002,
    rpcUrl: process.env.ARC_RPC_URL || "https://5042002.rpc.thirdweb.com",
    explorerUrl: "https://testnet.arcscan.app/",
    usdcAddress: "0x3600000000000000000000000000000000000000",
    eurcAddress: process.env.ARC_EURC_ADDRESS || "",
  },
  sepolia: {
    name: "Ethereum Sepolia",
    chainId: 11155111,
    rpcUrl: process.env.SEPOLIA_RPC_URL || "",
    explorerUrl: "https://sepolia.etherscan.io",
    usdcAddress: process.env.SEPOLIA_USDC_ADDRESS || "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
    eurcAddress: process.env.SEPOLIA_EURC_ADDRESS || "0x08210F9170F89Ab7658F0B5E3fF39b0E03C2Bef9",
  },
  base_sepolia: {
    name: "Base Sepolia",
    chainId: 84532,
    rpcUrl: process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org",
    explorerUrl: "https://sepolia.basescan.org",
    usdcAddress: process.env.BASE_USDC_ADDRESS || "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    eurcAddress: process.env.BASE_EURC_ADDRESS || "0x808456652fdb597867d38b17B2D67AFaF59c04CE",
  },
  arbitrum_sepolia: {
    name: "Arbitrum Sepolia",
    chainId: 421614,
    rpcUrl: process.env.ARBITRUM_SEPOLIA_RPC_URL || "https://sepolia-rollup.arbitrum.io/rpc",
    explorerUrl: "https://sepolia.arbiscan.io",
    usdcAddress: process.env.ARB_USDC_ADDRESS || "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
    eurcAddress: process.env.ARB_EURC_ADDRESS || "",
  },
  avalanche_fuji: {
    name: "Avalanche Fuji",
    chainId: 43113,
    rpcUrl: process.env.AVAX_RPC_URL || "https://api.avax-test.network/ext/bc/C/rpc",
    explorerUrl: "https://testnet.snowtrace.io",
    usdcAddress: process.env.AVAX_USDC_ADDRESS || "0x5425890298aed601595a70AB815c96711a31Bc65",
    eurcAddress: process.env.AVAX_EURC_ADDRESS || "",
  },
  monad_testnet: {
    name: "Monad Testnet",
    chainId: 10143,
    rpcUrl: process.env.MONAD_RPC_URL || "https://testnet-rpc.monad.xyz",
    explorerUrl: "https://testnet.monadexplorer.com",
    usdcAddress: process.env.MONAD_USDC_ADDRESS || "",
    eurcAddress: process.env.MONAD_EURC_ADDRESS || "",
  },
  ink_sepolia: {
    name: "Ink Sepolia",
    chainId: 763373,
    rpcUrl: process.env.INK_RPC_URL || "https://rpc-gel-sepolia.inkonchain.com",
    explorerUrl: "https://explorer-sepolia.inkonchain.com",
    usdcAddress: process.env.INK_USDC_ADDRESS || "",
    eurcAddress: process.env.INK_EURC_ADDRESS || "",
  },
  linea_sepolia: {
    name: "Linea Sepolia",
    chainId: 59141,
    rpcUrl: process.env.LINEA_RPC_URL || "https://rpc.sepolia.linea.build",
    explorerUrl: "https://sepolia.lineascan.build",
    usdcAddress: process.env.LINEA_USDC_ADDRESS || "",
    eurcAddress: process.env.LINEA_EURC_ADDRESS || "",
  },
  unichain_sepolia: {
    name: "Unichain Sepolia",
    chainId: 1301,
    rpcUrl: process.env.UNICHAIN_RPC_URL || "https://sepolia.unichain.org",
    explorerUrl: "https://unichain-sepolia.blockscout.com",
    usdcAddress: process.env.UNICHAIN_USDC_ADDRESS || "",
    eurcAddress: process.env.UNICHAIN_EURC_ADDRESS || "",
  },
};

export const DEPLOYMENT_CONFIG = {
  ADMIN_MULTISIG: process.env.ADMIN_ADDRESS || "",
  KMS_SIGNER_ADDRESS: process.env.KMS_SIGNER_ADDRESS || "",
  MAX_RELEASE_PER_DAY: (ethers: any) => ethers.parseUnits("1000000", 6), // 1M USDC daily limit
};

export function getNetworkConfig(networkName: string): NetworkConfig {
  const config = NETWORKS[networkName];
  if (!config) {
    throw new Error(
      `Network '${networkName}' not configured in deployment-config.ts.\n` +
      `Available networks: ${Object.keys(NETWORKS).join(", ")}`
    );
  }
  return config;
}
