import {
  GATEWAY_MINTER_TESTNET,
  GATEWAY_WALLET_TESTNET,
  ARCFUN_FEE_TREASURY_WALLET,
  isGatewayDomainSupported,
} from "@/config/gateway-config";

export interface ParsedTransferSpec {
  version: number;
  sourceDomain: number;
  destinationDomain: number;
  sourceContract: string;
  destinationContract: string;
  sourceToken: string;
  destinationToken: string;
  sourceDepositor: string;
  destinationRecipient: string;
  sourceSigner: string;
  destinationCaller: string;
  value: bigint;
  salt: string;
  hookData: string;
}

export interface ParsedBurnIntent {
  transferIdOrMaxBlock: string;
  maxFee: number;
  expirationTimestamp: bigint;
  spec: ParsedTransferSpec;
}

export interface ParsedAttestationPayload {
  magic: string;
  numIntents: number;
  intents: ParsedBurnIntent[];
}

export interface AttestationValidationResult {
  isValid: boolean;
  error?: string;
  userIntent?: ParsedBurnIntent;
  feeIntent?: ParsedBurnIntent;
  userAmountUnits?: bigint;
  feeAmountUnits?: bigint;
  totalTransferUnits?: bigint;
  userRecipient?: string;
  userDepositor?: string;
  destinationDomain?: number;
}

export const CIRCLE_ATTESTATION_MAGIC_SET = "1e12db71";
export const CIRCLE_ATTESTATION_MAGIC_SINGLE = "ff6fb334";

/**
 * Extracts 20-byte EVM address from 32-byte zero-padded hex string
 */
export function bytes32ToAddress(hex32: string): string {
  const clean = hex32.startsWith("0x") ? hex32.slice(2) : hex32;
  if (clean.length < 64) return "0x0000000000000000000000000000000000000000";
  return ("0x" + clean.slice(24)).toLowerCase();
}

function parseTransferSpec(buf: Buffer, cursor: number): { spec: ParsedTransferSpec; totalBytes: number } {
  if (cursor + 336 > buf.length) {
    throw new Error(`Attestation truncated at TransferSpec (offset ${cursor})`);
  }

  const version = buf.readUInt32BE(cursor);
  const sourceDomain = buf.readUInt32BE(cursor + 4);
  const destinationDomain = buf.readUInt32BE(cursor + 8);
  const sourceContract = "0x" + buf.slice(cursor + 12, cursor + 44).toString("hex");
  const destinationContract = "0x" + buf.slice(cursor + 44, cursor + 76).toString("hex");
  const sourceToken = "0x" + buf.slice(cursor + 76, cursor + 108).toString("hex");
  const destinationToken = "0x" + buf.slice(cursor + 108, cursor + 140).toString("hex");
  const sourceDepositor = "0x" + buf.slice(cursor + 140, cursor + 172).toString("hex");
  const destinationRecipient = "0x" + buf.slice(cursor + 172, cursor + 204).toString("hex");
  const sourceSigner = "0x" + buf.slice(cursor + 204, cursor + 236).toString("hex");
  const destinationCaller = "0x" + buf.slice(cursor + 236, cursor + 268).toString("hex");
  const value = BigInt("0x" + buf.slice(cursor + 268, cursor + 300).toString("hex"));
  const salt = "0x" + buf.slice(cursor + 300, cursor + 332).toString("hex");
  const hookDataLen = buf.readUInt32BE(cursor + 332);

  let hookData = "0x";
  let totalBytes = 336;
  if (hookDataLen > 0) {
    if (cursor + 336 + hookDataLen > buf.length) {
      throw new Error(`Attestation truncated at hookData (offset ${cursor + 336})`);
    }
    hookData = "0x" + buf.slice(cursor + 336, cursor + 336 + hookDataLen).toString("hex");
    totalBytes += hookDataLen;
  }

  return {
    spec: {
      version,
      sourceDomain,
      destinationDomain,
      sourceContract,
      destinationContract,
      sourceToken,
      destinationToken,
      sourceDepositor,
      destinationRecipient,
      sourceSigner,
      destinationCaller,
      value,
      salt,
      hookData,
    },
    totalBytes,
  };
}

/**
 * Decodes the raw binary payload of a Circle Gateway Attestation.
 * Works for both Single Intent (ff6fb334) and Multi-Intent / IntentSet (1e12db71).
 */
