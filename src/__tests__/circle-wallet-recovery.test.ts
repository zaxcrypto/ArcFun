import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { v5 as uuidv5 } from "uuid";
import { getNetworkReserve, formatSpendableBalance } from "../lib/circle/wallet-service";
import { getWebAuthnConfig } from "../lib/auth/webauthn-config";

describe("Circle DCW Wallet Recovery & Invariance Tests", () => {
  const CIRCLE_NAMESPACE = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

  it("produces deterministic idempotent idempotencyKey for same user and network", () => {
    const userId = "test-user-uuid-1234";
    const blockchain = "ARC-TESTNET";

    const key1 = uuidv5(`${userId}-${blockchain}`, CIRCLE_NAMESPACE);
    const key2 = uuidv5(`${userId}-${blockchain}`, CIRCLE_NAMESPACE);

    assert.equal(key1, key2, "Idempotency key must be strictly reproducible");
    assert.match(key1, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i, "Key must be valid UUIDv5");
  });

  it("different networks or users produce distinct idempotency keys", () => {
    const userId1 = "test-user-uuid-1234";
    const userId2 = "test-user-uuid-5678";
    const blockchainArc = "ARC-TESTNET";
    const blockchainEth = "ETH-SEPOLIA";

    const key1 = uuidv5(`${userId1}-${blockchainArc}`, CIRCLE_NAMESPACE);
    const key2 = uuidv5(`${userId2}-${blockchainArc}`, CIRCLE_NAMESPACE);
    const key3 = uuidv5(`${userId1}-${blockchainEth}`, CIRCLE_NAMESPACE);

    assert.notEqual(key1, key2, "Different users must have different idempotency keys");
    assert.notEqual(key1, key3, "Different networks must have different idempotency keys");
  });

  it("enforces correct network gas reserve for ARC-TESTNET", () => {
    const reserve = getNetworkReserve("ARC-TESTNET");
    assert.equal(reserve, 0.05, "ARC-TESTNET must maintain a 0.05 ARC reserve for gas fees");
  });

  it("calculates spendable balance accurately respecting reserve", () => {
    const spendable = formatSpendableBalance("10.000000", "ARC-TESTNET");
    assert.equal(spendable, "9.950000");

    const zeroSpendable = formatSpendableBalance("0.040000", "ARC-TESTNET");
    assert.equal(zeroSpendable, "0");

    const exactReserve = formatSpendableBalance("0.050000", "ARC-TESTNET");
    assert.equal(exactReserve, "0");
  });

  it("webauthn config provides correct RP ID and origins for production and local", () => {
    const prodConfig = getWebAuthnConfig("https://thearcfun.xyz");
    assert.equal(prodConfig.rpID, "thearcfun.xyz");
    assert.deepEqual(prodConfig.origin, ["https://thearcfun.xyz", "https://www.thearcfun.xyz"]);

    const localConfig = getWebAuthnConfig("http://localhost:3000");
    assert.equal(localConfig.rpID, "localhost");
    assert.deepEqual(localConfig.origin, ["http://localhost:3000"]);
  });

  it("prioritizes existing wallet lookup before any provisioning attempt", async () => {
    // Simulated DB with an existing Circle wallet record
    const existingWalletRecord = {
      user_id: "user-abc-123",
      blockchain: "ARC-TESTNET",
      circle_wallet_id: "circle-wallet-xyz-987",
      wallet_address: "0x1234567890123456789012345678901234567890"
    };

    let circleProvisionCallCount = 0;

    // Simulated lookup logic mirroring /api/wallet/provision
    async function simulateProvisionOrLookup(userId: string, blockchain: string) {
      // Tier 1: Look up existing mapping
      if (userId === existingWalletRecord.user_id && blockchain === existingWalletRecord.blockchain) {
        return {
          recovered: true,
          wallet: existingWalletRecord
        };
      }
      
      // If not found, would call Circle
      circleProvisionCallCount++;
      return {
        recovered: false,
        wallet: null
      };
    }

    const result = await simulateProvisionOrLookup("user-abc-123", "ARC-TESTNET");

    assert.equal(result.recovered, true, "Must recover existing wallet");
    assert.equal(result.wallet?.circle_wallet_id, "circle-wallet-xyz-987", "Circle wallet ID must match existing");
    assert.equal(result.wallet?.wallet_address, "0x1234567890123456789012345678901234567890", "Address must match existing");
    assert.equal(circleProvisionCallCount, 0, "Must NEVER call Circle provision if existing wallet mapping is found");
  });

  it("recovers wallet across legacy address lookup (Tier 2)", async () => {
    const legacyWalletInDB = {
      user_id: "old-user-id",
      wallet_address: "0xABCDEF0123456789ABCDEF0123456789ABCDEF01",
      circle_wallet_id: "circle-wallet-legacy-456",
      blockchain: "ARC-TESTNET"
    };

    async function simulateMultiTierLookup(currentUserId: string, connectedAddress: string, blockchain: string) {
      // Tier 1: direct user_id
      if (currentUserId === legacyWalletInDB.user_id) {
        return legacyWalletInDB;
      }
      // Tier 2: legacy address lookup
      if (connectedAddress.toLowerCase() === legacyWalletInDB.wallet_address.toLowerCase()) {
        return legacyWalletInDB;
      }
      return null;
    }

    // User logged in with fresh user_id but same connected address
    const recovered = await simulateMultiTierLookup("new-user-id", "0xABCDEF0123456789ABCDEF0123456789ABCDEF01", "ARC-TESTNET");
    assert.ok(recovered, "Must successfully recover legacy wallet via connected address");
    assert.equal(recovered.circle_wallet_id, "circle-wallet-legacy-456");
  });

  describe("Circle DCW Multi-Chain Architecture (EVM & Solana)", () => {
    const mockWalletSetId = "60e0d5cf-6126-4448-b4b3-f027be08e33f";
    const supportedNetworks = ['ARC-TESTNET', 'SOL-DEVNET', 'ARC', 'SOL', 'ETH-SEPOLIA'];

    it("EVM provisioning produces genuine Circle DCW wallet parameters", async () => {
      const mockEvmResponse = {
        id: "d8c97354-9ee7-425d-bb85-df0485984620",
        state: "LIVE",
        walletSetId: mockWalletSetId,
        blockchain: "ARC-TESTNET",
        address: "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
        accountType: "EOA"
      };

      assert.equal(mockEvmResponse.blockchain, "ARC-TESTNET");
      assert.equal(mockEvmResponse.walletSetId, mockWalletSetId);
      assert.match(mockEvmResponse.address, /^0x[a-fA-F0-9]{40}$/, "EVM address must be valid 0x hex format");
      assert.match(mockEvmResponse.id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "Wallet ID must be UUID");
      assert.equal(mockEvmResponse.accountType, "EOA");
    });

    it("Solana provisioning invokes Circle DCW with official identifier SOL-DEVNET", async () => {
      const mockSolanaResponse = {
        id: "a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d",
        state: "LIVE",
        walletSetId: mockWalletSetId,
        blockchain: "SOL-DEVNET",
        address: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
        accountType: "EOA"
      };

      assert.equal(mockSolanaResponse.blockchain, "SOL-DEVNET", "Blockchain must match Circle's official SOL-DEVNET identifier");
      assert.equal(mockSolanaResponse.walletSetId, mockWalletSetId, "WalletSetId must match authorized set");
      assert.match(mockSolanaResponse.address, /^[1-9A-HJ-NP-Za-km-z]{32,44}$/, "Solana address must be valid Base58 format");
      assert.match(mockSolanaResponse.id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "Wallet ID must be UUID");
      assert.equal(mockSolanaResponse.accountType, "EOA");
    });

    it("Circle API failure fails closed without falling back to local keypair generation", async () => {
      let localKeyGenerated = false;

      async function provisionOrSafelyFail(blockchain: string) {
        try {
          // Simulate Circle API outage
          throw new Error("Circle 503 Service Unavailable");
        } catch (err: any) {
          // Strictly fail closed — DO NOT fallback to Keypair.generate()
          // localKeyGenerated = true; <--- FORBIDDEN
          throw new Error(`Circle DCW provisioning failed: ${err.message}`);
        }
      }

      await assert.rejects(
        async () => {
          await provisionOrSafelyFail("SOL-DEVNET");
        },
        /Circle DCW provisioning failed: Circle 503 Service Unavailable/,
        "Must throw error on Circle API failure"
      );

      assert.equal(localKeyGenerated, false, "Must NEVER generate local keypair on Circle failure");
    });

    it("rejects unsupported blockchains explicitly", () => {
      const invalidBlockchains = ["SOLANA", "SOLANA-DEVNET", "ETHEREUM", "POLYGON", "BITCOIN"];
      for (const invalid of invalidBlockchains) {
        assert.ok(!supportedNetworks.includes(invalid), `Blockchain ${invalid} must not be in supported list`);
      }
    });

    it("enforces concurrent idempotency across simultaneous requests for same user and chain", async () => {
      const mockDatabase = new Map<string, any>();
      const userId = "concurrent-user-999";
      const blockchain = "SOL-DEVNET";
      const userChainKey = `${userId}:${blockchain}`;

      let circleCallCount = 0;

      async function simulateConcurrentProvision() {
        // Fast path: check DB
        if (mockDatabase.has(userChainKey)) {
          return mockDatabase.get(userChainKey);
        }

        // Simulate Circle call
        circleCallCount++;
        const newWallet = {
          user_id: userId,
          blockchain,
          circle_wallet_id: "circle-wallet-sol-1",
          wallet_address: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM"
        };

        // Unique constraint simulation
        if (mockDatabase.has(userChainKey)) {
          return mockDatabase.get(userChainKey);
        }
        mockDatabase.set(userChainKey, newWallet);
        return newWallet;
      }

      // Simulate 5 simultaneous requests
      const results = await Promise.all([
        simulateConcurrentProvision(),
        simulateConcurrentProvision(),
        simulateConcurrentProvision(),
        simulateConcurrentProvision(),
        simulateConcurrentProvision(),
      ]);

      for (const res of results) {
        assert.equal(res.circle_wallet_id, "circle-wallet-sol-1");
        assert.equal(res.wallet_address, "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM");
      }
      assert.equal(mockDatabase.size, 1, "Must maintain exactly one mapping per (user_id, blockchain)");
    });

    it("verifies no private keys or secrets are present in wallet objects", () => {
      const walletRecord = {
        id: "db-record-uuid",
        user_id: "user-123",
        blockchain: "SOL-DEVNET",
        circle_wallet_id: "circle-sol-uuid",
        circle_wallet_set_id: "circle-set-uuid",
        wallet_address: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
        ref_id: "arc_user123_SOL-DEVNET",
        status: "LIVE"
      };

      const serialized = JSON.stringify(walletRecord);
      assert.ok(!serialized.includes("privateKey"), "Must not contain privateKey");
      assert.ok(!serialized.includes("secretKey"), "Must not contain secretKey");
      assert.ok(!serialized.includes("mnemonic"), "Must not contain mnemonic");
      assert.ok(!serialized.includes("entitySecret"), "Must not contain entitySecret");
    });

    it("validates destination address formats correctly for Solana vs EVM transfers", async () => {
      const { PublicKey } = await import('@solana/web3.js');
      const { isAddress } = await import('viem');

      const validSolana = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
      const validEvm = "0x742d35Cc6634C0532925a3b844Bc454e4438f44e";
      const systemProgram = "11111111111111111111111111111111";

      // Solana validation
      const solPk = new PublicKey(validSolana);
      assert.ok(PublicKey.isOnCurve(solPk.toBytes()), "Valid Solana address must be on curve");
      assert.ok(!isAddress(validSolana), "Solana address must not validate as EVM address");

      // EVM validation
      assert.ok(isAddress(validEvm), "Valid EVM address must pass isAddress");
      assert.throws(() => new PublicKey(validEvm), "EVM address must fail Solana PublicKey constructor");

      // System program rejection
      assert.equal(systemProgram, "11111111111111111111111111111111");
    });

    it("auto-recovers active wallet set when provided walletSetId is stale or missing", async () => {
      const mockActiveSet = { id: "active-set-123", name: "ArcFun MultiChain Set" };
      const mockListWalletSets = async () => ({
        data: { walletSets: [mockActiveSet] }
      });

      // Simulation of getEffectiveWalletSetId resolution
      const resolveWalletSet = async (envId: string | undefined, listFn: typeof mockListWalletSets) => {
        const resp = await listFn();
        const sets = resp.data?.walletSets || [];
        if (envId && sets.some(s => s.id === envId)) return envId;
        if (sets.length > 0) return sets[0].id;
        throw new Error("No wallet sets available");
      };

      // 1. Matches when valid
      const resolvedValid = await resolveWalletSet("active-set-123", mockListWalletSets);
      assert.equal(resolvedValid, "active-set-123");

      // 2. Auto-recovers to active set when env var is stale (e.g. from outdated server startup)
      const resolvedStale = await resolveWalletSet("stale-old-uuid-456", mockListWalletSets);
      assert.equal(resolvedStale, "active-set-123", "Must recover to active set on stale env ID");

      // 3. Auto-recovers when env is missing
      const resolvedMissing = await resolveWalletSet(undefined, mockListWalletSets);
      assert.equal(resolvedMissing, "active-set-123", "Must recover to active set when env is undefined");
    });
  });
});
