import { Connection, PublicKey } from '@solana/web3.js';
import { createSolanaAdapterFromPrivateKey } from '@circle-fin/adapter-solana';
import { SolanaDevnet, Solana } from '@circle-fin/app-kit/chains';
import { CCTP_DOMAINS, MAINNET_CCTP_DOMAINS } from '../cctp-provider';

export class SolanaAdapter {
  static async submitMint(
    destinationDomain: number,
    messageHex: string,
    attestationHex: string,
    destinationChainName?: string
  ): Promise<string> {
    const isDevnet = destinationChainName 
      ? destinationChainName.toLowerCase().includes("devnet") 
      : (process.env.SOLANA_NETWORK !== "mainnet" && process.env.SOLANA_NETWORK !== "mainnet-beta");
    const rpcUrl = isDevnet 
      ? (process.env.SOLANA_DEVNET_RPC_URL || 'https://api.devnet.solana.com')
      : (process.env.SOLANA_MAINNET_RPC_URL || 'https://api.mainnet-beta.solana.com');

    const privateKey = process.env.SOL_CCTP_TEST_KEY;
    if (!privateKey) {
      throw new Error("SOL_CCTP_TEST_KEY is not configured on server");
    }

    const connection = new Connection(rpcUrl, 'confirmed');

    // Clean hex utility
    const cleanMsg = messageHex.replace(/^0x/, '');
    const cleanAtt = attestationHex.replace(/^0x/, '');
    
    const messageBuf = Buffer.from(cleanMsg, 'hex');

    // 1. Parse Source Domain and Nonce from CCTP Message Header
    const sourceDomainNum = messageBuf.readUInt32BE(4);
    const nonceNum = messageBuf.readBigUInt64BE(12);

    // 2. Derive 32-byte eventNonce (bytes 12 to 44 of message)
    const eventNonce = cleanMsg.slice(12 * 2, 44 * 2);

    // 3. Parse Recipient ATA (bytes 184 to 216)
    const recipientHex = cleanMsg.slice(184 * 2, 216 * 2);
    const recipientBytes = Buffer.from(recipientHex, 'hex');

    let recipientAta: PublicKey;
    let destinationAddress = "";

    if (recipientHex.startsWith("000000000000000000000000")) {
      const evmAddr = "0x" + recipientHex.slice(24);
      console.warn(`[SolanaAdapter] Warning: Recipient address in CCTP message is an EVM address (${evmAddr}) zero-padded to 32 bytes, not a Solana Base58 PublicKey.`);
      recipientAta = new PublicKey(recipientBytes);
      destinationAddress = recipientAta.toBase58();
    } else {
      recipientAta = new PublicKey(recipientBytes);
      destinationAddress = recipientAta.toBase58();
    }

    // 4. Resolve on-curve wallet owner address from ATA
    try {
      const accInfo = await connection.getAccountInfo(recipientAta);
      if (accInfo && accInfo.owner.toBase58() === "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" && accInfo.data.length === 165) {
        // SPL Token account layout puts the owner public key at bytes 32-64
        const ownerBytes = accInfo.data.slice(32, 64);
        destinationAddress = new PublicKey(ownerBytes).toBase58();
        console.log(`[SolanaAdapter] Resolved on-curve owner address ${destinationAddress} from recipient ATA.`);
      } else {
        console.log(`[SolanaAdapter] Recipient is not an SPL Token account. Using recipient address directly: ${destinationAddress}`);
      }
    } catch (resolveErr) {
      console.warn(`[SolanaAdapter] Failed to resolve ATA owner:`, resolveErr);
    }

    // 5. Dynamic fromChain configuration based on CCTP_DOMAINS
    const allDomains = isDevnet ? CCTP_DOMAINS : { ...CCTP_DOMAINS, ...MAINNET_CCTP_DOMAINS };
    let sourceChainName = "";
    for (const [name, config] of Object.entries(allDomains)) {
      if (config.domain === sourceDomainNum) {
        sourceChainName = name;
        break;
      }
    }

    if (!sourceChainName) {
      throw new Error(`Unsupported source domain: ${sourceDomainNum}`);
    }

    const sourceDomainConfig = allDomains[sourceChainName];
    const rawUsdc = sourceDomainConfig?.usdc || "";
    // If source chain is Sui, strip the Move type argument (e.g. ::usdc::USDC) to provide a clean 32-byte hex address
    const cleanUsdcAddress = rawUsdc.includes("::") ? rawUsdc.split("::")[0] : rawUsdc;

    const fromChain = {
      type: sourceChainName.toLowerCase().includes("stellar") ? "stellar" : "evm",
      chain: sourceChainName.replace(/\s+/g, '_'),
      name: sourceChainName,
      usdcAddress: cleanUsdcAddress,
      cctp: {
        domain: sourceDomainNum,
        contracts: {
          v2: {
            type: "split",
            tokenMessenger: sourceDomainConfig?.tokenMessenger || "",
            messageTransmitter: sourceDomainConfig?.messageTransmitter || ""
          }
        }
      }
    };

    // 6. Create adapter
    const adapter = await createSolanaAdapterFromPrivateKey({
      privateKey,
      connection
    });

    const targetChain = isDevnet ? SolanaDevnet : Solana;

    // 7. Invoke receiveMessage action handler from Map registry
    const handler = adapter.actionRegistry.actionHandlers.get('cctp.v2.receiveMessage');
    if (!handler) {
      throw new Error("cctp.v2.receiveMessage action handler not found in Solana adapter");
    }

    const adapterAddress = await adapter.getAddress(targetChain);

    console.log(`[SolanaAdapter] Executing mint for nonce ${nonceNum.toString()} (domain ${sourceDomainNum} -> ${destinationDomain}) to recipient ${destinationAddress}...`);
    const result = await handler({
      fromChain,
      toChain: targetChain,
      eventNonce,
      destinationAddress,
      message: '0x' + cleanMsg,
      attestation: '0x' + cleanAtt
    }, {
      chain: targetChain,
      address: adapterAddress
    });

    // 8. Submit transaction and return signature
    const signature = await result.execute();
    console.log(`[SolanaAdapter] Successfully submitted mint! Signature: ${signature}`);
    return signature;
  }
}
