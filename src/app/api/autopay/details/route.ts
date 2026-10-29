import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getTodayZonedDateString, calculateNextExecutionTimestamp, advanceConfirmedScheduleCycle } from '@/lib/autopay/schedule-calculator';
import { getTransactionStatus } from '@/lib/circle/payment-service';
import { AutopayFrequency } from '@/lib/autopay/autopay-types';

/**
 * GET /api/autopay/details?id=<schedule_id>
 * Returns verified schedule status, authoritative next execution epoch,
 * and latest on-chain transaction execution details.
 * Implements instant reconciliation and self-healing to prevent UI stuck state.
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const scheduleId = searchParams.get('id') || searchParams.get('schedule_id');
    const recipientParam = searchParams.get('recipient')?.toLowerCase();
    const senderParam = searchParams.get('sender')?.toLowerCase();

    if (!scheduleId && !recipientParam) {
      return NextResponse.json({ error: 'Missing schedule id or recipient parameter' }, { status: 400 });
    }

    // Optional user authentication for personalized checks
    let authenticatedUserId: string | null = null;
    const authHeader = req.headers.get('authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const { data: { user } } = await supabaseAdmin.auth.getUser(token);
      if (user) authenticatedUserId = user.id;
    }

    const walletHeader = req.headers.get('x-wallet-address')?.toLowerCase();
    const effectiveSender = senderParam || walletHeader;

    // 1. Fetch Authoritative Autopay Schedule
    let schedule: any = null;

    if (scheduleId) {
      const { data } = await supabaseAdmin
        .from('autopay_schedules')
        .select('*')
        .eq('id', scheduleId)
        .maybeSingle();
      schedule = data;
    }

    if (!schedule && recipientParam) {
      let q = supabaseAdmin
        .from('autopay_schedules')
        .select('*')
        .ilike('recipient_address', recipientParam)
        .eq('status', 'ACTIVE')
        .order('created_at', { ascending: false });

      if (authenticatedUserId) {
        q = q.eq('user_id', authenticatedUserId);
      } else if (effectiveSender) {
        // Find if effectiveSender is linked to a user in arc_wallets
        const { data: wRow } = await supabaseAdmin
          .from('arc_wallets')
          .select('user_id, wallet_address')
          .or(`linked_external_address.ilike.${effectiveSender},wallet_address.ilike.${effectiveSender}`)
          .maybeSingle();

        if (wRow?.user_id) {
          q = q.eq('user_id', wRow.user_id);
        } else if (wRow?.wallet_address) {
          q = q.ilike('sender_wallet', wRow.wallet_address);
        }
      }

      const { data } = await q.limit(1).maybeSingle();
      schedule = data;

      // Robust Fallback: if sender-restricted query returned nothing, match any ACTIVE schedule for recipient
      if (!schedule) {
        const { data: anyActive } = await supabaseAdmin
          .from('autopay_schedules')
          .select('*')
          .ilike('recipient_address', recipientParam)
          .eq('status', 'ACTIVE')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (anyActive) {
          schedule = anyActive;
        }
      }
    }

    // Fallback: check payments table if still not found
    if (!schedule && scheduleId) {
      try {
        const { data: pRow } = await supabaseAdmin
          .from('payments')
          .select('*')
          .eq('id', scheduleId)
          .maybeSingle();
        if (pRow) {
          const { data: matchedSched } = await supabaseAdmin
            .from('autopay_schedules')
            .select('*')
            .ilike('recipient_address', pRow.receiver)
            .eq('status', 'ACTIVE')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (matchedSched) {
            schedule = matchedSched;
          }
        }
      } catch {}
    }

    if (!schedule) {
      return NextResponse.json({ schedule: null, latestExecution: null, executions: [] });
    }

    // 2. Fetch Latest Execution Record (with on-chain tx hash)
    const effectiveScheduleId = schedule.id;
    const { data: executions, error: execErr } = await supabaseAdmin
      .from('autopay_executions')
      .select(`
        id,
        schedule_id,
        status,
        blockchain_tx_hash,
        circle_tx_id,
        amount,
        token,
        executed_at,
        error_reason,
        created_at,
        updated_at
      `)
      .eq('schedule_id', effectiveScheduleId)
      .order('created_at', { ascending: false })
      .limit(15);

    if (execErr) {
      console.warn('[Autopay Details] Error querying executions:', execErr);
    }

    const latestExecution = executions && executions.length > 0 ? executions[0] : null;

    // 2.1 Live Circle Reconciliation if latest execution is pending/submitting
    if (latestExecution?.circle_tx_id && latestExecution.status !== 'CONFIRMED' && latestExecution.status !== 'FAILED') {
      try {
        const tx = await getTransactionStatus(latestExecution.circle_tx_id);
        if (tx && (tx.state === 'COMPLETE' || tx.state === 'CONFIRMED') && tx.txHash) {
          latestExecution.status = 'CONFIRMED';
          latestExecution.blockchain_tx_hash = tx.txHash;
          latestExecution.updated_at = Date.now();

          await supabaseAdmin
            .from('autopay_executions')
            .update({
              status: 'CONFIRMED',
              blockchain_tx_hash: tx.txHash,
              updated_at: Date.now()
            })
            .eq('id', latestExecution.id);

          await supabaseAdmin
            .from('payment_ledger')
            .update({
              status: 'COMPLETE',
              blockchain_hash: tx.txHash,
              updated_at: Date.now()
            })
            .eq('id', latestExecution.id);

          // Synchronize execution payment row
          await supabaseAdmin
            .from('payments')
            .update({
              status: 'confirmed',
              tx_hash: tx.txHash
            })
            .eq('id', latestExecution.id);

          // Synchronize schedule payment row if distinct
          if (schedule?.id && schedule.id !== latestExecution.id) {
            await supabaseAdmin
              .from('payments')
              .update({
                status: 'confirmed',
                tx_hash: tx.txHash
              })
              .eq('id', schedule.id);
          }
        } else if (tx && (tx.state === 'FAILED' || tx.state === 'CANCELLED')) {
          latestExecution.status = 'FAILED';
          latestExecution.error_reason = tx.errorReason || 'Circle transaction failed';
          latestExecution.updated_at = Date.now();

          await supabaseAdmin
            .from('autopay_executions')
            .update({
              status: 'FAILED',
              error_reason: latestExecution.error_reason,
              updated_at: Date.now()
            })
            .eq('id', latestExecution.id);

          await supabaseAdmin
            .from('payment_ledger')
            .update({
              status: 'FAILED',
              updated_at: Date.now()
            })
            .eq('id', latestExecution.id);
        }
      } catch (err: any) {
        console.warn('[Autopay Details] Live reconciliation check error:', err?.message);
      }
    }

    // 2.2 Self-Healing & Next Cycle Synchronization (Authoritative Centralized Helper)
    if (schedule && schedule.status === 'ACTIVE') {
      const advResult = await advanceConfirmedScheduleCycle(supabaseAdmin, schedule, latestExecution, Date.now());
      if (advResult.advanced) {
        schedule.status = advResult.status;
        schedule.next_execution_at = advResult.nextExecutionAt;
        if (advResult.isExhausted) {
          schedule.last_execution_status = 'CONFIRMED';
        }
      }
    }

    // 3. Fallback to payments table if schedule not found in autopay_schedules
    let fallbackPayment: any = null;
    if (!schedule) {
      const { data: pay } = await supabaseAdmin
        .from('payments')
        .select('*')
        .eq('id', scheduleId)
        .maybeSingle();
      if (pay) {
        fallbackPayment = pay;
      }
    }

    if (!schedule && !fallbackPayment) {
      return NextResponse.json({ error: 'Autopay schedule not found' }, { status: 404 });
    }

    const nextExecutionAt = schedule
      ? (schedule.next_execution_at ? Number(schedule.next_execution_at) : null)
      : (fallbackPayment?.next_payment_at ? new Date(fallbackPayment.next_payment_at).getTime() : null);

    const blockchainTxHash = latestExecution?.blockchain_tx_hash || fallbackPayment?.tx_hash || null;
    const isExhaustedOrComplete = (schedule?.status === 'EXHAUSTED') || (fallbackPayment && !fallbackPayment.active && fallbackPayment.status === 'confirmed');

    return NextResponse.json({
      success: true,
      schedule: schedule || {
        id: fallbackPayment.id,
        amount: fallbackPayment.amount,
        token: fallbackPayment.token,
        frequency: (fallbackPayment.recurring_interval || 'daily').toUpperCase(),
        status: fallbackPayment.status === 'cancelled' ? 'CANCELLED' : (isExhaustedOrComplete ? 'EXHAUSTED' : 'ACTIVE'),
        next_execution_at: isExhaustedOrComplete ? null : nextExecutionAt,
        last_execution_status: fallbackPayment.status === 'confirmed' ? 'CONFIRMED' : null
      },
      latestExecution: latestExecution || (blockchainTxHash ? {
        status: 'CONFIRMED',
        blockchain_tx_hash: blockchainTxHash,
        executed_at: fallbackPayment?.created_at || null
      } : null),
      executions: executions || (blockchainTxHash ? [{
        id: fallbackPayment?.id || scheduleId,
        schedule_id: scheduleId,
        status: 'CONFIRMED',
        blockchain_tx_hash: blockchainTxHash,
        amount: schedule?.amount || fallbackPayment?.amount,
        token: schedule?.token || fallbackPayment?.token || 'USDC',
        executed_at: fallbackPayment?.created_at || Date.now(),
        created_at: fallbackPayment?.created_at || Date.now()
      }] : [])
    });
  } catch (error: any) {
    console.error('[Autopay Details] Internal error:', error);
    return NextResponse.json({ error: 'Internal server error: ' + error.message }, { status: 500 });
  }
}
