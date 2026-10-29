import {
  Keypair,
  Contract,
  TransactionBuilder,
  Networks,
  BASE_FEE,
  rpc,
  Horizon,
  Account,
  nativeToScVal,
  Asset,
  Operation,
} from '@stellar/stellar-sdk';
import { CCTP_DOMAINS } from '../cctp-provider';

// ─── RPC Providers ────────────────────────────────────────────────────────────
const SOROBAN_PROVIDERS = [
  process.env.NEXT_PUBLIC_STELLAR_RPC_URL || process.env.STELLAR_RPC_URL || "https://stellar-testnet.g.alchemy.com/v2/Vt9_fvDipTI7hEZdMc950",
  ...(process.env.NEXT_PUBLIC_STELLAR_RPC_FALLBACK_URL || process.env.STELLAR_RPC_FALLBACK_URL ? [process.env.NEXT_PUBLIC_STELLAR_RPC_FALLBACK_URL || process.env.STELLAR_RPC_FALLBACK_URL!] : []),
  "https://soroban-testnet.stellar.org",
].filter((url, i, arr) => arr.indexOf(url) === i);
const HORIZON_URL = process.env.STELLAR_HORIZON_URL || "https://horizon-testnet.stellar.org";

// ─── Error Helper ─────────────────────────────────────────────────────────────
function stellarErrorString(e: any): string {
  if (!e) return "Unknown error";
  const extras = e?.response?.data?.extras;
  if (extras) {
    const rc = extras.result_codes;
    if (rc) return JSON.stringify(rc);
    const result = extras.result_xdr || extras.result;
    if (result) return String(result);
  }
  return String(e?.response?.data?.detail || e?.message || e);
}

// ─── Soroban RPC Failover ────────────────────────────────────────────────────
async function getSorobanServer(): Promise<rpc.Server> {
  for (const url of SOROBAN_PROVIDERS) {
    try {
      const server = new rpc.Server(url, { allowHttp: false });
      const health = await server.getHealth();
      if (health.status === "healthy") {
        console.log(`[StellarAdapter] Soroban RPC: ${url}`);
        return server;
      }
    } catch (_) {
      console.warn(`[StellarAdapter] Provider unavailable: ${url}`);
    }
  }
  throw new Error("All Soroban RPC providers unavailable.");
}

// ─── Soroban Contract Call Helper ─────────────────────────────────────────────
async function invokeContract(
  contractId: string,
  method: string,
  args: any[],
  keypair: Keypair,
  soroban: rpc.Server,
  horizon: Horizon.Server,
): Promise<string> {
  const publicKey = keypair.publicKey();
  const contract = new Contract(contractId);
  const operation = contract.call(method, ...args);

  // Sequence from Horizon (reliable)
  const horizonAccount = await horizon.loadAccount(publicKey);
  const account = new Account(publicKey, horizonAccount.sequence);

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(operation)
    .setTimeout(60)
    .build();

  // Simulate
  console.log(`[StellarAdapter] Simulating ${method}...`);
  const simResult = await soroban.simulateTransaction(tx);

  if (rpc.Api.isSimulationError(simResult)) {
    const err = String(simResult.error);
    const eventsStr = JSON.stringify((simResult as any).events || []);
    
    // Log the full diagnostic events silently for backend debugging
    console.error(`[StellarAdapter] Simulation failed. Error: ${err}`);
    if ((simResult as any).events) {
       console.error(`[StellarAdapter] Simulation Events:`, eventsStr);
    }

    const errLower = err.toLowerCase();
    const eventsLower = eventsStr.toLowerCase();

    if (errLower.includes("6908")) {
      throw new Error("ALREADY_CLAIMED: Nonce already used on Stellar MessageTransmitter.");
    }
    
    if (eventsLower.includes("trustline entry is missing")) {
      throw new Error("ERR_STELLAR_MISSING_TRUSTLINE");
    }

    console.error(`[StellarAdapter] Soroban simulation failed: ${err}`);
    throw new Error("ERR_TRANSACTION_FAILED");
  }

  // Assemble + sign
  const assembled = rpc.assembleTransaction(tx, simResult).build();
  assembled.sign(keypair);

  console.log(`[StellarAdapter] Submitting ${method}...`);
  const sendResult = await soroban.sendTransaction(assembled);

  if (sendResult.status === "ERROR") {
    console.error(`[StellarAdapter] Send failed: ${JSON.stringify(sendResult.errorResult)}`);
    throw new Error("ERR_TRANSACTION_FAILED");
  }
  if (sendResult.status === "DUPLICATE") {
    console.error("[StellarAdapter] Duplicate Soroban transaction.");
    throw new Error("ALREADY_CLAIMED");
  }

  const txHash = sendResult.hash;
  console.log(`[StellarAdapter] TX submitted: ${txHash}`);

  // Poll confirmation
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 4000));
    const status = await soroban.getTransaction(txHash);
    if (status.status === rpc.Api.GetTransactionStatus.SUCCESS) {
      console.log(`[StellarAdapter] TX confirmed ✅: ${txHash}`);
      return txHash;
    }
    if (status.status === rpc.Api.GetTransactionStatus.FAILED) {
      console.error(`[StellarAdapter] TX failed on-chain: ${txHash}`);
      throw new Error("ERR_TRANSACTION_FAILED");
    }
    console.log(`[StellarAdapter] Waiting... attempt ${i + 1}/20`);
  }
  console.error(`[StellarAdapter] TX did not confirm after 80s: ${txHash}`);
  throw new Error("ERR_TRANSACTION_EXPIRED");
}

