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
    const contactAddress = searchParams.get('contact')?.toLowerCase();
    const filter = (searchParams.get('filter') || 'all').toLowerCase();
    const offset = Math.max(0, parseInt(searchParams.get('offset') || '0', 10));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '10', 10)));

    if (!requestedAddress) {
      return NextResponse.json({ error: 'Missing address parameter' }, { status: 400 });
    }

    // 1. Session verification / resolve caller address
    const cookieStore = await cookies();
    const token = cookieStore.get('arc_session')?.value;
    const authHeader = req.headers.get('authorization');
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;
    const headerWallet = req.headers.get('x-wallet-address')?.toLowerCase();
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

    // Security rule: If a valid authenticated session exists, caller can ONLY access their own address
    if (authenticatedAddress && requestedAddress.toLowerCase() !== authenticatedAddress) {
      return NextResponse.json({ error: 'Unauthorized: Cannot query transactions of another wallet' }, { status: 403 });
    }

    const myAddr = (authenticatedAddress || headerWallet || requestedAddress).toLowerCase();

    // 2. Rate limit (120 req / min)
    const rateLimitError = await checkRateLimit(req, myAddr, { maxRequests: 120, windowMs: 60000 });
    if (rateLimitError) return rateLimitError;

    // 3. Build participant query
    let participantFilter = '';
    if (contactAddress) {
      if (filter === 'sent') {
        participantFilter = `and(sender.eq.${myAddr},receiver.eq.${contactAddress})`;
      } else if (filter === 'received') {
        participantFilter = `and(sender.eq.${contactAddress},receiver.eq.${myAddr})`;
      } else {
        participantFilter = `and(sender.eq.${myAddr},receiver.eq.${contactAddress}),and(sender.eq.${contactAddress},receiver.eq.${myAddr})`;
      }
    } else {
      if (filter === 'sent') {
        participantFilter = `sender.eq.${myAddr}`;
      } else if (filter === 'received') {
        participantFilter = `receiver.eq.${myAddr}`;
      } else {
        participantFilter = `sender.eq.${myAddr},receiver.eq.${myAddr}`;
      }
    }

    // 4. Query paginated payments from database:
    // Exclude schedule configuration placeholders (which have is_recurring=true, next_payment_at not null, no tx_hash, and are active)
    // Include all genuine one-time and recurring executions (confirmed, pending, or failed)
    const { data: rawPayments, count, error } = await supabaseAdmin
      .from('payments')
      .select('*', { count: 'exact' })
      .or(participantFilter)
      .or('next_payment_at.is.null,tx_hash.not.is.null,status.in.(confirmed,failed)')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('[Payments API] Query error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const totalCount = count || 0;
    const rawList = rawPayments || [];

    // Reconcile pending payments against autopay_executions and payment_ledger
    const pendingIds = rawList.filter(p => !p.tx_hash || p.status !== 'confirmed').map(p => p.id);
    const reconciledMap: Record<string, { status: string; txHash: string | null }> = {};

    if (pendingIds.length > 0) {
      try {
        const { data: exList } = await supabaseAdmin
          .from('autopay_executions')
          .select('id, blockchain_tx_hash, status')
          .in('id', pendingIds);

        for (const ex of exList || []) {
          if (ex.blockchain_tx_hash || ex.status === 'CONFIRMED') {
            reconciledMap[ex.id] = {
              status: 'confirmed',
              txHash: ex.blockchain_tx_hash || null
            };
          }
        }

        const stillPending = pendingIds.filter(id => !reconciledMap[id]?.txHash);
        if (stillPending.length > 0) {
          const { data: ledgerList } = await supabaseAdmin
            .from('payment_ledger')
            .select('id, blockchain_hash, status')
            .in('id', stillPending);

          for (const l of ledgerList || []) {
            if (l.blockchain_hash || l.status === 'COMPLETE') {
              reconciledMap[l.id] = {
                status: 'confirmed',
                txHash: l.blockchain_hash || null
              };
            }
          }
        }
      } catch (reconErr) {
        console.warn('[Payments API] Reconciliation warning:', reconErr);
      }
    }

    const mappedPayments = rawList.map(p => {
      const recon = reconciledMap[p.id];
      const effectiveStatus = recon?.status || p.status;
      const effectiveTxHash = recon?.txHash || p.tx_hash;

      return {
        id: p.id,
        sender: p.sender,
        receiver: p.receiver,
        amount: p.amount,
        token: p.token,
        description: p.description,
        status: effectiveStatus,
        active: p.active !== false,
        createdAt: typeof p.created_at === 'number' ? p.created_at : (new Date(p.created_at).getTime() || Date.now()),
        txHash: effectiveTxHash,
        isRecurring: !!p.is_recurring,
        recurringInterval: p.recurring_interval,
        nextPaymentAt: p.next_payment_at ? (typeof p.next_payment_at === 'number' ? p.next_payment_at : new Date(p.next_payment_at).getTime()) : undefined
      };
    });

    // 5. Aggregate stats for ALL confirmed payments
    const allStatsFilter = contactAddress
      ? `and(sender.eq.${myAddr},receiver.eq.${contactAddress}),and(sender.eq.${contactAddress},receiver.eq.${myAddr})`
      : `sender.eq.${myAddr},receiver.eq.${myAddr}`;
    const { data: allStatsRows } = await supabaseAdmin
      .from('payments')
      .select('amount, token, sender, receiver')
      .or(allStatsFilter)
      .or('status.eq.confirmed,tx_hash.not.is.null');

    let sentUSDC = 0; let receivedUSDC = 0;
    let sentEURC = 0; let receivedEURC = 0;

    (allStatsRows || []).forEach(p => {
      const amt = Number(p.amount) || 0;
      const isEURC = p.token === 'EURC' || (p.token && p.token.startsWith('EURC'));
      if (p.sender?.toLowerCase() === myAddr) {
        if (isEURC) sentEURC += amt; else sentUSDC += amt;
      } else {
        if (isEURC) receivedEURC += amt; else receivedUSDC += amt;
      }
    });

    const stats = {
      USDC: {
        sent: sentUSDC,
        received: receivedUSDC,
        total: sentUSDC + receivedUSDC
      },
      EURC: {
        sent: sentEURC,
        received: receivedEURC,
        total: sentEURC + receivedEURC
      }
    };

    return NextResponse.json({
      payments: mappedPayments,
      totalCount,
      hasMore: offset + limit < totalCount,
      offset,
      limit,
      stats
    });
  } catch (err: any) {
    console.error('[Payments API] Unexpected error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