export function decodeCircleAttestation(payloadHex: string): ParsedAttestationPayload {
  const cleanHex = payloadHex.startsWith("0x") ? payloadHex.slice(2) : payloadHex;
  const buf = Buffer.from(cleanHex, "hex");

  if (buf.length < 8) {
    throw new Error("Attestation payload is too short (< 8 bytes header)");
  }

  const magic = buf.slice(0, 4).toString("hex").toLowerCase();
  const intents: ParsedBurnIntent[] = [];
  let numIntents = 1;

  if (magic === CIRCLE_ATTESTATION_MAGIC_SINGLE) {
    // Single BurnIntent Attestation (380+ bytes: 4 magic + 32 transferId + 4 maxFee + 4 expiration + 336 TransferSpec)
    if (buf.length < 44 + 336) {
      throw new Error(`Single intent attestation truncated (length: ${buf.length}, required >= 380)`);
    }

    const transferIdOrMaxBlock = "0x" + buf.slice(4, 36).toString("hex");
    const maxFee = buf.readUInt32BE(36);
    const expirationTimestamp = BigInt(buf.readUInt32BE(40));
    let cursor = 44;

    const parsedSpec = parseTransferSpec(buf, cursor);
    intents.push({
      transferIdOrMaxBlock,
      maxFee,
      expirationTimestamp,
      spec: parsedSpec.spec,
    });
  } else if (magic === CIRCLE_ATTESTATION_MAGIC_SET) {
    // Multi-Intent Attestation Set (8 bytes header: 4 magic + 4 numIntents, then intents)
    numIntents = buf.readUInt32BE(4);
    if (numIntents < 1 || numIntents > 10) {
      throw new Error(`Invalid intent count in attestation: ${numIntents}`);
    }

    let cursor = 8;
    for (let i = 0; i < numIntents; i++) {
      // Skip optional per-sub-intent magic prefix (ff6fb334)
      if (
        cursor + 4 <= buf.length &&
        buf.slice(cursor, cursor + 4).toString("hex").toLowerCase() === CIRCLE_ATTESTATION_MAGIC_SINGLE
      ) {
        cursor += 4;
      }

      // Each sub-intent header: 32 bytes transferId + 4 bytes maxFee + 4 bytes expirationTimestamp = 40 bytes
      if (cursor + 40 > buf.length) {
        throw new Error(`Attestation truncated at intent ${i} header (offset ${cursor}, buf.length ${buf.length})`);
      }

      const transferIdOrMaxBlock = "0x" + buf.slice(cursor, cursor + 32).toString("hex");
      const maxFee = buf.readUInt32BE(cursor + 32);
      // expirationTimestamp is always a 4-byte uint32 in Circle Gateway V1 protocol
      const expirationTimestamp = BigInt(buf.readUInt32BE(cursor + 36));
      cursor += 40; // advance past the 40-byte header

      const parsedSpec = parseTransferSpec(buf, cursor);
      cursor += parsedSpec.totalBytes;

      intents.push({
        transferIdOrMaxBlock,
        maxFee,
        expirationTimestamp,
        spec: parsedSpec.spec,
      });
    }
  } else {
    throw new Error(
      `Invalid attestation magic: ${magic}. Expected ${CIRCLE_ATTESTATION_MAGIC_SET} or ${CIRCLE_ATTESTATION_MAGIC_SINGLE}`
    );
  }

  return { magic, numIntents, intents };
}

/**
 * Robustly validates that an attestation satisfies ArcFun Sponsored Mint requirements.
 * Rejects any external, unauthenticated, or economically invalid attempts to use the relayer.
 */
