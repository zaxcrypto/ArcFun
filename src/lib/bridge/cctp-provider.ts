/**
 * ArcFun CCTP Provider — Production Implementation
 * 
 * Uses Circle CCTP V2 (MessageBodyVersion=1) contracts.
 * Official reference: https://developers.circle.com/cctp/quickstarts/transfer-usdc-ethereum-to-arc
 * 
 * Route: Ethereum Sepolia → Arc Testnet (official supported path)
 * Domain IDs verified from official Circle docs:
 *   - Ethereum Sepolia: 0
 *   - Arbitrum Sepolia: 3  
 *   - Base Sepolia: 6
 *   - Arc Testnet: 26
 */

import type { BridgeProvider, BridgeRouteParams, RouteValidationResult, EstimateTimeResult, EstimateFeesResult, SimulationResult, BridgeExecutionResult, BridgeStatusResult } from "./provider";

// ─── CCTP V2 ABI ─────────────────────────────────────────────────────────────
// depositForBurn requires 7 params in V2 (messageBodyVersion=1)
export const TOKEN_MESSENGER_V2_ABI = [
  {
    inputs: [
      { name: "amount", type: "uint256" },
      { name: "destinationDomain", type: "uint32" },
      { name: "mintRecipient", type: "bytes32" },
      { name: "burnToken", type: "address" },
      { name: "destinationCaller", type: "bytes32" },
      { name: "maxFee", type: "uint256" },
      { name: "minFinalityThreshold", type: "uint32" }
    ],
    name: "depositForBurn",
    outputs: [{ name: "nonce", type: "uint64" }],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      { name: "amount", type: "uint256" },
      { name: "destinationDomain", type: "uint32" },
      { name: "mintRecipient", type: "bytes32" },
      { name: "burnToken", type: "address" },
      { name: "destinationCaller", type: "bytes32" },
      { name: "maxFee", type: "uint256" },
      { name: "minFinalityThreshold", type: "uint32" },
      { name: "hookData", type: "bytes" }
    ],
    name: "depositForBurnWithHook",
    outputs: [{ name: "nonce", type: "uint64" }],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "nonce", type: "uint64" },
      { indexed: true, name: "burnToken", type: "address" },
      { indexed: false, name: "amount", type: "uint256" },
      { indexed: true, name: "depositor", type: "address" },
      { indexed: false, name: "mintRecipient", type: "bytes32" },
      { indexed: false, name: "destinationDomain", type: "uint32" },
      { indexed: false, name: "destinationTokenMessenger", type: "bytes32" },
      { indexed: false, name: "destinationCaller", type: "bytes32" },
      { indexed: false, name: "maxFee", type: "uint256" },
      { indexed: false, name: "minFinalityThreshold", type: "uint32" }
    ],
    name: "DepositForBurn",
    type: "event"
  }
] as const;

