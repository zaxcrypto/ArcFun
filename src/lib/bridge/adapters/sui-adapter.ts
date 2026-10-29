import { SuiGrpcClient } from "@mysten/sui/grpc";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import { Transaction } from "@mysten/sui/transactions";
import { getSuiCctpConfig, type SuiCctpConfig } from "@/lib/bridge/sui-cctp-config";

export class SuiAdapter {
  static getKeypair(): Ed25519Keypair {
    const rawKey = process.env.SUI_WALLET || process.env.SUI_PRIVATE_KEY;
    if (!rawKey) {
      throw new Error("Missing SUI_WALLET or SUI_PRIVATE_KEY in environment variables.");
    }

    if (rawKey.startsWith("suiprivkey")) {
      const { secretKey } = decodeSuiPrivateKey(rawKey);
      return Ed25519Keypair.fromSecretKey(secretKey);
    }

    return Ed25519Keypair.fromSecretKey(rawKey);
  }

  /**
   * Submits the Circle CCTP V2 destination receive & mint transaction on Sui.
   * Composes the atomic 4-step Programmable Transaction Block (PTB) verified against official Circle CCTP V2 docs:
   * 1. MessageTransmitterV2::receive_message::receive_message
   * 2. TokenMessengerMinterV2::handle_receive_message::prepare_mint
   * 3. StablecoinHandler::handler::mint
   * 4. TokenMessengerMinterV2::handle_receive_message::complete_mint
   */
  static async submitMint(
    messageHex: string,
    attestationHex: string,
    destinationChainName?: string
  ): Promise<string> {
    const isMainnet = destinationChainName?.toLowerCase().includes("mainnet") || false;
    const config: SuiCctpConfig = getSuiCctpConfig(isMainnet);

    console.log(`[SuiAdapter] Initializing Sui CCTP V2 receive & mint execution (${isMainnet ? 'Mainnet' : 'Testnet'})...`);
    
    const keypair = this.getKeypair();
    const cleanMsg = messageHex.startsWith("0x") ? messageHex.slice(2) : messageHex;
    const cleanAtt = attestationHex.startsWith("0x") ? attestationHex.slice(2) : attestationHex;

    const msgBytesArray = Array.from(Buffer.from(cleanMsg, "hex"));
    const attestationArray = Array.from(Buffer.from(cleanAtt, "hex"));

    const tx = new Transaction();

    // ── Step 1: receive_message on MessageTransmitterV2 ──────────────────────
    const [receipt] = tx.moveCall({
      target: `${config.mtV2PackageId}::receive_message::receive_message`,
      arguments: [
        tx.pure.vector("u8", msgBytesArray),
        tx.pure.vector("u8", attestationArray),
        tx.object(config.mtV2StateId),
      ],
    });

    // ── Step 2: prepare_mint on TokenMessengerMinterV2 ───────────────────────
    const [mintReceipt] = tx.moveCall({
      target: `${config.tmmV2PackageId}::handle_receive_message::prepare_mint`,
      arguments: [
        receipt,
        tx.object(config.tmmV2StateId),
        tx.object(config.clockId), // Sui clock (0x6)
      ],
      typeArguments: [config.usdcCoinType],
    });

    // ── Step 3: mint on StablecoinHandler ────────────────────────────────────
    const [completeMintTicket] = tx.moveCall({
      target: `${config.handlerPackageId}::handler::mint`,
      arguments: [
        tx.object(config.handlerStateId),
        mintReceipt,
        tx.object(config.tmmV2StateId),
        tx.object(config.treasuryId),
        tx.object(config.denyListId), // Sui deny list (0x403)
      ],
    });

    // ── Step 4: complete_mint on TokenMessengerMinterV2 ──────────────────────
    tx.moveCall({
      target: `${config.tmmV2PackageId}::handle_receive_message::complete_mint`,
      arguments: [
        completeMintTicket,
        tx.object(config.tmmV2StateId),
        tx.object(config.mtV2StateId),
      ],
      typeArguments: [
        config.usdcCoinType,
        `${config.handlerPackageId}::handler::Auth`,
      ],
    });

    const senderAddr = keypair.toSuiAddress();
    tx.setSender(senderAddr);
    tx.setGasBudget(100_000_000); // 0.1 SUI

    const primaryRpc = isMainnet 
      ? (process.env.NEXT_PUBLIC_SUI_MAINNET_RPC_URL || process.env.SUI_MAINNET_RPC_URL || config.rpcUrl)
      : (process.env.NEXT_PUBLIC_SUI_RPC_URL || process.env.SUI_RPC_URL || config.rpcUrl);
    
    const fallbackRpc = isMainnet
      ? "https://fullnode.mainnet.sui.io:443"
      : "https://fullnode.testnet.sui.io:443";

    const rpcUrls = Array.from(new Set([primaryRpc, fallbackRpc]));
    let lastError: any = null;

    for (const url of rpcUrls) {
      try {
        console.log(`[SuiAdapter] Submitting CCTP V2 PTB with sender ${senderAddr} via gRPC: ${url}`);
        const grpcClient = new SuiGrpcClient({ baseUrl: url, network: isMainnet ? "mainnet" : "testnet" });
        const result = await grpcClient.signAndExecuteTransaction({
          signer: keypair,
          transaction: tx,
        });

        if (result.$kind === "Transaction") {
          const digest = result.Transaction.digest;
          console.log(`[SuiAdapter] CCTP V2 Mint successful! Digest: ${digest}`);
          return digest;
        }

        const errDetail = (result.FailedTransaction?.status as any)?.error?.message || "Transaction execution failed";
        console.error("[SuiAdapter] Execution failed:", errDetail);
        const errLower = errDetail.toLowerCase();
        if (
          errLower.includes("already used") ||
          errLower.includes("alreadyclaimed") ||
          errLower.includes("noncealreadyused") ||
          errLower.includes("already received") ||
          errLower.includes("abort code: 4") ||
          errLower.includes("abortcode: '4'") ||
          errLower.includes("abortcode: 4") ||
          errLower.includes("enoncealreadyused")
        ) {
          const error: any = new Error("ERR_ALREADY_CLAIMED");
          error.code = "ERR_ALREADY_CLAIMED";
          throw error;
        }
        throw new Error(`Sui CCTP V2 mint failed: ${errDetail}`);
      } catch (e: any) {
        lastError = e;
        const msg = String(e?.message || e);
        const msgLower = msg.toLowerCase();
        if (
          e?.code === "ERR_ALREADY_CLAIMED" ||
          msg.includes("ERR_ALREADY_CLAIMED") ||
          msgLower.includes("abort code: 4") ||
          msgLower.includes("abortcode: '4'") ||
          msgLower.includes("abortcode: 4") ||
          msgLower.includes("enoncealreadyused") ||
          msgLower.includes("already used") ||
          msgLower.includes("nonce already used") ||
          msgLower.includes("already received") ||
          msgLower.includes("alreadyclaimed")
        ) {
          console.log(`[SuiAdapter] Nonce already used / message already claimed detected on Sui: ${msg}`);
          const err: any = new Error("ERR_ALREADY_CLAIMED");
          err.code = "ERR_ALREADY_CLAIMED";
          throw err;
        }
        console.warn(`[SuiAdapter] gRPC ${url} attempt failed: ${e.message || e}. Trying next fallback...`);
      }
    }
    throw lastError || new Error("All Sui gRPC attempts failed");
  }
}
