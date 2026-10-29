import { NextResponse } from 'next/server';
import { processDueAutopaySchedules } from '@/lib/autopay/execution-engine';

/**
 * Scheduled Worker for ArcFun Autopay.
 *
 * Authentication model:
 *
 * Authorization: Bearer <CRON_SECRET>
 * – Vercel Cron automatically sends this header when CRON_SECRET is set
 *   in the Vercel project environment variables (Vercel-native behavior).
 * – External schedulers and manual invocations must supply the same header.
 *
 * Security invariants:
 * – CRON_SECRET must be configured; without it the worker returns 503 (disabled).
 * – x-vercel-cron: 1 is NEVER trusted alone — headers can be forged by clients.
 * – Query parameter authentication (?cronToken=) is forbidden to prevent credential exposure in URLs/logs.
 * – Constant-time comparison prevents timing-based secret enumeration.
 * – Credentials are never logged or reflected in responses.
 *
 * Compatible with: Vercel Cron, cURL, GitHub Actions, and any HTTPS scheduler.
 */
export async function POST(req: Request) {
  return handleWorkerRequest(req);
}

export async function GET(req: Request) {
  return handleWorkerRequest(req);
}

/**
 * Constant-time string comparison to prevent timing-based secret enumeration.
 */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

async function handleWorkerRequest(req: Request) {
  const startTime = Date.now();

  try {
    // ── 1. Retrieve CRON_SECRET from server environment ─────────────────────
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret) {
      // Log at WARN, not ERROR — missing secret is a config issue, not a crash.
      console.warn('[Autopay Worker] CRON_SECRET is not configured. Worker is disabled.');
      return NextResponse.json(
        { error: 'Scheduler worker is disabled: CRON_SECRET is not configured on this environment.' },
        { status: 503 }
      );
    }

    // ── 2. Verify Authorization: Bearer <CRON_SECRET> header ────────────────
    const authHeader = req.headers.get('authorization') ?? '';
    const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    const bearerValid = bearerToken.length > 0 && safeEqual(bearerToken, cronSecret);

    if (!bearerValid) {
      // Log the IP for audit, never log the presented token.
      const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'unknown';
      console.warn(`[Autopay Worker] Unauthorized invocation rejected. IP=${ip}`);
      return NextResponse.json({ error: 'Unauthorized worker invocation' }, { status: 401 });
    }

    // ── 3. Query options ────────────────────────────────────────────────────
    const url = new URL(req.url);
    const batchParam = url.searchParams.get('batchSize');
    const batchSize = batchParam ? Math.min(Math.max(1, parseInt(batchParam, 10)), 50) : 10;
    const dryRun = url.searchParams.get('dryRun') === 'true';

    // ── 4. Process due schedules ────────────────────────────────────────────
    const result = await processDueAutopaySchedules({
      batchSize,
      nowEpoch: startTime,
      dryRun
    });

    const durationMs = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      timestamp: startTime,
      durationMs,
      summary: {
        processed: result.processedCount,
        success: result.successCount,
        failed: result.failureCount,
        skipped: result.skippedCount
      },
      details: result.details
    });

  } catch (error: any) {
    // Log the error message only — never log env vars or request headers.
    console.error('[Autopay Worker] Fatal error executing worker batch:', error?.message ?? 'unknown');
    return NextResponse.json(
      {
        error: 'Worker execution failed',
        timestamp: startTime,
        durationMs: Date.now() - startTime
      },
      { status: 500 }
    );
  }
}
