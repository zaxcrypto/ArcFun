jest.mock('@mysten/sui/jsonRpc', () => ({
  SuiJsonRpcClient: jest.fn().mockImplementation(() => ({
    executeTransactionBlock: jest.fn(),
    waitForTransactionBlock: jest.fn(),
  })),
}));
jest.mock('@mysten/sui/keypairs/ed25519', () => ({
  Ed25519Keypair: {
    fromSecretKey: jest.fn(),
  },
}));
jest.mock('@mysten/sui/cryptography', () => ({
  decodeSuiPrivateKey: jest.fn(),
}));
jest.mock('@mysten/sui/transactions', () => ({
  Transaction: jest.fn().mockImplementation(() => ({
    setSender: jest.fn(),
    setGasBudget: jest.fn(),
    moveCall: jest.fn(),
    object: jest.fn(),
    pure: {
      vector: {
        u8: jest.fn(),
      },
    },
  })),
}));

import {
  SUI_CCTP_TESTNET_CONFIG,
  SUI_CCTP_MAINNET_CONFIG,
  getSuiCctpConfig,
  padAddressToBytes32
} from '@/lib/bridge/sui-cctp-config';
import {
  CCTP_DOMAINS,
  MAINNET_CCTP_DOMAINS,
  resolveCctpDomain
} from '@/lib/bridge/cctp-provider';
import { SuiAdapter } from '@/lib/bridge/adapters/sui-adapter';
import { ChainRouter } from '@/lib/bridge/adapters/chain-router';

