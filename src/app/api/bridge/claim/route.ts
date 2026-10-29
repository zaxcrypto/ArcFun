import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { ChainRouter } from '@/lib/bridge/adapters/chain-router';
import { pollCCTPAttestation, getCctpDomains } from '@/lib/bridge/cctp-provider';
import { isMainnetChain } from '@/config/swap-contract';
import { checkRateLimit } from '@/lib/rate-limit';

export const maxDuration = 300;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Initialize Supabase Admin Client
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

export async function POST(req: Request) {
  let rollbackStatus: string | null = null;
  let currentBurnHash: string | null = null;

  try {
    const body = await req.json();
    const {
      burn_tx_hash,
      source_chain: reqSource,
      destination_chain: reqDest,
      wallet_address: reqWallet,
      amount: reqAmount,
      token_symbol: reqTokenSymbol,
      manual_claim: reqManual,
      action: reqAction
    } = body;
    currentBurnHash = burn_tx_hash;

    if (!burn_tx_hash) {
      return NextResponse.json({ error: 'Missing burn_tx_hash parameter' }, { status: 400 });
    }

    // Rate limiting (by IP, since this is now public)
    const rateLimitError = await checkRateLimit(req, undefined, { maxRequests: 30, windowMs: 60000 });
    if (rateLimitError) return rateLimitError;

    interface BridgeTxData {
      bridge_status: string;
      updated_at: string;
      wallet_address: string;
      source_chain: string;
      destination_chain: string;
      amount: string;
      mint_tx_hash: string | null;
    }

    // 1. Fetch transaction details from Supabase (Source of Truth)
    const { data: dbRecord } = await supabaseAdmin.from('bridge_transactions')
      .select('bridge_status, updated_at, wallet_address, source_chain, destination_chain, amount, mint_tx_hash')
      .eq('burn_tx_hash', burn_tx_hash)
      .single();

    let existing: BridgeTxData;

    // Auto-heal if transaction hasn't finished /api/bridge/sync write yet
    if (!dbRecord) {
      const srcChain = reqSource || (isMainnetChain(reqDest) ? "Arc Mainnet" : "Arc Testnet");
      const dstChain = reqDest || (isMainnetChain(reqSource) ? "Base Mainnet" : "Base Sepolia");
      const wAddr = (reqWallet || "0x0000000000000000000000000000000000000000").slice(0, 42).toLowerCase();
      const amt = reqAmount || "0";

      const { data: autoInserted } = await supabaseAdmin.from('bridge_transactions').insert([{
        wallet_address: wAddr,
        source_chain: srcChain,
        destination_chain: dstChain,
        token_symbol: reqTokenSymbol || 'USDC',
        amount: amt,
        burn_tx_hash,
        bridge_status: 'PROCESSING_CLAIM'
      }]).select().single();

      existing = (autoInserted as any) || {
        bridge_status: 'PROCESSING_CLAIM',
        updated_at: new Date().toISOString(),
        wallet_address: wAddr,
        source_chain: srcChain,
        destination_chain: dstChain,
        amount: amt,
        mint_tx_hash: null
      };
    } else {
      existing = dbRecord as BridgeTxData;
    }

    if (existing.bridge_status === 'COMPLETED') {
      return NextResponse.json({ success: true, mint_tx_hash: existing.mint_tx_hash, message: 'Bridge already completed' });
    }

    if (existing.bridge_status === 'PROCESSING_CLAIM') {
      const lockTime = new Date(existing.updated_at).getTime();
      const now = Date.now();
      if (now - lockTime < 45000 && existing.mint_tx_hash) { // 45-second lease
        return NextResponse.json({ error: 'Claim is already processing (Race condition prevented)', code: 'CLAIM_IN_PROGRESS' }, { status: 409 });
      }
      console.warn(`[Claim API] Processing claim for ${burn_tx_hash} (updated at ${existing.updated_at})`);
    }

    // CLAIM_MANUAL_REQUIRED: relayer was previously out of gas.
    // Allow immediate re-entry with a direct lock (no optimistic timestamp race).
    if (existing.bridge_status === 'CLAIM_MANUAL_REQUIRED') {
      const { error: directLockErr } = await supabaseAdmin.from('bridge_transactions')
        .update({ bridge_status: 'PROCESSING_CLAIM', updated_at: new Date().toISOString() })
        .eq('burn_tx_hash', burn_tx_hash)
        .eq('bridge_status', 'CLAIM_MANUAL_REQUIRED');

      if (directLockErr) {
        return NextResponse.json({ error: 'Claim locked by another process', code: 'CLAIM_IN_PROGRESS' }, { status: 409 });
      }
      rollbackStatus = 'CLAIM_MANUAL_REQUIRED';
    } else {
      rollbackStatus = existing.bridge_status === 'PROCESSING_CLAIM' ? 'PENDING' : existing.bridge_status;

      // Attempt atomic lock via state transition and timestamp
      const { data: lockData } = await supabaseAdmin.from('bridge_transactions')
        .update({ bridge_status: 'PROCESSING_CLAIM', updated_at: new Date().toISOString() })
        .eq('burn_tx_hash', burn_tx_hash)
        .select()
        .single();
    }

    // Identify Domain ID based on transaction environment
    const isMainnet = isMainnetChain(existing.source_chain) || isMainnetChain(existing.destination_chain);
    const env = isMainnet ? "mainnet" : "testnet";
    const activeDomains = getCctpDomains(env);

    const { resolveCctpDomain } = await import('@/lib/bridge/cctp-provider');
    const sourceDomainDef = activeDomains[existing.source_chain] || resolveCctpDomain(existing.source_chain, env);
    const destDomainDef = activeDomains[existing.destination_chain] || resolveCctpDomain(existing.destination_chain, env);

    if (!sourceDomainDef || !destDomainDef) {
      throw new Error('Unsupported chain mapping');
    }

    let isCompleted = false;

    try {
      // 2. Poll Iris API for Attestation (Domain-agnostic logic)
      let messageHex: string;
      let attestationHex: string;
      try {
        const result = await pollCCTPAttestation(sourceDomainDef.domain, burn_tx_hash, 4000, env); // 4-second timeout to prevent serverless timeout
        messageHex = result.message;
        attestationHex = result.attestation;
      } catch {
        // Before returning 409, check if source burn transaction reverted on-chain
        if (!existing.source_chain.toLowerCase().includes("stellar") && !existing.source_chain.toLowerCase().includes("solana")) {
          try {
            const { ChainRegistry } = await import('@/lib/bridge/chain-registry');
            const sourceChainConfig = ChainRegistry.getChainSafe(existing.source_chain);
            if (sourceChainConfig?.rpcUrl) {
              const { createPublicClient, http } = await import('viem');
              const sourceClient = createPublicClient({ transport: http(sourceChainConfig.rpcUrl, { timeout: 4000 }) });
              const receipt = await sourceClient.getTransactionReceipt({ hash: burn_tx_hash as `0x${string}` }).catch(() => null);
              if (receipt && (receipt.status === 'reverted' || (receipt as any).status === '0x0')) {
                await supabaseAdmin.from('bridge_transactions')
                  .update({
                    bridge_status: 'FAILED',
                    failure_reason: 'Burn transaction reverted on source chain',
                    updated_at: new Date().toISOString()
                  })
                  .eq('burn_tx_hash', burn_tx_hash);

                return NextResponse.json({
                  error: 'Burn transaction reverted on source chain.',
                  code: 'BURN_REVERTED'
                }, { status: 400 });
              }
            }
          } catch (srcErr) {
            console.warn("[Claim API] Source receipt check error:", srcErr);
          }
        }

        console.log(`[Claim API] Iris Attestation pending for ${burn_tx_hash}`);
        return NextResponse.json({ error: 'Attestation still pending. Please try again later.', code: 'PENDING_ATTESTATION' }, { status: 409 });
      }

      // 2b. Manual Claim Mode / Attestation Fetch
      if (reqManual || reqAction === "get_attestation") {
        console.log(`[Claim API] Manual claim mode requested for ${burn_tx_hash}. Returning attestation payload.`);
        await supabaseAdmin.from('bridge_transactions').update({
          bridge_status: 'CLAIM_MANUAL_REQUIRED',
          updated_at: new Date().toISOString()
        }).eq('burn_tx_hash', burn_tx_hash);
        isCompleted = true;
        return NextResponse.json({
          success: true,
          status: 'READY_TO_CLAIM',
          mode: 'manual',
          message: messageHex,
          attestation: attestationHex,
          destination_domain: destDomainDef.domain
        }, { status: 200 });
      }

      // 2c. Gas-Aware Pre-Flight: Check Relayer Operational Reserve ($5 USD + Tx Budget)
      const { checkDestinationRelayerGas } = await import('@/lib/bridge/gas-monitor');
      const gasStatus = await checkDestinationRelayerGas(existing.destination_chain);
      if (!gasStatus.isSponsoredAvailable) {
        console.warn(`[Claim API] Destination relayer gas insufficient for ${existing.destination_chain}: ${gasStatus.reason}. Transitioning to CLAIM_MANUAL_REQUIRED.`);
        await supabaseAdmin.from('bridge_transactions').update({
          bridge_status: 'CLAIM_MANUAL_REQUIRED',
          updated_at: new Date().toISOString()
        }).eq('burn_tx_hash', burn_tx_hash);
        isCompleted = true;
        return NextResponse.json({
          success: false,
          status: 'MANUAL_CLAIM_REQUIRED',
          code: 'RELAYER_LOW_GAS',
          error: 'Backend gas is low, so please claim your USDC manually.',
          message: messageHex,
          attestation: attestationHex,
          destination_domain: destDomainDef.domain,
          gasStatus
        }, { status: 200 });
      }

      // 3. Delegate to ChainRouter for specific chain execution, or check Solana claim status
      let mint_tx_hash: string = "";
      try {
        if (existing.destination_chain.toLowerCase().includes("solana")) {
          const { Connection, PublicKey } = await import('@solana/web3.js');
          const isDevnet = existing.destination_chain.includes("Devnet");
          const rpcUrl = isDevnet
            ? (process.env.SOLANA_DEVNET_RPC_URL || 'https://api.devnet.solana.com')
            : (process.env.SOLANA_MAINNET_RPC_URL || 'https://api.mainnet-beta.solana.com');

          const connection = new Connection(rpcUrl, 'confirmed');

          // Correct V2 PDA seed derivation (bytes 12 to 44 of CCTP message)
          const cleanMsg = messageHex.startsWith('0x') ? messageHex.slice(2) : messageHex;
          const messageBuf = Buffer.from(cleanMsg, 'hex');
          const seedBuf = messageBuf.slice(12, 44);

          const programId = new PublicKey("CCTPV2Sm4AdWt5296sk4P66VBZ7bEhcARwFaaS9YPbeC");
          const [pda] = PublicKey.findProgramAddressSync(
            [Buffer.from("used_nonce"), seedBuf],
            programId
          );

          const accountInfo = await connection.getAccountInfo(pda);
          if (accountInfo) {
            console.log(`[Claim API] Solana CCTP already claimed detected for ${burn_tx_hash}. Marking as COMPLETED.`);
            mint_tx_hash = "ALREADY_CLAIMED_ON_CHAIN";
          } else {
            console.log(`[Claim API] Solana CCTP transfer pending. Executing auto-mint via SolanaAdapter...`);
            mint_tx_hash = await ChainRouter.executeMint(destDomainDef.domain, messageHex, attestationHex, existing.destination_chain);
          }
        } else {
          mint_tx_hash = await ChainRouter.executeMint(destDomainDef.domain, messageHex, attestationHex, existing.destination_chain);
        }
      } catch (e: unknown) {
        const errorMsg = String((e as Error)?.message || e);
        const errLower = errorMsg.toLowerCase();
        if (
          errLower.includes("already_claimed") ||
          errLower.includes("already claimed") ||
          errLower.includes("nonce already used") ||
          errLower.includes("nonce_already_used") ||
          errLower.includes("message_already_received") ||
          errLower.includes("message already received") ||
          errLower.includes("abort code: 4") ||
          errLower.includes("abortcode: '4'") ||
          errLower.includes("abortcode: 4") ||
          errLower.includes("enoncealreadyused")
        ) {
          console.log(`[Claim API] ALREADY_CLAIMED detected for ${burn_tx_hash}. Marking as COMPLETED.`);
          mint_tx_hash = "ALREADY_CLAIMED_ON_CHAIN";
        } else if (
          errLower.includes("relayer_low_gas") ||
          errLower.includes("insufficient funds") ||
          errLower.includes("insufficient_funds") ||
          errLower.includes("account balance too low") ||
          errLower.includes("exceeds balance")
        ) {
          console.warn(`[Claim API] RELAYER_LOW_GAS detected for ${burn_tx_hash}. Transitioning DB to CLAIM_MANUAL_REQUIRED.`);
          await supabaseAdmin.from('bridge_transactions').update({
            bridge_status: 'CLAIM_MANUAL_REQUIRED',
            updated_at: new Date().toISOString()
          }).eq('burn_tx_hash', burn_tx_hash);
          isCompleted = true;
          return NextResponse.json({
            success: false,
            status: 'MANUAL_CLAIM_REQUIRED',
            code: 'RELAYER_LOW_GAS',
            error: 'Backend gas is low, so please claim your USDC manually.',
            message: messageHex,
            attestation: attestationHex,
            destination_domain: destDomainDef.domain
          }, { status: 200 });
        } else if (
          errLower.includes("accountnotinitialized") ||
          errLower.includes("token_pair") ||
          errLower.includes("3012")
        ) {
          console.warn(`[Claim API] Uninitialized token_pair on destination chain for ${burn_tx_hash}. Marking as FAILED.`);
          await supabaseAdmin.from('bridge_transactions').update({
            bridge_status: 'FAILED',
            failure_reason: 'Destination chain CCTP contract has not linked the token pair for this source chain.',
            updated_at: new Date().toISOString()
          }).eq('burn_tx_hash', burn_tx_hash);
          isCompleted = true;
          return NextResponse.json({
            success: false,
            status: 'FAILED',
            error: 'Circle CCTP has not initialized the token pair on the destination chain for this route.'
          }, { status: 400 });
        } else {
          console.error(`[Claim API] Execution Failed for ${burn_tx_hash}:`, errorMsg.replace(/secret|key|pass/gi, '***'));
          return NextResponse.json({ error: `Execution Failed: ${errorMsg}` }, { status: 500 });
        }
      }

      // 4. Update Database
      const { error: updateErr } = await supabaseAdmin.from('bridge_transactions').update({
        bridge_status: 'COMPLETED',
        mint_tx_hash,
        completed_at: new Date().toISOString()
      }).eq('burn_tx_hash', burn_tx_hash);

      if (updateErr) throw updateErr;

      isCompleted = true;
      return NextResponse.json({ success: true, mint_tx_hash });

    } finally {
      if (!isCompleted) {
        console.log(`[Claim API] Releasing lock for ${burn_tx_hash} back to ${rollbackStatus}`);
        await supabaseAdmin.from('bridge_transactions')
          .update({ bridge_status: rollbackStatus, updated_at: new Date().toISOString() })
          .eq('burn_tx_hash', burn_tx_hash)
          .eq('bridge_status', 'PROCESSING_CLAIM');
      }
    }
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('Bridge Claim POST Error:', errMsg);
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
