import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { checkRateLimit } from '@/lib/rate-limit';

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('authorization');
    const walletHeader = req.headers.get('x-wallet-address')?.toLowerCase();

    // 1. Authenticate user via JWT session or wallet header fallback
    let user: any = null;
    let userAddresses: string[] = [];

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const { data: { user: authUser } } = await supabaseAdmin.auth.getUser(token);
      if (authUser) {
        user = authUser;
        try {
          const { data: wallets } = await supabaseAdmin
            .from('arc_wallets')
            .select('wallet_address')
            .eq('user_id', user.id);
          userAddresses = (wallets || []).map(w => w.wallet_address?.toLowerCase()).filter(Boolean);
        } catch {}
      }
    }

    // 2. Parse body (optional recipient filter)
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      // Empty body allowed
    }

    const { recipientAddress, walletAddress, scheduleIds: requestedScheduleIds } = body || {};
    const clientWallet = (walletAddress || walletHeader || '').toLowerCase();
    if (clientWallet && !userAddresses.includes(clientWallet)) {
      userAddresses.push(clientWallet);
    }

    if (!user && !clientWallet) {
      return NextResponse.json({ error: 'Missing or invalid authorization header' }, { status: 401 });
    }

    if (user) {
      const rateLimitError = await checkRateLimit(req, user.id, { maxRequests: 10, windowMs: 60000 });
      if (rateLimitError) return rateLimitError;
    }

    // 3. Find target schedules: only CANCELLED or EXHAUSTED schedules owned by this user
    let selectQuery = supabaseAdmin
      .from('autopay_schedules')
      .select('id');

    if (user) {
      selectQuery = selectQuery.eq('user_id', user.id);
    } else if (userAddresses.length > 0) {
      selectQuery = selectQuery.in('sender_wallet', userAddresses);
    }

    if (Array.isArray(requestedScheduleIds) && requestedScheduleIds.length > 0) {
      selectQuery = selectQuery.in('id', requestedScheduleIds);
    } else {
      selectQuery = selectQuery.in('status', ['CANCELLED', 'EXHAUSTED']);
    }

    if (recipientAddress && typeof recipientAddress === 'string') {
      selectQuery = selectQuery.eq('recipient_address', recipientAddress.toLowerCase());
    }

    const { data: targetSchedules, error: queryErr } = await selectQuery;
    if (queryErr) {
      console.error('[Autopay Delete History] Error finding schedules:', queryErr);
      return NextResponse.json({ error: 'Failed to locate past schedules' }, { status: 500 });
    }

    const scheduleIds = (targetSchedules || []).map(s => s.id);
    if (scheduleIds.length === 0) {
      return NextResponse.json({
        success: true,
        deletedCount: 0,
        message: 'No completed or cancelled history found to delete.'
      });
    }

    // 4. Permanently delete child execution logs from database
    const { error: execDeleteErr } = await supabaseAdmin
      .from('autopay_executions')
      .delete()
      .in('schedule_id', scheduleIds);

    if (execDeleteErr) {
      console.warn('[Autopay Delete History] Warning deleting execution records:', execDeleteErr);
    }

    // 5. Permanently delete the schedules themselves from database
    const { error: scheduleDeleteErr } = await supabaseAdmin
      .from('autopay_schedules')
      .delete()
      .in('id', scheduleIds);

    if (scheduleDeleteErr) {
      console.error('[Autopay Delete History] Error deleting schedules:', scheduleDeleteErr);
      return NextResponse.json({ error: 'Failed to delete past schedules from database' }, { status: 500 });
    }

    // 6. Also clean up any mirrored cancelled/exhausted rows in payments table
    try {
      await supabaseAdmin
        .from('payments')
        .delete()
        .in('id', scheduleIds);
    } catch (e) {
      console.warn('[Autopay Delete History] Non-fatal cleanup error on payments table:', e);
    }

    return NextResponse.json({
      success: true,
      deletedCount: scheduleIds.length,
      message: `Permanently deleted ${scheduleIds.length} completed/cancelled record${scheduleIds.length === 1 ? '' : 's'}.`
    });
  } catch (err: any) {
    console.error('[Autopay Delete History] Unhandled error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
