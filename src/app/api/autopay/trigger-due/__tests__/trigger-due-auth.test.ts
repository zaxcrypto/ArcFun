/**
 * Trigger-Due Route — Authentication & Authorization Unit Tests
 *
 * Tests the /api/autopay/trigger-due authentication and ownership logic
 * without hitting the database or Circle API. Both supabaseAdmin and
 * processDueAutopaySchedules are fully mocked.
 *
 * Coverage:
 *  ✓ Missing Authorization header → 401
 *  ✓ Malformed Authorization header → 401
 *  ✓ Empty token → 401
 *  ✓ CRON_SECRET caller (scheduler path) — no scheduleId → runs batch → 200
 *  ✓ CRON_SECRET caller — with scheduleId → targeted run → 200
 *  ✓ Valid JWT user — with own scheduleId → 200
 *  ✓ Valid JWT user — wrong owner scheduleId → 403
 *  ✓ Valid JWT user — schedule not found → 404
 *  ✓ Valid JWT user — without scheduleId → 403 (cannot bulk trigger)
 *  ✓ Invalid JWT → 401
 *  ✓ NODE_ENV=development is NOT a bypass (dev bypass removed)
 *  ✓ processDueAutopaySchedules called with correct parameters
 */

const mockGetUser = jest.fn();
const mockFrom = jest.fn();
const mockProcessDueSchedules = jest.fn().mockResolvedValue({
  processedCount: 1,
  successCount: 1,
  failureCount: 0,
  skippedCount: 0,
  details: []
});

jest.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: {
    auth: {
      getUser: (token: string) => mockGetUser(token)
    },
    from: (table: string) => mockFrom(table)
  }
}));

jest.mock('@/lib/autopay/execution-engine', () => ({
  processDueAutopaySchedules: (opts: any) => mockProcessDueSchedules(opts)
}));

import { POST } from '@/app/api/autopay/trigger-due/route';

const CRON_SECRET = 'cron-secret-ABCDEF';
const VALID_USER_ID = 'user-uuid-0001';
const SCHEDULE_ID = 'sched-uuid-0001';

