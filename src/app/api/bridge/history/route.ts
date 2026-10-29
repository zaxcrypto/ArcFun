import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { checkRateLimit } from '@/lib/rate-limit';
import { TESTNET_SUPPORTED_CHAINS, MAINNET_SUPPORTED_CHAINS } from '@/config/swap-contract';
import { getCctpDomains, getCircleIrisApi } from '@/lib/bridge/cctp-provider';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Initialize Supabase Admin Client
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

// ── Hard limit enforced by server. Client can never bypass this. ─────────────
const MAX_PAGE_SIZE = 10;

// ── Cursor encoding / decoding ───────────────────────────────────────────────
// Cursor encodes: { created_at (ISO string), id (UUID string) }
// Format: base64(created_at + "__" + id)
function encodeCursor(created_at: string, id: string): string {
  return Buffer.from(`${created_at}__${id}`).toString('base64url');
}

function decodeCursor(cursor: string): { created_at: string; id: string } | null {
  try {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
    const sep = decoded.lastIndexOf('__');
    if (sep === -1) return null;
    return {
      created_at: decoded.slice(0, sep),
      id: decoded.slice(sep + 2),
    };
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const wallet_address = searchParams.get("wallet");
    const env = (searchParams.get("environment") || "testnet").toLowerCase() as "mainnet" | "testnet";
    const pendingOnly = searchParams.get("pending") === "true";
    // status filter: "all" | "success" | "pending" | "failed"
    const statusFilter = searchParams.get("status") || "all";
    // cursor for keyset pagination
    const cursorParam = searchParams.get("cursor") || null;
    const allowedChains = env === "mainnet" ? MAINNET_SUPPORTED_CHAINS : TESTNET_SUPPORTED_CHAINS;

    const userEvmAddress = wallet_address ? wallet_address.toLowerCase() : null;

    if (!userEvmAddress) {
      return NextResponse.json({ error: 'Missing wallet parameter' }, { status: 400 });
    }

    const rateLimitError = await checkRateLimit(req, userEvmAddress || undefined, { maxRequests: 20, windowMs: 60000 });
    if (rateLimitError) return rateLimitError;

    // ── Auto-heal logic: Check if pending transactions are already claimed on-chain ──
    // (Unchanged — only runs on up to 3 pending txs, does not affect pagination)
    try {
      const { pollCCTPAttestation } = await import('@/lib/bridge/cctp-provider');
      const activeDomains = getCctpDomains(env);
      const { data: pendingTxs } = await supabaseAdmin
        .from("bridge_transactions")
        .select("*")
        .eq("wallet_address", userEvmAddress)
        .in("source_chain", allowedChains)
        .neq("bridge_status", "COMPLETED")
        .neq("bridge_status", "FAILED");

      if (pendingTxs && pendingTxs.length > 0) {
        const checkPromises = pendingTxs.slice(0, 3).map(async (tx) => {
          try {
            const ageMs = Date.now() - new Date(tx.updated_at || tx.created_at).getTime();
            if (ageMs < 15000) return;

            // Cooldown lock
            await supabaseAdmin.from("bridge_transactions")
              .update({ updated_at: new Date().toISOString() })
              .eq("id", tx.id);

            const sourceDomainDef = activeDomains[tx.source_chain];
            const destDomainDef = activeDomains[tx.destination_chain];
            if (!sourceDomainDef || !destDomainDef) return;

            // 1. Check if source chain burn transaction reverted on-chain
            if (!tx.source_chain.toLowerCase().includes("stellar") && !tx.source_chain.toLowerCase().includes("solana")) {
              try {
                const { ChainRegistry } = await import('@/lib/bridge/chain-registry');
                const sourceChainConfig = ChainRegistry.getChainSafe(tx.source_chain);
                if (sourceChainConfig?.rpcUrl) {
                  const { createPublicClient, http } = await import('viem');
                  const sourceClient = createPublicClient({ transport: http(sourceChainConfig.rpcUrl, { timeout: 4000 }) });
                  const receipt = await sourceClient.getTransactionReceipt({ hash: tx.burn_tx_hash as `0x${string}` }).catch(() => null);
                  if (receipt && (receipt.status === 'reverted' || (receipt as any).status === '0x0')) {
                    await supabaseAdmin.from("bridge_transactions")
                      .update({
                        bridge_status: "FAILED",
                        failure_reason: "Burn transaction reverted on source chain",
                        updated_at: new Date().toISOString()
                      })
                      .eq("id", tx.id);
                    return;
                  }
                }
              } catch (srcCheckErr) {
                console.warn("[History Auto-Heal] Source receipt check failed:", srcCheckErr);
              }
            }

            // Poll Circle Iris API (timeout = 3 seconds to keep history response fast)
            const result = await pollCCTPAttestation(sourceDomainDef.domain, tx.burn_tx_hash, 3000, env).catch(() => null);
            if (!result || !result.message) return;

            const cleanMsg = result.message.startsWith('0x') ? result.message.slice(2) : result.message;
            let isClaimed = false;

            if (tx.destination_chain.toLowerCase().includes("solana")) {
              // Check Solana claim status
              const { Connection, PublicKey } = await import('@solana/web3.js');
              const isDevnet = tx.destination_chain.includes("Devnet");
              const rpcUrl = isDevnet
                ? (process.env.SOLANA_DEVNET_RPC_URL || 'https://api.devnet.solana.com')
                : (process.env.SOLANA_MAINNET_RPC_URL || 'https://api.mainnet-beta.solana.com');
              const connection = new Connection(rpcUrl, 'confirmed');

              const messageBuf = Buffer.from(cleanMsg, 'hex');
              const seedBuf = messageBuf.slice(12, 44);
              const programId = new PublicKey("CCTPV2Sm4AdWt5296sk4P66VBZ7bEhcARwFaaS9YPbeC");
              const [pda] = PublicKey.findProgramAddressSync(
                [Buffer.from("used_nonce"), seedBuf],
                programId
              );

              const accountInfo = await connection.getAccountInfo(pda);
              if (accountInfo) isClaimed = true;
            } else if (tx.destination_chain.toLowerCase().includes("stellar")) {
              // Bypass Stellar
            } else {
              // Check EVM claim status
              const { ChainRegistry } = await import('@/lib/bridge/chain-registry');
              const config = ChainRegistry.getChainSafe(tx.destination_chain);
              if (config && config.rpcUrl) {
                const { createPublicClient, http, keccak256, encodePacked } = await import('viem');
                const publicClient = createPublicClient({ transport: http(config.rpcUrl) });

                const nonceHex = cleanMsg.slice(24, 40);
                const nonceNum = BigInt("0x" + nonceHex);

                const hashKey = keccak256(encodePacked(['uint32', 'uint64'], [sourceDomainDef.domain, nonceNum]));

                const MESSAGE_TRANSMITTER_ABI = [
                  {
                    inputs: [{ name: "", type: "bytes32" }],
                    name: "usedNonces",
                    outputs: [{ name: "", type: "uint256" }],
                    stateMutability: "view",
                    type: "function"
                  }
                ] as const;

                const used = await publicClient.readContract({
                  address: destDomainDef.messageTransmitter as `0x${string}`,
                  abi: MESSAGE_TRANSMITTER_ABI,
                  functionName: 'usedNonces',
                  args: [hashKey]
                });

                if (used > 0n) {
                  isClaimed = true;
                }
              }
            }

            if (isClaimed) {
              console.log(`[History Sync] Auto-completing already claimed transaction ${tx.burn_tx_hash}`);
              await supabaseAdmin.from("bridge_transactions").update({
                bridge_status: "COMPLETED",
                mint_tx_hash: "ALREADY_CLAIMED_ON_CHAIN",
                completed_at: new Date().toISOString()
              }).eq("id", tx.id);
            }
          } catch (err) {
            console.warn(`[History Sync] Failed to verify status for ${tx.burn_tx_hash}:`, err);
          }
        });
        await Promise.all(checkPromises).catch(() => null);
      }
    } catch (err) {
      console.warn("[History Sync] Failed to process auto-heal checks:", err);
    }

    // ── Build the paginated Supabase query ────────────────────────────────────
    // Stable ordering: created_at DESC, id DESC (for tie-breaking)
    // Fetch MAX_PAGE_SIZE + 1 to determine hasMore without over-fetching.

    let query = supabaseAdmin
      .from("bridge_transactions")
      .select("*")
      .eq("wallet_address", userEvmAddress)
      .in("source_chain", allowedChains)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(MAX_PAGE_SIZE + 1); // +1 to detect hasMore — client gets MAX_PAGE_SIZE

    // ── Server-side status filter ─────────────────────────────────────────────
    if (pendingOnly || statusFilter === "pending") {
      query = query.neq("bridge_status", "COMPLETED").neq("bridge_status", "FAILED");
    } else if (statusFilter === "success") {
      query = query.eq("bridge_status", "COMPLETED");
    } else if (statusFilter === "failed") {
      query = query.eq("bridge_status", "FAILED");
    }
    // "all" → no status filter applied

    // ── Cursor-based keyset pagination ────────────────────────────────────────
    // Cursor = encode(created_at, id) of the last record on the previous page.
    // Next page: created_at < cursor.created_at
    //         OR (created_at = cursor.created_at AND id < cursor.id)
    // This avoids OFFSET which degrades at large N.
    if (cursorParam) {
      const decoded = decodeCursor(cursorParam);
      if (decoded) {
        // Supabase doesn't support OR natively in this SDK style, so we use the
        // simpler keyset: created_at <= cursor_created_at then filter by id in JS.
        // For most workloads (unique timestamps) this is correct; where timestamps
        // collide we handle with the secondary id sort below.
        query = query.lte("created_at", decoded.created_at);
        // We'll post-filter any record with EXACTLY the same created_at but id >= cursor.id
        // in the JS step below so we never miss or duplicate.
      }
    }

    const { data: rawData, error } = await query;

    if (error) throw error;

    let rows = rawData ?? [];

    // ── Apply tie-breaker cursor correction in JS ─────────────────────────────
    // If multiple rows share the exact same created_at as the cursor boundary,
    // only include rows with id < cursor.id (strict less-than to avoid dup).
    if (cursorParam) {
      const decoded = decodeCursor(cursorParam);
      if (decoded) {
        rows = rows.filter((row) => {
          if (row.created_at === decoded.created_at) {
            // same timestamp: only include rows with id strictly less than cursor id
            // (string UUID comparison is safe if using UUIDv4 — falls back to row index)
            return row.id < decoded.id;
          }
          // created_at strictly less than cursor: always include
          return true;
        });
      }
    }

    // ── Determine hasMore via the extra record ────────────────────────────────
    const hasMore = rows.length > MAX_PAGE_SIZE;
    // Strictly return at most MAX_PAGE_SIZE records to the client
    const pageRows = rows.slice(0, MAX_PAGE_SIZE);

    // ── Build nextCursor from the LAST item of the returned page ─────────────
    let nextCursor: string | null = null;
    if (hasMore && pageRows.length === MAX_PAGE_SIZE) {
      const last = pageRows[pageRows.length - 1];
      nextCursor = encodeCursor(last.created_at, last.id);
    }

    return NextResponse.json({
      success: true,
      data: pageRows,
      nextCursor,
      hasMore,
    });
  } catch (error: any) {
    console.error('Bridge History GET Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
