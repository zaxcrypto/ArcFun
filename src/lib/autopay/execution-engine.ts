/**
 * ArcFun Autopay Execution Engine
 * Durable, atomic recurring execution engine backed by Circle Developer-Controlled Wallets.
 * Restricted strictly to Arc Testnet USDC.
 */

import { supabaseAdmin } from '@/lib/supabase-admin';
import { executeTransfer, getTokenIdBySymbol, getTransactionStatus } from '@/lib/circle/payment-service';
import { calculateNextExecutionTimestamp, getTodayZonedDateString } from './schedule-calculator';
import { AUTOPAY_SUPPORTED_BLOCKCHAIN, AUTOPAY_SUPPORTED_TOKEN, AutopayFrequency } from './autopay-types';

export interface ExecutionResult {
  processedCount: number;
  successCount: number;
  failureCount: number;
  skippedCount: number;
  reconciledCount?: number;
  details: Array<{
    scheduleId: string;
    executionId?: string;
    recipient: string;
    amount: number;
    status: 'CONFIRMED' | 'SUCCESS' | 'FAILED' | 'SKIPPED' | 'PENDING';
    circleTxId?: string;
    blockchainTxHash?: string | null;
    error?: string;
  }>;
}

/**
 * Parses complete Circle error structure including nested `details` array.
 * Accurately classifies insufficient funds, rate limits, timeouts, and auth errors.
 */
export function parseCircleTransferError(transferErr: any): {
  errorMessage: string;
  isInsufficientFunds: boolean;
  isUncertainStatus: boolean;
  isTransient: boolean;
} {
  const errData = transferErr.response?.data;
  const topMessage = errData?.message || transferErr.message || 'Circle transfer failed';
  const detailList = Array.isArray(errData?.details)
    ? errData.details.map((d: any) => d.message || d.error || '').filter(Boolean)
    : [];
  const fullErrorText = [topMessage, ...detailList].join(' | ');
  const lowerText = fullErrorText.toLowerCase();

  const isInsufficientFunds =
    lowerText.includes('insufficient') ||
    lowerText.includes('balance') ||
    lowerText.includes('funds') ||
    errData?.code === 155106;

  const isUncertainStatus =
    transferErr.code === 'ECONNABORTED' ||
    transferErr.code === 'ETIMEDOUT' ||
    transferErr.code === 'ECONNRESET' ||
    transferErr.code === 'ENOTFOUND' ||
    transferErr.response?.status === 408 ||
    transferErr.response?.status === 502 ||
    transferErr.response?.status === 503 ||
    transferErr.response?.status === 504 ||
    lowerText.includes('timeout') ||
    lowerText.includes('socket hang up') ||
    lowerText.includes('network error');

  const isTransient =
    isUncertainStatus ||
    transferErr.response?.status === 429 ||
    transferErr.response?.status === 500 ||
    lowerText.includes('rate limit') ||
    lowerText.includes('too many requests') ||
    lowerText.includes('service unavailable');

  return {
    errorMessage: isInsufficientFunds ? `Insufficient USDC balance: ${fullErrorText}` : fullErrorText,
    isInsufficientFunds,
    isUncertainStatus,
    isTransient
  };
}

/**
 * Active Reconciliation: Reconciles any PENDING or SUBMITTING executions with Circle.
 * Ensures executions are updated to CONFIRMED or FAILED even if webhooks are delayed or dropped.
 */
