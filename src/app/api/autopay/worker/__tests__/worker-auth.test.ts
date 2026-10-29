/**
 * Worker Route — Authentication Unit Tests
 *
 * Tests the handleWorkerRequest authentication logic without touching the
 * database or Circle API. processDueAutopaySchedules is fully mocked.
 *
 * Coverage:
 *  ✓ CRON_SECRET not configured → 503
 *  ✓ Missing Authorization header → 401
 *  ✓ Wrong Bearer secret → 401
 *  ✓ Query token rejected (even if matching CRON_SECRET) → 401
 *  ✓ x-vercel-cron: 1 alone (forged header) → 401
 *  ✓ x-vercel-cron: 1 WITH correct Bearer → 200
 *  ✓ Correct Bearer → 200
 *  ✓ Response body never includes CRON_SECRET value
 */

jest.mock('@/lib/autopay/execution-engine', () => ({
  processDueAutopaySchedules: jest.fn().mockResolvedValue({
    processedCount: 0,
    successCount: 0,
    failureCount: 0,
    skippedCount: 0,
    reconciledCount: 0,
    details: []
  })
}));

import { GET, POST } from '@/app/api/autopay/worker/route';

const REAL_SECRET = 'test-cron-secret-abc123XYZ';

function makeRequest(options: {
  authHeader?: string;
  cronToken?: string;
  method?: 'GET' | 'POST';
  extraHeaders?: Record<string, string>;
}): Request {
  const url = new URL('http://localhost:3000/api/autopay/worker');
  if (options.cronToken) {
    url.searchParams.set('cronToken', options.cronToken);
  }
  const headers: Record<string, string> = {};
  if (options.authHeader !== undefined) {
    headers['authorization'] = options.authHeader;
  }
  if (options.extraHeaders) {
    Object.assign(headers, options.extraHeaders);
  }
  return new Request(url.toString(), {
    method: options.method ?? 'GET',
    headers
  });
}

describe('Autopay Worker — Authentication', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    jest.clearAllMocks();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  // ── CRON_SECRET missing ──────────────────────────────────────────────────
  describe('when CRON_SECRET is not configured', () => {
    beforeEach(() => {
      delete process.env.CRON_SECRET;
    });

    it('returns 503 regardless of headers', async () => {
      const req = makeRequest({ authHeader: `Bearer anything` });
      const res = await GET(req);
      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.error).toMatch(/disabled/i);
    });

    it('returns 503 even with x-vercel-cron header', async () => {
      const req = makeRequest({ extraHeaders: { 'x-vercel-cron': '1' } });
      const res = await GET(req);
      expect(res.status).toBe(503);
    });
  });

  // ── CRON_SECRET is set ────────────────────────────────────────────────────
  describe('when CRON_SECRET is configured', () => {
    beforeEach(() => {
      process.env.CRON_SECRET = REAL_SECRET;
    });

    it('returns 401 with no Authorization header', async () => {
      const req = makeRequest({});
      const res = await GET(req);
      expect(res.status).toBe(401);
    });

    it('returns 401 with malformed Authorization header (no Bearer prefix)', async () => {
      const req = makeRequest({ authHeader: REAL_SECRET });
      const res = await GET(req);
      expect(res.status).toBe(401);
    });

    it('returns 401 with wrong Bearer secret', async () => {
      const req = makeRequest({ authHeader: 'Bearer wrong-secret' });
      const res = await GET(req);
      expect(res.status).toBe(401);
    });

    it('returns 401 for ?cronToken query parameter even with correct secret (query auth rejected)', async () => {
      const req = makeRequest({ cronToken: REAL_SECRET });
      const res = await GET(req);
      expect(res.status).toBe(401);
    });

    it('returns 401 for ?cronToken query parameter with wrong secret', async () => {
      const req = makeRequest({ cronToken: 'wrong-token' });
      const res = await GET(req);
      expect(res.status).toBe(401);
    });

    it('returns 401 for x-vercel-cron: 1 alone (no secret provided) — forged header attack', async () => {
      const req = makeRequest({ extraHeaders: { 'x-vercel-cron': '1' } });
      const res = await GET(req);
      expect(res.status).toBe(401);
    });

    it('returns 401 for empty Bearer token', async () => {
      const req = makeRequest({ authHeader: 'Bearer ' });
      const res = await GET(req);
      expect(res.status).toBe(401);
    });

    it('returns 200 with correct Authorization Bearer header (Vercel Cron path)', async () => {
      const req = makeRequest({ authHeader: `Bearer ${REAL_SECRET}` });
      const res = await GET(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    it('returns 200 via POST with correct Bearer', async () => {
      const req = makeRequest({ method: 'POST', authHeader: `Bearer ${REAL_SECRET}` });
      const res = await POST(req);
      expect(res.status).toBe(200);
    });

    it('returns 200 with correct Bearer even when x-vercel-cron is also present', async () => {
      const req = makeRequest({
        authHeader: `Bearer ${REAL_SECRET}`,
        extraHeaders: { 'x-vercel-cron': '1' }
      });
      const res = await GET(req);
      expect(res.status).toBe(200);
    });

    it('response body never contains the CRON_SECRET value', async () => {
      // Test with wrong secret so we get a rejection — ensure the presented token isn't echoed.
      const req = makeRequest({ authHeader: 'Bearer leaked-secret' });
      const res = await GET(req);
      const text = await res.text();
      expect(text).not.toContain('leaked-secret');
      expect(text).not.toContain(REAL_SECRET);
    });

    it('returns 200 response with correct summary shape', async () => {
      const req = makeRequest({ authHeader: `Bearer ${REAL_SECRET}` });
      const res = await GET(req);
      const body = await res.json();
      expect(body).toMatchObject({
        success: true,
        summary: {
          processed: expect.any(Number),
          success: expect.any(Number),
          failed: expect.any(Number),
          skipped: expect.any(Number)
        }
      });
    });
  });
});
