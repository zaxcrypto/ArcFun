import { NextResponse } from 'next/server';
import { ChainRouter } from '@/lib/bridge/adapters/chain-router';
import { getCctpDomains, getCircleIrisApi } from '@/lib/bridge/cctp-provider';
import { isMainnetChain } from '@/config/swap-contract';
import { checkRateLimit } from '@/lib/rate-limit';
import { normalizeError, errorResponse } from '@/lib/errors/error-normalizer';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { RECOVERABLE_BRIDGE_STATES } from '@/lib/bridge/state-machine';
import { verifySessionToken, getSessionTokenFromRequest } from '@/lib/verify-session';
import { verifySourceTxOnChain } from '@/lib/bridge/source-tx-verifier';

// ── Per-hash cooldown to prevent duplicate execution attempts ──────────────
// Key = burn_tx_hash, Value = timestamp of last execution attempt
const hashCooldownMap = new Map<string, number>();
const HASH_COOLDOWN_MS = 60_000; // 60 seconds between attempts for same hash
const MAX_COOLDOWN_ENTRIES = 5000;

function checkHashCooldown(hash: string): boolean {
  // Evict expired entries periodically
  if (hashCooldownMap.size > MAX_COOLDOWN_ENTRIES) {
    const now = Date.now();
    for (const [key, ts] of hashCooldownMap) {
      if (now - ts > HASH_COOLDOWN_MS) hashCooldownMap.delete(key);
    }
  }
  const lastAttempt = hashCooldownMap.get(hash);
  if (lastAttempt && Date.now() - lastAttempt < HASH_COOLDOWN_MS) {
    return false; // Still in cooldown
  }
  hashCooldownMap.set(hash, Date.now());
  return true; // Allowed
}

export async function POST(req: Request) {
  try {
    // ── P0: Turnstile bot protection (Bypassed for local development referers/hosts) ──
    const sessionToken = getSessionTokenFromRequest(req);
    const host = req.headers.get("host") || "";
    const referer = req.headers.get("referer") || "";
    const origin = req.headers.get("origin") || "";
    const isLocal = 
      host.includes("localhost:") || host.includes("127.0.0.1:") ||
      referer.includes("localhost:") || referer.includes("127.0.0.1:") ||
      origin.includes("localhost:") || origin.includes("127.0.0.1:") ||
      sessionToken === "local-dev-bypass";
    
    if (!isLocal && !(await verifySessionToken(sessionToken))) {
      return NextResponse.json(
        { error: 'Security verification required. Please complete the Turnstile challenge.' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { source_network, burn_tx_hash } = body;
    const env = (body.environment || (isMainnetChain(source_network) ? "mainnet" : "testnet")) as "mainnet" | "testnet";

    if (!source_network || !burn_tx_hash) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    // ── P0: IP rate limiting ─────────────────────────────────────────────
    const rateLimitError = await checkRateLimit(req, undefined, { maxRequests: 5, windowMs: 60000 });
    if (rateLimitError) return rateLimitError;

    // ── P0: Per-hash cooldown ────────────────────────────────────────────
    const normalizedHash = burn_tx_hash.trim().toLowerCase();
    if (!checkHashCooldown(normalizedHash)) {
      return NextResponse.json(
        { error: 'This transaction was recently processed. Please wait 60 seconds before retrying.' },
        { status: 429 }
      );
    }

    const activeDomains = getCctpDomains(env);
    const irisApi = getCircleIrisApi(env);

    // 1. Convert source network
    const sourceDomainDef = activeDomains[source_network as string];
    if (!sourceDomainDef) {
      return errorResponse('ERR_NETWORK_NOT_SUPPORTED', undefined, 400);
    }

    // 2. Query Iris API
    const url = `${irisApi}/v2/messages/${sourceDomainDef.domain}?transactionHash=${burn_tx_hash}`;
    const res = await fetch(url);
    if (res.status === 404) {
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

    if (!msg || msg.status !== "complete" || !msg.attestation) {
      const onChain = await verifySourceTxOnChain(source_network, burn_tx_hash, env);
      if (onChain.exists) {
        if (onChain.status === 'failed') {
          return errorResponse('ERR_TRANSACTION_FAILED', undefined, 400);
        }
      }
      return errorResponse('ERR_ATTESTATION_NOT_READY', undefined, 409);
    }

    // 3. Decode & Validate
    const decodedMessage = msg.decodedMessage;
    if (!decodedMessage || !decodedMessage.decodedMessageBody) {
        return errorResponse('ERR_INTERNAL', 'Iris API parsing', 500);
    }

    // 4. Check destinationCaller (Only restrict for EVM destination chains)
    const destinationCaller = decodedMessage.destinationCaller;
    const destDomainStr = decodedMessage.destinationDomain.toString();
    const destNetworkEntry = Object.entries(activeDomains).find(([_, config]) => config.domain.toString() === destDomainStr);
    const destination_network = destNetworkEntry ? destNetworkEntry[0] : "";

    if (destinationCaller !== "0x0000000000000000000000000000000000000000000000000000000000000000" &&
        !destination_network.toLowerCase().includes("solana") &&
        !destination_network.toLowerCase().includes("stellar")) {
        return errorResponse('ERR_DESTINATION_CALLER_RESTRICTED', undefined, 403);
    }

    const destDomainNum = parseInt(decodedMessage.destinationDomain, 10);
    const messageHex = msg.message;
    const attestationHex = msg.attestation;

    // Resolve destination chain name from DB if tracked, otherwise use CCTP domain mapped name
    const { data: dbTx } = await supabaseAdmin
        .from('bridge_transactions')
        .select('destination_chain')
        .eq('burn_tx_hash', burn_tx_hash)
        .maybeSingle();
    const destinationChainName = dbTx?.destination_chain || destination_network;

    // 5. Execution: Pass directly to existing ChainRouter
    let mint_tx_hash: string = "";
    try {
        mint_tx_hash = await ChainRouter.executeMint(destDomainNum, messageHex, attestationHex, destinationChainName);
    } catch (e: unknown) {
        const rawErrorMsg = String((e as Error)?.message || e);
        const normalized = normalizeError(rawErrorMsg, 'ChainRouter.executeMint');
        
        if (normalized.code === "ERR_ALREADY_CLAIMED") {
            console.log(`[Universal Recover API] ALREADY_CLAIMED detected for ${burn_tx_hash}.`);
            mint_tx_hash = "ALREADY_CLAIMED_ON_CHAIN";
        } else {
            return NextResponse.json({ success: false, error: { ...normalized } }, { status: 500 });
        }
    }

    // 6. State Sync: Opportunistically update the database if this transaction belongs to our ecosystem
    try {
        const { error: dbError } = await supabaseAdmin
            .from('bridge_transactions')
            .update({
                bridge_status: 'COMPLETED',
                mint_tx_hash: mint_tx_hash === "ALREADY_CLAIMED_ON_CHAIN" ? undefined : mint_tx_hash,
                completed_at: new Date().toISOString(),
                failure_reason: null
            })
            .eq('burn_tx_hash', burn_tx_hash)
            .in('bridge_status', RECOVERABLE_BRIDGE_STATES); // Strict state transition
            
        if (dbError) {
            console.error(`[Universal Recover API] Failed to sync db state for ${burn_tx_hash}:`, dbError);
        }
    } catch (e) {
        console.error(`[Universal Recover API] Supabase update exception:`, e);
    }

    return NextResponse.json({ success: true, mint_tx_hash });

  } catch (error: any) {
    return errorResponse(error, 'Universal Recover Execute API', 500);
  }
}