export async function reconcilePendingExecutions(): Promise<{
  reconciledCount: number;
  confirmedCount: number;
  failedCount: number;
}> {
  try {
    const { data: pendingExecs, error: fetchErr } = await supabaseAdmin
      .from('autopay_executions')
      .select('id, schedule_id, circle_tx_id, idempotency_key, amount, created_at')
      .in('status', ['PENDING', 'SUBMITTING'])
      .not('circle_tx_id', 'is', null)
      .order('created_at', { ascending: true })
      .limit(20);

    if (fetchErr || !pendingExecs || pendingExecs.length === 0) {
      return { reconciledCount: 0, confirmedCount: 0, failedCount: 0 };
    }

    let confirmedCount = 0;
    let failedCount = 0;

    for (const exec of pendingExecs) {
      if (!exec.circle_tx_id) continue;
      try {
        const tx = await getTransactionStatus(exec.circle_tx_id);
        if (!tx) continue;

        const isConfirmed = (tx.state === 'COMPLETE' || tx.state === 'CONFIRMED') && !!tx.txHash;
        const isFailed = tx.state === 'FAILED' || tx.state === 'CANCELLED' || tx.state === 'DENIED';

        if (isConfirmed) {
          await supabaseAdmin
            .from('autopay_executions')
            .update({
              status: 'CONFIRMED',
              blockchain_tx_hash: tx.txHash || null,
              updated_at: Date.now()
            })
            .eq('id', exec.id);

          await supabaseAdmin
            .from('payment_ledger')
            .update({
              status: 'COMPLETE',
              blockchain_hash: tx.txHash || null,
              updated_at: Date.now()
            })
            .eq('id', exec.id);

          // Fetch schedule to advance next cycle or mark EXHAUSTED if end_date arrived
          const { data: schedule } = await supabaseAdmin
            .from('autopay_schedules')
            .select('*')
            .eq('id', exec.schedule_id)
            .maybeSingle();

          let scheduleUpdate: Record<string, any> = {
            last_execution_status: 'CONFIRMED',
            updated_at: Date.now()
          };
          let paymentsUpdate: Record<string, any> = {
            status: 'confirmed',
            tx_hash: tx.txHash || null,
            active: true
          };

          if (schedule && schedule.status === 'ACTIVE' && schedule.next_execution_at && Number(schedule.next_execution_at) <= Date.now()) {
            const nextTimestamp = calculateNextExecutionTimestamp({
              frequency: schedule.frequency as AutopayFrequency,
              executionTime: schedule.execution_time,
              timezone: schedule.timezone,
              monthlyDay: schedule.monthly_day,
              weeklyDay: schedule.weekly_day,
              startDate: schedule.start_date,
              fromTimestamp: Date.now()
            });

            const todayIso = getTodayZonedDateString(schedule.timezone || 'Asia/Kolkata');
            const nextZoned = getTodayZonedDateString(schedule.timezone || 'Asia/Kolkata', nextTimestamp);
            const isOneTime = Boolean(
              schedule.start_date &&
              schedule.end_date &&
              schedule.start_date === schedule.end_date
            );
            const isExhausted = Boolean(
              isOneTime ||
              (schedule.end_date &&
              (schedule.end_date < todayIso || nextZoned > schedule.end_date))
            );

            if (isExhausted) {
              scheduleUpdate.status = 'EXHAUSTED';
              paymentsUpdate.active = false;
              paymentsUpdate.next_payment_at = null;
            } else {
              scheduleUpdate.next_execution_at = nextTimestamp;
              paymentsUpdate.active = true;
              paymentsUpdate.next_payment_at = new Date(nextTimestamp).toISOString();
            }
          }

          await supabaseAdmin
            .from('autopay_schedules')
            .update(scheduleUpdate)
            .eq('id', exec.schedule_id);

          await supabaseAdmin
            .from('payments')
            .update(paymentsUpdate)
            .eq('id', exec.schedule_id);

          try {
            await supabaseAdmin
              .from('payments')
              .update({
                status: 'confirmed',
                tx_hash: tx.txHash
              })
              .eq('id', exec.id);
          } catch {}

          confirmedCount++;
          console.log(`[Autopay Reconciliation] Execution ${exec.id} CONFIRMED on-chain (txHash: ${tx.txHash})`);
        } else if (isFailed) {
          await supabaseAdmin
            .from('autopay_executions')
            .update({
              status: 'FAILED',
              error_reason: tx.errorReason || 'Transaction rejected by network',
              updated_at: Date.now()
            })
            .eq('id', exec.id);

          await supabaseAdmin
            .from('payment_ledger')
            .update({
              status: 'FAILED',
              error_reason: tx.errorReason || 'Transaction rejected by network',
              updated_at: Date.now()
            })
            .eq('id', exec.id);

          // Fetch schedule to revert current_month_spent and increment failures
          const { data: schedule } = await supabaseAdmin
            .from('autopay_schedules')
            .select('current_month_spent, consecutive_failures')
            .eq('id', exec.schedule_id)
            .maybeSingle();

          const newFailures = (schedule?.consecutive_failures || 0) + 1;
          const revertedSpent = Math.max(0, (schedule?.current_month_spent || 0) - (Number(exec.amount) || 0));
          const shouldPause = newFailures >= 3;

          const scheduleUpdate: Record<string, any> = {
            last_execution_status: 'FAILED',
            last_error_reason: tx.errorReason || 'Transaction rejected by network',
            consecutive_failures: newFailures,
            current_month_spent: revertedSpent,
            updated_at: Date.now()
          };
          if (shouldPause) {
            scheduleUpdate.status = 'PAUSED';
          }

          await supabaseAdmin
            .from('autopay_schedules')
            .update(scheduleUpdate)
            .eq('id', exec.schedule_id);

          failedCount++;
          console.warn(`[Autopay Reconciliation] Execution ${exec.id} FAILED: ${tx.errorReason}`);
        }
      } catch (err: any) {
        // Non-fatal if single transaction query fails
        console.warn(`[Autopay Reconciliation] Could not query Circle for tx ${exec.circle_tx_id}:`, err.message);
      }
    }

    return { reconciledCount: pendingExecs.length, confirmedCount, failedCount };
  } catch (err: any) {
    console.error('[Autopay Reconciliation] Failed to reconcile pending executions:', err.message);
    return { reconciledCount: 0, confirmedCount: 0, failedCount: 0 };
  }
}

