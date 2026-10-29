import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { processDueAutopaySchedules } from '@/lib/autopay/execution-engine';

/**
 * Trigger Due Autopay Schedules.
 *
 * This endpoint executes due autopay schedules on demand.
 * It is NOT a public endpoint — every request must carry valid credentials.
 *
 * Authentication (one of):
 *   A) Authorization: Bearer <CRON_SECRET>   — scheduler / worker token
 *   B) Authorization: Bearer <supabase_jwt>  — authenticated user session
 *
 * Authorization rules:
 *   – CRON_SECRET callers may trigger any due schedule (bulk or targeted).
 *   – Authenticated user callers may only trigger their own schedules.
 *   – scheduleId filtering does NOT bypass authentication; it merely narrows scope.
 *
 * Security invariants:
 *   – NODE_ENV === 'development' is NEVER a sufficient bypass. Secrets must be
 *     present and valid in all environments.
 *   – Unknown or missing credentials always return 401.
 *   – Credentials are never logged or reflected in responses.
 */
export async function POST(req: Request) {
  try {
    // ── 1. Extract bearer token ──────────────────────────────────────────────
    const authHeader = req.headers.get('authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Unauthorized: Missing or malformed Authorization header' },
        { status: 401 }
      );
    }

    const token = authHeader.slice(7);
    if (!token) {
      return NextResponse.json(
        { error: 'Unauthorized: Empty token' },
        { status: 401 }
      );
    }

    // ── 2. Identify caller and determine scope ───────────────────────────────
    const cronSecret = process.env.CRON_SECRET;
    let isScheduler = false;
    let authenticatedUserId: string | null = null;

    // Path A: CRON_SECRET bearer — scheduler / server-to-server caller
    if (cronSecret && token === cronSecret) {
      isScheduler = true;
    } else {
      // Path B: Supabase JWT — authenticated user session
      const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
      if (authErr || !user) {
        return NextResponse.json(
          { error: 'Unauthorized: Invalid or expired session token' },
          { status: 401 }
        );
      }
      authenticatedUserId = user.id;
    }

    // ── 3. Parse optional scheduleId from request body ───────────────────────
    let targetedScheduleId: string | undefined;
    try {
      const body = await req.json();
      const sId = body?.scheduleId ?? body?.id;
      if (sId && typeof sId === 'string') {
        targetedScheduleId = sId;
      }
    } catch {
      // No body or invalid JSON — continue without a targeted schedule.
    }

    // ── 4. Ownership check for user-session callers ──────────────────────────
    // Authenticated users may only trigger their own schedules.
    if (authenticatedUserId && targetedScheduleId) {
      const { data: sched, error: schedErr } = await supabaseAdmin
        .from('autopay_schedules')
        .select('id, user_id, status')
        .eq('id', targetedScheduleId)
        .maybeSingle();

      if (schedErr || !sched) {
        return NextResponse.json({ error: 'Schedule not found' }, { status: 404 });
      }
      if (sched.user_id !== authenticatedUserId) {
        return NextResponse.json(
          { error: 'Forbidden: You do not own this schedule' },
          { status: 403 }
        );
      }
    } else if (authenticatedUserId && !targetedScheduleId) {
      // User-session callers without a scheduleId would trigger all due schedules —
      // restrict this to scheduler callers only.
      return NextResponse.json(
        { error: 'Forbidden: User sessions must specify a scheduleId' },
        { status: 403 }
      );
    }

    // ── 5. Execute ────────────────────────────────────────────────────────────
    const nowEpoch = Date.now();
    const result = await processDueAutopaySchedules({
      batchSize: isScheduler ? 10 : 1,
      nowEpoch,
      dryRun: false,
      scheduleId: targetedScheduleId
    });

    return NextResponse.json({
      success: true,
      timestamp: nowEpoch,
      result
    });

  } catch (error: any) {
    // Log only the message — never log auth headers or env values.
    console.error('[Autopay Trigger Due] Execution failed:', error?.message ?? 'unknown');
    return NextResponse.json(
      { error: 'Execution failed' },
      { status: 500 }
    );
  }
}
