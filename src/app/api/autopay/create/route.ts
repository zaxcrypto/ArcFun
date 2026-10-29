import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { checkRateLimit } from '@/lib/rate-limit';
import { validateAndPrepareAutopay } from '@/lib/autopay/authorization-validator';

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Missing or invalid authorization header' }, { status: 401 });
    }
    const token = authHeader.split(' ')[1];

    // 1. Authenticate user
    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized: Invalid session' }, { status: 401 });
    }

    // 2. Rate limit (10 creation attempts per minute)
    const rateLimitError = await checkRateLimit(req, user.id, { maxRequests: 10, windowMs: 60000 });
    if (rateLimitError) return rateLimitError;

    // 3. Parse JSON Body
    let body;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Malformed JSON payload' }, { status: 400 });
    }

    // 4. Validate Autopay parameters & Circle DCW ownership
    let config;
    try {
      config = await validateAndPrepareAutopay(body, user, supabaseAdmin);
    } catch (valErr: any) {
      const status = valErr.status || 400;
      return NextResponse.json({ 
        error: valErr.message || 'Validation failed',
        code: valErr.code || 'VALIDATION_ERROR'
      }, { status });
    }

    // 5. One Active Autopay Per Recipient Enforcement
    // A sender can have only one non-terminal (ACTIVE or PAUSED) schedule per recipient address.
    const { data: existingActiveSchedule } = await supabaseAdmin
      .from('autopay_schedules')
      .select('id, amount, token, frequency, status, execution_time, timezone, authorization_version, created_at')
      .eq('user_id', config.userId)
      .eq('recipient_address', config.recipientAddress.toLowerCase())
      .in('status', ['ACTIVE', 'PAUSED'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingActiveSchedule) {
      const isPaused = existingActiveSchedule.status === 'PAUSED';
      return NextResponse.json({
        error: isPaused
          ? 'A paused Autopay schedule already exists for this recipient. Please cancel it before creating a new schedule.'
          : 'An active Autopay schedule already exists for this recipient. Please cancel the existing schedule before setting up a new one.',
        code: 'ACTIVE_SCHEDULE_EXISTS',
        existingSchedule: {
          id: existingActiveSchedule.id,
          amount: Number(existingActiveSchedule.amount),
          token: existingActiveSchedule.token,
          frequency: existingActiveSchedule.frequency,
          status: existingActiveSchedule.status,
          executionTime: existingActiveSchedule.execution_time,
          timezone: existingActiveSchedule.timezone,
          authorizationVersion: existingActiveSchedule.authorization_version
        }
      }, { status: 409 });
    }

    // 5.1 Duplicate rapid-fire request prevention (same sender, recipient, amount, frequency within 60s)
    const now = Date.now();
    const recentWindow = now - 60000;
    const { data: duplicateSchedule } = await supabaseAdmin
      .from('autopay_schedules')
      .select('id, created_at')
      .eq('user_id', config.userId)
      .eq('recipient_address', config.recipientAddress.toLowerCase())
      .eq('amount', config.amount)
      .eq('frequency', config.frequency)
      .gt('created_at', recentWindow)
      .maybeSingle();

    if (duplicateSchedule) {
      return NextResponse.json({
        error: 'Duplicate request: An identical Autopay schedule was just created. Please wait before creating another.',
        code: 'DUPLICATE_REQUEST',
        scheduleId: duplicateSchedule.id
      }, { status: 409 });
    }

    // 6. Persist Autopay Schedule
    const insertPayload: Record<string, any> = {
      user_id: config.userId,
      sender_wallet: config.senderWallet,
      circle_wallet_id: config.circleWalletId,
      recipient_address: config.recipientAddress,
      amount: config.amount,
      token: config.token,
      blockchain: config.blockchain,
      frequency: config.frequency,
      execution_time: config.executionTime,
      timezone: config.timezone,
      monthly_day: config.monthlyDay,
      start_date: config.startDate,
      end_date: config.endDate,
      description: config.description,
      max_per_payment: config.maxPerPayment,
      monthly_spending_limit: config.monthlySpendingLimit,
      current_month_spent: 0.00,
      current_month_cycle: config.currentMonthCycle,
      status: 'ACTIVE',
      next_execution_at: config.nextExecutionAt,
      authorization_version: 1,
      authorized_at: now,
      created_at: now,
      updated_at: now
    };

    if (config.weeklyDay !== null && config.weeklyDay !== undefined) {
      insertPayload.weekly_day = config.weeklyDay;
    }

    let { data: schedule, error: insertErr } = await supabaseAdmin
      .from('autopay_schedules')
      .insert(insertPayload)
      .select('*')
      .single();

    // If weekly_day is missing on live DB schema cache, retry without it
    if (insertErr && (insertErr.message?.includes('weekly_day') || insertErr.code === 'PGRST204' || insertErr.code === '42703')) {
      console.warn('[Autopay Create] Database schema cache missing weekly_day column. Retrying insert without weekly_day (pending migration 031)...');
      const fallbackPayload = { ...insertPayload };
      delete fallbackPayload.weekly_day;
      const retryResult = await supabaseAdmin
        .from('autopay_schedules')
        .insert(fallbackPayload)
        .select('*')
        .single();
      schedule = retryResult.data;
      insertErr = retryResult.error;
    }

    if (insertErr || !schedule) {
      console.error('[Autopay] Schedule creation failed:', insertErr);
      let errMsg = insertErr?.message || 'Database error';
      if (errMsg.includes('autopay_schedules_frequency_check')) {
        errMsg = 'The live database requires migration 031 to support WEEKLY frequency. Please execute migration 031_autopay_schema_parity.sql in Supabase SQL Editor.';
      }
      return NextResponse.json({ error: 'Failed to create Autopay schedule: ' + errMsg }, { status: 500 });
    }

    // 6. Seamlessly create linked chat payment & message in Supabase
    try {
      let senderChatAddr = (body?.senderChatAddress && typeof body.senderChatAddress === 'string')
        ? body.senderChatAddress.toLowerCase()
        : null;

      if (!senderChatAddr) {
        // Look up primary linked EVM address from arc_wallets
        const { data: wRows } = await supabaseAdmin
          .from('arc_wallets')
          .select('wallet_address, linked_external_address')
          .eq('user_id', user.id);

        const linkedRow = wRows?.find(r => r.linked_external_address && r.linked_external_address.startsWith('0x'));
        senderChatAddr = linkedRow?.linked_external_address?.toLowerCase() || schedule.sender_wallet?.toLowerCase();
      }

      const recipientChatAddr = schedule.recipient_address.toLowerCase();

      if (senderChatAddr && recipientChatAddr) {
        const nextExecEpoch = Number(schedule.next_execution_at);
        const nextPaymentIso = nextExecEpoch ? new Date(nextExecEpoch).toISOString() : null;

        // Upsert payment row linked 1:1 with schedule.id
        await supabaseAdmin.from('payments').upsert({
          id: schedule.id,
          sender: senderChatAddr,
          receiver: recipientChatAddr,
          amount: Number(schedule.amount),
          token: schedule.token || 'USDC',
          status: 'pending',
          active: true,
          created_at: Number(schedule.created_at) || now,
          is_recurring: true,
          recurring_interval: (schedule.frequency || 'weekly').toLowerCase(),
          next_payment_at: nextPaymentIso,
          description: schedule.description || null
        });

        // Ensure conversation exists in chats so user appears in contacts if new
        const { data: existingChat } = await supabaseAdmin
          .from('chats')
          .select('id, participants')
          .contains('participants', [senderChatAddr, recipientChatAddr])
          .maybeSingle();

        if (!existingChat) {
          await supabaseAdmin
            .from('chats')
            .insert({
              participants: [senderChatAddr, recipientChatAddr],
              last_message_at: null,
              last_message_body: null,
              is_pinned: false,
              is_archived: false,
              is_hidden: false
            });
        }

        // Chat messages are only inserted when an actual payment is sent and confirmed on-chain
        // The active schedule is managed at the top header indicator and drawer
      }
    } catch (chatLinkErr) {
      console.warn('[Autopay Create] Failed to link chat message (non-fatal):', chatLinkErr);
    }

    // 7. Structured Audit Log
    console.log(JSON.stringify({
      level: 'INFO',
      event: 'AUTOPAY_SCHEDULE_CREATED',
      scheduleId: schedule.id,
      userId: user.id,
      senderWallet: schedule.sender_wallet,
      recipientAddress: schedule.recipient_address,
      amount: schedule.amount,
      token: schedule.token,
      frequency: schedule.frequency,
      nextExecutionAt: schedule.next_execution_at,
      timestamp: now
    }));

    return NextResponse.json({
      success: true,
      schedule: {
        id: schedule.id,
        recipientAddress: schedule.recipient_address,
        senderWallet: schedule.sender_wallet,
        amount: Number(schedule.amount),
        token: schedule.token,
        blockchain: schedule.blockchain,
        frequency: schedule.frequency,
        executionTime: schedule.execution_time,
        timezone: schedule.timezone,
        monthlyDay: schedule.monthly_day,
        weeklyDay: schedule.weekly_day,
        startDate: schedule.start_date,
        endDate: schedule.end_date,
        description: schedule.description,
        maxPerPayment: Number(schedule.max_per_payment),
        monthlySpendingLimit: Number(schedule.monthly_spending_limit),
        currentMonthSpent: Number(schedule.current_month_spent),
        status: schedule.status,
        nextExecutionAt: Number(schedule.next_execution_at),
        createdAt: Number(schedule.created_at)
      }
    }, { status: 201 });

  } catch (error: any) {
    console.error('[Autopay Create Route] Internal error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