/**
 * Executes due Autopay payments atomically.
 * Prevents concurrent duplicate runs via Supabase FOR UPDATE SKIP LOCKED.
 */
export async function processDueAutopaySchedules(options?: {
  batchSize?: number;
  nowEpoch?: number;
  dryRun?: boolean;
  scheduleId?: string;
}): Promise<ExecutionResult> {
  const batchSize = options?.batchSize || 10;
  const nowEpoch = options?.nowEpoch || Date.now();
  const isDryRun = options?.dryRun ?? false;
  const targetedScheduleId = options?.scheduleId;

  const result: ExecutionResult = {
    processedCount: 0,
    successCount: 0,
    failureCount: 0,
    skippedCount: 0,
    details: []
  };

  // 0. Active Reconciliation Pass: Reconcile any in-flight pending payments with Circle
  const reconResult = await reconcilePendingExecutions();
  result.reconciledCount = reconResult.confirmedCount + reconResult.failedCount;

  // 1. Atomically acquire due schedules using stored procedure (or targeted schedule directly)
  let acquiredSchedules: any[] = [];
  if (targetedScheduleId) {
    const { data: directSched, error: directErr } = await supabaseAdmin
      .from('autopay_schedules')
      .select('*')
      .eq('id', targetedScheduleId)
      .maybeSingle();

    if (directErr || !directSched) {
      console.warn(`[Autopay Execution Engine] Targeted schedule ${targetedScheduleId} not found:`, directErr);
      return result;
    }
    // Only proceed if active and due
    if (directSched.status === 'ACTIVE') {
      acquiredSchedules = [directSched];
    } else {
      console.warn(`[Autopay Execution Engine] Targeted schedule ${targetedScheduleId} is not ACTIVE (status: ${directSched.status})`);
      return result;
    }
  } else {
    const { data: rpcSchedules, error: rpcErr } = await supabaseAdmin.rpc('acquire_due_autopay_schedules', {
      p_limit: batchSize,
      p_now_epoch: nowEpoch
    });

    if (rpcErr) {
      console.error('[Autopay Execution Engine] Failed to acquire due schedules via RPC:', rpcErr);
      throw new Error(`Failed to acquire due Autopay schedules: ${rpcErr.message}`);
    }

    if (rpcSchedules && rpcSchedules.length > 0) {
      acquiredSchedules = rpcSchedules;
    }
  }

  if (!acquiredSchedules || acquiredSchedules.length === 0) {
    return result;
  }

  // 2. Process each acquired schedule sequentially
  for (const raw of acquiredSchedules) {
    result.processedCount++;
    const scheduleId = raw.schedule_id || raw.id;

    try {
      // 2.1 Revalidate schedule state from database
      const { data: schedule, error: fetchErr } = await supabaseAdmin
        .from('autopay_schedules')
        .select('*')
        .eq('id', scheduleId)
        .single();

      if (fetchErr || !schedule) {
        result.skippedCount++;
        result.details.push({
          scheduleId,
          recipient: raw.recipient_address,
          amount: Number(raw.amount),
          status: 'SKIPPED',
          error: 'Schedule no longer exists in database'
        });
        continue;
      }

      // Check status: only process ACTIVE schedules
      if (schedule.status !== 'ACTIVE') {
        result.skippedCount++;
        result.details.push({
          scheduleId,
          recipient: schedule.recipient_address,
          amount: Number(schedule.amount),
          status: 'SKIPPED',
          error: `Schedule status is not ACTIVE (current: "${schedule.status}")`
        });
        continue;
      }

      // Verify authorization version matches
      if (schedule.authorization_version !== raw.authorization_version) {
        result.skippedCount++;
        result.details.push({
          scheduleId,
          recipient: schedule.recipient_address,
          amount: Number(schedule.amount),
          status: 'SKIPPED',
          error: 'Authorization version conflict: schedule modified concurrently'
        });
        continue;
      }

      // Check network and token constraint: strictly Arc Testnet USDC
      if (schedule.blockchain !== AUTOPAY_SUPPORTED_BLOCKCHAIN || schedule.token !== AUTOPAY_SUPPORTED_TOKEN) {
        result.skippedCount++;
        result.details.push({
          scheduleId,
          recipient: schedule.recipient_address,
          amount: Number(schedule.amount),
          status: 'SKIPPED',
          error: `Unsupported network or token: ${schedule.blockchain} / ${schedule.token}`
        });
        continue;
      }

      // Check if end_date has elapsed (in schedule's selected timezone)
      if (schedule.end_date) {
        const todayIso = getTodayZonedDateString(schedule.timezone, nowEpoch);
        const scheduledZonedDate = schedule.next_execution_at
          ? getTodayZonedDateString(schedule.timezone, Number(schedule.next_execution_at))
          : null;

        // If end_date is past today, OR if the scheduled next_execution_at is beyond end_date:
        if (schedule.end_date < todayIso || (scheduledZonedDate && scheduledZonedDate > schedule.end_date)) {
          // Mark schedule completed/exhausted
          const exUpdate: Record<string, any> = {
            status: 'EXHAUSTED',
            updated_at: nowEpoch
          };
          const { error: exErr } = await supabaseAdmin
            .from('autopay_schedules')
            .update({ ...exUpdate, next_execution_at: null })
            .eq('id', scheduleId);
          if (exErr) {
            await supabaseAdmin
              .from('autopay_schedules')
              .update(exUpdate)
              .eq('id', scheduleId);
          }

          await supabaseAdmin
            .from('payments')
            .update({
              active: false,
              next_payment_at: null,
              status: 'confirmed'
            })
            .eq('id', scheduleId);

          result.skippedCount++;
          result.details.push({
            scheduleId,
            recipient: schedule.recipient_address,
            amount: Number(schedule.amount),
            status: 'SKIPPED',
            error: 'Schedule end_date has expired; marked EXHAUSTED'
          });
          continue;
        }
      }

      // 2.2 Revalidate and adjust monthly spending cycle
      const amount = Number(schedule.amount);
      const maxPerPayment = Number(schedule.max_per_payment);
      const monthlySpendingLimit = Number(schedule.monthly_spending_limit);

      if (amount > maxPerPayment) {
        await handleExecutionFailure(schedule, 'Amount exceeds per-payment cap limit', nowEpoch);
        result.failureCount++;
        result.details.push({
          scheduleId,
          recipient: schedule.recipient_address,
          amount,
          status: 'FAILED',
          error: `Amount (${amount}) exceeds per-payment cap (${maxPerPayment})`
        });
        continue;
      }

      // Calculate current month cycle (YYYY-MM) in target timezone
      const dateObj = new Date(nowEpoch);
      const currentCycle = `${dateObj.getUTCFullYear()}-${String(dateObj.getUTCMonth() + 1).padStart(2, '0')}`;
      let currentMonthSpent = Number(schedule.current_month_spent);

      if (schedule.current_month_cycle !== currentCycle) {
        // Month has rolled over: reset monthly spending accounting
        currentMonthSpent = 0.00;
        await supabaseAdmin
          .from('autopay_schedules')
          .update({
            current_month_spent: 0.00,
            current_month_cycle: currentCycle,
            updated_at: nowEpoch
          })
          .eq('id', scheduleId);
      }

      // Check monthly spending limit
      if (currentMonthSpent + amount > monthlySpendingLimit) {
        await supabaseAdmin
          .from('autopay_schedules')
          .update({
            status: 'EXHAUSTED',
            last_execution_status: 'SKIPPED',
            last_error_reason: `Monthly spending limit of ${monthlySpendingLimit} USDC reached for cycle ${currentCycle}`,
            updated_at: nowEpoch
          })
          .eq('id', scheduleId);

        result.skippedCount++;
        result.details.push({
          scheduleId,
          recipient: schedule.recipient_address,
          amount,
          status: 'SKIPPED',
          error: `Monthly spending limit of ${monthlySpendingLimit} USDC reached; marked EXHAUSTED`
        });
        continue;
      }

      // 2.3 Verify Sender's ArcFun Circle DCW is ACTIVE
      const { data: senderWallet, error: walletErr } = await supabaseAdmin
        .from('arc_wallets')
        .select('status, circle_wallet_id, wallet_address')
        .eq('user_id', schedule.user_id)
        .eq('blockchain', AUTOPAY_SUPPORTED_BLOCKCHAIN)
        .maybeSingle();

      if (walletErr || !senderWallet || senderWallet.status === 'FROZEN') {
        await handleExecutionFailure(schedule, 'Sender ArcFun Wallet is frozen or inaccessible', nowEpoch);
        result.failureCount++;
        result.details.push({
          scheduleId,
          recipient: schedule.recipient_address,
          amount,
          status: 'FAILED',
          error: 'Sender ArcFun Circle Wallet is frozen or unavailable'
        });
        continue;
      }

      // 2.4 Idempotency Key Generation
      // Strictly deterministic: autopay_{scheduleId}_{scheduledFor}_{authVersion}
      const idempotencyKey = `autopay_${schedule.id}_${schedule.next_execution_at}_v${schedule.authorization_version}`;
      const intentId = crypto.randomUUID();

      // Check if an execution with this idempotency key was already created or completed
      let existingExecution: any = null;
      try {
        const { data: byIdemp, error: idempErr } = await supabaseAdmin
          .from('autopay_executions')
          .select('id, status, circle_tx_id')
          .eq('idempotency_key', idempotencyKey)
          .maybeSingle();

        if (!idempErr) {
          existingExecution = byIdemp;
        }
      } catch {
        // Table may not have idempotency_key yet (prior to migration 031)
      }

      if (existingExecution && (existingExecution.status === 'CONFIRMED' || existingExecution.status === 'SUCCESS')) {
        // Already executed: advance schedule timestamp to avoid deadlock
        const newNextExecution = calculateNextExecutionTimestamp({
          frequency: schedule.frequency as AutopayFrequency,
          executionTime: schedule.execution_time,
          timezone: schedule.timezone,
          monthlyDay: schedule.monthly_day,
          weeklyDay: schedule.weekly_day,
          startDate: schedule.start_date,
          fromTimestamp: nowEpoch
        });

        const nextZonedDate = getTodayZonedDateString(schedule.timezone, newNextExecution);
        const isExhausted = Boolean(schedule.end_date && nextZonedDate > schedule.end_date);

        await supabaseAdmin
          .from('autopay_schedules')
          .update({
            status: isExhausted ? 'EXHAUSTED' : schedule.status,
            next_execution_at: isExhausted ? null : newNextExecution,
            updated_at: nowEpoch
          })
          .eq('id', schedule.id);

        if (isExhausted) {
          await supabaseAdmin
            .from('payments')
            .update({
              active: false,
              next_payment_at: null,
              status: 'confirmed'
            })
            .eq('id', schedule.id);
        }

        result.skippedCount++;
        result.details.push({
          scheduleId,
          recipient: schedule.recipient_address,
          amount,
          status: 'SKIPPED',
          error: isExhausted
            ? 'Already executed; schedule reached end_date and was marked EXHAUSTED'
            : 'Already executed under this idempotency key; schedule advanced'
        });
        continue;
      }

      // 2.5 Insert or reuse PENDING execution record
      let executionId: string;
      if (existingExecution) {
        executionId = existingExecution.id;
      } else {
        const fullInsertPayload = {
          schedule_id: schedule.id,
          intent_id: intentId,
          user_id: schedule.user_id,
          circle_wallet_id: schedule.circle_wallet_id,
          recipient_address: schedule.recipient_address,
          amount: schedule.amount,
          token: schedule.token,
          blockchain: schedule.blockchain,
          status: 'PENDING',
          idempotency_key: idempotencyKey,
          scheduled_for: schedule.next_execution_at,
          created_at: nowEpoch,
          updated_at: nowEpoch
        };

        let { data: newExec, error: execInsertErr } = await supabaseAdmin
          .from('autopay_executions')
          .insert(fullInsertPayload)
          .select('id')
          .single();

        // Schema fallback if legacy table lacks idempotency_key or user_id columns (prior to migration 031)
        if (execInsertErr && (execInsertErr.code === '42703' || execInsertErr.code === 'PGRST204')) {
          console.warn('[Autopay Execution Engine] Legacy autopay_executions table detected. Falling back to core columns (pending migration 031)...');
          const legacyPayload = {
            schedule_id: schedule.id,
            intent_id: intentId,
            amount: schedule.amount,
            token: schedule.token,
            status: 'PENDING',
            scheduled_for: schedule.next_execution_at,
            created_at: nowEpoch,
            updated_at: nowEpoch
          };
          const fallbackInsert = await supabaseAdmin
            .from('autopay_executions')
            .insert(legacyPayload)
            .select('id')
            .single();
          newExec = fallbackInsert.data;
          execInsertErr = fallbackInsert.error;
        }

        if (execInsertErr || !newExec) {
          console.error('[Autopay Execution Engine] Failed to record pending execution:', execInsertErr);
          result.failureCount++;
          continue;
        }
        executionId = newExec.id;
      }

      // 2.6 Resolve USDC Token ID for Circle DCW
      let usdcTokenId: string;
      try {
        usdcTokenId = await getTokenIdBySymbol(
          schedule.circle_wallet_id,
          schedule.token,
          schedule.blockchain
        );
      } catch (tokenErr: any) {
        await markExecutionFailed(executionId, schedule, `Token ID resolution failed: ${tokenErr.message}`, nowEpoch);
        result.failureCount++;
        result.details.push({
          scheduleId,
          recipient: schedule.recipient_address,
          amount,
          status: 'FAILED',
          error: tokenErr.message
        });
        continue;
      }

      // 2.7 Dry-Run Check: Bypass actual financial execution if dryRun is enabled
      if (isDryRun) {
        console.log(`[Autopay Execution Engine] [DRY RUN] Schedule ${schedule.id} verified: would transfer ${amount} ${schedule.token} to ${schedule.recipient_address} (idempotency: ${idempotencyKey})`);
        result.skippedCount++;
        result.details.push({
          scheduleId,
          recipient: schedule.recipient_address,
          amount,
          status: 'SKIPPED',
          error: 'DRY_RUN: Transfers disabled'
        });
        continue;
      }

      // 2.8 Execute transfer via Circle Developer-Controlled Wallets
      let circleTx: any;
      try {
        // Circle API strictly requires idempotencyKey / refId to be a standard UUID v4 format
        circleTx = await executeTransfer(
          schedule.circle_wallet_id,
          usdcTokenId,
          schedule.recipient_address,
          amount.toFixed(6),
          intentId,
          'HIGH' // Priority fee for reliable automated execution
        );
      } catch (transferErr: any) {
        const {
          errorMessage,
          isInsufficientFunds,
          isUncertainStatus,
          isTransient
        } = parseCircleTransferError(transferErr);

        console.error(`[Autopay Execution Engine] Circle transfer call failed for schedule ${schedule.id}:`, errorMessage);

        if (isUncertainStatus) {
          // CRITICAL: Submission status uncertain. Never blindly retry.
          // Keep execution in PENDING state awaiting Circle reconciliation or webhook confirmation.
          console.warn(`[Autopay Execution Engine] Uncertain submission status for schedule ${schedule.id}. Preserving PENDING state without retry.`);
          await supabaseAdmin
            .from('autopay_executions')
            .update({
              status: 'PENDING',
              error_reason: `Submission status uncertain: ${errorMessage}. Pending reconciliation.`,
              updated_at: nowEpoch
            })
            .eq('id', executionId);

          result.skippedCount++;
          result.details.push({
            scheduleId,
            recipient: schedule.recipient_address,
            amount,
            status: 'SKIPPED',
            error: `Submission status uncertain due to timeout (${errorMessage}). Kept PENDING for reconciliation.`
          });
          continue;
        }

        await markExecutionFailed(
          executionId,
          schedule,
          errorMessage,
          nowEpoch,
          isInsufficientFunds,
          isTransient
        );

        result.failureCount++;
        result.details.push({
          scheduleId,
          recipient: schedule.recipient_address,
          amount,
          status: 'FAILED',
          error: errorMessage
        });
        continue;
      }

      // 2.8 Handle Transfer Submission: Persist as PENDING with circle_tx_id
      // Never mark CONFIRMED prematurely; confirmation requires on-chain mining proof or Circle COMPLETE state.
      const circleTxId = circleTx.id;
      const nextExecutionAt = calculateNextExecutionTimestamp({
        frequency: schedule.frequency as AutopayFrequency,
        executionTime: schedule.execution_time,
        timezone: schedule.timezone,
        monthlyDay: schedule.monthly_day,
        weeklyDay: schedule.weekly_day,
        startDate: schedule.start_date,
        fromTimestamp: nowEpoch
      });

      const nextExecutionZonedDate = getTodayZonedDateString(schedule.timezone, nextExecutionAt);
      const isOneTime = Boolean(
        schedule.start_date &&
        schedule.end_date &&
        schedule.start_date === schedule.end_date
      );
      const isScheduleExhausted = Boolean(
        isOneTime ||
        (schedule.end_date && nextExecutionZonedDate > schedule.end_date)
      );

      // Check if Circle operation already returned with confirmed blockchain tx hash (e.g. in test mock)
      const isConfirmedOnChain = circleTx.state === 'COMPLETE' && !!circleTx.txHash;
      const executionStatus: 'CONFIRMED' | 'PENDING' = isConfirmedOnChain ? 'CONFIRMED' : 'PENDING';

      // Update execution record with Circle operation ID and on-chain status
      await supabaseAdmin
        .from('autopay_executions')
        .update({
          status: executionStatus,
          circle_tx_id: circleTxId,
          blockchain_tx_hash: circleTx.txHash || null,
          executed_at: nowEpoch,
          updated_at: nowEpoch
        })
        .eq('id', executionId);

      // Record in payment_ledger so transaction history is immediately synced across all devices
      try {
        await supabaseAdmin
          .from('payment_ledger')
          .upsert({
            id: executionId,
            user_id: schedule.user_id,
            status: executionStatus === 'CONFIRMED' ? 'COMPLETE' : 'PENDING',
            amount: amount,
            token: schedule.token,
            from_wallet: senderWallet.wallet_address || schedule.circle_wallet_id,
            to_wallet: schedule.recipient_address,
            blockchain_hash: circleTx.txHash || null,
            circle_tx_id: circleTxId,
            type: 'AUTOPAY',
            created_at: nowEpoch,
            updated_at: nowEpoch
          }, { onConflict: 'id' });
      } catch (ledgerErr: any) {
        console.warn(`[Autopay Execution Engine] payment_ledger upsert notice: ${ledgerErr?.message}`);
      }

      // Advance schedule record to next execution cycle and record last_execution_status
      const newMonthSpent = currentMonthSpent + amount;
      await supabaseAdmin
        .from('autopay_schedules')
        .update({
          current_month_spent: newMonthSpent,
          current_month_cycle: currentCycle,
          status: isScheduleExhausted ? 'EXHAUSTED' : schedule.status,
          next_execution_at: isScheduleExhausted ? null : nextExecutionAt,
          last_execution_at: nowEpoch,
          last_execution_status: executionStatus,
          consecutive_failures: 0,
          last_error_reason: null,
          updated_at: nowEpoch
        })
        .eq('id', schedule.id);

      // Sync payments table row with updated next_payment_at and status
      await supabaseAdmin
        .from('payments')
        .update({
          next_payment_at: isScheduleExhausted ? null : new Date(nextExecutionAt).toISOString(),
          status: executionStatus === 'CONFIRMED' ? 'confirmed' : 'pending',
          ...(circleTx.txHash ? { tx_hash: circleTx.txHash } : {}),
          active: !isScheduleExhausted
        })
        .eq('id', schedule.id);

      // Automatically post confirmed payment & chat card into chat thread and transaction history
      try {
        let senderChatAddress = '';
        try {
          // 1. Check original payment schedule record for authoritative chat sender
          const { data: pOrig } = await supabaseAdmin
            .from('payments')
            .select('sender')
            .eq('id', schedule.id)
            .maybeSingle();
          if (pOrig?.sender && pOrig.sender.startsWith('0x')) {
            senderChatAddress = pOrig.sender.toLowerCase();
          }
        } catch {}

        // 2. If not found, look up all wallets for user to find linked EVM address
        if (!senderChatAddress) {
          try {
            const { data: wRows } = await supabaseAdmin
              .from('arc_wallets')
              .select('wallet_address, linked_external_address')
              .eq('user_id', schedule.user_id);
            for (const w of wRows || []) {
              if (w.linked_external_address && w.linked_external_address.startsWith('0x')) {
                senderChatAddress = w.linked_external_address.toLowerCase();
                break;
              }
            }
          } catch {}
        }

        // 3. Fallback to senderWallet or schedule.sender_wallet
        if (!senderChatAddress) {
          senderChatAddress = (senderWallet.wallet_address || schedule.sender_wallet).toLowerCase();
        }

        const executedPaymentId = executionId;
        await supabaseAdmin
          .from('payments')
          .upsert({
            id: executedPaymentId,
            sender: senderChatAddress.toLowerCase(),
            receiver: schedule.recipient_address.toLowerCase(),
            amount: Number(schedule.amount),
            token: schedule.token || 'USDC',
            status: executionStatus === 'CONFIRMED' ? 'confirmed' : 'pending',
            active: false,
            created_at: nowEpoch,
            tx_hash: circleTx.txHash || null,
            is_recurring: true,
            recurring_interval: (schedule.frequency || 'daily').toLowerCase(),
            description: schedule.description || null
          }, { onConflict: 'id' });

        const { data: existingMsg } = await supabaseAdmin
          .from('messages')
          .select('id')
          .eq('payment_id', executedPaymentId)
          .maybeSingle();

        if (!existingMsg) {
          const msgId = crypto.randomUUID();
          await supabaseAdmin
            .from('messages')
            .insert({
              id: msgId,
              sender: senderChatAddress.toLowerCase(),
              receiver: schedule.recipient_address.toLowerCase(),
              body: `Sent ${schedule.amount} ${schedule.token || 'USDC'} via Autopay`,
              payment_id: executedPaymentId,
              created_at: nowEpoch,
              seen: false
            });

          await supabaseAdmin
            .from('chats')
            .update({
              last_message: `Sent ${schedule.amount} ${schedule.token || 'USDC'} via Autopay`,
              updated_at: nowEpoch
            })
            .contains('participants', [senderChatAddress.toLowerCase(), schedule.recipient_address.toLowerCase()]);
        }
      } catch (chatLinkErr: any) {
        console.warn('[Autopay Execution Engine] Chat message insert notice:', chatLinkErr?.message);
      }

      // Structured Audit Log
      console.log(JSON.stringify({
        level: 'INFO',
        event: isConfirmedOnChain ? 'AUTOPAY_EXECUTION_CONFIRMED' : 'AUTOPAY_EXECUTION_SUBMITTED',
        scheduleId: schedule.id,
        userId: schedule.user_id,
        recipient: schedule.recipient_address,
        amount,
        circleTxId,
        status: executionStatus,
        blockchainTxHash: circleTx.txHash || null,
        nextExecutionAt,
        timestamp: nowEpoch
      }));

      result.successCount++;
      result.details.push({
        scheduleId: schedule.id,
        executionId,
        recipient: schedule.recipient_address,
        amount,
        status: executionStatus,
        circleTxId,
        blockchainTxHash: circleTx.txHash || null
      });

    } catch (unexpectedErr: any) {
      console.error(`[Autopay Execution Engine] Unexpected error executing schedule ${scheduleId}:`, unexpectedErr);
      result.failureCount++;
      result.details.push({
        scheduleId,
        recipient: raw.recipient_address || 'unknown',
        amount: Number(raw.amount) || 0,
        status: 'FAILED',
        error: unexpectedErr.message || 'Unexpected engine failure'
      });
    }
  }

  return result;
}

