/**
 * Circle CCTP V2 — Sui Configuration & Parameter Definitions
 * 
 * Authoritative constants verified against official Circle CCTP V2 documentation:
 * - https://developers.circle.com/cctp/references/sui-packages
 * - https://developers.circle.com/cctp/quickstarts/transfer-usdc-sui-arc
 * - https://developers.circle.com/cctp/concepts/supported-chains-and-domains
 */

export interface SuiCctpConfig {
  domain: number; // Official Circle Domain ID: 8
  mtV2PackageId: string;
  mtV2StateId: string;
  tmmV2PackageId: string;
  tmmV2StateId: string;
  handlerPackageId: string;
  handlerStateId: string;
  treasuryId: string;
  usdcPackageId: string;
  usdcCoinType: string;
  denyListId: string; // 0x403
  clockId: string;    // 0x6
  rpcUrl: string;
}

/** Official Sui Testnet CCTP V2 Configuration */
export const SUI_CCTP_TESTNET_CONFIG: SuiCctpConfig = {
  domain: 8,
  mtV2PackageId: "0xe9678cd42a81886e18e21361088071f275105636a4d3751e1d7f255211f73bbe",
  mtV2StateId: "0xfee3a2b47f9ef2de2405fc63d79194307945f8ea768815cfc46083bc20fbe6ed",
  tmmV2PackageId: "0x267d3c0cb776eace2840f27e4d33da9c6d952f9749403f1fe6579f4962ed3c64",
  tmmV2StateId: "0x72cb55cd14d01e6361386d6ea93eecda9fa1efc3c202b8dd69c1e4683e4c0ca0",
  handlerPackageId: "0xbe8479044396a45e07de2c7f14789c35b8338406eebc53b2527da56839a91561",
  handlerStateId: "0xfbd9c0517c4f0e1817445ee2be598806e3c392a465d7e3d773d1055f3f0eed32",
  treasuryId: "0x7170137d4a6431bf83351ac025baf462909bffe2877d87716374fb42b9629ebe",
  usdcPackageId: "0xa1ec7fc00a6f40db9693ad1415d0c193ad3906494428cf252621037bd7117e29",
  usdcCoinType: "0xa1ec7fc00a6f40db9693ad1415d0c193ad3906494428cf252621037bd7117e29::usdc::USDC",
  denyListId: "0x403",
  clockId: "0x6",
  rpcUrl: "https://fullnode.testnet.sui.io:443"
};

/** Official Sui Mainnet CCTP V2 Configuration */
export const SUI_CCTP_MAINNET_CONFIG: SuiCctpConfig = {
  domain: 8,
  mtV2PackageId: "0x16bcfcfc465f96281663a344641c017de84529370e11aa3879d0dce43ad6db87",
  mtV2StateId: "0x0c067f7d325e5b60e3179712e7783534ba1556cbb3d359d8161497e37689230c",
  tmmV2PackageId: "0xeb14978abfe93a37c5d5bf86a0623b923553a5f0e794daac7724f1e2fdbfb830",
  tmmV2StateId: "0x06fb166941cd7bc095edc019d054a753ec3f1e4c25f28f2ecc4a6cfa0a9b1167",
  handlerPackageId: "0x185ed207c4d64fc594882ab927f9f3c6ff957aad03df8a731ba64378faeeb2bf",
  handlerStateId: "0xa32de8a6dd0178fb05f662929d55cddb69a25c26bde4b83f89e36d17ead94c41",
  treasuryId: "0x57d6725e7a8b49a7b2a612f6bd66ab5f39fc95332ca48be421c3229d514a6de7",
  usdcPackageId: "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7",
  usdcCoinType: "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC",
  denyListId: "0x403",
  clockId: "0x6",
  rpcUrl: "https://fullnode.mainnet.sui.io:443"
};

/**
 * Retrieves the verified Sui CCTP V2 configuration for a given environment.
 */
export function getSuiCctpConfig(isMainnet: boolean = false): SuiCctpConfig {
  return isMainnet ? SUI_CCTP_MAINNET_CONFIG : SUI_CCTP_TESTNET_CONFIG;
}

/**
 * Helper to left-pad an EVM or Sui address to 32 bytes (64 hex characters) with 0x prefix.
 * Required for CCTP V2 mintRecipient on both EVM and Move layers.
 */
export function padAddressToBytes32(address: string): `0x${string}` {
  const clean = address.replace(/^0x/, "").padStart(64, "0").toLowerCase();
  return `0x${clean}`;
}
