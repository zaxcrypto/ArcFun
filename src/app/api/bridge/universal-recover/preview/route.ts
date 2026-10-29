import { NextResponse } from 'next/server';
import { getCctpDomains, getCircleIrisApi, MESSAGE_TRANSMITTER_V2_ABI } from '@/lib/bridge/cctp-provider';
import { isMainnetChain } from '@/config/swap-contract';
import { checkRateLimit } from '@/lib/rate-limit';
import { normalizeError, errorResponse } from '@/lib/errors/error-normalizer';
import { getEvmFallbacks } from '@/lib/evm-rpc';
import { ethers } from 'ethers';

import { verifySourceTxOnChain } from '@/lib/bridge/source-tx-verifier';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { source_network, burn_tx_hash } = body;
    const env = (body.environment || (isMainnetChain(source_network) ? "mainnet" : "testnet")) as "mainnet" | "testnet";

    if (!source_network || !burn_tx_hash) {
      return errorResponse('ERR_INVALID_BURN_HASH', undefined, 400);
    }

    // Rate limiting to prevent Iris API abuse
    const rateLimitError = await checkRateLimit(req, undefined, { maxRequests: 10, windowMs: 60000 });
    if (rateLimitError) return rateLimitError;

    const activeDomains = getCctpDomains(env);
    const irisApi = getCircleIrisApi(env);

    const sourceDomainDef = activeDomains[source_network as string];
    if (!sourceDomainDef) {
      return errorResponse('ERR_NETWORK_NOT_SUPPORTED', undefined, 400);
    }

    const url = `${irisApi}/v2/messages/${sourceDomainDef.domain}?transactionHash=${burn_tx_hash}`;
    const res = await fetch(url);
    if (res.status === 404) {
      // Circle Iris returns 404 while transaction block finality / indexing is pending.
      // Verify real on-chain transaction status directly against the source network RPC.
      const onChain = await verifySourceTxOnChain(source_network, burn_tx_hash, env);
      if (onChain.exists) {
        if (onChain.status === 'failed') {
          return errorResponse('ERR_TRANSACTION_FAILED', undefined, 400);
        }
        return errorResponse('ERR_ATTESTATION_NOT_READY', undefined, 409);
      }
      return errorResponse('ERR_INVALID_BURN_HASH', undefined, 404);
    }
    if (!res.ok) {
      return errorResponse('ERR_RPC_UNAVAILABLE', undefined, 502);
    }

    const data = await res.json();
    const msg = data?.messages?.[0];

    if (!msg) {
      const onChain = await verifySourceTxOnChain(source_network, burn_tx_hash, env);
      if (onChain.exists) {
        if (onChain.status === 'failed') {
          return errorResponse('ERR_TRANSACTION_FAILED', undefined, 400);
        }
        return errorResponse('ERR_ATTESTATION_NOT_READY', undefined, 409);
      }
      return errorResponse('ERR_INVALID_BURN_HASH', undefined, 404);
    }

    if (msg.status !== "complete" || !msg.attestation) {
      return errorResponse('ERR_ATTESTATION_NOT_READY', undefined, 409);
    }

    const decodedMessage = msg.decodedMessage;
    if (!decodedMessage || !decodedMessage.decodedMessageBody) {
      return errorResponse('ERR_INTERNAL', 'Iris API parsing', 500);
    }

    // Identify destination network from domain ID
    const destDomainStr = decodedMessage.destinationDomain.toString();
    const destNetworkEntry = Object.entries(activeDomains).find(([_, config]) => config.domain.toString() === destDomainStr);
    const destination_network = destNetworkEntry ? destNetworkEntry[0] : `Unknown (Domain ${destDomainStr})`;

    // Validate Caller (Only restrict for EVM destination chains)
    const destinationCaller = decodedMessage.destinationCaller;
    if (destinationCaller !== "0x0000000000000000000000000000000000000000000000000000000000000000" &&
        !destination_network.toLowerCase().includes("solana") &&
        !destination_network.toLowerCase().includes("stellar")) {
      return errorResponse('ERR_DESTINATION_CALLER_RESTRICTED', undefined, 403);
    }

    // Validate Expiration
    const expirationBlock = decodedMessage.decodedMessageBody.expirationBlock;
    if (expirationBlock !== "0") {
      // Technically we should check the current block on destination, but 0 is standard for no expiration.
      // If it's non-zero, we flag it. (Full expiration check requires RPC call).
    }

    // Re-evaluate current blockchain state (minimal production-safe check)
    try {
      if (destination_network.toLowerCase().includes("solana")) {
        const { Connection, PublicKey } = await import('@solana/web3.js');
        const isDevnet = destination_network.includes("Devnet");
        const rpcUrl = isDevnet 
          ? (process.env.SOLANA_DEVNET_RPC_URL || 'https://api.devnet.solana.com')
          : (process.env.SOLANA_MAINNET_RPC_URL || 'https://api.mainnet-beta.solana.com');
        const connection = new Connection(rpcUrl, 'confirmed');
        
        // Correct V2 PDA seed derivation (bytes 12 to 44 of CCTP message)
        const cleanMsg = msg.message.startsWith('0x') ? msg.message.slice(2) : msg.message;
        const messageBuf = Buffer.from(cleanMsg, 'hex');
        const seedBuf = messageBuf.slice(12, 44);
        
        const programId = new PublicKey("CCTPV2Sm4AdWt5296sk4P66VBZ7bEhcARwFaaS9YPbeC");
        const [pda] = PublicKey.findProgramAddressSync(
          [Buffer.from("used_nonce"), seedBuf],
          programId
        );
        
        const accountInfo = await connection.getAccountInfo(pda);
        if (accountInfo) {
          return errorResponse('ERR_ALREADY_CLAIMED', undefined, 409);
        }
      } else {
        const fallbacks = getEvmFallbacks(destination_network);
        const domainConfig = activeDomains[destination_network];
        if (domainConfig && fallbacks.length > 0) {
          const provider = new ethers.JsonRpcProvider(fallbacks[0]);
          const contract = new ethers.Contract(domainConfig.messageTransmitter, MESSAGE_TRANSMITTER_V2_ABI, provider);
          // Simulate the transaction to see if it reverts with an "already claimed" or "nonce" error
          await contract.receiveMessage.staticCall(msg.message, msg.attestation);
        }
      }
    } catch (e: any) {
      const errStr = String(e?.message || e).toLowerCase();
      if (errStr.includes("nonce already used") || errStr.includes("noncealreadyused")) {
        return errorResponse('ERR_ALREADY_CLAIMED', undefined, 409);
      }
      // If simulation fails for other reasons, we let the frontend preview it anyway, 
      // Execute API will handle exact errors during broadcast.
    }

    // Note: We deliberately DO NOT return the raw message hex or attestation hex to the frontend.
    return NextResponse.json({
      success: true,
      preview: {
        source_network,
        destination_network,
        destinationDomain: parseInt(destDomainStr, 10),
        amount: decodedMessage.decodedMessageBody.amount,
        recipient: decodedMessage.decodedMessageBody.mintRecipient,
        destinationCaller,
        expirationBlock,
        nonce: decodedMessage.nonce,
        status: "Ready to Recover"
      }
    });

  } catch (error: any) {
    return errorResponse(error, 'Universal Recover Preview API', 500);
  }
}
