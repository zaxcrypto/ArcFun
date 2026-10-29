import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { checkRateLimit } from '@/lib/rate-limit';
import { getTodayZonedDateString, calculateNextExecutionTimestamp, advanceConfirmedScheduleCycle } from '@/lib/autopay/schedule-calculator';
import { AutopayFrequency } from '@/lib/autopay/autopay-types';

export async function GET(req: Request) {
  try {
    let cookieToken: string | undefined;
    try {
      const cookieStore = await cookies();
      cookieToken = cookieStore?.get('arc_session')?.value;
    } catch {
      // In test environments or when headers are unavailable, cookies() throws.
    }
    const authHeader = req.headers.get('authorization');
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;
    const walletHeader = req.headers.get('x-wallet-address')?.toLowerCase();

    let user: any = null;
    const token = bearerToken || cookieToken;

    if (token) {
      const { data: { user: authUser } } = await supabaseAdmin.auth.getUser(token);
      if (authUser) user = authUser;
    }

    if (!user && !walletHeader) {
      return NextResponse.json({ error: 'Missing or invalid authorization' }, { status: 401 });
    }

    // 2. Rate limit (30 requests per minute)
    const rateLimitKey = user?.id || walletHeader || 'anonymous';
    const rateLimitError = await checkRateLimit(req, rateLimitKey, { maxRequests: 30, windowMs: 60000 });
    if (rateLimitError) return rateLimitError;

    // 3. Query parameters
    const { searchParams } = new URL(req.url);
    const statusParam = searchParams.get('status')?.toUpperCase();
    const recipientParam = searchParams.get('recipient')?.toLowerCase();
    const senderParam = searchParams.get('sender')?.toLowerCase() || walletHeader;

    // 4. Fetch schedules
    let schedules: any[] = [];

    if (user?.id) {
      let query = supabaseAdmin
        .from('autopay_schedules')
        .select('*')
        .eq('user_id', user.id);

      if (statusParam && statusParam !== 'ALL') {
        query = query.eq('status', statusParam);
      }
      if (recipientParam) {
        query = query.eq('recipient_address', recipientParam);
      }

      const { data: primarySchedules, error: fetchErr } = await query.order('created_at', { ascending: false });
      if (fetchErr) {
        console.error('[Autopay List] Error querying schedules:', fetchErr);
      } else if (primarySchedules) {
        schedules = primarySchedules;
      }
    }

    // 4.1 Fallback: if user_id query returns nothing, or if user is unauthenticated but walletHeader is given
    if (schedules.length === 0) {
      const candidateWallets = new Set<string>();

      if (senderParam) {
        candidateWallets.add(senderParam.toLowerCase());
      }
      if (user?.email && user.email.endsWith('@arcfun.xyz')) {
        candidateWallets.add(user.email.replace('@arcfun.xyz', '').toLowerCase());
      }

      if (user?.id) {
        try {
          const { data: walletRows } = await supabaseAdmin
            .from('arc_wallets')
            .select('wallet_address')
            .eq('user_id', user.id);

          for (const row of walletRows || []) {
            if (row.wallet_address) candidateWallets.add(row.wallet_address.toLowerCase());
          }
        } catch {
          // Non-fatal — email fallback is enough
        }
      }

      console.log(`[Autopay List] candidateWallets=[${Array.from(candidateWallets).join(',')}]`);

      if (candidateWallets.size > 0) {
        try {
          const walletArr = Array.from(candidateWallets);
          let fallbackQuery = supabaseAdmin
            .from('autopay_schedules')
            .select('*')
            .in('sender_wallet', walletArr);

          if (statusParam && statusParam !== 'ALL') {
            fallbackQuery = fallbackQuery.eq('status', statusParam);
          }
          if (recipientParam) {
            fallbackQuery = fallbackQuery.eq('recipient_address', recipientParam);
          }

          const { data: fallbackSchedules } = await fallbackQuery.order('created_at', { ascending: false });

          console.log(`[Autopay List] Fallback found ${fallbackSchedules?.length ?? 0} schedules for wallets=[${walletArr.join(',')}]`);

          if (fallbackSchedules && fallbackSchedules.length > 0) {
            const seenIds = new Set(schedules.map((s: any) => s.id));
            for (const s of fallbackSchedules) {
              if (!seenIds.has(s.id)) {
                schedules.push(s);
                seenIds.add(s.id);
              }
            }
          }
        } catch (fallbackErr) {
          console.warn('[Autopay List] Fallback sender_wallet query failed:', fallbackErr);
        }
      }
    }

    // 5. Fetch recent executions for these schedules (latest 5 per schedule)
    const scheduleIds = (schedules || []).map(s => s.id);
    let executionsMap: Record<string, any[]> = {};

    if (scheduleIds.length > 0) {
      const { data: executions, error: execErr } = await supabaseAdmin
        .from('autopay_executions')
        .select(`
          id,
          schedule_id,
          amount,
          token,
          status,
          circle_tx_id,
          blockchain_tx_hash,
          scheduled_for,
          executed_at,
          error_reason,
          created_at
        `)
        .in('schedule_id', scheduleIds)
        .order('created_at', { ascending: false })
        .limit(50);

      if (!execErr && executions) {
        for (const ex of executions) {
          if (!executionsMap[ex.schedule_id]) {
            executionsMap[ex.schedule_id] = [];
          }
          if (executionsMap[ex.schedule_id].length < 5) {
            executionsMap[ex.schedule_id].push({
              id: ex.id,
              amount: Number(ex.amount),
              token: ex.token,
              status: ex.status,
              circleTxId: ex.circle_tx_id,
              blockchainTxHash: ex.blockchain_tx_hash,
              scheduledFor: Number(ex.scheduled_for),
              executedAt: ex.executed_at ? Number(ex.executed_at) : null,
              errorReason: ex.error_reason,
              createdAt: Number(ex.created_at)
            });
          }
        }
      }
    }

    // 5.1 Self-heal: check if any ACTIVE schedules are confirmed or have reached end_dates
    for (const s of schedules || []) {
      if (s.status === 'ACTIVE') {
        const recentExecs = executionsMap[s.id] || [];
        const latestExec = recentExecs.length > 0 ? {
          status: recentExecs[0].status,
          blockchain_tx_hash: recentExecs[0].blockchainTxHash
        } : null;

        const advResult = await advanceConfirmedScheduleCycle(supabaseAdmin, s, latestExec, Date.now());
        if (advResult.advanced) {
          s.status = advResult.status;
          s.next_execution_at = advResult.nextExecutionAt;
          if (advResult.isExhausted) {
            s.last_execution_status = 'CONFIRMED';
          }
        }
      }
    }

    // 6. Format response
    const formatted = (schedules || []).map(s => ({
      id: s.id,
      senderWallet: s.sender_wallet,
      recipientAddress: s.recipient_address,
      amount: Number(s.amount),
      token: s.token,
      blockchain: s.blockchain,
      frequency: s.frequency,
      executionTime: s.execution_time,
      timezone: s.timezone,
      monthlyDay: s.monthly_day,
      weeklyDay: s.weekly_day,
      startDate: s.start_date,
      endDate: s.end_date,
      description: s.description,
      maxPerPayment: Number(s.max_per_payment),
      monthlySpendingLimit: Number(s.monthly_spending_limit),
      currentMonthSpent: Number(s.current_month_spent),
      currentMonthCycle: s.current_month_cycle,
      status: s.status,
      nextExecutionAt: Number(s.next_execution_at),
      lastExecutionAt: s.last_execution_at ? Number(s.last_execution_at) : null,
      lastExecutionStatus: s.last_execution_status,
      consecutiveFailures: s.consecutive_failures,
      lastErrorReason: s.last_error_reason,
      authorizationVersion: s.authorization_version,
      authorizedAt: Number(s.authorized_at),
      createdAt: Number(s.created_at),
      updatedAt: Number(s.updated_at),
      recentExecutions: executionsMap[s.id] || []
    }));

    return NextResponse.json({
      success: true,
      count: formatted.length,
      schedules: formatted
    });

  } catch (error: any) {
    console.error('[Autopay List Route] Internal error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