export const MESSAGE_TRANSMITTER_V2_ABI = [
  {
    inputs: [
      { name: "message", type: "bytes" },
      { name: "attestation", type: "bytes" }
    ],
    name: "receiveMessage",
    outputs: [{ name: "success", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      { name: "", type: "bytes32" }
    ],
    name: "usedNonces",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  {
    anonymous: false,
    inputs: [{ indexed: false, name: "message", type: "bytes" }],
    name: "MessageSent",
    type: "event"
  }
] as const;

// ─── Circle CCTPx (Non-USDC Assets / EURC) ───────────────────────────────────
// Circle reference: https://developers.circle.com/cctp/expanded-assets/quickstarts/transfer-eurc-ethereum-to-arc
export const EURC_TOKEN_ID = "0x2587821a0ee7daa174b95436b5dab1731cfa1844775b010217d3c0dd02a4eecd" as const;
export const CIRBTC_TOKEN_ID = "0x7c27b7b6485f3ea49b7d1a439e288d3c3116f533302afabb7e372dfc0770cc7d" as const;
export const CROSS_CHAIN_TOKEN_SERVICE_ADDRESS = "0x63753E722bd2C2A5DF6EE19C5106662208B81077" as const;
export const CCTS_TOKEN_MANAGER_ADDRESS = "0xE5D6eacf2eD5A7F81cC89d2a216F004092c0C2E0" as const;
export const CIRBTC_TOKEN_MANAGER_ADDRESS = "0xb995f4060c38b7608626d0ccabe547cdc2c7390a" as const;

export const CROSS_CHAIN_TOKEN_SERVICE_ABI = [
  {
    inputs: [
      { name: "tokenId", type: "bytes32" },
      { name: "amount", type: "uint256" },
      { name: "destinationDomain", type: "uint32" },
      { name: "destinationAddress", type: "bytes" },
      { name: "destinationCaller", type: "bytes32" },
      { name: "minFinalityThreshold", type: "uint32" },
      {
        name: "claim",
        type: "tuple",
        components: [
          { name: "signedQuote", type: "bytes" },
          { name: "refundAddress", type: "address" },
        ],
      },
      { name: "autoExecuteHookData", type: "bool" },
      { name: "hookData", type: "bytes" },
    ],
    name: "crossChainTransfer",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [{ name: "tokenId", type: "bytes32" }],
    name: "resolveTokenAddress",
    outputs: [{ name: "token", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "tokenId", type: "bytes32" }],
    name: "resolveTokenManager",
    outputs: [{ name: "tokenManager", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

// ─── CCTP V2 Domain Registry ──────────────────────────────────────────────────
// Verified against official Circle docs:
// https://developers.circle.com/cctp/concepts/supported-chains-and-domains
// https://developers.circle.com/cctp/quickstarts/transfer-usdc-ethereum-to-arc
export const CCTP_DOMAINS: Record<string, {
  domain: number;
  chainId: number;
  tokenMessenger: string;    // TokenMessengerV2 on source chain (EVM hex or Soroban strkey)
  tokenMessengerV1?: string;  // TokenMessengerV1 on source chain (for V1 burns, e.g. EVM→Sui)
  messageTransmitter: string; // MessageTransmitterV2 on destination chain
  messageTransmitterV1?: string; // MessageTransmitterV1 on destination chain for V1 source messages
  usdc: string;
  eurc?: string;
  cirBtc?: string;
  irisApiDomain: string;
  fastTransfer: boolean;
  standardTransfer: boolean;
  cctpV1: boolean;
  cctpForwarder?: string;   // Soroban C-address of CctpForwarder (Stellar only)
}> = {
  "Ethereum Sepolia": {
    domain: 0,
    chainId: 11155111,
    tokenMessenger: "0x8fe6b999dc680ccfdd5bf7eb0974218be2542daa",
    messageTransmitter: "0xe737e5cebeeba77efe34d4aa090756590b1ce275",
    messageTransmitterV1: "0x7865fAfC2db2093669d92c0F33AeEF291086BEFD",
    usdc: "0x1c7d4b196cb0c7b01d743fbc6116a902379c7238",
    eurc: "0x08210f9170f89ab7658f0b5e3ff39b0e03c594d4",
    cirBtc: "0x3a3fe695f684bf9b9e43cf43c2b895ea5e392bb3",
    irisApiDomain: "0",
    fastTransfer: true,
    standardTransfer: true,
    cctpV1: true
  },
  "Arbitrum Sepolia": {
    domain: 3,
    chainId: 421614,
    tokenMessenger: "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA",
    messageTransmitter: "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275",
    messageTransmitterV1: "0xaCF1ceeF35caAc005e15888dDb8A3515C41B4872",
    usdc: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
    irisApiDomain: "3",
    fastTransfer: true,
    standardTransfer: true,
    cctpV1: true
  },
  "Optimism Sepolia": {
    domain: 2,
    chainId: 11155420,
    tokenMessenger: "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA",
    messageTransmitter: "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275",
    messageTransmitterV1: "0x7865fAfC2db2093669d92c0F33AeEF291086BEFD",
    usdc: "0x5fd84259d66Cd46123540766Be93DFE6D43130D7",
    irisApiDomain: "2",
    fastTransfer: true,
    standardTransfer: true,
    cctpV1: true
  },
  "Base Sepolia": {
    domain: 6,
    chainId: 84532,
    tokenMessenger: "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA",
    messageTransmitter: "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275",
    messageTransmitterV1: "0x7865fAfC2db2093669d92c0F33AeEF291086BEFD",
    usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    eurc: "0x808456652fdb597867f38412077A9182bf77359F",
    irisApiDomain: "6",
    fastTransfer: true,
    standardTransfer: true,
    cctpV1: true
  },
  "Polygon Amoy Testnet": {
    domain: 7,
    chainId: 80002,
    tokenMessenger: "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA",
    messageTransmitter: "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275",
    messageTransmitterV1: "0x7865fAfC2db2093669d92c0F33AeEF291086BEFD",
    usdc: "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582",
    irisApiDomain: "7",
    fastTransfer: true,
    standardTransfer: true,
    cctpV1: true
  },
  "X Layer Testnet": {
    domain: 37,
    chainId: 1952,
    tokenMessenger: "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA",
    messageTransmitter: "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275",
    usdc: "0xDec90b78111Ba2fc6FC6d84d8B9ec159A2d4b9B3",
    irisApiDomain: "37",
    fastTransfer: true,
    standardTransfer: true,
    cctpV1: false
  },
  "Avalanche Fuji": {
    domain: 1,
    chainId: 43113,
    tokenMessenger: "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA",
    tokenMessengerV1: "0xeb08f243e5d3fcff26a9e38ae5520a669f4019d0", // V1 TokenMessenger on Avalanche Fuji (confirmed via localMessageTransmitter())
    messageTransmitter: "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275",
    messageTransmitterV1: "0xa9fB1b3009DCb79E2fe346c16a604B8Fa8aE0a79",
    usdc: "0x5425890298aed601595a70ab815c96711a31bc65",
    eurc: "0x5E44db7996c682E92a960b65AC713a54AD815c6B",
    irisApiDomain: "1",
    fastTransfer: false,
    standardTransfer: true,
    cctpV1: true
  },
  "HyperEVM Testnet": {
    domain: 19,
    chainId: 998,
    tokenMessenger: "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA",
    messageTransmitter: "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275",
    usdc: "0x2B3370eE501B4a559b57D449569354196457D8Ab",
    irisApiDomain: "19",
    fastTransfer: false,
    standardTransfer: true,
    cctpV1: false
  },
  "Arc Testnet": {
    domain: 26, // ← Official Circle domain ID for Arc Testnet
    chainId: 1516,
    tokenMessenger: "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA",   // TokenMessengerV2 on Arc
    messageTransmitter: "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275", // MessageTransmitterV2 on Arc
    usdc: "0x3600000000000000000000000000000000000000",
    eurc: "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a",
    cirBtc: "0xf0c4a4ce82a5746abaad9425360ab04fbba432bf",
    irisApiDomain: "26",
    fastTransfer: true,
    standardTransfer: false, // Arc only supports fast transfer (1000)
    cctpV1: false
  },
  "Injective EVM Testnet": {
    domain: 29,
    chainId: 1439,
    tokenMessenger: "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA",
    messageTransmitter: "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275",
    usdc: "0x0C382e685bbeeFE5d3d9C29e29E341fEE8E84C5d",
    irisApiDomain: "29",
    fastTransfer: true,
    standardTransfer: true,
    cctpV1: false
  },
  // ─── Stellar Testnet (Domain 27) ─────────────────────────────────────────────
  // Official Circle Soroban contract addresses:
  // Source: https://developers.circle.com/cctp/quickstarts/transfer-usdc-stellar-arc
  "Stellar Testnet": {
    domain: 27,
    chainId: 0, // Not an EVM chain — chainId unused
    tokenMessenger: "CDNG7HXAPBWICI2E3AUBP3YZWZELJLYSB6F5CC7WLDTLTHVM74SLRTHP",   // Soroban TokenMessengerMinterV2 (verified from Circle docs)
    messageTransmitter: "CBJ6MTCKKZG73PMDZCJMSFRD7DQEMI4FKDH7CGDSV4W6FHCRBCQAVVJY", // Soroban MessageTransmitterV2 (verified from Circle docs)
    usdc: "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",        // Soroban USDC (verified from Circle docs)
    irisApiDomain: "27",
    fastTransfer: true,
    standardTransfer: true,
    cctpV1: false,
    cctpForwarder: "CA66Q2WFBND6V4UEB7RD4SAXSVIWMD6RA4X3U32ELVFGXV5PJK4T4VSZ"   // Official CctpForwarder on Stellar Testnet (verified from Circle docs)
  },
  "Unichain Sepolia": {
    domain: 10,
    chainId: 1301,
    tokenMessenger: "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA",
    messageTransmitter: "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275",
    messageTransmitterV1: "0xbc498c326533d675cf571B90A2Ced265ACb7d086",
    usdc: "0x31d0220469e10c4E71834a79b1f276d740d3768F",
    irisApiDomain: "10",
    fastTransfer: true,
    standardTransfer: true,
    cctpV1: true
  },
  "Linea Sepolia": {
    domain: 11,
    chainId: 59141,
    tokenMessenger: "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA",
    messageTransmitter: "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275",
    usdc: "0xFEce4462D57bD51A6A552365A011b95f0E16d9B7",
    irisApiDomain: "11",
    fastTransfer: true,
    standardTransfer: true,
    cctpV1: false
  },
  "Sonic Testnet": {
    domain: 13,
    chainId: 14601,
    tokenMessenger: "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA",
    messageTransmitter: "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275",
    usdc: "0x0BA304580ee7c9a980CF72e55f5Ed2E9fd30Bc51",
    irisApiDomain: "13",
    fastTransfer: true,
    standardTransfer: true,
    cctpV1: false
  },
  "Monad Testnet": {
    domain: 15,
    chainId: 10143,
    tokenMessenger: "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA",
    messageTransmitter: "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275",
    usdc: "0x534b2f3A21130d7a60830c2Df862319e593943A3",
    irisApiDomain: "15",
    fastTransfer: true,
    standardTransfer: true,
    cctpV1: false
  },
  "Ink Sepolia": {
    domain: 21,
    chainId: 763373,
    tokenMessenger: "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA",
    messageTransmitter: "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275",
    usdc: "0xFabab97dCE620294D2B0b0e46C68964e326300Ac",
    irisApiDomain: "21",
    fastTransfer: true,
    standardTransfer: true,
    cctpV1: false
  },
  "Solana Devnet": {
    domain: 5,
    chainId: 0,
    tokenMessenger: "CCTPV2vPZJS2u2BBsUoscuikbYjnpFmbFsvVuJdgUMQe",
    messageTransmitter: "CCTPV2Sm4AdWt5296sk4P66VBZ7bEhcARwFaaS9YPbeC",
    usdc: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
    irisApiDomain: "5",
    fastTransfer: true,
    standardTransfer: true,
    cctpV1: true
  },
  "Solana": {
    domain: 5,
    chainId: 101,
    tokenMessenger: "CCTPV2vPZJS2u2BBsUoscuikbYjnpFmbFsvVuJdgUMQe",
    messageTransmitter: "CCTPV2Sm4AdWt5296sk4P66VBZ7bEhcARwFaaS9YPbeC",
    usdc: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    irisApiDomain: "5",
    fastTransfer: true,
    standardTransfer: true,
    cctpV1: true
  },
  "Sui Testnet": {
    domain: 8,
    chainId: 0,
    tokenMessenger: "0x267d3c0cb776eace2840f27e4d33da9c6d952f9749403f1fe6579f4962ed3c64",
    messageTransmitter: "0xe9678cd42a81886e18e21361088071f275105636a4d3751e1d7f255211f73bbe",
    usdc: "0xa1ec7fc00a6f40db9693ad1415d0c193ad3906494428cf252621037bd7117e29::usdc::USDC",
    irisApiDomain: "8",
    fastTransfer: false,
    standardTransfer: true,
    cctpV1: false
  }
};

export const TESTNET_CCTP_DOMAINS = CCTP_DOMAINS;

export const MAINNET_CCTP_DOMAINS: Record<string, {
  domain: number;
  chainId: number;
  tokenMessenger: string;
  tokenMessengerV1?: string;
  messageTransmitter: string;
  messageTransmitterV1?: string;
  usdc: string;
  irisApiDomain: string;
  fastTransfer: boolean;
  standardTransfer: boolean;
  cctpV1: boolean;
  cctpForwarder?: string;
}> = {
  // ─── Mainnet CCTP V2 — Verified from Circle official docs ───────────────────
  // Source: https://developers.circle.com/cctp/references/contract-addresses
  // TokenMessengerV2:   0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d (all EVM chains)
  // MessageTransmitterV2: 0x81D40F21F12A8F0E3252Bccb954D722d4c464B64 (all EVM chains)
  "Arc Mainnet": {
    domain: 26, // Official Circle domain ID for Arc Mainnet (same as testnet domain)
    chainId: 5042,
    tokenMessenger: "0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d",    // TokenMessengerV2 on Arc Mainnet (verified from Circle docs)
    messageTransmitter: "0x81D40F21F12A8F0E3252Bccb954D722d4c464B64",  // MessageTransmitterV2 on Arc Mainnet (verified from Circle docs)
    usdc: "0x3600000000000000000000000000000000000000",                  // Native USDC on Arc Mainnet
    irisApiDomain: "26",
    fastTransfer: true,
    standardTransfer: true, // Arc mainnet supports both per Circle docs
    cctpV1: false
  },
  "Base Mainnet": {
    domain: 6,
    chainId: 8453,
    tokenMessenger: "0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d",
    tokenMessengerV1: "0x1682Ae6375C4E4A97e4B583BC394c861A46D8962",
    messageTransmitter: "0x81D40F21F12A8F0E3252Bccb954D722d4c464B64",
    messageTransmitterV1: "0xAD09780d193884d503182aD4588450C416D6F9D4",
    usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    irisApiDomain: "6",
    fastTransfer: true,
    standardTransfer: true,
    cctpV1: true
  },
  "Arbitrum Mainnet": {
    domain: 3,
    chainId: 42161,
    tokenMessenger: "0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d",
    tokenMessengerV1: "0x19330d10D9Cc8751215230721E655B381CD80e1B",
    messageTransmitter: "0x81D40F21F12A8F0E3252Bccb954D722d4c464B64",
    messageTransmitterV1: "0xC30362313FBBA5cf9163F0bb16a0e01f01A896ca",
    usdc: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    irisApiDomain: "3",
    fastTransfer: true,
    standardTransfer: true,
    cctpV1: true
  },
  "Solana Mainnet": {
    domain: 5,
    chainId: 101,
    tokenMessenger: "CCTPV2vPZJS2u2BBsUoscuikbYjnpFmbFsvVuJdgUMQe",
    messageTransmitter: "CCTPV2Sm4AdWt5296sk4P66VBZ7bEhcARwFaaS9YPbeC",
    usdc: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    irisApiDomain: "5",
    fastTransfer: true,
    standardTransfer: true,
    cctpV1: true
  },
  "Sui Mainnet": {
    domain: 8,
    chainId: 0,
    tokenMessenger: "0xeb14978abfe93a37c5d5bf86a0623b923553a5f0e794daac7724f1e2fdbfb830",
    messageTransmitter: "0x16bcfcfc465f96281663a344641c017de84529370e11aa3879d0dce43ad6db87",
    usdc: "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC",
    irisApiDomain: "8",
    fastTransfer: false,
    standardTransfer: true,
    cctpV1: false
  },
  "Sui": {
    domain: 8,
    chainId: 0,
    tokenMessenger: "0xeb14978abfe93a37c5d5bf86a0623b923553a5f0e794daac7724f1e2fdbfb830",
    messageTransmitter: "0x16bcfcfc465f96281663a344641c017de84529370e11aa3879d0dce43ad6db87",
    usdc: "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC",
    irisApiDomain: "8",
    fastTransfer: false,
    standardTransfer: true,
    cctpV1: false
  }
};

export function getCctpDomains(mode: "testnet" | "mainnet" = "testnet") {
  return mode === "mainnet" ? MAINNET_CCTP_DOMAINS : TESTNET_CCTP_DOMAINS;
}

export function resolveCctpDomain(chainName?: string | null, mode?: "testnet" | "mainnet") {
  if (!chainName) return undefined;
  const isMainnet = mode === "mainnet" || chainName.toLowerCase().includes("mainnet");
  const domains = isMainnet ? MAINNET_CCTP_DOMAINS : TESTNET_CCTP_DOMAINS;

  // 1. Direct match
  if (domains[chainName]) return domains[chainName];

  // 2. Case-insensitive exact match
  const lower = chainName.toLowerCase().trim();
  for (const [key, val] of Object.entries(domains)) {
    if (key.toLowerCase() === lower) return val;
  }

  // 3. Prefix / alias match (e.g. "Arc" -> "Arc Mainnet" or "Arc Testnet", "Base" -> "Base Mainnet")
  for (const [key, val] of Object.entries(domains)) {
    const keyLower = key.toLowerCase();
    if (keyLower.startsWith(lower) || lower.startsWith(keyLower.split(' ')[0])) {
      return val;
    }
  }

  // 4. Global fallback across both sets
  const allDomains = { ...TESTNET_CCTP_DOMAINS, ...MAINNET_CCTP_DOMAINS };
  if (allDomains[chainName]) return allDomains[chainName];
  for (const [key, val] of Object.entries(allDomains)) {
    if (key.toLowerCase() === lower || key.toLowerCase().startsWith(lower) || lower.startsWith(key.toLowerCase().split(' ')[0])) {
      return val;
    }
  }

  return undefined;
}

// ─── Iris V2 API ──────────────────────────────────────────────────────────────
export function getCircleIrisApi(mode: "testnet" | "mainnet" = "testnet"): string {
  if (mode === "mainnet") {
    if (typeof window !== 'undefined') {
      return process.env.NEXT_PUBLIC_CIRCLE_IRIS_MAINNET_API_URL || 'https://iris-api.circle.com';
    }
    return process.env.CIRCLE_IRIS_MAINNET_API_URL || process.env.NEXT_PUBLIC_CIRCLE_IRIS_MAINNET_API_URL || 'https://iris-api.circle.com';
  }
  if (typeof window !== 'undefined') {
    return process.env.NEXT_PUBLIC_CIRCLE_IRIS_API_URL || process.env.NEXT_PUBLIC_CIRCLE_IRIS_API || 'https://iris-api-sandbox.circle.com';
  }
  return process.env.CIRCLE_IRIS_API_URL || process.env.NEXT_PUBLIC_CIRCLE_IRIS_API_URL || 'https://iris-api-sandbox.circle.com';
}

export const CIRCLE_IRIS_API: string = getCircleIrisApi("testnet");

export async function pollCCTPAttestation(
  sourceDomain: number,
  burnTxHash: string,
  timeoutMs = 600_000,
  mode: "testnet" | "mainnet" = "testnet"
): Promise<{ message: string; attestation: string }> {
  const baseIrisUrl = getCircleIrisApi(mode);
  // Sui transaction digests are base58 and must not include a 0x prefix
  const formattedTxHash = sourceDomain === 8 && burnTxHash.startsWith("0x") ? burnTxHash.slice(2) : burnTxHash;
  const url = `${baseIrisUrl}/v2/messages/${sourceDomain}?transactionHash=${formattedTxHash}`;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { method: "GET" });
      if (res.ok) {
        const data = await res.json();
        const msg = data?.messages?.[0];
        if (msg?.status === "complete" && msg.attestation) {
          return { message: msg.message, attestation: msg.attestation };
        }
      } else if (res.status === 404) {
        // Circle Iris API returns 404 while transaction block finality is being verified on-chain.
        // This is an expected pending state per official Circle CCTP documentation.
        if (process.env.NODE_ENV === "development") {
          console.log(`[Circle Iris API] 404 Message not found for tx ${burnTxHash.slice(0, 10)}... (Block finality pending - Normal CCTP behavior)`);
        }
      }
    } catch (_) { }
    await new Promise(r => setTimeout(r, 5000));
  }
  throw new Error("CCTP attestation timeout after 10 minutes");
}

// ─── Provider Class Removed ───────────────────────────────────────────────────