export function validateArcFunSponsoredAttestation(params: {
  attestationPayload: string;
  expectedDestinationDomain: number;
  expectedRecipient: string;
  expectedUserWallet: string;
  isManualClaim?: boolean;
}): AttestationValidationResult {
  const {
    attestationPayload,
    expectedDestinationDomain,
    expectedRecipient,
    expectedUserWallet,
    isManualClaim = false,
  } = params;

  let decoded: ParsedAttestationPayload;
  try {
    decoded = decodeCircleAttestation(attestationPayload);
  } catch (err: any) {
    return {
      isValid: false,
      error: `Malformed attestation payload: ${err.message || String(err)}`,
    };
  }

  if (decoded.intents.length === 0) {
    return { isValid: false, error: "Attestation contains zero transfer intents" };
  }

  const userIntent = decoded.intents[0];
  const userRecipient = bytes32ToAddress(userIntent.spec.destinationRecipient);
  const userDepositor = bytes32ToAddress(userIntent.spec.sourceDepositor);
  const userSigner = bytes32ToAddress(userIntent.spec.sourceSigner);
  const minterAddress = bytes32ToAddress(userIntent.spec.destinationContract);
  const walletAddress = bytes32ToAddress(userIntent.spec.sourceContract);

  // 1. Destination Domain Validation
  if (!isGatewayDomainSupported(userIntent.spec.destinationDomain)) {
    return {
      isValid: false,
      error: `Destination domain ${userIntent.spec.destinationDomain} is not in the supported allowlist`,
    };
  }

  if (userIntent.spec.destinationDomain !== expectedDestinationDomain) {
    return {
      isValid: false,
      error: `Attestation destination domain (${userIntent.spec.destinationDomain}) does not match request domain (${expectedDestinationDomain})`,
    };
  }

  // 2. Gateway Contract Binding
  if (minterAddress.toLowerCase() !== GATEWAY_MINTER_TESTNET.toLowerCase()) {
    return {
      isValid: false,
      error: `Attestation destination contract (${minterAddress}) is not the legitimate GatewayMinter (${GATEWAY_MINTER_TESTNET})`,
    };
  }

  if (walletAddress.toLowerCase() !== GATEWAY_WALLET_TESTNET.toLowerCase()) {
    return {
      isValid: false,
      error: `Attestation source contract (${walletAddress}) is not the legitimate GatewayWallet (${GATEWAY_WALLET_TESTNET})`,
    };
  }

  // 3. User Identity Binding
  const cleanExpectedUser = expectedUserWallet.toLowerCase();
  if (userDepositor !== cleanExpectedUser && userSigner !== cleanExpectedUser) {
    return {
      isValid: false,
      error: `Attestation depositor (${userDepositor}) does not match authenticated user (${cleanExpectedUser})`,
    };
  }

  const cleanExpectedRecipient = expectedRecipient.toLowerCase();
  if (userRecipient !== cleanExpectedRecipient) {
    return {
      isValid: false,
      error: `Attestation recipient (${userRecipient}) does not match request recipient (${cleanExpectedRecipient})`,
    };
  }

  // 4. Value Check
  if (userIntent.spec.value <= 0n) {
    return {
      isValid: false,
      error: "User transfer amount must be greater than zero",
    };
  }

  // 5. Sponsored vs Manual Mode Validation
  if (isManualClaim) {
    // In Manual Claim, ArcFun relayer should NOT be used!
    return {
      isValid: false,
      error: "Manual Claim transfers must be submitted by the user's wallet, not sponsored by ArcFun Relayer.",
    };
  }

  const userAmountUnits = userIntent.spec.value;
  let feeIntent: ParsedBurnIntent | undefined;
  let feeAmountUnits = 0n;

  // In multi-intent mode (IntentSet with Intent 2 for ArcFun platform fee):
  if (decoded.intents.length >= 2) {
    feeIntent = decoded.intents[1];
    const feeRecipient = bytes32ToAddress(feeIntent.spec.destinationRecipient);
    const cleanTreasury = ARCFUN_FEE_TREASURY_WALLET.toLowerCase();

    if (feeRecipient !== cleanTreasury) {
      return {
        isValid: false,
        error: `Fee intent recipient (${feeRecipient}) does not match ArcFun Fee Treasury (${cleanTreasury})`,
      };
    }

    if (feeIntent.spec.destinationDomain !== userIntent.spec.destinationDomain) {
      return {
        isValid: false,
        error: "Fee intent destination domain does not match user transfer domain",
      };
    }

    feeAmountUnits = feeIntent.spec.value;
    const totalTransferUnits = userAmountUnits + feeAmountUnits;

    // Verify fee satisfies ArcFun 1% policy (with small tolerance for Circle forwarder fee deductions)
    // 1% of total is totalTransferUnits * 100 / 10000
    const expectedMinFee = (totalTransferUnits * 80n) / 10000n; // At least 0.8% net after forwarder deductions
    if (feeAmountUnits < expectedMinFee || feeAmountUnits <= 0n) {
      return {
        isValid: false,
        error: `Fee amount (${feeAmountUnits.toString()} units) is below ArcFun platform fee policy for sponsored transfers`,
      };
    }
  }

  const totalTransferUnits = userAmountUnits + feeAmountUnits;

  return {
    isValid: true,
    userIntent,
    feeIntent,
    userAmountUnits,
    feeAmountUnits,
    totalTransferUnits,
    userRecipient,
    userDepositor,
    destinationDomain: userIntent.spec.destinationDomain,
  };
}