// ─── StellarAdapter ───────────────────────────────────────────────────────────
export class StellarAdapter {
  /**
   * Submits a CCTP claim to Stellar by calling MessageTransmitter.receive_message().
   *
   * The MessageTransmitter handles:
   *   1. Attestation verification
   *   2. Nonce replay prevention
   *   3. Delegating to TokenMessengerMinter to mint USDC to the mintRecipient
   *
   * IMPORTANT: Do NOT call CctpForwarder.mint_and_forward() unless the burn
   * transaction included forwarding hook data (forward recipient strkey appended
   * to the message body). Without hook data, error 7300 (HookDataTooShort) fires.
   */
  static async submitMint(messageHex: string, attestationHex: string): Promise<string> {
    if (!messageHex || !attestationHex) {
      throw new Error("Missing message or attestation for Stellar mint.");
    }

    const secret = process.env.STELLAR_SECRET_KEY;
    if (!secret) throw new Error("Missing STELLAR_SECRET_KEY.");

    const keypair = Keypair.fromSecret(secret);
    const messageTransmitter = CCTP_DOMAINS["Stellar Testnet"].messageTransmitter;

    if (!messageTransmitter || !messageTransmitter.startsWith("C")) {
      throw new Error(`Invalid MessageTransmitter: ${messageTransmitter}`);
    }
    const domainConfig = CCTP_DOMAINS["Stellar Testnet"];

    console.log(`[StellarAdapter] MessageTransmitter: ${domainConfig.messageTransmitter}`);
    console.log(`[StellarAdapter] Executor: ${keypair.publicKey()}`);

    if (!domainConfig.cctpForwarder) {
      throw new Error("Missing cctpForwarder configuration for Stellar");
    }

    const contractId = domainConfig.cctpForwarder;
    
    const args = [
      nativeToScVal(Buffer.from(messageHex.replace("0x", ""), "hex"), { type: "bytes" }),
      nativeToScVal(Buffer.from(attestationHex.replace("0x", ""), "hex"), { type: "bytes" }),
    ];

    console.log(`[StellarAdapter] CctpForwarder: ${contractId}`);

    const soroban = await getSorobanServer();
    const horizon = new Horizon.Server(HORIZON_URL, { allowHttp: false });

    try {
      return await invokeContract(
        contractId,
        "mint_and_forward",
        args,
        keypair,
        soroban,
        horizon,
      );
    } catch (e: any) {
      if (e.message === "ERR_STELLAR_MISSING_TRUSTLINE") {
        throw new Error("ERR_STELLAR_MISSING_TRUSTLINE");
      }

      const msg = stellarErrorString(e);
      const msgLower = msg.toLowerCase();

      // Normalise nonce-reuse / duplicate errors into a recognisable sentinel
      if (
        e.message?.startsWith("ALREADY_CLAIMED") ||
        msgLower.includes("noncealreadyused") ||
        msgLower.includes("6908")
      ) {
        throw new Error("ALREADY_CLAIMED");
      }
      console.error(`[StellarAdapter] Stellar Execution Failed: ${msg}`);
      throw new Error("ERR_TRANSACTION_FAILED");
    }
  }

  /**
   * Ensures the executor wallet has a USDC trustline on Stellar.
   * Must be called before the first mint, otherwise the minting will fail.
   */
  static async ensureUsdcTrustline(): Promise<void> {
    const secret = process.env.STELLAR_SECRET_KEY;
    if (!secret) throw new Error("Missing STELLAR_SECRET_KEY.");

    const keypair = Keypair.fromSecret(secret);
    const publicKey = keypair.publicKey();
    const usdcIssuer = CCTP_DOMAINS["Stellar Testnet"].usdc;
    const usdcAsset  = new Asset("USDC", usdcIssuer);
    const horizon    = new Horizon.Server(HORIZON_URL, { allowHttp: false });

    const account = await horizon.loadAccount(publicKey);
    const hasTrustline = account.balances.some(
      (b: any) => b.asset_code === "USDC" && b.asset_issuer === usdcIssuer
    );

    if (hasTrustline) {
      console.log("[StellarAdapter] USDC trustline already exists.");
      return;
    }

    console.log("[StellarAdapter] Establishing USDC trustline...");
    const sourceAccount = new Account(publicKey, account.sequence);
    const tx = new TransactionBuilder(sourceAccount, {
      fee: BASE_FEE,
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(Operation.changeTrust({ asset: usdcAsset }))
      .setTimeout(30)
      .build();

    tx.sign(keypair);
    const result = await horizon.submitTransaction(tx);
    console.log(`[StellarAdapter] Trustline TX: ${result.hash}`);
  }

  /**
   * Returns the 32-byte hex (0x-prefixed) mintRecipient for our backend wallet.
   * Use this as the mintRecipient in depositForBurn so USDC lands in our wallet,
   * NOT in the CctpForwarder (which requires hook data).
   */
  static getWalletMintRecipient(): string {
    const secret = process.env.STELLAR_SECRET_KEY;
    if (!secret) throw new Error("Missing STELLAR_SECRET_KEY.");
    const keypair = Keypair.fromSecret(secret);
    const rawPubkey = keypair.rawPublicKey(); // 32 raw Ed25519 bytes
    return "0x" + Buffer.from(rawPubkey).toString("hex");
  }
}