describe('Circle CCTP V2 — Sui ↔ Arc Migration Verification', () => {

  describe('1. Authoritative V2 Configuration Verification', () => {
    it('verifies Sui CCTP domain is 8 on both testnet and mainnet', () => {
      expect(SUI_CCTP_TESTNET_CONFIG.domain).toBe(8);
      expect(SUI_CCTP_MAINNET_CONFIG.domain).toBe(8);
    });

    it('verifies Sui Testnet V2 package IDs and shared state object IDs against official docs', () => {
      expect(SUI_CCTP_TESTNET_CONFIG.mtV2PackageId).toBe('0xe9678cd42a81886e18e21361088071f275105636a4d3751e1d7f255211f73bbe');
      expect(SUI_CCTP_TESTNET_CONFIG.mtV2StateId).toBe('0xfee3a2b47f9ef2de2405fc63d79194307945f8ea768815cfc46083bc20fbe6ed');
      expect(SUI_CCTP_TESTNET_CONFIG.tmmV2PackageId).toBe('0x267d3c0cb776eace2840f27e4d33da9c6d952f9749403f1fe6579f4962ed3c64');
      expect(SUI_CCTP_TESTNET_CONFIG.tmmV2StateId).toBe('0x72cb55cd14d01e6361386d6ea93eecda9fa1efc3c202b8dd69c1e4683e4c0ca0');
      expect(SUI_CCTP_TESTNET_CONFIG.handlerPackageId).toBe('0xbe8479044396a45e07de2c7f14789c35b8338406eebc53b2527da56839a91561');
      expect(SUI_CCTP_TESTNET_CONFIG.handlerStateId).toBe('0xfbd9c0517c4f0e1817445ee2be598806e3c392a465d7e3d773d1055f3f0eed32');
      expect(SUI_CCTP_TESTNET_CONFIG.treasuryId).toBe('0x7170137d4a6431bf83351ac025baf462909bffe2877d87716374fb42b9629ebe');
      expect(SUI_CCTP_TESTNET_CONFIG.denyListId).toBe('0x403');
      expect(SUI_CCTP_TESTNET_CONFIG.clockId).toBe('0x6');
    });

    it('verifies Sui Mainnet V2 package IDs and shared state object IDs against official docs', () => {
      expect(SUI_CCTP_MAINNET_CONFIG.mtV2PackageId).toBe('0x16bcfcfc465f96281663a344641c017de84529370e11aa3879d0dce43ad6db87');
      expect(SUI_CCTP_MAINNET_CONFIG.mtV2StateId).toBe('0x0c067f7d325e5b60e3179712e7783534ba1556cbb3d359d8161497e37689230c');
      expect(SUI_CCTP_MAINNET_CONFIG.tmmV2PackageId).toBe('0xeb14978abfe93a37c5d5bf86a0623b923553a5f0e794daac7724f1e2fdbfb830');
      expect(SUI_CCTP_MAINNET_CONFIG.tmmV2StateId).toBe('0x06fb166941cd7bc095edc019d054a753ec3f1e4c25f28f2ecc4a6cfa0a9b1167');
      expect(SUI_CCTP_MAINNET_CONFIG.handlerPackageId).toBe('0x185ed207c4d64fc594882ab927f9f3c6ff957aad03df8a731ba64378faeeb2bf');
      expect(SUI_CCTP_MAINNET_CONFIG.handlerStateId).toBe('0xa32de8a6dd0178fb05f662929d55cddb69a25c26bde4b83f89e36d17ead94c41');
      expect(SUI_CCTP_MAINNET_CONFIG.treasuryId).toBe('0x57d6725e7a8b49a7b2a612f6bd66ab5f39fc95332ca48be421c3229d514a6de7');
    });

    it('verifies getSuiCctpConfig returns correct configuration based on network', () => {
      expect(getSuiCctpConfig(false)).toBe(SUI_CCTP_TESTNET_CONFIG);
      expect(getSuiCctpConfig(true)).toBe(SUI_CCTP_MAINNET_CONFIG);
    });

    it('verifies CCTP_DOMAINS registry contains Sui Testnet with CCTP V2 configuration and cctpV1 false', () => {
      const sui = CCTP_DOMAINS['Sui Testnet'];
      expect(sui).toBeDefined();
      expect(sui.domain).toBe(8);
      expect(sui.tokenMessenger).toBe('0x267d3c0cb776eace2840f27e4d33da9c6d952f9749403f1fe6579f4962ed3c64');
      expect(sui.messageTransmitter).toBe('0xe9678cd42a81886e18e21361088071f275105636a4d3751e1d7f255211f73bbe');
      expect(sui.cctpV1).toBe(false);
    });

    it('verifies MAINNET_CCTP_DOMAINS registry contains Sui Mainnet with CCTP V2 configuration', () => {
      const suiMainnet = MAINNET_CCTP_DOMAINS['Sui Mainnet'];
      expect(suiMainnet).toBeDefined();
      expect(suiMainnet.domain).toBe(8);
      expect(suiMainnet.tokenMessenger).toBe('0xeb14978abfe93a37c5d5bf86a0623b923553a5f0e794daac7724f1e2fdbfb830');
      expect(suiMainnet.messageTransmitter).toBe('0x16bcfcfc465f96281663a344641c017de84529370e11aa3879d0dce43ad6db87');
      expect(suiMainnet.cctpV1).toBe(false);
    });

    it('verifies resolveCctpDomain resolves Sui correctly for testnet and mainnet', () => {
      const testnetDef = resolveCctpDomain('Sui Testnet', 'testnet');
      expect(testnetDef?.domain).toBe(8);
      expect(testnetDef?.cctpV1).toBe(false);

      const mainnetDef = resolveCctpDomain('Sui Mainnet', 'mainnet');
      expect(mainnetDef?.domain).toBe(8);
      expect(mainnetDef?.cctpV1).toBe(false);
    });
  });

  describe('2. Address Padding and Parameter Formatting', () => {
    it('pads EVM 20-byte address to 32-byte bytes32 format with 0x prefix', () => {
      const evmAddr = '0x1234567890123456789012345678901234567890';
      const padded = padAddressToBytes32(evmAddr);
      expect(padded).toHaveLength(66); // '0x' + 64 hex chars
      expect(padded.startsWith('0x000000000000000000000000')).toBe(true);
      expect(padded.toLowerCase()).toBe('0x0000000000000000000000001234567890123456789012345678901234567890');
    });

    it('normalizes 32-byte Sui address to 32-byte bytes32 format', () => {
      const suiAddr = '0x16bcfcfc465f96281663a344641c017de84529370e11aa3879d0dce43ad6db87';
      const padded = padAddressToBytes32(suiAddr);
      expect(padded).toHaveLength(66);
      expect(padded.toLowerCase()).toBe(suiAddr.toLowerCase());
    });
  });

  describe('3. ChainRouter Routing to SuiAdapter', () => {
    it('routes domain 8 to SuiAdapter.submitMint', async () => {
      const submitMintSpy = jest.spyOn(SuiAdapter, 'submitMint').mockResolvedValue('0xMockSuiTxDigest12345');

      const mockMsg = '0x00000001';
      const mockAtt = '0x11111111';
      const res = await ChainRouter.executeMint(8, mockMsg, mockAtt, 'Sui Testnet');

      expect(submitMintSpy).toHaveBeenCalledWith(mockMsg, mockAtt, 'Sui Testnet');
      expect(res).toBe('0xMockSuiTxDigest12345');

      submitMintSpy.mockRestore();
    });

    it('rejects invalid or unsupported domains with UnsupportedDomainError', async () => {
      await expect(ChainRouter.executeMint(999999, '0x0', '0x0')).rejects.toThrow('UnsupportedDomainError');
      await expect(ChainRouter.executeMint(-1, '0x0', '0x0')).rejects.toThrow('UnsupportedDomainError');
    });
  });

  describe('4. Complete V1 Elimination Verification', () => {
    it('ensures no active V1 package IDs are used in active Sui CCTP configurations', () => {
      const oldV1TokenMessengerPkg = '0x31cc14d80c175ae39777c0238f20594c6d4869cfab199f40b69f3319956b8beb';
      const oldV1MessageTransmitterPkg = '0x4931e06dce648b3931f890035bd196920770e913e43e45990b383f6486fdd0a5';

      expect(SUI_CCTP_TESTNET_CONFIG.tmmV2PackageId).not.toBe(oldV1TokenMessengerPkg);
      expect(SUI_CCTP_TESTNET_CONFIG.mtV2PackageId).not.toBe(oldV1MessageTransmitterPkg);
      expect(CCTP_DOMAINS['Sui Testnet'].tokenMessenger).not.toBe(oldV1TokenMessengerPkg);
      expect(CCTP_DOMAINS['Sui Testnet'].messageTransmitter).not.toBe(oldV1MessageTransmitterPkg);
      expect(CCTP_DOMAINS['Sui Testnet'].cctpV1).toBe(false);
    });
  });
});
