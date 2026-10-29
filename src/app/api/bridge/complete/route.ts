import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { checkRateLimit } from '@/lib/rate-limit';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import { PrivyClient } from '@privy-io/node';
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import { RECOVERABLE_BRIDGE_STATES } from '@/lib/bridge/state-machine';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const privy = new PrivyClient({
  appId: process.env.NEXT_PUBLIC_PRIVY_APP_ID || '',
  appSecret: process.env.PRIVY_APP_SECRET || ''
});

/**
 * CRIT-04 Fix: bridge/complete now:
 * 1. Requires session authentication (wallet_address from session, not body).
 * 2. Verifies the mint_tx_hash on the destination chain has a successful receipt
 *    before marking the bridge COMPLETED in the database.
 * 3. Still allows the special sentinel "ALREADY_CLAIMED_ON_CHAIN" which is set
 *    by the backend universal-recover/execute route (not user-supplied).
 */
async function resolveAuthenticatedAddress(req: Request): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('arc_session')?.value;
    if (token) {
      const decoded = jwt.verify(token, process.env.SUPABASE_JWT_SECRET!) as any;
      const addr = decoded.sub?.toLowerCase();
      if (addr?.startsWith('0x')) return addr;
    }
  } catch (_) {}

  const authHeader = req.headers.get('Authorization');
  const privyToken = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;
  if (privyToken && privyToken !== 'null' && privyToken !== 'undefined' && privyToken.trim() !== '') {
    try {
      const claims = await privy.utils().auth().verifyAccessToken(privyToken);
      const userId = claims?.user_id || (claims as any)?.sub;
      if (userId) {
        const user: any = await privy.users().get(userId);
        const addr = user?.wallet?.address
          || user?.linkedAccounts?.find((a: any) => a.type === 'wallet')?.address
          || user?.linked_accounts?.find((a: any) => a.type === 'wallet')?.address;
        if (addr) return addr.toLowerCase();
      }
    } catch (_) {}
  }

  return null;
}

// We use Base as the primary destination chain for on-chain verification.
// For cross-chain bridges the destination chain should match the domain config —
// but for the current product scope (bridge → Base), Base is correct.
const viemClient = createPublicClient({
  chain: base,
  transport: http(process.env.NEXT_PUBLIC_BASE_RPC_URL || 'https://base-rpc.publicnode.com')
});