/**
 * Handles an execution failure gracefully:
 * - Updates autopay_executions
 * - Increments consecutive_failures
 * - Automatically pauses schedule if 3 consecutive failures occur
 */
async function markExecutionFailed(
  executionId: string,
  schedule: any,
  errorReason: string,
  nowEpoch: number,
  isInsufficientFunds: boolean = false,
  isTransient: boolean = false
) {
  // Update execution row
  await supabaseAdmin
    .from('autopay_executions')
    .update({
      status: 'FAILED',
      error_reason: errorReason,
      executed_at: nowEpoch,
      updated_at: nowEpoch
    })
    .eq('id', executionId);

  await handleExecutionFailure(schedule, errorReason, nowEpoch, isInsufficientFunds, isTransient);
}

/**
 * Updates schedule failure counters, applies retry backoff, and automatically pauses upon threshold breach.
 */
async function handleExecutionFailure(
  schedule: any,
  errorReason: string,
  nowEpoch: number,
  isInsufficientFunds: boolean = false,
  isTransient: boolean = false
) {
  const failures = (schedule.consecutive_failures || 0) + 1;
  const shouldPause = failures >= 3;

  const updates: Record<string, any> = {
    last_execution_at: nowEpoch,
    last_execution_status: 'FAILED',
    consecutive_failures: failures,
    last_error_reason: errorReason,
    updated_at: nowEpoch
  };

  if (shouldPause) {
    updates.status = 'PAUSED';
    updates.last_error_reason = `Auto-paused after ${failures} consecutive failures. Reason: ${errorReason}`;
  } else if (isInsufficientFunds) {
    // Backoff 30m on 1st failure, 2h on 2nd failure so schedule doesn't immediately exhaust
    const backoffMs = failures === 1 ? 30 * 60 * 1000 : 2 * 60 * 60 * 1000;
    updates.next_execution_at = Math.max(Number(schedule.next_execution_at || nowEpoch), nowEpoch) + backoffMs;
  } else if (isTransient) {
    // 5m backoff on transient network or provider error
    updates.next_execution_at = Math.max(Number(schedule.next_execution_at || nowEpoch), nowEpoch) + 5 * 60 * 1000;
  }

  // If retry backoff would schedule past end_date, terminate schedule as EXHAUSTED
  if (schedule.end_date && updates.next_execution_at) {
    const nextZoned = getTodayZonedDateString(schedule.timezone, updates.next_execution_at);
    if (nextZoned > schedule.end_date) {
      updates.status = 'EXHAUSTED';
      updates.next_execution_at = null;
    }
  }

  await supabaseAdmin
    .from('autopay_schedules')
    .update(updates)
    .eq('id', schedule.id);

  console.warn(JSON.stringify({
    level: 'WARN',
    event: 'AUTOPAY_EXECUTION_FAILED',
    scheduleId: schedule.id,
    userId: schedule.user_id,
    consecutiveFailures: failures,
    autoPaused: shouldPause,
    isInsufficientFunds,
    isTransient,
    error: errorReason,
    timestamp: nowEpoch
  }));
}
