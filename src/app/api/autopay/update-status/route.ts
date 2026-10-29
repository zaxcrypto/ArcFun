import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { checkRateLimit } from '@/lib/rate-limit';
import { calculateNextExecutionTimestamp, getTodayZonedDateString } from '@/lib/autopay/schedule-calculator';
import { AutopayFrequency } from '@/lib/autopay/autopay-types';

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

    // 2. Parse and validate body
    let body;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Malformed JSON payload' }, { status: 400 });
    }

    const { scheduleId, action, authorizationVersion, walletAddress } = body || {};
    if (!scheduleId || typeof scheduleId !== 'string') {
      return NextResponse.json({ error: 'Missing or invalid scheduleId' }, { status: 400 });
    }

    const clientWallet = (walletAddress || walletHeader || '').toLowerCase();
    if (clientWallet && !userAddresses.includes(clientWallet)) {
      userAddresses.push(clientWallet);
    }

    // Must have at least authenticated user or valid wallet address
    if (!user && !clientWallet) {
      return NextResponse.json({ error: 'Missing or invalid authorization header' }, { status: 401 });
    }

    // Rate limit for authenticated users
    if (user) {
      const rateLimitError = await checkRateLimit(req, user.id, { maxRequests: 20, windowMs: 60000 });
      if (rateLimitError) return rateLimitError;
    }

    const validActions = ['PAUSE', 'RESUME', 'CANCEL'] as const;
    if (!action || !validActions.includes(action as any)) {
      return NextResponse.json({ error: 'Invalid action. Must be "PAUSE", "RESUME", or "CANCEL"' }, { status: 400 });
    }

    // 4. Fetch schedule
    let { data: schedule } = await supabaseAdmin
      .from('autopay_schedules')
      .select('*')
      .eq('id', scheduleId)
      .maybeSingle();

    let linkedPayRow: any = null;

    if (!schedule) {
      // Fallback: check payments table
      try {
        const { data: payRow } = await supabaseAdmin
          .from('payments')
          .select('*')
          .eq('id', scheduleId)
          .maybeSingle();

        if (payRow) {
          linkedPayRow = payRow;
          // Look up active schedule between these participants
          const { data: matchedSched } = await supabaseAdmin
            .from('autopay_schedules')
            .select('*')
            .eq('recipient_address', payRow.receiver)
            .eq('status', 'ACTIVE')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (matchedSched) {
            schedule = matchedSched;
          } else if (action === 'CANCEL') {
            await supabaseAdmin
              .from('payments')
              .update({ status: 'cancelled', active: false })
              .eq('id', scheduleId);

            return NextResponse.json({
              success: true,
              action: 'CANCEL',
              status: 'cancelled',
              scheduleId,
              message: 'Payment cancelled successfully'
            });
          }
        }
      } catch {}

      if (!schedule) {
        return NextResponse.json({ error: 'Autopay schedule not found' }, { status: 404 });
      }
    }

    // Verify ownership: user_id matches OR user address matches sender_wallet or recipient_address
    const isOwner = (user && schedule.user_id === user.id) ||
      (schedule.sender_wallet && userAddresses.includes(schedule.sender_wallet.toLowerCase())) ||
      (schedule.recipient_address && userAddresses.includes(schedule.recipient_address.toLowerCase())) ||
      (linkedPayRow && (userAddresses.includes(linkedPayRow.sender?.toLowerCase()) || userAddresses.includes(linkedPayRow.receiver?.toLowerCase())));

    if (!isOwner) {
      return NextResponse.json({ error: 'Unauthorized: Schedule does not belong to this user' }, { status: 403 });
    }

    // 5. Authorization version check (concurrency & replay protection for PAUSE/RESUME)
    if (action !== 'CANCEL' && authorizationVersion !== undefined && authorizationVersion !== null) {
      const expectedVer = Number(authorizationVersion);
      if (expectedVer !== schedule.authorization_version) {
        return NextResponse.json({ 
          error: `Authorization version mismatch (expected ${schedule.authorization_version}, got ${expectedVer}). The schedule may have been updated concurrently.` 
        }, { status: 409 });
      }
    }

    // 6. Enforce immutable cancellation constraint (Idempotent for CANCEL)
    if (schedule.status === 'CANCELLED') {
      if (action === 'CANCEL') {
        return NextResponse.json({
          success: true,
          action: 'CANCEL',
          status: 'CANCELLED',
          scheduleId: schedule.id,
          message: 'Autopay schedule is already cancelled'
        });
      }
      return NextResponse.json({ 
        error: 'This Autopay schedule has been permanently cancelled and its authorization revoked. A new schedule must be configured.' 
      }, { status: 400 });
    }

    const now = Date.now();
    let updates: Record<string, any> = {
      updated_at: now
    };

    // 6. Handle State Transitions
    if (action === 'PAUSE') {
      if (schedule.status !== 'ACTIVE') {
        return NextResponse.json({ error: `Cannot pause schedule: current status is "${schedule.status}"` }, { status: 400 });
      }
      updates.status = 'PAUSED';
    } else if (action === 'RESUME') {
      if (schedule.status !== 'PAUSED' && schedule.status !== 'EXHAUSTED') {
        return NextResponse.json({ error: `Cannot resume schedule: current status is "${schedule.status}"` }, { status: 400 });
      }

      // Check if end_date has already elapsed in schedule timezone
      if (schedule.end_date) {
        const todayIso = getTodayZonedDateString(schedule.timezone || 'Asia/Kolkata', now);
        if (schedule.end_date < todayIso) {
          return NextResponse.json({ error: 'Cannot resume: Schedule end date has already passed.' }, { status: 400 });
        }
      }

      // Re-calculate the next execution time starting from now to avoid back-dated execution spikes
      const newNextExecution = calculateNextExecutionTimestamp({
        frequency: schedule.frequency as AutopayFrequency,
        executionTime: schedule.execution_time,
        timezone: schedule.timezone,
        monthlyDay: schedule.monthly_day,
        weeklyDay: schedule.weekly_day,
        fromTimestamp: now
      });

      if (schedule.end_date) {
        const nextZoned = getTodayZonedDateString(schedule.timezone || 'Asia/Kolkata', newNextExecution);
        if (nextZoned > schedule.end_date) {
          return NextResponse.json({ error: 'Cannot resume: Schedule end date has already passed or next execution exceeds end date.' }, { status: 400 });
        }
      }

      updates.status = 'ACTIVE';
      updates.next_execution_at = newNextExecution;
      updates.consecutive_failures = 0;
      updates.last_error_reason = null;
    } else if (action === 'CANCEL') {
      // Cancellation permanently revokes the user authorization
      updates.status = 'CANCELLED';
      updates.revoked_at = now;
      updates.authorization_version = (schedule.authorization_version || 1) + 1;
    }

    // 7. Persist updates
    const { data: updatedSchedule, error: updateErr } = await supabaseAdmin
      .from('autopay_schedules')
      .update(updates)
      .eq('id', scheduleId)
      .select('*')
      .single();

    if (updateErr || !updatedSchedule) {
      console.error('[Autopay Update Status] Error updating schedule:', updateErr);
      return NextResponse.json({ error: 'Failed to update schedule status' }, { status: 500 });
    }

    // Seamlessly sync with payments table
    try {
      if (action === 'CANCEL') {
        await supabaseAdmin
          .from('payments')
          .update({ status: 'cancelled', active: false })
          .eq('id', scheduleId);
      } else if (action === 'PAUSE') {
        await supabaseAdmin
          .from('payments')
          .update({ active: false })
          .eq('id', scheduleId);
      } else if (action === 'RESUME') {
        await supabaseAdmin
          .from('payments')
          .update({
            active: true,
            status: 'pending',
            next_payment_at: updates.next_execution_at ? new Date(updates.next_execution_at).toISOString() : null
          })
          .eq('id', scheduleId);
      }
    } catch (paySyncErr) {
      console.warn('[Autopay Update Status] Failed to sync payment table status (non-fatal):', paySyncErr);
    }

    // 8. Audit logging
    console.log(JSON.stringify({
      level: 'INFO',
      event: 'AUTOPAY_STATUS_UPDATED',
      scheduleId: schedule.id,
      userId: user?.id || clientWallet || 'anonymous',
      action,
      previousStatus: schedule.status,
      newStatus: updatedSchedule.status,
      authorizationVersion: updatedSchedule.authorization_version,
      timestamp: now
    }));

    return NextResponse.json({
      success: true,
      scheduleId: updatedSchedule.id,
      status: updatedSchedule.status,
      nextExecutionAt: Number(updatedSchedule.next_execution_at),
      authorizationVersion: updatedSchedule.authorization_version,
      revokedAt: updatedSchedule.revoked_at ? Number(updatedSchedule.revoked_at) : null,
      updatedAt: Number(updatedSchedule.updated_at)
    });

  } catch (error: any) {
    console.error('[Autopay Update Status Route] Internal error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