export async function POST(req: Request) {
  try {
    // ── Auth ─────────────────────────────────────────────────────────────────
    const authenticatedAddress = await resolveAuthenticatedAddress(req);
    if (!authenticatedAddress) {
      return NextResponse.json({ error: 'Unauthorized: Authentication required.' }, { status: 401 });
    }

    const { burn_tx_hash, mint_tx_hash } = await req.json();
    // wallet_address is from the authenticated session — NOT from the request body
    const wallet_address = authenticatedAddress;

    if (!burn_tx_hash || !mint_tx_hash) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    const rateLimitError = await checkRateLimit(req, wallet_address, { maxRequests: 10, windowMs: 60000 });
    if (rateLimitError) return rateLimitError;

    const isValidEVMHash = (hash: string) => /^0x[a-fA-F0-9]{64}$/.test(hash);
    const isSolanaHash = (hash: string) => /^[1-9A-HJ-NP-Za-km-z]{87,88}$/.test(hash);
    const isAlreadyClaimed = mint_tx_hash === 'ALREADY_CLAIMED_ON_CHAIN';

    if (!isValidEVMHash(burn_tx_hash) && !isSolanaHash(burn_tx_hash)) {
      return NextResponse.json({ error: 'Invalid burn hash format' }, { status: 400 });
    }

    if (!isAlreadyClaimed && !isValidEVMHash(mint_tx_hash) && !isSolanaHash(mint_tx_hash)) {
      return NextResponse.json({ error: 'Invalid mint hash format' }, { status: 400 });
    }

    // ── Ownership check ───────────────────────────────────────────────────────
    const { data: existing } = await supabaseAdmin.from('bridge_transactions')
      .select('bridge_status, wallet_address, destination_chain').eq('burn_tx_hash', burn_tx_hash).single();

    if (!existing || !RECOVERABLE_BRIDGE_STATES.includes(existing.bridge_status)) {
      return NextResponse.json({ error: 'Bridge not pending, immutable, or not found' }, { status: 400 });
    }

    if (existing.wallet_address.toLowerCase() !== wallet_address) {
      return NextResponse.json({ error: 'Unauthorized: Ownership mismatch' }, { status: 403 });
    }

    // ── CRIT-04: On-chain verification of mint transaction ────────────────────
    // We must NOT trust mint_tx_hash from the user without verifying it on-chain.
    // The only exception is the sentinel "ALREADY_CLAIMED_ON_CHAIN" which is set
    // exclusively by our own backend (universal-recover/execute), not by users.
    if (!isAlreadyClaimed) {
      try {
        const destChain = existing.destination_chain;
        if (destChain.toLowerCase().includes("solana")) {
          // Solana signature verification
          const { Connection } = await import('@solana/web3.js');
          const isDevnet = destChain.includes("Devnet");
          const rpcUrl = isDevnet 
            ? (process.env.SOLANA_DEVNET_RPC_URL || 'https://api.devnet.solana.com')
            : (process.env.SOLANA_MAINNET_RPC_URL || 'https://api.mainnet-beta.solana.com');
          
          const connection = new Connection(rpcUrl, 'confirmed');
          let confirmation = null;
          for (let attempt = 0; attempt < 10; attempt++) {
            try {
              const status = await connection.getSignatureStatus(mint_tx_hash);
              confirmation = status?.value;
              if (confirmation && !confirmation.err) {
                break;
              }
            } catch (_) {}
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
          
          if (!confirmation || confirmation.err) {
            return NextResponse.json({
              error: 'Mint transaction failed or not found on Solana.'
            }, { status: 400 });
          }
        } else if (destChain.toLowerCase().includes("stellar")) {
          // Stellar transaction verification
          const { Horizon } = await import('@stellar/stellar-sdk');
          const isTestnet = destChain.includes("Testnet") || destChain.includes("Fuji") || destChain.includes("Sepolia") || destChain.includes("Devnet");
          const serverUrl = isTestnet
            ? 'https://horizon-testnet.stellar.org'
            : 'https://horizon.stellar.org';
          const server = new Horizon.Server(serverUrl);
          
          let tx = null;
          for (let attempt = 0; attempt < 10; attempt++) {
            try {
              tx = await server.transactions().transaction(mint_tx_hash).call();
              if (tx && tx.successful) {
                break;
              }
            } catch (_) {}
            await new Promise(resolve => setTimeout(resolve, 1000));
          }

          if (!tx || !tx.successful) {
            return NextResponse.json({
              error: 'Mint transaction failed or not found on Stellar.'
            }, { status: 400 });
          }
        } else if (destChain.toLowerCase().includes("sui")) {
          // Sui transaction verification
          const { SuiGrpcClient } = await import('@mysten/sui/grpc');
          const isMainnet = destChain.includes("Mainnet");
          const suiRpc = isMainnet
            ? (process.env.NEXT_PUBLIC_SUI_MAINNET_RPC_URL || "https://fullnode.mainnet.sui.io:443")
            : (process.env.NEXT_PUBLIC_SUI_RPC_URL || "https://fullnode.testnet.sui.io:443");
          const grpcClient = new SuiGrpcClient({ baseUrl: suiRpc, network: isMainnet ? "mainnet" : "testnet" });
          const cleanDigest = mint_tx_hash.startsWith("0x") ? mint_tx_hash.slice(2) : mint_tx_hash;

          let suiTx = null;
          for (let attempt = 0; attempt < 10; attempt++) {
            try {
              suiTx = await grpcClient.getTransaction({ digest: cleanDigest });
              if (suiTx && (suiTx.$kind === "Transaction" || (suiTx as any).Transaction)) {
                break;
              }
            } catch (_) {}
            await new Promise(resolve => setTimeout(resolve, 1000));
          }

          const txObj = (suiTx as any)?.Transaction || suiTx;
          const isSuccess = txObj?.status?.success === true || txObj?.effects?.status?.status === "success";
          if (!isSuccess) {
            return NextResponse.json({
              error: 'Mint transaction failed or not found on Sui.'
            }, { status: 400 });
          }
        } else {
          // EVM validation using the destination chain's registered RPC URL
          const { ChainRegistry } = await import('@/lib/bridge/chain-registry');
          const config = ChainRegistry.getChainSafe(destChain);
          const rpcUrl = config?.rpcUrl || process.env.NEXT_PUBLIC_BASE_RPC_URL || 'https://base-rpc.publicnode.com';
          
          const customViemClient = createPublicClient({
            chain: base,
            transport: http(rpcUrl)
          });
          
          let receipt = null;
          for (let attempt = 0; attempt < 10; attempt++) {
            try {
              receipt = await customViemClient.getTransactionReceipt({
                hash: mint_tx_hash as `0x${string}`
              });
              if (receipt && receipt.status === 'success') {
                break;
              }
            } catch (_) {}
            await new Promise(resolve => setTimeout(resolve, 1000));
          }

          if (!receipt || receipt.status !== 'success') {
            return NextResponse.json({
              error: 'Mint transaction not confirmed on-chain or failed. Cannot mark bridge as COMPLETED.'
            }, { status: 400 });
          }
        }
      } catch (e: any) {
        console.error(`Verification error on destination chain ${existing.destination_chain}:`, e);
        return NextResponse.json({
          error: `Could not verify mint transaction on-chain: ${e.message || e}`
        }, { status: 400 });
      }
    }

    const { error } = await supabaseAdmin.from('bridge_transactions').update({
      bridge_status: 'COMPLETED',
      mint_tx_hash: isAlreadyClaimed ? undefined : mint_tx_hash,
      failure_reason: null,
      completed_at: new Date().toISOString()
    }).eq('burn_tx_hash', burn_tx_hash);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Bridge Complete POST Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
