import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { circleClient } from '@/lib/circle/wallet-service';
import { createPublicClient, http, decodeEventLog } from 'viem';
import { checkRateLimit } from '@/lib/rate-limit';
import { ERC20_ABI } from '@/config/contracts';
import { withEvmFailover, getEvmFallbacks } from '@/lib/evm-rpc';

export async function POST(req: Request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // 1. Optional session verification (supports both Web3 wallet callers & Supabase sessions)
    const authHeader = req.headers.get("authorization");
    let authenticatedUserId: string | null = null;

    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.split(" ")[1];
      try {
        const { data: { user } } = await supabaseAdmin.auth.getUser(token);
        if (user) {
          authenticatedUserId = user.id;
        }
      } catch {
        // Fallback for custom Web3 JWTs or stateless callers
      }
    }

    // Rate limit by authenticated user ID or caller IP
    const rateLimitError = await checkRateLimit(req, authenticatedUserId || undefined, { maxRequests: 60, windowMs: 60000 });
    if (rateLimitError) return rateLimitError;

    const body = await req.json();
    const { paymentId, txHash } = body;

    if (!paymentId || !txHash) {
      return NextResponse.json({ error: 'Missing paymentId or txHash' }, { status: 400 });
    }

    // 2. Fetch payment record from database
    const { data: payment, error: paymentErr } = await supabaseAdmin
      .from('payments')
      .select('*')
      .eq('id', paymentId)
      .maybeSingle();

    if (paymentErr || !payment) {
      return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
    }

    const senderExpected = (payment.sender || '').toLowerCase().trim();
    const receiverExpected = (payment.receiver || '').toLowerCase().trim();

    // If caller has an authenticated Supabase user profile, verify ownership
    if (authenticatedUserId) {
      const { data: userWallets } = await supabaseAdmin
        .from('arc_wallets')
        .select('address')
        .eq('user_id', authenticatedUserId);

      const userAddresses = (userWallets || []).map((w: any) => w.address?.toLowerCase()).filter(Boolean);
      if (userAddresses.length > 0) {
        const isOwner = userAddresses.includes(senderExpected) || userAddresses.includes(receiverExpected);
        if (!isOwner) {
          return NextResponse.json({ error: 'Forbidden: You do not own this payment record' }, { status: 403 });
        }
      }
    }

    // Already confirmed or failed
    if (payment.status === 'confirmed' || payment.status === 'failed') {
      return NextResponse.json({ 
        success: true, 
        status: payment.status, 
        txHash: payment.tx_hash || txHash 
      });
    }

    let updatedStatus: 'confirmed' | 'failed' | 'pending' = 'pending';
    let confirmedTxHash = payment.tx_hash || txHash;

    // Case A: Circle DCW Transaction (UUID - 36 chars)
    if (txHash.length === 36 && !txHash.startsWith('0x')) {
      // 1. Check payment_ledger first
      const { data: ledgerEntry } = await supabaseAdmin
        .from('payment_ledger')
        .select('status, blockchain_hash, to_wallet, from_wallet, amount')
        .eq('circle_tx_id', txHash)
        .maybeSingle();

      if (ledgerEntry) {
        const ledgerDest = (ledgerEntry.to_wallet || '').toLowerCase().trim();
        if (receiverExpected && ledgerDest && ledgerDest !== receiverExpected) {
          console.warn(`[VerifyPayment] Ledger recipient mismatch: ${ledgerDest} vs expected ${receiverExpected}`);
          return NextResponse.json({ error: 'Recipient mismatch on ledger record' }, { status: 400 });
        }

        if (ledgerEntry.status === 'COMPLETE' || ledgerEntry.status === 'CONFIRMED') {
          updatedStatus = 'confirmed';
          if (ledgerEntry.blockchain_hash) confirmedTxHash = ledgerEntry.blockchain_hash;
        } else if (ledgerEntry.status === 'FAILED' || ledgerEntry.status === 'CANCELLED') {
          updatedStatus = 'failed';
        }
      }

      // 2. Query Circle API if still pending
      if (updatedStatus === 'pending') {
        try {
          const circleRes = await circleClient.getTransaction({ id: txHash });
          const txData = circleRes.data?.transaction;
          if (txData) {
            const circleDest = (txData.destinationAddress || '').toLowerCase().trim();
            if (receiverExpected && circleDest && circleDest !== receiverExpected) {
              console.warn(`[VerifyPayment] Circle recipient mismatch: ${circleDest} vs expected ${receiverExpected}`);
              return NextResponse.json({ error: 'Recipient mismatch on Circle transaction' }, { status: 400 });
            }

            if (txData.state === 'COMPLETE') {
              updatedStatus = 'confirmed';
              if (txData.txHash) confirmedTxHash = txData.txHash;
            } else if (txData.state === 'FAILED' || txData.state === 'CANCELLED') {
              updatedStatus = 'failed';
            }
          }
        } catch (circleErr: any) {
          console.warn("[VerifyPayment] Circle API check warning:", circleErr.message);
        }
      }
    } 
    // Case B: EVM On-Chain Transaction Hash (0x...)
    else if (txHash.startsWith('0x') && txHash.length === 66) {
      // Determine chain and RPC fallbacks based on token network
      const tokenUpper = (payment.token || '').toUpperCase();
      let chainName = "Arc Testnet";
      let primaryRpc = process.env.NEXT_PUBLIC_ARC_TESTNET_RPC_URL || "https://5042002.rpc.thirdweb.com";

      if (tokenUpper.includes('1439') || tokenUpper.includes('INJECTIVE')) {
        chainName = "Injective EVM Testnet";
        primaryRpc = process.env.NEXT_PUBLIC_INJECTIVE_TESTNET_RPC_URL || "https://k8s.testnet.json-rpc.injective.network/";
      } else if (tokenUpper.includes('8453') || tokenUpper.includes('BASE')) {
        chainName = "Base Mainnet";
        primaryRpc = process.env.NEXT_PUBLIC_BASE_MAINNET_RPC_URL || "https://mainnet.base.org";
      } else if (tokenUpper.includes('MAINNET') || tokenUpper.includes('5042')) {
        chainName = "Arc Mainnet";
        primaryRpc = process.env.NEXT_PUBLIC_ARC_MAINNET_RPC_URL || "https://rpc.arc.io";
      }

      try {
        await withEvmFailover(
          chainName,
          primaryRpc,
          async (rpcUrl: string) => {
            const publicClient = createPublicClient({ transport: http(rpcUrl) });
            const receipt = await publicClient.getTransactionReceipt({ hash: txHash as `0x${string}` });

            if (receipt) {
              if (receipt.status === 'success') {
                const tx = await publicClient.getTransaction({ hash: txHash as `0x${string}` });
                let isVerified = false;

                // 1. Native transfer check (ETH / Arc native transfer)
                if (tx) {
                  const txFrom = (tx.from || '').toLowerCase().trim();
                  const txTo = (tx.to || '').toLowerCase().trim();
                  if (txFrom === senderExpected && txTo === receiverExpected && tx.value > 0n) {
                    isVerified = true;
                  }
                }

                // 2. ERC-20 Transfer log check (USDC / EURC / Custom tokens)
                if (!isVerified && receipt.logs && receipt.logs.length > 0) {
                  for (const log of receipt.logs) {
                    try {
                      const decoded = decodeEventLog({
                        abi: ERC20_ABI,
                        data: log.data,
                        topics: log.topics
                      });

                      if (decoded.eventName === 'Transfer') {
                        const args: any = decoded.args;
                        const logFrom = (args.from || '').toLowerCase().trim();
                        const logTo = (args.to || '').toLowerCase().trim();

                        // Match recipient strictly and sender tolerantly
                        const recipientMatches = logTo === receiverExpected;
                        const senderMatches = !senderExpected || logFrom === senderExpected || logFrom === (tx?.from || '').toLowerCase();

                        if (recipientMatches && senderMatches && args.value > 0n) {
                          isVerified = true;
                          break;
                        }
                      }
                    } catch {
                      // Log is not an ERC20 Transfer event; continue
                    }
                  }
                }

                if (isVerified) {
                  updatedStatus = 'confirmed';
                  confirmedTxHash = txHash;
                } else {
                  console.warn(`[VerifyPayment] On-chain tx ${txHash} found, but sender/receiver mismatch with payment record.`);
                  updatedStatus = 'pending';
                }
              } else if (receipt.status === 'reverted') {
                updatedStatus = 'failed';
              }
            }
          },
          `Verify Payment ${paymentId}`
        );
      } catch (evmErr: any) {
        console.warn("[VerifyPayment] EVM receipt check note:", evmErr.message);
      }
    }

    // 3. Update payment status in database if state transitioned
    // NOTE: payments table does NOT have updated_at column; only update status and tx_hash
    if (updatedStatus !== 'pending') {
      const { error: updateErr } = await supabaseAdmin
        .from('payments')
        .update({
          status: updatedStatus,
          tx_hash: confirmedTxHash
        })
        .eq('id', payment.id);

      if (updateErr) {
        console.error("[VerifyPayment] Database update error:", updateErr);
      }
    }

    return NextResponse.json({
      success: true,
      status: updatedStatus,
      txHash: confirmedTxHash
    });

  } catch (error: any) {
    console.error("Payment verification route failed:", error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