function makeRequest(options: {
  authHeader?: string;
  body?: Record<string, unknown>;
}): Request {
  const headers: Record<string, string> = {
    'content-type': 'application/json'
  };
  if (options.authHeader !== undefined) {
    headers['authorization'] = options.authHeader;
  }
  return new Request('http://localhost:3000/api/autopay/trigger-due', {
    method: 'POST',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
}

describe('Autopay Trigger-Due — Authentication & Authorization', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, CRON_SECRET };
    jest.clearAllMocks();

    // Default: auth.getUser returns an authenticated user
    mockGetUser.mockResolvedValue({
      data: { user: { id: VALID_USER_ID } },
      error: null
    });

    // Default: schedule lookup returns a schedule owned by VALID_USER_ID
    const selectChain = {
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: { id: SCHEDULE_ID, user_id: VALID_USER_ID, status: 'ACTIVE' },
        error: null
      })
    };
    mockFrom.mockReturnValue({ select: jest.fn().mockReturnValue(selectChain) });
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  // ── Missing / malformed credentials ─────────────────────────────────────
  describe('missing or malformed credentials', () => {
    it('returns 401 when Authorization header is absent', async () => {
      const req = makeRequest({});
      const res = await POST(req);
      expect(res.status).toBe(401);
    });

    it('returns 401 when Authorization has no Bearer prefix', async () => {
      const req = makeRequest({ authHeader: 'Basic abc123' });
      const res = await POST(req);
      expect(res.status).toBe(401);
    });

    it('returns 401 when Bearer token is empty string', async () => {
      const req = makeRequest({ authHeader: 'Bearer ' });
      const res = await POST(req);
      expect(res.status).toBe(401);
    });
  });

  // ── CRON_SECRET (scheduler) path ─────────────────────────────────────────
  describe('CRON_SECRET scheduler caller', () => {
    it('returns 200 and triggers batch run when no scheduleId given', async () => {
      const req = makeRequest({ authHeader: `Bearer ${CRON_SECRET}` });
      const res = await POST(req);
      expect(res.status).toBe(200);
      expect(mockProcessDueSchedules).toHaveBeenCalledWith(
        expect.objectContaining({ batchSize: 10, scheduleId: undefined })
      );
    });

    it('returns 200 and passes scheduleId for targeted run', async () => {
      const req = makeRequest({
        authHeader: `Bearer ${CRON_SECRET}`,
        body: { scheduleId: SCHEDULE_ID }
      });
      const res = await POST(req);
      expect(res.status).toBe(200);
      expect(mockProcessDueSchedules).toHaveBeenCalledWith(
        expect.objectContaining({ scheduleId: SCHEDULE_ID, batchSize: 10 })
      );
    });

    it('does NOT call supabaseAdmin.auth.getUser for CRON_SECRET callers', async () => {
      const req = makeRequest({ authHeader: `Bearer ${CRON_SECRET}` });
      await POST(req);
      expect(mockGetUser).not.toHaveBeenCalled();
    });
  });

  // ── Authenticated user session path ──────────────────────────────────────
  describe('authenticated user session caller', () => {
    const USER_JWT = 'valid-user-jwt-token';

    it('returns 200 when user provides own scheduleId', async () => {
      const req = makeRequest({
        authHeader: `Bearer ${USER_JWT}`,
        body: { scheduleId: SCHEDULE_ID }
      });
      const res = await POST(req);
      expect(res.status).toBe(200);
    });

    it('returns 403 when user provides a scheduleId they do not own', async () => {
      // Override schedule lookup to return a different owner
      const selectChain = {
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({
          data: { id: SCHEDULE_ID, user_id: 'different-user-uuid', status: 'ACTIVE' },
          error: null
        })
      };
      mockFrom.mockReturnValue({ select: jest.fn().mockReturnValue(selectChain) });

      const req = makeRequest({
        authHeader: `Bearer ${USER_JWT}`,
        body: { scheduleId: SCHEDULE_ID }
      });
      const res = await POST(req);
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toMatch(/do not own/i);
    });

    it('returns 404 when scheduleId is not found', async () => {
      const selectChain = {
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null })
      };
      mockFrom.mockReturnValue({ select: jest.fn().mockReturnValue(selectChain) });

      const req = makeRequest({
        authHeader: `Bearer ${USER_JWT}`,
        body: { scheduleId: SCHEDULE_ID }
      });
      const res = await POST(req);
      expect(res.status).toBe(404);
    });

    it('returns 403 when user omits scheduleId (cannot bulk trigger)', async () => {
      const req = makeRequest({ authHeader: `Bearer ${USER_JWT}` });
      const res = await POST(req);
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toMatch(/must specify a scheduleId/i);
    });

    it('uses batchSize=1 for user session callers', async () => {
      const req = makeRequest({
        authHeader: `Bearer ${USER_JWT}`,
        body: { scheduleId: SCHEDULE_ID }
      });
      await POST(req);
      expect(mockProcessDueSchedules).toHaveBeenCalledWith(
        expect.objectContaining({ batchSize: 1 })
      );
    });
  });

  // ── Invalid JWT ───────────────────────────────────────────────────────────
  describe('invalid JWT', () => {
    it('returns 401 when supabase.auth.getUser returns an error', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'Invalid JWT' }
      });
      const req = makeRequest({ authHeader: 'Bearer expired-jwt' });
      const res = await POST(req);
      expect(res.status).toBe(401);
    });

    it('returns 401 when supabase.auth.getUser returns null user', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
      const req = makeRequest({ authHeader: 'Bearer valid-looking-but-revoked' });
      const res = await POST(req);
      expect(res.status).toBe(401);
    });
  });

  // ── NODE_ENV bypass removed ───────────────────────────────────────────────
  describe('NODE_ENV bypass is not present', () => {
    it('does not allow unauthenticated access in development mode', async () => {
      (process.env as any).NODE_ENV = 'development';
      mockGetUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'No token' }
      });
      const req = makeRequest({});  // No auth header
      const res = await POST(req);
      // Must be 401, not 200 — there is no dev bypass.
      expect(res.status).toBe(401);
    });
  });
});
