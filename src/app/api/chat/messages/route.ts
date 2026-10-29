import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { checkRateLimit } from '@/lib/rate-limit';

const JWT_SECRET = process.env.SUPABASE_JWT_SECRET || 'secret';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const requestedAddress = searchParams.get('address')?.toLowerCase();
    const activeChatAddress = searchParams.get('activeChatAddress')?.toLowerCase();
    const cursor = searchParams.get('cursor');
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '30', 10)));

    if (!requestedAddress || !activeChatAddress) {
      return NextResponse.json({ error: 'Missing address or activeChatAddress' }, { status: 400 });
    }

    // 1. Session verification
    const cookieStore = await cookies();
    const token = cookieStore.get('arc_session')?.value;
    const authHeader = req.headers.get('authorization');
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;
    const activeToken = token || bearerToken;

    let authenticatedAddress: string | null = null;
    if (activeToken) {
      try {
        const decoded: any = jwt.verify(activeToken, JWT_SECRET);
        authenticatedAddress = decoded?.sub?.toLowerCase() || null;
      } catch (e) {
        // Token verification failed or expired
      }
    }

    // Determine the target wallet address to query
    const targetAddress = authenticatedAddress || requestedAddress;

    // Rate limit: 120 requests per minute per wallet (generous for chat thread loading & pagination)
    const rateLimitError = await checkRateLimit(req, targetAddress, { maxRequests: 120, windowMs: 60000 });
    if (rateLimitError) return rateLimitError;

    // 2. Resolve linked wallet addresses (e.g. Circle DCW addresses) for robust participant matching
    let myAddresses = [targetAddress];
    let peerAddresses = [activeChatAddress];
    try {
      const { data: linkedWallets } = await supabaseAdmin
        .from('arc_wallets')
        .select('wallet_address, linked_external_address')
        .or(`linked_external_address.eq."${targetAddress}",wallet_address.eq."${targetAddress}",linked_external_address.eq."${activeChatAddress}",wallet_address.eq."${activeChatAddress}"`);

      if (linkedWallets && linkedWallets.length > 0) {
        for (const w of linkedWallets) {
          const wAddr = w.wallet_address?.toLowerCase();
          const extAddr = w.linked_external_address?.toLowerCase();
          if (extAddr === targetAddress || wAddr === targetAddress) {
            if (wAddr && !myAddresses.includes(wAddr)) myAddresses.push(wAddr);
            if (extAddr && !myAddresses.includes(extAddr)) myAddresses.push(extAddr);
          }
          if (extAddr === activeChatAddress || wAddr === activeChatAddress) {
            if (wAddr && !peerAddresses.includes(wAddr)) peerAddresses.push(wAddr);
            if (extAddr && !peerAddresses.includes(extAddr)) peerAddresses.push(extAddr);
          }
        }
      }
    } catch {}

    const orConditions: string[] = [];
    for (const m of myAddresses) {
      for (const p of peerAddresses) {
        orConditions.push(`and(sender.eq."${m}",receiver.eq."${p}")`);
        orConditions.push(`and(sender.eq."${p}",receiver.eq."${m}")`);
      }
    }

    // 3. Query messages via supabaseAdmin (bypasses RLS)
    let query = supabaseAdmin
      .from('messages')
      .select('*')
      .or(orConditions.join(','))
      .order('created_at', { ascending: false })
      .limit(limit);

    if (cursor) {
      query = query.lt('created_at', cursor);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[Messages API] Database error:', error);
      return NextResponse.json({ error: 'Database query failed' }, { status: 500 });
    }

    const rawRows = data || [];

    const parseTs = (ts: any) => {
      if (!ts) return 0;
      if (typeof ts === 'number') return ts;
      if (typeof ts === 'string' && /^\d+$/.test(ts)) return parseInt(ts, 10);
      return new Date(ts).getTime() || 0;
    };

    // Filter out messages marked as deleted for the querying user
    const filteredRows = rawRows.filter(m => !(m.deleted_for || []).includes(targetAddress));

    // Collect payment IDs to attach on-chain transaction hashes
    const paymentIds = Array.from(new Set(filteredRows.map(m => m.payment_id).filter(Boolean)));
    const paymentsMap: Record<string, any> = {};

    if (paymentIds.length > 0) {
      try {
        const { data: pRows } = await supabaseAdmin
          .from('payments')
          .select('id, sender, receiver, amount, token, description, status, tx_hash, is_recurring, recurring_interval, next_payment_at, created_at')
          .in('id', paymentIds);

        for (const p of pRows || []) {
          paymentsMap[p.id] = {
            id: p.id,
            sender: p.sender,
            receiver: p.receiver,
            amount: p.amount,
            token: p.token,
            description: p.description,
            status: p.status,
            txHash: p.tx_hash,
            isRecurring: !!p.is_recurring,
            recurringInterval: p.recurring_interval,
            nextPaymentAt: p.next_payment_at,
            createdAt: parseTs(p.created_at)
          };
        }

        // Also check autopay_executions and payment_ledger for any missing tx_hash or unconfirmed status
        const missingTxIds = paymentIds.filter(id => !paymentsMap[id]?.txHash || paymentsMap[id]?.status !== 'confirmed');
        if (missingTxIds.length > 0) {
          const { data: exRows } = await supabaseAdmin
            .from('autopay_executions')
            .select('id, blockchain_tx_hash, status')
            .in('id', missingTxIds);

          const newlyConfirmed: Array<{ id: string; txHash: string }> = [];

          for (const ex of exRows || []) {
            if (ex.blockchain_tx_hash) {
              if (paymentsMap[ex.id]) {
                paymentsMap[ex.id].txHash = ex.blockchain_tx_hash;
                paymentsMap[ex.id].status = 'confirmed';
              } else {
                paymentsMap[ex.id] = {
                  id: ex.id,
                  txHash: ex.blockchain_tx_hash,
                  status: 'confirmed'
                };
              }
              newlyConfirmed.push({ id: ex.id, txHash: ex.blockchain_tx_hash });
            }
          }

          // Check payment_ledger for remaining missing hashes
          const stillMissing = missingTxIds.filter(id => !paymentsMap[id]?.txHash || paymentsMap[id]?.status !== 'confirmed');
          if (stillMissing.length > 0) {
            const { data: ledgerRows } = await supabaseAdmin
              .from('payment_ledger')
              .select('id, blockchain_hash, status')
              .in('id', stillMissing);

            for (const l of ledgerRows || []) {
              if (l.blockchain_hash || l.status === 'COMPLETE') {
                const effectiveHash = l.blockchain_hash || null;
                if (paymentsMap[l.id]) {
                  if (effectiveHash) paymentsMap[l.id].txHash = effectiveHash;
                  paymentsMap[l.id].status = 'confirmed';
                } else {
                  paymentsMap[l.id] = {
                    id: l.id,
                    txHash: effectiveHash,
                    status: 'confirmed'
                  };
                }
                if (effectiveHash) {
                  newlyConfirmed.push({ id: l.id, txHash: effectiveHash });
                }
              }
            }
          }

          // Self-heal: synchronously update payments in database if confirmed on-chain
          if (newlyConfirmed.length > 0) {
            for (const nc of newlyConfirmed) {
              supabaseAdmin
                .from('payments')
                .update({ status: 'confirmed', tx_hash: nc.txHash })
                .eq('id', nc.id)
                .then(() => {}, () => {});
            }
          }
        }
      } catch (err) {
        console.warn('[Messages API] Payments lookup warning:', err);
      }
    }

    const messages = filteredRows.map(m => ({
      id: m.id,
      sender: m.sender,
      receiver: m.receiver,
      body: m.body,
      mediaUrl: m.media_url,
      replyTo: m.reply_to,
      paymentId: m.payment_id,
      txHash: m.payment_id ? paymentsMap[m.payment_id]?.txHash || null : null,
      reactions: m.reactions || [],
      seen: m.seen,
      delivered: m.delivered,
      edited: m.edited,
      deletedFor: m.deleted_for || [],
      createdAt: parseTs(m.created_at)
    }));

    const nextCursor = rawRows.length > 0 ? rawRows[rawRows.length - 1].created_at : null;

    return NextResponse.json(
      {
        success: true,
        messages,
        payments: Object.values(paymentsMap),
        nextCursor,
        hasMore: rawRows.length === limit
      },
      {
        headers: {
          'Cache-Control': 'private, no-cache, no-store, must-revalidate'
        }
      }
    );
  } catch (error: any) {
    console.error('[Messages API] Unexpected error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
