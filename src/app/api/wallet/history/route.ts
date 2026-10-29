import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { checkRateLimit } from '@/lib/rate-limit';
import { circleClient } from '@/lib/circle/wallet-service';

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Missing authorization header" }, { status: 401 });
    }
    const token = authHeader.split(" ")[1];

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Rate limit: 60 req/min for smooth scrolling
    const rateLimitError = await checkRateLimit(req, user.id, { maxRequests: 60, windowMs: 60000 });
    if (rateLimitError) return rateLimitError;

    const { searchParams } = new URL(req.url);
    const rawLimit = parseInt(searchParams.get('limit') || '10', 10);
    const limit = Math.min(Math.max(isNaN(rawLimit) ? 10 : rawLimit, 1), 50);
    const rawOffset = parseInt(searchParams.get('offset') || '0', 10);
    const offset = Math.max(isNaN(rawOffset) ? 0 : rawOffset, 0);

    // Also look up user's wallet addresses to fetch any legacy transactions where user_id might not be populated
    const { data: wallets } = await supabaseAdmin
      .from('arc_wallets')
      .select('wallet_address')
      .eq('user_id', user.id);

    const userAddresses = (wallets || []).map(w => w.wallet_address?.toLowerCase()).filter(Boolean);

    // Self-healing: On initial page (offset === 0), ensure any confirmed/pending Autopay executions exist in payment_ledger
    if (offset === 0) {
      try {
        const { data: unsyncedExecs } = await supabaseAdmin
          .from('autopay_executions')
          .select('id, user_id, circle_tx_id, blockchain_tx_hash, status, amount, token, recipient_address, circle_wallet_id, created_at, updated_at')
          .eq('user_id', user.id)
          .not('circle_tx_id', 'is', null)
          .order('created_at', { ascending: false })
          .limit(10);

        if (unsyncedExecs && unsyncedExecs.length > 0) {
          for (const ex of unsyncedExecs) {
            await supabaseAdmin.from('payment_ledger').upsert({
              id: ex.id,
              user_id: ex.user_id,
              circle_tx_id: ex.circle_tx_id,
              blockchain_hash: ex.blockchain_tx_hash || null,
              status: ex.status === 'CONFIRMED' ? 'COMPLETE' : (ex.status || 'PENDING'),
              amount: Number(ex.amount) || 0,
              token: ex.token || 'USDC',
              from_wallet: userAddresses[0] || ex.circle_wallet_id || 'ArcFun Wallet',
              to_wallet: ex.recipient_address,
              type: 'AUTOPAY',
              created_at: Number(ex.created_at) || Date.now(),
              updated_at: Number(ex.updated_at) || Date.now()
            }, { onConflict: 'id' });
          }
        }
      } catch (syncErr: any) {
        console.warn('[History Route] Autopay ledger sync notice:', syncErr?.message);
      }
    }

    let query = supabaseAdmin
      .from('payment_ledger')
      .select('*');

    if (userAddresses.length > 0) {
      query = query.or(`user_id.eq.${user.id},from_wallet.in.(${userAddresses.join(',')}),to_wallet.in.(${userAddresses.join(',')})`);
    } else {
      query = query.eq('user_id', user.id);
    }

    const { data: history, error: fetchErr } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (fetchErr) {
      console.error('History fetch error:', fetchErr);
      return NextResponse.json({ error: 'Failed to fetch transaction history' }, { status: 500 });
    }

    // Active reconciliation: check Circle API for any recent transactions that are PENDING or missing blockchain_hash
    const pendingWithCircle = (history || []).filter(
      (tx) => tx.circle_tx_id && (!tx.blockchain_hash || ['PENDING', 'INITIATED'].includes((tx.status || '').toUpperCase()))
    ).slice(0, 5);

    if (pendingWithCircle.length > 0) {
      await Promise.allSettled(
        pendingWithCircle.map(async (tx) => {
          try {
            const res = await circleClient.getTransaction({ id: tx.circle_tx_id });
            const circleTx = res.data?.transaction;
            if (circleTx) {
              const updates: any = {};
              if (circleTx.txHash && circleTx.txHash !== tx.blockchain_hash) {
                updates.blockchain_hash = circleTx.txHash;
                tx.blockchain_hash = circleTx.txHash;
              }
              if (circleTx.state && circleTx.state !== tx.status) {
                updates.status = circleTx.state;
                tx.status = circleTx.state;
              }
              if (circleTx.errorReason && !tx.error_reason) {
                updates.error_reason = circleTx.errorReason;
                tx.error_reason = circleTx.errorReason;
              }

              if (circleTx.amounts?.[0]) {
                const circleAmountNum = Number(circleTx.amounts[0]);
                if (!isNaN(circleAmountNum) && circleAmountNum > 0 && Number(tx.amount) !== circleAmountNum) {
                  updates.amount = circleAmountNum;
                  tx.amount = circleAmountNum;
                }
              }

              if (circleTx.blockchain) {
                tx.blockchain = circleTx.blockchain;
              }

              if (Object.keys(updates).length > 0) {
                updates.updated_at = Date.now();
                await supabaseAdmin
                  .from('payment_ledger')
                  .update(updates)
                  .eq('id', tx.id);
              }
            }
          } catch (e: any) {
            // Silently ignore individual Circle lookup errors to ensure history loads fast
          }
        })
      );
    }

    const enrichedHistory = (history || []).map((tx) => {
      const fromLower = (tx.from_wallet || '').toLowerCase();
      const toLower = (tx.to_wallet || '').toLowerCase();
      
      const isFromMe = userAddresses.includes(fromLower);
      const isToMe = userAddresses.includes(toLower);
      
      let isSender = isFromMe;
      if (!isSender && tx.user_id === user.id && tx.type === 'TRANSFER') {
        isSender = true;
      }

      // Safety guard: if legacy SOL transaction has USD valuation stored instead of actual SOL
      let cleanAmount = tx.amount;
      if (tx.token === 'SOL' && Number(cleanAmount) > 5) {
        const val = Number(cleanAmount);
        if (Math.abs(val - 10.384) < 0.5) cleanAmount = 0.1;
        else if (Math.abs(val - 50.977) < 0.5) cleanAmount = 0.5;
        else if (val >= 100 && val <= 105) cleanAmount = 1.0;
        else cleanAmount = Math.round((val / 103.8) * 1000) / 1000;
      }

      // Infer blockchain if missing
      let chain = tx.blockchain;
      if (!chain) {
        if (tx.token === 'SOL' || (!fromLower.startsWith('0x') && fromLower.length >= 32)) {
          chain = 'Solana Devnet';
        } else {
          chain = 'Arc Testnet';
        }
      }
      
      return {
        ...tx,
        amount: cleanAmount,
        blockchain: chain,
        is_sender: isSender,
        direction: isSender ? 'OUTBOUND' : 'INBOUND'
      };
    });

    return NextResponse.json({ 
      success: true, 
      history: enrichedHistory,
      has_more: (history || []).length === limit,
      offset,
      limit,
      user_addresses: userAddresses 
    });

  } catch (error: any) {
    console.error('Wallet history route failed:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
