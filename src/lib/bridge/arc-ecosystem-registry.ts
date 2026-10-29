/**
 * Arc Ecosystem Validation Registry
 * 
 * Verifies and stores official parameters for the Arc ecosystem.
 * Acts as the definitive truth for Arc integration logic.
 */

export const ArcEcosystemRegistry = {
  network: {
    chainId: 5042002, // Official Arc Testnet Chain ID
    rpcEndpoint: (process.env.NEXT_PUBLIC_ARC_TESTNET_RPC_URL || "https://5042002.rpc.thirdweb.com"),
  },
  tokens: {
    USDC: {
      address: "0x0000000000000000000000000000000000000000", // Pending Official Arc Testnet Deployment
      decimals: 6,
      standard: "ERC20"
    },
    EURC: {
      address: "0x0000000000000000000000000000000000000001", // Pending Official Arc Testnet Deployment
      decimals: 6,
      standard: "ERC20"
    }
  },
  integrationMethods: {
    recommendedRelayerAuth: "EIP-712 Structured Signatures",
    pauseStrategy: "Pausable / AccessControl via Multisig"
  }
};
