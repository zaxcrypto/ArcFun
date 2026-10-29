import {
  decodeCircleAttestation,
  validateArcFunSponsoredAttestation,
  bytes32ToAddress,
} from "@/lib/gateway/attestation-decoder";
import {
  isSponsorshipEconomicallySafe,
  gasReservationManager,
  MIN_SPONSORED_FEE_USDC_UNITS,
} from "@/lib/gateway/economic-policy";
import {
  isSponsoredMintEnabled,
  setEmergencyKillSwitch,
  setDomainKillSwitch,
} from "@/lib/gateway/emergency-switch";
import {
  GATEWAY_NETWORKS,
  GATEWAY_MINTER_TESTNET,
  GATEWAY_WALLET_TESTNET,
  ARCFUN_FEE_TREASURY_WALLET,
  isGatewayDomainSupported,
  toGatewayBytes32,
} from "@/config/gateway-config";

describe("Circle Gateway Production Security & Reliability Audit Test Suite", () => {
  // Test fixture generator for a valid 2-intent Circle Gateway attestation payload
  function buildMockAttestationPayload(params?: {
    destDomain?: number;
    userDepositor?: string;
    userRecipient?: string;
    feeRecipient?: string;
    userValue?: bigint;
    feeValue?: bigint;
    minterAddress?: string;
    walletAddress?: string;
  }): string {
    const p = {
      destDomain: params?.destDomain ?? 1, // Avalanche Fuji
      userDepositor: params?.userDepositor ?? "0xd448777940dfabf65fd259fa8a9903e60e1ff178",
      userRecipient: params?.userRecipient ?? "0xd448777940dfabf65fd259fa8a9903e60e1ff178",
      feeRecipient: params?.feeRecipient ?? ARCFUN_FEE_TREASURY_WALLET,
      userValue: params?.userValue ?? 5067160780n, // ~5067.16 USDC
      feeValue: params?.feeValue ?? 51183520n,    // ~51.18 USDC (1%)
      minterAddress: params?.minterAddress ?? GATEWAY_MINTER_TESTNET,
      walletAddress: params?.walletAddress ?? GATEWAY_WALLET_TESTNET,
    };

    const buf = Buffer.alloc(768);
    // Header (8 bytes)
    buf.write("1e12db71", 0, "hex");
    buf.writeUInt32BE(2, 4); // 2 intents

    // Intent 0: User Transfer
    buf.write("ff6fb334", 8, "hex");
    buf.writeUInt32BE(15000, 40); // maxFee
    buf.writeBigUInt64BE(BigInt(Date.now() + 600000), 44); // expiration

    const spec0 = 52;
    buf.writeUInt32BE(1, spec0);     // version
    buf.writeUInt32BE(26, spec0 + 4); // sourceDomain (Arc)
    buf.writeUInt32BE(p.destDomain, spec0 + 8); // destDomain
    buf.write(toGatewayBytes32(p.walletAddress).slice(2), spec0 + 12, "hex");
    buf.write(toGatewayBytes32(p.minterAddress).slice(2), spec0 + 44, "hex");
    buf.write(toGatewayBytes32("0x3600000000000000000000000000000000000000").slice(2), spec0 + 76, "hex"); // srcToken
    buf.write(toGatewayBytes32("0x5425890298aed601595a70ab815c96711a31bc65").slice(2), spec0 + 108, "hex"); // dstToken
    buf.write(toGatewayBytes32(p.userDepositor).slice(2), spec0 + 140, "hex");
    buf.write(toGatewayBytes32(p.userRecipient).slice(2), spec0 + 172, "hex");
    buf.write(toGatewayBytes32(p.userDepositor).slice(2), spec0 + 204, "hex");
    buf.write("0".repeat(64), spec0 + 236, "hex"); // destinationCaller
    buf.write(p.userValue.toString(16).padStart(64, "0"), spec0 + 268, "hex"); // value
    buf.write("a".repeat(64), spec0 + 300, "hex"); // salt
    buf.writeUInt32BE(0, spec0 + 332); // hookDataLen = 0

    // Intent 1: ArcFun Treasury Platform Fee
    const intent1Header = 388;
    buf.write("ff6fb334", intent1Header, "hex");
    buf.writeUInt32BE(15000, intent1Header + 32);
    buf.writeBigUInt64BE(BigInt(Date.now() + 600000), intent1Header + 36);

    const spec1 = 432;
    buf.writeUInt32BE(1, spec1);
    buf.writeUInt32BE(26, spec1 + 4);
    buf.writeUInt32BE(p.destDomain, spec1 + 8);
    buf.write(toGatewayBytes32(p.walletAddress).slice(2), spec1 + 12, "hex");
    buf.write(toGatewayBytes32(p.minterAddress).slice(2), spec1 + 44, "hex");
    buf.write(toGatewayBytes32("0x3600000000000000000000000000000000000000").slice(2), spec1 + 76, "hex");
    buf.write(toGatewayBytes32("0x5425890298aed601595a70ab815c96711a31bc65").slice(2), spec1 + 108, "hex");
    buf.write(toGatewayBytes32(p.userDepositor).slice(2), spec1 + 140, "hex");
    buf.write(toGatewayBytes32(p.feeRecipient).slice(2), spec1 + 172, "hex"); // Treasury
    buf.write(toGatewayBytes32(p.userDepositor).slice(2), spec1 + 204, "hex");
    buf.write("0".repeat(64), spec1 + 236, "hex");
    buf.write(p.feeValue.toString(16).padStart(64, "0"), spec1 + 268, "hex");
    buf.write("b".repeat(64), spec1 + 300, "hex");
    buf.writeUInt32BE(0, spec1 + 332);

    return "0x" + buf.toString("hex");
  }

  describe("1. Gateway Network Allowlist & Configuration", () => {
    it("should authorize all approved V1 testnet domains including Arc, Base, Arbitrum, Fuji, Optimism, and Ethereum", () => {
      expect(isGatewayDomainSupported(26)).toBe(true); // Arc Testnet
      expect(isGatewayDomainSupported(6)).toBe(true);  // Base Sepolia
      expect(isGatewayDomainSupported(3)).toBe(true);  // Arbitrum Sepolia
      expect(isGatewayDomainSupported(1)).toBe(true);  // Avalanche Fuji
      expect(isGatewayDomainSupported(2)).toBe(true);  // Optimism Sepolia
      expect(isGatewayDomainSupported(0)).toBe(true);  // Ethereum Sepolia
    });

    it("should strictly reject unauthorized or fake domains", () => {
      expect(isGatewayDomainSupported(999)).toBe(false);
      expect(isGatewayDomainSupported(137)).toBe(false);
      expect(isGatewayDomainSupported(-1)).toBe(false);
    });

    it("should have valid contract and RPC configs for all enabled networks", () => {
      for (const net of Object.values(GATEWAY_NETWORKS)) {
        expect(net.gatewayWallet).toBe(GATEWAY_WALLET_TESTNET);
        expect(net.gatewayMinter).toBe(GATEWAY_MINTER_TESTNET);
        expect(net.rpcUrl).toBeTruthy();
        expect(net.chainId).toBeGreaterThan(0);
      }
    });
  });

  describe("2. Attestation Binary Decoder & Security Validation", () => {
    const validUser = "0xd448777940dfabf65fd259fa8a9903e60e1ff178";

    it("should successfully decode and validate a legitimate ArcFun sponsored attestation", () => {
      const payload = buildMockAttestationPayload();
      const res = validateArcFunSponsoredAttestation({
        attestationPayload: payload,
        expectedDestinationDomain: 1,
        expectedRecipient: validUser,
        expectedUserWallet: validUser,
        isManualClaim: false,
      });

      expect(res.isValid).toBe(true);
      expect(res.destinationDomain).toBe(1);
      expect(res.userAmountUnits).toBe(5067160780n);
      expect(res.feeAmountUnits).toBe(51183520n);
    });

    it("CRITICAL: should reject attestation if user deposits to wrong recipient (attacker address)", () => {
      const payload = buildMockAttestationPayload({
        userRecipient: "0xattacker00000000000000000000000000000001",
      });
      const res = validateArcFunSponsoredAttestation({
        attestationPayload: payload,
        expectedDestinationDomain: 1,
        expectedRecipient: validUser,
        expectedUserWallet: validUser,
        isManualClaim: false,
      });

      expect(res.isValid).toBe(false);
      expect(res.error).toContain("does not match request recipient");
    });

    it("CRITICAL: should reject attestation if platform fee recipient is not ArcFun Treasury", () => {
      const payload = buildMockAttestationPayload({
        feeRecipient: "0xattacker00000000000000000000000000000002",
      });
      const res = validateArcFunSponsoredAttestation({
        attestationPayload: payload,
        expectedDestinationDomain: 1,
        expectedRecipient: validUser,
        expectedUserWallet: validUser,
        isManualClaim: false,
      });

      expect(res.isValid).toBe(false);
      expect(res.error).toContain("does not match ArcFun Fee Treasury");
    });

    it("CRITICAL: should reject sponsored mint if Intent 2 (Platform Fee) is 0 or missing", () => {
      const payload = buildMockAttestationPayload({
        feeValue: 0n,
      });
      const res = validateArcFunSponsoredAttestation({
        attestationPayload: payload,
        expectedDestinationDomain: 1,
        expectedRecipient: validUser,
        expectedUserWallet: validUser,
        isManualClaim: false,
      });

      expect(res.isValid).toBe(false);
      expect(res.error).toContain("below ArcFun platform fee policy");
    });

    it("CRITICAL: should reject external attestation created with wrong GatewayMinter contract", () => {
      const payload = buildMockAttestationPayload({
        minterAddress: "0x1111111111111111111111111111111111111111",
      });
      const res = validateArcFunSponsoredAttestation({
        attestationPayload: payload,
        expectedDestinationDomain: 1,
        expectedRecipient: validUser,
        expectedUserWallet: validUser,
        isManualClaim: false,
      });

      expect(res.isValid).toBe(false);
      expect(res.error).toContain("is not the legitimate GatewayMinter");
    });

    it("CRITICAL: should reject if destination domain in attestation does not match request domain", () => {
      const payload = buildMockAttestationPayload({ destDomain: 6 }); // Base Sepolia in payload
      const res = validateArcFunSponsoredAttestation({
        attestationPayload: payload,
        expectedDestinationDomain: 1, // Fuji requested
        expectedRecipient: validUser,
        expectedUserWallet: validUser,
        isManualClaim: false,
      });

      expect(res.isValid).toBe(false);
      expect(res.error).toContain("does not match request domain");
    });

    it("should successfully decode and validate a single-intent Circle Gateway attestation (ff6fb334)", () => {
      // Build valid 380-byte single intent payload
      const buf = Buffer.alloc(380);
      buf.write("ff6fb334", 0, "hex"); // Single intent magic
      buf.write("0".repeat(64), 4, "hex"); // transferId
      buf.writeUInt32BE(340, 36); // maxFee
      buf.writeUInt32BE(Math.floor(Date.now() / 1000) + 3600, 40); // expiration

      const specOffset = 44;
      buf.writeUInt32BE(1, specOffset); // version
      buf.writeUInt32BE(26, specOffset + 4); // Arc
      buf.writeUInt32BE(6, specOffset + 8); // Base Sepolia
      buf.write(toGatewayBytes32(GATEWAY_WALLET_TESTNET).slice(2), specOffset + 12, "hex");
      buf.write(toGatewayBytes32(GATEWAY_MINTER_TESTNET).slice(2), specOffset + 44, "hex");
      buf.write(toGatewayBytes32("0x3600000000000000000000000000000000000000").slice(2), specOffset + 76, "hex");
      buf.write(toGatewayBytes32("0x036cbd53842c5426634e7929541ec2318f3dcf7e").slice(2), specOffset + 108, "hex");
      buf.write(toGatewayBytes32(validUser).slice(2), specOffset + 140, "hex");
      buf.write(toGatewayBytes32(validUser).slice(2), specOffset + 172, "hex");
      buf.write(toGatewayBytes32(validUser).slice(2), specOffset + 204, "hex");
      buf.write("0".repeat(64), specOffset + 236, "hex");
      buf.write((998000n).toString(16).padStart(64, "0"), specOffset + 268, "hex"); // 0.998 USDC
      buf.write("a".repeat(64), specOffset + 300, "hex");
      buf.writeUInt32BE(0, specOffset + 332);

      const singlePayload = "0x" + buf.toString("hex");
      const decoded = decodeCircleAttestation(singlePayload);
      expect(decoded.magic).toBe("ff6fb334");
      expect(decoded.numIntents).toBe(1);
      expect(decoded.intents[0].spec.destinationDomain).toBe(6);

      const validation = validateArcFunSponsoredAttestation({
        attestationPayload: singlePayload,
        expectedDestinationDomain: 6,
        expectedRecipient: validUser,
        expectedUserWallet: validUser,
        isManualClaim: false,
      });
      expect(validation.isValid).toBe(true);
      expect(validation.userAmountUnits).toBe(998000n);
    });

    it("should reject corrupted or malformed attestation binaries with invalid magic", () => {
      const corrupted = "0xdeadbeef0000000200000000";
      const res = validateArcFunSponsoredAttestation({
        attestationPayload: corrupted,
        expectedDestinationDomain: 1,
        expectedRecipient: validUser,
        expectedUserWallet: validUser,
        isManualClaim: false,
      });

      expect(res.isValid).toBe(false);
      expect(res.error).toContain("Malformed attestation payload");
    });
  });

  describe("3. Economic Safety & Anti-Gas Drain Policy", () => {
    it("should reject sponsorship when platform fee is below minimum threshold ($0.04 USDC)", () => {
      const check = isSponsorshipEconomicallySafe(20_000n, 0.05); // 0.02 USDC fee
      expect(check.safe).toBe(false);
      expect(check.reason).toContain("below the minimum sponsored threshold");
    });

    it("should reject sponsorship when estimated gas cost exceeds platform fee", () => {
      // 0.10 USDC fee ($0.10) vs $0.50 gas cost
      const check = isSponsorshipEconomicallySafe(100_000n, 0.50);
      expect(check.safe).toBe(false);
      expect(check.reason).toContain("exceeds platform fee");
    });

    it("should approve sponsorship when platform fee safely covers gas cost", () => {
      // 1.00 USDC fee vs $0.20 gas cost
      const check = isSponsorshipEconomicallySafe(1_000_000n, 0.20);
      expect(check.safe).toBe(true);
    });
  });

  describe("4. Concurrency-Safe Gas Reservation & TOCTOU Defense", () => {
    it("should prevent overselling relayer gas when concurrent requests exhaust reserve capacity", () => {
      const domain = 26;
      const totalBalanceWei = 1_000_000_000_000_000_000n; // 1.0 native units
      const requiredGasWei = 400_000_000_000_000_000n;  // 0.4 units

      // Request 1: should acquire reservation
      const res1 = gasReservationManager.acquireReservation("transfer-1", domain, totalBalanceWei, requiredGasWei);
      expect(res1.success).toBe(true);

      // Request 2: with 0.4 already reserved, remaining is 0.6. Needed is 0.4 * 1.5 = 0.6. Should acquire.
      const res2 = gasReservationManager.acquireReservation("transfer-2", domain, totalBalanceWei, requiredGasWei);
      expect(res2.success).toBe(true);

      // Request 3: with 0.8 reserved, remaining is 0.2. Request 3 MUST be rejected!
      const res3 = gasReservationManager.acquireReservation("transfer-3", domain, totalBalanceWei, requiredGasWei);
      expect(res3.success).toBe(false);

      // Release transfer-1
      gasReservationManager.releaseReservation("transfer-1");

      // Now Request 4 should succeed after release
      const res4 = gasReservationManager.acquireReservation("transfer-4", domain, totalBalanceWei, requiredGasWei);
      expect(res4.success).toBe(true);

      // Cleanup
      gasReservationManager.releaseReservation("transfer-2");
      gasReservationManager.releaseReservation("transfer-4");
    });
  });

  describe("5. Emergency Kill Switch", () => {
    afterEach(() => {
      setEmergencyKillSwitch(false);
      setDomainKillSwitch(1, false);
    });

    it("should allow sponsored mint when kill switch is disabled", () => {
      expect(isSponsoredMintEnabled(1).enabled).toBe(true);
    });

    it("should instantly block sponsored mint when global emergency kill switch is activated", () => {
      setEmergencyKillSwitch(true, "Security investigation underway");
      const status = isSponsoredMintEnabled(1);
      expect(status.enabled).toBe(false);
      expect(status.reason).toContain("Security investigation underway");
    });

    it("should support domain-specific kill switch without affecting other networks", () => {
      setDomainKillSwitch(1, true); // Halt Fuji
      expect(isSponsoredMintEnabled(1).enabled).toBe(false);
      expect(isSponsoredMintEnabled(26).enabled).toBe(true); // Arc remains active
      expect(isSponsoredMintEnabled(6).enabled).toBe(true);  // Base remains active
    });
  });
});
