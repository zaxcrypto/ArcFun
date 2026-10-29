import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@openzeppelin/hardhat-upgrades";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const DEPLOYER_KEY = process.env.DEPLOYER_PRIVATE_KEY || "0x0000000000000000000000000000000000000000000000000000000000000001";

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: "0.8.28",
        settings: {
          evmVersion: "cancun",
          optimizer: { enabled: true, runs: 200 },
        },
      },
      {
        version: "0.8.19",
        settings: {
          evmVersion: "paris",
          optimizer: { enabled: true, runs: 200 },
        },
      },
    ],
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache-hardhat",
    artifacts: "./artifacts",
  },
  networks: {
    // ── Arc (source chain) ──────────────────────────────────────────────────
    arc_testnet: {
      url: process.env.ARC_RPC_URL || "https://5042002.rpc.thirdweb.com",
      chainId: 5042002,
      accounts: [DEPLOYER_KEY],
    },
    // ── Destination chains ──────────────────────────────────────────────────
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL || "",
      chainId: 11155111,
      accounts: [DEPLOYER_KEY],
    },
    base_mainnet: {
      url: process.env.NEXT_PUBLIC_BASE_RPC_URL || "https://mainnet.base.org",
      chainId: 8453,
      accounts: [DEPLOYER_KEY],
    },
    base_sepolia: {
      url: process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org",
      chainId: 84532,
      accounts: [DEPLOYER_KEY],
    },
    arbitrum_sepolia: {
      url: process.env.ARBITRUM_SEPOLIA_RPC_URL || "https://sepolia-rollup.arbitrum.io/rpc",
      chainId: 421614,
      accounts: [DEPLOYER_KEY],
    },
    sonic_testnet: {
      url: process.env.SONIC_RPC_URL || "https://rpc.testnet.soniclabs.com",
      chainId: 57054,
      accounts: [DEPLOYER_KEY],
    },
    monad_testnet: {
      url: process.env.MONAD_RPC_URL || "https://testnet-rpc.monad.xyz",
      chainId: 10143,
      accounts: [DEPLOYER_KEY],
    },
    ink_sepolia: {
      url: process.env.INK_RPC_URL || "https://rpc-gel-sepolia.inkonchain.com",
      chainId: 763373,
      accounts: [DEPLOYER_KEY],
    },
    linea_sepolia: {
      url: process.env.LINEA_RPC_URL || "https://rpc.sepolia.linea.build",
      chainId: 59141,
      accounts: [DEPLOYER_KEY],
    },
    unichain_sepolia: {
      url: process.env.UNICHAIN_RPC_URL || "https://sepolia.unichain.org",
      chainId: 1301,
      accounts: [DEPLOYER_KEY],
    },
    giwa_sepolia: {
      url: process.env.GIWA_SEPOLIA_RPC_URL || "https://sepolia-rpc.giwa.io",
      chainId: 91342,
      accounts: [DEPLOYER_KEY],
    },
  },
  etherscan: {
    apiKey: {
      arc_testnet: "empty",
      sepolia: process.env.ETHERSCAN_API_KEY || "",
      arbitrumSepolia: process.env.ARBISCAN_API_KEY || "",
      baseSepolia: process.env.BASESCAN_API_KEY || "",
      base: process.env.BASESCAN_API_KEY || "",
      giwa_sepolia: "empty",
    },
    customChains: [
      {
        network: "arc_testnet",
        chainId: 5042002,
        urls: {
          apiURL: "https://testnet.arcscan.app/api",
          browserURL: "https://testnet.arcscan.app",
        },
      },
      {
        network: "monad_testnet",
        chainId: 10143,
        urls: {
          apiURL: "https://testnet.monadexplorer.com/api",
          browserURL: "https://testnet.monadexplorer.com",
        },
      },
      {
        network: "ink_sepolia",
        chainId: 763373,
        urls: {
          apiURL: "https://explorer-sepolia.inkonchain.com/api",
          browserURL: "https://explorer-sepolia.inkonchain.com",
        },
      },
      {
        network: "linea_sepolia",
        chainId: 59141,
        urls: {
          apiURL: "https://api-sepolia.lineascan.build/api",
          browserURL: "https://sepolia.lineascan.build",
        },
      },
      {
        network: "unichain_sepolia",
        chainId: 1301,
        urls: {
          apiURL: "https://unichain-sepolia.blockscout.com/api",
          browserURL: "https://unichain-sepolia.blockscout.com",
        },
      },
      {
        network: "giwa_sepolia",
        chainId: 91342,
        urls: {
          apiURL: "https://sepolia-explorer.giwa.io/api",
          browserURL: "https://sepolia-explorer.giwa.io",
        },
      },
    ],
  },
};

export default config;
