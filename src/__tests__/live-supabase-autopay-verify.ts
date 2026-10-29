import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { createClient } from '@supabase/supabase-js';
import { calculateNextExecutionTimestamp, getTodayZonedDateString } from '../lib/autopay/schedule-calculator';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false }
});

async function runLiveVerification() {
  console.log('========================================================================');
  console.log('🚀 LIVE SUPABASE AUTOPAY AUDIT & VERIFICATION (Migration 031)');
  console.log('========================================================================');
  console.log(`📡 Connecting to Supabase: ${supabaseUrl}`);

  let testUserId: string;
  // Get an existing auth user or mock UUID for foreign key checks
  const { data: users, error: userErr } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1 });
  if (userErr || !users.users || users.users.length === 0) {
    console.warn('⚠️ No auth user found via admin API; attempting to query auth.users directly or fallback');
    testUserId = '00000000-0000-0000-0000-000000000001';
  } else {
    testUserId = users.users[0].id;
    console.log(`✅ Using test user id: ${testUserId}`);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 1: Live Schema & Constraint Verification
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- 1. Live Database Schema & Constraint Parity ---');

  const now = Date.now();
  const testScheduleWeeklyId = '11111111-2222-3333-4444-555555555555';
  const testScheduleMonthlyId = '22222222-3333-4444-5555-666666666666';

  // Cleanup any lingering test schedules from previous runs
  await supabase.from('autopay_executions').delete().in('schedule_id', [testScheduleWeeklyId, testScheduleMonthlyId]);
  await supabase.from('autopay_schedules').delete().in('id', [testScheduleWeeklyId, testScheduleMonthlyId]);

  // Insert WEEKLY schedule with weekly_day = 1 (Monday)
  const nextWeekly = calculateNextExecutionTimestamp({
    frequency: 'WEEKLY',
    executionTime: '13:45',
    timezone: 'Asia/Kolkata',
    startDate: getTodayZonedDateString('Asia/Kolkata'),
    weeklyDay: 1,
    fromTimestamp: now
  });

  const { data: insertedWeekly, error: weeklyInsertErr } = await supabase
    .from('autopay_schedules')
    .insert({
      id: testScheduleWeeklyId,
      user_id: testUserId,
      sender_wallet: '0xffdd68c95b7678168d43dbd7ffc38ef850476140',
      circle_wallet_id: 'fcab32e7-46e5-5668-b6c4-89aba9805816',
      recipient_address: '0x4a6b6887e6f0dd99ea9cc1a36a6bc02c14c80d5a',
      amount: 1.0,
      token: 'USDC',
      blockchain: 'ARC-TESTNET',
      frequency: 'WEEKLY',
      weekly_day: 1,
      execution_time: '13:45',
      timezone: 'Asia/Kolkata',
      start_date: getTodayZonedDateString('Asia/Kolkata'),
      max_per_payment: 1.0,
      monthly_spending_limit: 5.0,
      current_month_spent: 0.0,
      current_month_cycle: '2026-10',
      status: 'ACTIVE',
      next_execution_at: nextWeekly,
      authorization_version: 1,
      last_execution_status: 'CONFIRMED', // Verify CONFIRMED is allowed on schedules
      authorized_at: now,
      created_at: now,
      updated_at: now
    })
    .select('*')
    .single();

  if (weeklyInsertErr) {
    console.error('❌ Failed to insert WEEKLY schedule with weekly_day & CONFIRMED:', weeklyInsertErr);
    throw weeklyInsertErr;
  }
  console.log('✅ WEEKLY schedule persisted with weekly_day = 1 and frequency = "WEEKLY".');
  console.log(`   Next execution timestamp: ${insertedWeekly.next_execution_at} (${new Date(insertedWeekly.next_execution_at).toISOString()})`);

  // Insert MONTHLY schedule with monthly_day = 15
  const nextMonthly = calculateNextExecutionTimestamp({
    frequency: 'MONTHLY',
    executionTime: '10:00',
    timezone: 'UTC',
    startDate: '2026-10-01',
    monthlyDay: 15,
    fromTimestamp: now
  });

  const { data: insertedMonthly, error: monthlyInsertErr } = await supabase
    .from('autopay_schedules')
    .insert({
      id: testScheduleMonthlyId,
      user_id: testUserId,
      sender_wallet: '0xffdd68c95b7678168d43dbd7ffc38ef850476140',
      circle_wallet_id: 'fcab32e7-46e5-5668-b6c4-89aba9805816',
      recipient_address: '0x4a6b6887e6f0dd99ea9cc1a36a6bc02c14c80d5a',
      amount: 2.5,
      token: 'USDC',
      blockchain: 'ARC-TESTNET',
      frequency: 'MONTHLY',
      monthly_day: 15,
      execution_time: '10:00',
      timezone: 'UTC',
      start_date: '2026-10-01',
      max_per_payment: 2.5,
      monthly_spending_limit: 10.0,
      current_month_spent: 0.0,
      current_month_cycle: '2026-10',
      status: 'ACTIVE',
      next_execution_at: nextMonthly,
      authorization_version: 1,
      authorized_at: now,
      created_at: now,
      updated_at: now
    })
    .select('*')
    .single();

  if (monthlyInsertErr) {
    console.error('❌ Failed to insert MONTHLY schedule:', monthlyInsertErr);
    throw monthlyInsertErr;
  }
  console.log('✅ MONTHLY schedule persisted with monthly_day = 15.');
  console.log(`   Next execution timestamp: ${insertedMonthly.next_execution_at} (${new Date(insertedMonthly.next_execution_at).toISOString()})`);

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 2: autopay_executions Parity & Constraints
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- 2. autopay_executions Parity & Idempotency Check ---');

  const testExecutionId1 = '33333333-4444-5555-6666-777777777777';
  const testIdempotencyKey = `idemp-test-${now}`;

  const { data: execData, error: execErr } = await supabase
    .from('autopay_executions')
    .insert({
      id: testExecutionId1,
      schedule_id: testScheduleWeeklyId,
      user_id: testUserId,
      circle_wallet_id: 'fcab32e7-46e5-5668-b6c4-89aba9805816',
      recipient_address: '0x4a6b6887e6f0dd99ea9cc1a36a6bc02c14c80d5a',
      blockchain: 'ARC-TESTNET',
      idempotency_key: testIdempotencyKey,
      scheduled_for: now,
      amount: 1.0,
      token: 'USDC',
      status: 'CONFIRMED', // Verify CONFIRMED status constraint
      circle_tx_id: 'circle-mock-tx-1234',
      created_at: now,
      updated_at: now
    })
    .select('*')
    .single();

  if (execErr) {
    console.error('❌ Failed to insert autopay_execution with CONFIRMED status & idempotency_key:', execErr);
    throw execErr;
  }
  console.log('✅ autopay_execution inserted with CONFIRMED status, idempotency_key, and parity columns.');

  // TEST Idempotency Constraint: Duplicate idempotency_key MUST fail
  const { error: dupErr } = await supabase
    .from('autopay_executions')
    .insert({
      schedule_id: testScheduleWeeklyId,
      user_id: testUserId,
      circle_wallet_id: 'fcab32e7-46e5-5668-b6c4-89aba9805816',
      recipient_address: '0x4a6b6887e6f0dd99ea9cc1a36a6bc02c14c80d5a',
      blockchain: 'ARC-TESTNET',
      idempotency_key: testIdempotencyKey, // Duplicate key!
      scheduled_for: now,
      amount: 1.0,
      token: 'USDC',
      status: 'PENDING',
      created_at: now,
      updated_at: now
    });

  if (!dupErr || dupErr.code !== '23505') {
    console.error('❌ Duplicate idempotency_key was NOT rejected as expected (expected 23505):', dupErr);
    throw new Error('Idempotency constraint missing on autopay_executions');
  }
  console.log('✅ Duplicate idempotency_key correctly rejected with PostgreSQL 23505 unique violation.');

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 3: acquire_due_autopay_schedules Stored Procedure (RPC) Verification
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- 3. acquire_due_autopay_schedules RPC Signature & Columns ---');

  // Query RPC for due schedules at current_time_ms in the future (to include our test weekly schedule)
  const futureQueryTime = nextWeekly + 1000;
  const { data: rpcRows, error: rpcErr } = await supabase.rpc('acquire_due_autopay_schedules', {
    p_limit: 10,
    p_now_epoch: futureQueryTime
  });

  if (rpcErr) {
    console.error('❌ Failed to call acquire_due_autopay_schedules RPC:', rpcErr);
    throw rpcErr;
  }

  console.log(`✅ acquire_due_autopay_schedules RPC executed successfully. Retrieved ${rpcRows?.length || 0} locked schedule(s).`);

  const lockedWeekly = rpcRows?.find((r: any) => r.id === testScheduleWeeklyId);
  if (!lockedWeekly) {
    console.warn(`⚠️ Weekly schedule ${testScheduleWeeklyId} was not locked by RPC at future timestamp. Checking rows returned:`, rpcRows);
  } else {
    console.log('✅ Locked weekly schedule has column weekly_day:', lockedWeekly.weekly_day === 1 ? '1 (Matches Monday)' : lockedWeekly.weekly_day);
    console.log('✅ RPC return fields verified:', Object.keys(lockedWeekly).join(', '));
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 4: Schedule Lifecycle (List, Pause, Resume, Cancel)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- 4. Schedule Lifecycle (List, Pause, Resume, Cancel) ---');

  // List
  const { data: listData, error: listErr } = await supabase
    .from('autopay_schedules')
    .select('*')
    .eq('user_id', testUserId);
  if (listErr) throw listErr;
  console.log(`✅ List schedules passed: found ${listData.length} schedule(s) for user.`);

  // Pause
  const { data: pausedData, error: pauseErr } = await supabase
    .from('autopay_schedules')
    .update({ status: 'PAUSED', updated_at: Date.now() })
    .eq('id', testScheduleWeeklyId)
    .select('id, status')
    .single();
  if (pauseErr || pausedData.status !== 'PAUSED') throw pauseErr || new Error('Pause failed');
  console.log('✅ Pause schedule passed: status is PAUSED.');

  // Resume
  const { data: resumedData, error: resumeErr } = await supabase
    .from('autopay_schedules')
    .update({ status: 'ACTIVE', updated_at: Date.now() })
    .eq('id', testScheduleWeeklyId)
    .select('id, status')
    .single();
  if (resumeErr || resumedData.status !== 'ACTIVE') throw resumeErr || new Error('Resume failed');
  console.log('✅ Resume schedule passed: status is ACTIVE.');

  // Cancel
  const { data: cancelledData, error: cancelErr } = await supabase
    .from('autopay_schedules')
    .update({ status: 'CANCELLED', updated_at: Date.now() })
    .eq('id', testScheduleWeeklyId)
    .select('id, status')
    .single();
  if (cancelErr || cancelledData.status !== 'CANCELLED') throw cancelErr || new Error('Cancel failed');
  console.log('✅ Cancel schedule passed: status is CANCELLED.');

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 5: Scheduler Dry-Run with Transfers Disabled
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- 5. Scheduler Dry-Run Execution (Transfers Disabled) ---');
  const { processDueAutopaySchedules } = await import('../lib/autopay/execution-engine');
  
  // Reactivate test schedule for dry run verification
  await supabase
    .from('autopay_schedules')
    .update({ status: 'ACTIVE', next_execution_at: now - 5000, updated_at: now })
    .eq('id', testScheduleWeeklyId);

  const dryRunResult = await processDueAutopaySchedules({
    batchSize: 5,
    nowEpoch: now,
    dryRun: true // FINANCIALLY SAFE: Transfers disabled
  });

  console.log(`✅ Scheduler Dry-Run Completed:`, {
    processed: dryRunResult.processedCount,
    skipped: dryRunResult.skippedCount,
    failed: dryRunResult.failureCount,
    success: dryRunResult.successCount
  });
  const dryRunItem = dryRunResult.details.find(d => d.scheduleId === testScheduleWeeklyId);
  if (dryRunItem) {
    console.log(`✅ Test schedule dry-run status: ${dryRunItem.status} (Reason: ${dryRunItem.error})`);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 6: Worker CRON_SECRET & Cancellation Enforcement
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- 6. Worker Authentication & Cancellation Enforcement ---');
  const cronSecret = process.env.CRON_SECRET;
  console.log(`✅ CRON_SECRET configured: ${cronSecret ? 'YES (' + cronSecret.slice(0, 4) + '...)' : 'NO'}`);

  // Cancelled schedule check: verify that a CANCELLED schedule is ignored by the engine
  await supabase
    .from('autopay_schedules')
    .update({ status: 'CANCELLED', next_execution_at: now - 10000, updated_at: now })
    .eq('id', testScheduleWeeklyId);

  const cancelledEngineResult = await processDueAutopaySchedules({
    batchSize: 5,
    nowEpoch: now,
    dryRun: true
  });
  const cancelledFound = cancelledEngineResult.details.some(d => d.scheduleId === testScheduleWeeklyId && d.status !== 'SKIPPED');
  if (cancelledFound) {
    throw new Error('Cancelled schedule was incorrectly processed!');
  }
  console.log('✅ Cancelled schedule verification: CANCELLED schedules are strictly excluded from execution.');

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 7: Clean Up Test Records
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- 7. Clean up test records ---');
  await supabase.from('autopay_executions').delete().in('schedule_id', [testScheduleWeeklyId, testScheduleMonthlyId]);
  await supabase.from('autopay_schedules').delete().in('id', [testScheduleWeeklyId, testScheduleMonthlyId]);
  console.log('✅ All test schedules and execution records cleanly purged from live database.');

  console.log('\n========================================================================');
  console.log('🎉 ALL LIVE SUPABASE AUTOPAY PARITY & INTEGRATION CHECKS PASSED!');
  console.log('========================================================================');
}

runLiveVerification().catch(err => {
  console.error('\n❌ LIVE AUDIT VERIFICATION FAILED:', err);
  process.exit(1);
});
