/* eslint-disable @typescript-eslint/no-explicit-any */
import { validateAndPrepareAutopay, CreateAutopayInput } from '@/lib/autopay/authorization-validator';
import { getTodayZonedDateString } from '@/lib/autopay/schedule-calculator';
import { POST as createAutopayRoute } from '@/app/api/autopay/create/route';
import { GET as listAutopayRoute } from '@/app/api/autopay/list/route';
import { POST as updateStatusRoute } from '@/app/api/autopay/update-status/route';

// Mock rate-limiting so unit tests are deterministic
jest.mock('@/lib/rate-limit', () => ({
  checkRateLimit: jest.fn().mockResolvedValue(null)
}));

// Mock Supabase Admin client
const mockAuthUser = jest.fn();
const mockFrom = jest.fn();

jest.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: {
    auth: {
      getUser: (token: string) => mockAuthUser(token)
    },
    from: (table: string) => mockFrom(table)
  }
}));

describe('ArcFun Autopay Backend APIs & Authorization Handlers', () => {
  const TEST_USER_ID = '00000000-0000-0000-0000-000000000001';
  const OTHER_USER_ID = '99999999-9999-9999-9999-999999999999';
  const TEST_SENDER_WALLET = '0x1111111111111111111111111111111111111111';
  const TEST_RECIPIENT_WALLET = '0x2222222222222222222222222222222222222222';
  const TEST_CIRCLE_WALLET_ID = 'circle-dcw-uuid-abc-123';
  const TEST_VALID_TOKEN = 'valid-jwt-token-xyz';

  beforeEach(() => {
    jest.clearAllMocks();

    // Default authenticated user
    mockAuthUser.mockImplementation(async (token: string) => {
      if (token === TEST_VALID_TOKEN) {
        return { data: { user: { id: TEST_USER_ID, email: 'user@arcfun.xyz' } }, error: null };
      }
      return { data: { user: null }, error: { message: 'Invalid JWT' } };
    });
  });

  // =========================================================================
  // 1. Authorization Validator Unit Tests
  // =========================================================================
  describe('1. Authorization Validator (validateAndPrepareAutopay)', () => {
    function createMockSupabase(options?: {
      walletExists?: boolean;
      activeScheduleCount?: number;
      customSenderWallet?: string;
    }) {
      const walletExists = options?.walletExists !== undefined ? options.walletExists : true;
      const activeScheduleCount = options?.activeScheduleCount !== undefined ? options.activeScheduleCount : 0;
      const senderWallet = options?.customSenderWallet || TEST_SENDER_WALLET;

      return {
        from: jest.fn().mockImplementation((table: string) => {
          if (table === 'arc_wallets') {
            return {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              maybeSingle: jest.fn().mockResolvedValue({
                data: walletExists
                  ? {
                      circle_wallet_id: TEST_CIRCLE_WALLET_ID,
                      wallet_address: senderWallet,
                      status: 'ACTIVE'
                    }
                  : null,
                error: null
              })
            };
          }
          if (table === 'autopay_schedules') {
            return {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              count: activeScheduleCount,
              error: null
            };
          }
          return {};
        })
      } as any;
    }

    const baseValidInput: CreateAutopayInput = {
      recipientAddress: TEST_RECIPIENT_WALLET,
      amount: 10.5,
      frequency: 'DAILY',
      executionTime: '14:30',
      timezone: 'UTC',
      startDate: '2026-11-01',
      maxPerPayment: 15.0,
      monthlyLimit: 300.0,
      description: 'Daily staking reward'
    };

    it('rejects invalid recipient address format', async () => {
      const mockDb = createMockSupabase();
      await expect(
        validateAndPrepareAutopay({ ...baseValidInput, recipientAddress: 'invalid-address' }, { id: TEST_USER_ID }, mockDb)
      ).rejects.toThrow('Invalid EVM recipient address format');

      await expect(
        validateAndPrepareAutopay({ ...baseValidInput, recipientAddress: '' }, { id: TEST_USER_ID }, mockDb)
      ).rejects.toThrow('Valid recipient address is required');
    });

    it('rejects zero address as recipient', async () => {
      const mockDb = createMockSupabase();
      await expect(
        validateAndPrepareAutopay(
          { ...baseValidInput, recipientAddress: '0x0000000000000000000000000000000000000000' },
          { id: TEST_USER_ID },
          mockDb
        )
      ).rejects.toThrow('Cannot send Autopay payments to the zero address');
    });

    it('rejects self-sending (recipient equals user Circle DCW address)', async () => {
      const mockDb = createMockSupabase({ customSenderWallet: TEST_RECIPIENT_WALLET });
      await expect(
        validateAndPrepareAutopay(baseValidInput, { id: TEST_USER_ID }, mockDb)
      ).rejects.toThrow('Cannot configure Autopay to send funds to your own ArcFun Wallet address');
    });

    it('rejects invalid amounts (negative, zero, NaN, or > 6 decimal places)', async () => {
      const mockDb = createMockSupabase();
      await expect(
        validateAndPrepareAutopay({ ...baseValidInput, amount: 0 }, { id: TEST_USER_ID }, mockDb)
      ).rejects.toThrow('Amount must be a positive number greater than 0');

      await expect(
        validateAndPrepareAutopay({ ...baseValidInput, amount: -5 }, { id: TEST_USER_ID }, mockDb)
      ).rejects.toThrow('Amount must be a positive number greater than 0');

      await expect(
        validateAndPrepareAutopay({ ...baseValidInput, amount: 'abc' as any }, { id: TEST_USER_ID }, mockDb)
      ).rejects.toThrow('Amount must be a positive number greater than 0');

      await expect(
        validateAndPrepareAutopay({ ...baseValidInput, amount: 1.1234567 }, { id: TEST_USER_ID }, mockDb)
      ).rejects.toThrow('USDC amount cannot exceed 6 decimal places');
    });

    it('rejects invalid frequency or invalid execution times', async () => {
      const mockDb = createMockSupabase();
      await expect(
        validateAndPrepareAutopay({ ...baseValidInput, frequency: 'HOURLY' as any }, { id: TEST_USER_ID }, mockDb)
      ).rejects.toThrow('Frequency must be either "DAILY", "WEEKLY", or "MONTHLY"');

      await expect(
        validateAndPrepareAutopay({ ...baseValidInput, executionTime: '25:00' }, { id: TEST_USER_ID }, mockDb)
      ).rejects.toThrow('Invalid hour in execution time: "25"');

      await expect(
        validateAndPrepareAutopay({ ...baseValidInput, executionTime: '9:30 AM' }, { id: TEST_USER_ID }, mockDb)
      ).rejects.toThrow('Expected "HH:mm" 24-hour format');
    });

    it('accepts valid WEEKLY frequency and calculates schedule correctly', async () => {
      const mockDb = createMockSupabase();
      const result = await validateAndPrepareAutopay(
        { ...baseValidInput, amount: 10, frequency: 'WEEKLY', weeklyDay: 1, maxPerPayment: 10, monthlyLimit: undefined },
        { id: TEST_USER_ID },
        mockDb
      );
      expect(result.frequency).toBe('WEEKLY');
      expect(result.weeklyDay).toBe(1);
      expect(result.monthlySpendingLimit).toBe(10 * 5); // 50
    });

    it('rejects unsupported or invalid IANA timezones', async () => {
      const mockDb = createMockSupabase();
      await expect(
        validateAndPrepareAutopay({ ...baseValidInput, timezone: 'Moon/Base' }, { id: TEST_USER_ID }, mockDb)
      ).rejects.toThrow('Invalid or unsupported timezone: "Moon/Base"');
    });

    it('enforces monthlyDay requirements when frequency is MONTHLY', async () => {
      const mockDb = createMockSupabase();
      await expect(
        validateAndPrepareAutopay(
          { ...baseValidInput, frequency: 'MONTHLY', monthlyDay: undefined },
          { id: TEST_USER_ID },
          mockDb
        )
      ).rejects.toThrow('monthlyDay (1-31) is required when frequency is MONTHLY');

      await expect(
        validateAndPrepareAutopay(
          { ...baseValidInput, frequency: 'MONTHLY', monthlyDay: 0 },
          { id: TEST_USER_ID },
          mockDb
        )
      ).rejects.toThrow('monthlyDay must be an integer between 1 and 31');

      await expect(
        validateAndPrepareAutopay(
          { ...baseValidInput, frequency: 'MONTHLY', monthlyDay: 32 },
          { id: TEST_USER_ID },
          mockDb
        )
      ).rejects.toThrow('monthlyDay must be an integer between 1 and 31');
    });

    it('rejects invalid startDate format or endDate earlier than startDate', async () => {
      const mockDb = createMockSupabase();
      await expect(
        validateAndPrepareAutopay({ ...baseValidInput, startDate: '11/01/2026' }, { id: TEST_USER_ID }, mockDb)
      ).rejects.toThrow('startDate must be in YYYY-MM-DD format');

      await expect(
        validateAndPrepareAutopay(
          { ...baseValidInput, startDate: '2026-11-10', endDate: '2026-11-05' },
          { id: TEST_USER_ID },
          mockDb
        )
      ).rejects.toThrow('endDate cannot be earlier than startDate');
    });

    it('rejects startDate in the past and rejects past execution time on today', async () => {
      const mockDb = createMockSupabase();
      await expect(
        validateAndPrepareAutopay({ ...baseValidInput, startDate: '2025-01-01' }, { id: TEST_USER_ID }, mockDb)
      ).rejects.toThrow('Start date cannot be in the past');

      const todayUtc = getTodayZonedDateString('UTC');
      await expect(
        validateAndPrepareAutopay(
          { ...baseValidInput, startDate: todayUtc, executionTime: '00:01', timezone: 'UTC' },
          { id: TEST_USER_ID },
          mockDb
        )
      ).rejects.toThrow('has already passed for today');
    });

    it('enforces spending limits (maxPerPayment >= amount and monthlyLimit >= maxPerPayment)', async () => {
      const mockDb = createMockSupabase();
      await expect(
        validateAndPrepareAutopay(
          { ...baseValidInput, amount: 20, maxPerPayment: 15 },
          { id: TEST_USER_ID },
          mockDb
        )
      ).rejects.toThrow('maxPerPayment (15) cannot be less than payment amount (20)');

      await expect(
        validateAndPrepareAutopay(
          { ...baseValidInput, amount: 20, maxPerPayment: 25, monthlyLimit: 20 },
          { id: TEST_USER_ID },
          mockDb
        )
      ).rejects.toThrow('monthlySpendingLimit (20) cannot be less than maxPerPayment (25)');
    });

    it('rejects if ArcFun Circle DCW wallet is not initialized on Arc Testnet', async () => {
      const mockDb = createMockSupabase({ walletExists: false });
      await expect(
        validateAndPrepareAutopay(baseValidInput, { id: TEST_USER_ID }, mockDb)
      ).rejects.toMatchObject({
        code: 'ARCFUN_WALLET_NOT_FOUND',
        status: 404
      });
    });

    it('rejects if user has reached the maximum of 20 active schedules', async () => {
      const mockDb = createMockSupabase({ activeScheduleCount: 20 });
      await expect(
        validateAndPrepareAutopay(baseValidInput, { id: TEST_USER_ID }, mockDb)
      ).rejects.toMatchObject({
        status: 429
      });
    });

    it('successfully prepares valid daily configuration and populates defaults', async () => {
      const mockDb = createMockSupabase();
      const res = await validateAndPrepareAutopay(
        {
          recipientAddress: TEST_RECIPIENT_WALLET,
          amount: 50,
          frequency: 'DAILY',
          executionTime: '08:00',
          timezone: 'Asia/Kolkata',
          startDate: '2026-11-01'
        },
        { id: TEST_USER_ID },
        mockDb
      );

      expect(res.userId).toBe(TEST_USER_ID);
      expect(res.senderWallet).toBe(TEST_SENDER_WALLET);
      expect(res.circleWalletId).toBe(TEST_CIRCLE_WALLET_ID);
      expect(res.token).toBe('USDC');
      expect(res.blockchain).toBe('ARC-TESTNET');
      expect(res.maxPerPayment).toBe(50); // defaults to amount
      expect(res.monthlySpendingLimit).toBe(50 * 31); // defaults to amount * 31 for daily
      expect(res.currentMonthSpent).toBe(0.00);
      expect(res.nextExecutionAt).toBeGreaterThan(Date.now());
    });
  });

  // =========================================================================
  // 2. POST /api/autopay/create Route Tests
  // =========================================================================
  describe('2. POST /api/autopay/create API Endpoint', () => {
    it('returns 401 when Authorization header is missing or invalid', async () => {
      const reqNoAuth = new Request('http://localhost/api/autopay/create', { method: 'POST' });
      const res1 = await createAutopayRoute(reqNoAuth);
      expect(res1.status).toBe(401);

      const reqBadAuth = new Request('http://localhost/api/autopay/create', {
        method: 'POST',
        headers: { authorization: 'Basic invalid-token' }
      });
      const res2 = await createAutopayRoute(reqBadAuth);
      expect(res2.status).toBe(401);
    });

    it('returns 401 when Supabase token authentication fails', async () => {
      const req = new Request('http://localhost/api/autopay/create', {
        method: 'POST',
        headers: { authorization: 'Bearer expired-or-invalid-jwt' }
      });
      const res = await createAutopayRoute(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toContain('Unauthorized');
    });

    it('returns 400 when request body is malformed JSON', async () => {
      const req = new Request('http://localhost/api/autopay/create', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${TEST_VALID_TOKEN}`,
          'content-type': 'application/json'
        },
        body: 'invalid-json{'
      });
      const res = await createAutopayRoute(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe('Malformed JSON payload');
    });

    it('returns 400 on validation failure (e.g. invalid recipient)', async () => {
      // Mock arc_wallets table query
      mockFrom.mockImplementation((table: string) => {
        if (table === 'arc_wallets') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: { circle_wallet_id: TEST_CIRCLE_WALLET_ID, wallet_address: TEST_SENDER_WALLET },
              error: null
            })
          };
        }
        return {};
      });

      const req = new Request('http://localhost/api/autopay/create', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${TEST_VALID_TOKEN}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          recipientAddress: 'not-an-evm-address',
          amount: 10,
          frequency: 'DAILY',
          executionTime: '12:00',
          timezone: 'UTC'
        })
      });

      const res = await createAutopayRoute(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain('Invalid EVM recipient address');
    });

    it('returns 409 when a duplicate active schedule request is detected within 60s', async () => {
      // The validator queries autopay_schedules for activeCount:
      // Call 1: select('id', { count: 'exact', head: true }).eq().eq() -> { count: 0, error: null }
      // Then create route queries autopay_schedules:
      // Call 2: one-active-per-recipient check -> null
      // Call 3: rapid-fire duplicate check -> existing schedule
      let autopayCallCount = 0;
      mockFrom.mockImplementation((table: string) => {
        if (table === 'arc_wallets') {
          const b: any = {};
          b.select = jest.fn().mockReturnValue(b);
          b.eq = jest.fn().mockReturnValue(b);
          b.maybeSingle = jest.fn().mockResolvedValue({
            data: { circle_wallet_id: TEST_CIRCLE_WALLET_ID, wallet_address: TEST_SENDER_WALLET },
            error: null
          });
          return b;
        }
        if (table === 'autopay_schedules') {
          autopayCallCount++;
          const b: any = {};
          b.select = jest.fn().mockReturnValue(b);
          b.eq = jest.fn().mockReturnValue(b);
          b.in = jest.fn().mockReturnValue(b);
          b.order = jest.fn().mockReturnValue(b);
          b.limit = jest.fn().mockReturnValue(b);
          b.gt = jest.fn().mockReturnValue(b);
          b.count = 0;
          b.error = null;
          if (autopayCallCount === 1) {
            // Call 1: Validator active count check
            b.then = (resolve: any) => Promise.resolve({ count: 0, error: null }).then(resolve);
            return b;
          } else if (autopayCallCount === 2) {
            // Call 2: One-active-per-recipient check
            b.maybeSingle = jest.fn().mockResolvedValue({ data: null, error: null });
            return b;
          } else {
            // Call 3: Rapid-fire duplicate check
            b.maybeSingle = jest.fn().mockResolvedValue({
              data: { id: 'existing-schedule-uuid', created_at: Date.now() - 5000 },
              error: null
            });
            return b;
          }
        }
        return {};
      });

      const req = new Request('http://localhost/api/autopay/create', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${TEST_VALID_TOKEN}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          recipientAddress: TEST_RECIPIENT_WALLET,
          amount: 25,
          frequency: 'DAILY',
          executionTime: '12:00',
          timezone: 'UTC',
          startDate: '2026-11-01'
        })
      });

      const res = await createAutopayRoute(req);
      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.code).toBe('DUPLICATE_REQUEST');
      expect(json.error).toContain('Duplicate request');
    });

    it('returns 201 on valid creation, persists explicit authorization, and does NOT leak circle_wallet_id', async () => {
      let insertedRecord: any = null;
      // Call 1 (validator): active schedules count check
      // Call 2 (route): one-active-per-recipient check
      // Call 3 (route): rapid-fire duplicate check
      // Call 4 (route): insert schedule
      let autopayCallCount = 0;

      mockFrom.mockImplementation((table: string) => {
        if (table === 'arc_wallets') {
          const b: any = {};
          b.select = jest.fn().mockReturnValue(b);
          b.eq = jest.fn().mockReturnValue(b);
          b.maybeSingle = jest.fn().mockResolvedValue({
            data: { circle_wallet_id: TEST_CIRCLE_WALLET_ID, wallet_address: TEST_SENDER_WALLET },
            error: null
          });
          // For line 166: .select('wallet_address, linked_external_address').eq('user_id', user.id)
          b.then = (resolve: any) => Promise.resolve({
            data: [{ wallet_address: TEST_SENDER_WALLET, linked_external_address: null }],
            error: null
          }).then(resolve);
          return b;
        }
        if (table === 'autopay_schedules') {
          autopayCallCount++;
          if (autopayCallCount === 1) {
            // Call 1: Validator active count check
            const b: any = {};
            b.select = jest.fn().mockReturnValue(b);
            b.eq = jest.fn().mockReturnValue(b);
            b.count = 0;
            b.error = null;
            b.then = (resolve: any) => Promise.resolve({ count: 0, error: null }).then(resolve);
            return b;
          }
          if (autopayCallCount === 2 || autopayCallCount === 3) {
            // Calls 2 & 3: one-active check and rapid-fire check — both return null
            const b: any = {};
            b.select = jest.fn().mockReturnValue(b);
            b.eq = jest.fn().mockReturnValue(b);
            b.in = jest.fn().mockReturnValue(b);
            b.order = jest.fn().mockReturnValue(b);
            b.limit = jest.fn().mockReturnValue(b);
            b.gt = jest.fn().mockReturnValue(b);
            b.maybeSingle = jest.fn().mockResolvedValue({ data: null, error: null });
            return b;
          }
          // Call 4: insert
          return {
            insert: jest.fn().mockImplementation((payload: any) => {
              insertedRecord = { id: 'created-schedule-uuid-1', ...payload };
              const ib: any = {};
              ib.select = jest.fn().mockReturnValue(ib);
              ib.single = jest.fn().mockResolvedValue({ data: insertedRecord, error: null });
              return ib;
            })
          };
        }
        if (table === 'payments') {
          return {
            upsert: jest.fn().mockResolvedValue({ error: null })
          };
        }
        if (table === 'chats') {
          const b: any = {};
          b.select = jest.fn().mockReturnValue(b);
          b.contains = jest.fn().mockReturnValue(b);
          b.maybeSingle = jest.fn().mockResolvedValue({ data: { id: 'chat-1' }, error: null });
          b.insert = jest.fn().mockResolvedValue({ error: null });
          return b;
        }
        return {};
      });

      const req = new Request('http://localhost/api/autopay/create', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${TEST_VALID_TOKEN}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          recipientAddress: TEST_RECIPIENT_WALLET,
          amount: 15.0,
          frequency: 'MONTHLY',
          monthlyDay: 15,
          executionTime: '09:00',
          timezone: 'UTC',
          maxPerPayment: 20.0,
          monthlyLimit: 50.0,
          description: 'Monthly Cloud Subscription'
        })
      });

      const res = await createAutopayRoute(req);
      expect(res.status).toBe(201);
      const json = await res.json();

      expect(json.success).toBe(true);
      expect(json.schedule).toBeDefined();
      expect(json.schedule.id).toBe('created-schedule-uuid-1');
      expect(json.schedule.senderWallet).toBe(TEST_SENDER_WALLET);
      expect(json.schedule.recipientAddress).toBe(TEST_RECIPIENT_WALLET);
      expect(json.schedule.amount).toBe(15.0);
      expect(json.schedule.token).toBe('USDC');
      expect(json.schedule.blockchain).toBe('ARC-TESTNET');
      expect(json.schedule.status).toBe('ACTIVE');

      // Security check: circle_wallet_id MUST NEVER be returned to the frontend
      expect(json.schedule.circle_wallet_id).toBeUndefined();
      expect(json.schedule.circleWalletId).toBeUndefined();

      // Verified stored database fields
      expect(insertedRecord).toBeDefined();
      expect(insertedRecord.user_id).toBe(TEST_USER_ID);
      expect(insertedRecord.circle_wallet_id).toBe(TEST_CIRCLE_WALLET_ID);
      expect(insertedRecord.authorization_version).toBe(1);
      expect(insertedRecord.status).toBe('ACTIVE');
    });
  });

  // =========================================================================
  // 3. GET /api/autopay/list Route Tests
  // =========================================================================
  describe('3. GET /api/autopay/list API Endpoint', () => {
    it('returns 401 when Authorization header is missing', async () => {
      const req = new Request('http://localhost/api/autopay/list');
      const res = await listAutopayRoute(req);
      expect(res.status).toBe(401);
    });

    it('returns 200 with user-isolated schedules and recent execution logs', async () => {
      const mockScheduleRow = {
        id: 'sch-1',
        sender_wallet: TEST_SENDER_WALLET,
        recipient_address: TEST_RECIPIENT_WALLET,
        amount: '10.000000',
        token: 'USDC',
        blockchain: 'ARC-TESTNET',
        frequency: 'DAILY',
        execution_time: '12:00',
        timezone: 'UTC',
        monthly_day: null,
        start_date: '2026-10-01',
        end_date: null,
        description: 'Test daily',
        max_per_payment: '10.000000',
        monthly_spending_limit: '310.000000',
        current_month_spent: '20.000000',
        current_month_cycle: '2026-10',
        status: 'ACTIVE',
        next_execution_at: 1761400000000,
        last_execution_at: 1761300000000,
        last_execution_status: 'SUCCESS',
        consecutive_failures: 0,
        last_error_reason: null,
        authorization_version: 1,
        authorized_at: 1761200000000,
        created_at: 1761200000000,
        updated_at: 1761200000000
      };

      const mockExecutionRow = {
        id: 'exec-1',
        schedule_id: 'sch-1',
        amount: '10.000000',
        token: 'USDC',
        status: 'SUCCESS',
        circle_tx_id: 'circle-tx-999',
        blockchain_tx_hash: '0xabc123hash',
        scheduled_for: 1761300000000,
        executed_at: 1761300005000,
        error_reason: null,
        created_at: 1761300000000
      };

      let filterUserId: string | null = null;
      let filterStatus: string | null = null;

      mockFrom.mockImplementation((table: string) => {
        if (table === 'autopay_schedules') {
          const queryBuilder: any = {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockImplementation((col: string, val: string) => {
              if (col === 'user_id') filterUserId = val;
              if (col === 'status') filterStatus = val;
              return queryBuilder;
            }),
            update: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({ error: null })
            }),
            order: jest.fn().mockResolvedValue({
              data: [mockScheduleRow],
              error: null
            })
          };
          return queryBuilder;
        }
        if (table === 'autopay_executions') {
          return {
            select: jest.fn().mockReturnThis(),
            in: jest.fn().mockReturnThis(),
            order: jest.fn().mockReturnThis(),
            limit: jest.fn().mockResolvedValue({
              data: [mockExecutionRow],
              error: null
            })
          };
        }
        if (table === 'payments') {
          return {
            update: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                eq: jest.fn().mockResolvedValue({ error: null })
              })
            })
          };
        }
        return {};
      });

      const req = new Request('http://localhost/api/autopay/list?status=ACTIVE', {
        headers: { authorization: `Bearer ${TEST_VALID_TOKEN}` }
      });

      const res = await listAutopayRoute(req);
      expect(res.status).toBe(200);
      const json = await res.json();

      expect(json.success).toBe(true);
      expect(json.count).toBe(1);
      expect(json.schedules).toHaveLength(1);
      expect(filterUserId).toBe(TEST_USER_ID); // Strict user isolation

      const item = json.schedules[0];
      expect(item.id).toBe('sch-1');
      expect(item.amount).toBe(10);
      expect(item.recentExecutions).toHaveLength(1);
      expect(item.recentExecutions[0].blockchainTxHash).toBe('0xabc123hash');
      expect(item.circle_wallet_id).toBeUndefined(); // Security: no DCW ID leaked
    });
  });

  // =========================================================================
  // 4. POST /api/autopay/update-status Route Tests
  // =========================================================================
  describe('4. POST /api/autopay/update-status API Endpoint', () => {
    it('returns 400 when scheduleId or action is missing or invalid', async () => {
      const req1 = new Request('http://localhost/api/autopay/update-status', {
        method: 'POST',
        headers: { authorization: `Bearer ${TEST_VALID_TOKEN}` },
        body: JSON.stringify({ action: 'PAUSE' })
      });
      const res1 = await updateStatusRoute(req1);
      expect(res1.status).toBe(400);

      const req2 = new Request('http://localhost/api/autopay/update-status', {
        method: 'POST',
        headers: { authorization: `Bearer ${TEST_VALID_TOKEN}` },
        body: JSON.stringify({ scheduleId: 'sch-1', action: 'UNAUTHORIZED_ACTION' })
      });
      const res2 = await updateStatusRoute(req2);
      expect(res2.status).toBe(400);
    });

    it('returns 404 when schedule is not found or belongs to another user', async () => {
      mockFrom.mockImplementation((table: string) => {
        if (table === 'autopay_schedules') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null })
          };
        }
        return {};
      });

      const req = new Request('http://localhost/api/autopay/update-status', {
        method: 'POST',
        headers: { authorization: `Bearer ${TEST_VALID_TOKEN}` },
        body: JSON.stringify({ scheduleId: 'sch-other-user', action: 'PAUSE' })
      });

      const res = await updateStatusRoute(req);
      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.error).toBe('Autopay schedule not found');
    });

    it('returns 409 when authorizationVersion does not match current schedule version', async () => {
      mockFrom.mockImplementation((table: string) => {
        if (table === 'autopay_schedules') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: {
                id: 'sch-1',
                user_id: TEST_USER_ID,
                status: 'ACTIVE',
                authorization_version: 3
              },
              error: null
            })
          };
        }
        return {};
      });

      const req = new Request('http://localhost/api/autopay/update-status', {
        method: 'POST',
        headers: { authorization: `Bearer ${TEST_VALID_TOKEN}` },
        body: JSON.stringify({ scheduleId: 'sch-1', action: 'PAUSE', authorizationVersion: 2 })
      });

      const res = await updateStatusRoute(req);
      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.error).toContain('Authorization version mismatch');
    });

    it('returns 400 when attempting to pause an already paused schedule', async () => {
      mockFrom.mockImplementation((table: string) => {
        if (table === 'autopay_schedules') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: {
                id: 'sch-1',
                user_id: TEST_USER_ID,
                status: 'PAUSED',
                authorization_version: 1
              },
              error: null
            })
          };
        }
        return {};
      });

      const req = new Request('http://localhost/api/autopay/update-status', {
        method: 'POST',
        headers: { authorization: `Bearer ${TEST_VALID_TOKEN}` },
        body: JSON.stringify({ scheduleId: 'sch-1', action: 'PAUSE' })
      });

      const res = await updateStatusRoute(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain('Cannot pause schedule: current status is "PAUSED"');
    });

    it('successfully pauses an ACTIVE schedule', async () => {
      let appliedUpdates: any = null;

      mockFrom.mockImplementation((table: string) => {
        if (table === 'autopay_schedules') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: {
                id: 'sch-1',
                user_id: TEST_USER_ID,
                status: 'ACTIVE',
                authorization_version: 1,
                next_execution_at: 1761400000000
              },
              error: null
            }),
            update: jest.fn().mockImplementation((updates: any) => {
              appliedUpdates = updates;
              return {
                eq: jest.fn().mockReturnThis(),
                select: jest.fn().mockReturnThis(),
                single: jest.fn().mockResolvedValue({
                  data: {
                    id: 'sch-1',
                    status: 'PAUSED',
                    next_execution_at: 1761400000000,
                    authorization_version: 1,
                    updated_at: updates.updated_at
                  },
                  error: null
                })
              };
            })
          };
        }
        return {};
      });

      const req = new Request('http://localhost/api/autopay/update-status', {
        method: 'POST',
        headers: { authorization: `Bearer ${TEST_VALID_TOKEN}` },
        body: JSON.stringify({ scheduleId: 'sch-1', action: 'PAUSE' })
      });

      const res = await updateStatusRoute(req);
      expect(res.status).toBe(200);
      const json = await res.json();

      expect(json.success).toBe(true);
      expect(json.status).toBe('PAUSED');
      expect(appliedUpdates.status).toBe('PAUSED');
    });

    it('successfully resumes a PAUSED schedule and recalculates next_execution_at forward', async () => {
      let appliedUpdates: any = null;

      mockFrom.mockImplementation((table: string) => {
        if (table === 'autopay_schedules') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: {
                id: 'sch-1',
                user_id: TEST_USER_ID,
                status: 'PAUSED',
                frequency: 'DAILY',
                execution_time: '18:00',
                timezone: 'UTC',
                monthly_day: null,
                authorization_version: 1,
                next_execution_at: 1600000000000 // In the far past
              },
              error: null
            }),
            update: jest.fn().mockImplementation((updates: any) => {
              appliedUpdates = updates;
              return {
                eq: jest.fn().mockReturnThis(),
                select: jest.fn().mockReturnThis(),
                single: jest.fn().mockResolvedValue({
                  data: {
                    id: 'sch-1',
                    status: 'ACTIVE',
                    next_execution_at: updates.next_execution_at,
                    authorization_version: 1,
                    updated_at: updates.updated_at
                  },
                  error: null
                })
              };
            })
          };
        }
        return {};
      });

      const req = new Request('http://localhost/api/autopay/update-status', {
        method: 'POST',
        headers: { authorization: `Bearer ${TEST_VALID_TOKEN}` },
        body: JSON.stringify({ scheduleId: 'sch-1', action: 'RESUME' })
      });

      const res = await updateStatusRoute(req);
      expect(res.status).toBe(200);
      const json = await res.json();

      expect(json.success).toBe(true);
      expect(json.status).toBe('ACTIVE');
      expect(appliedUpdates.status).toBe('ACTIVE');
      // Must be recalculated forward into the future, never keeping past timestamp
      expect(appliedUpdates.next_execution_at).toBeGreaterThan(Date.now());
      expect(appliedUpdates.consecutive_failures).toBe(0);
    });

    it('successfully cancels a schedule, sets revoked_at, and increments authorization_version', async () => {
      let appliedUpdates: any = null;

      mockFrom.mockImplementation((table: string) => {
        if (table === 'autopay_schedules') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: {
                id: 'sch-1',
                user_id: TEST_USER_ID,
                status: 'ACTIVE',
                authorization_version: 1,
                next_execution_at: 1761400000000
              },
              error: null
            }),
            update: jest.fn().mockImplementation((updates: any) => {
              appliedUpdates = updates;
              return {
                eq: jest.fn().mockReturnThis(),
                select: jest.fn().mockReturnThis(),
                single: jest.fn().mockResolvedValue({
                  data: {
                    id: 'sch-1',
                    status: 'CANCELLED',
                    authorization_version: updates.authorization_version,
                    revoked_at: updates.revoked_at,
                    updated_at: updates.updated_at
                  },
                  error: null
                })
              };
            })
          };
        }
        return {};
      });

      const req = new Request('http://localhost/api/autopay/update-status', {
        method: 'POST',
        headers: { authorization: `Bearer ${TEST_VALID_TOKEN}` },
        body: JSON.stringify({ scheduleId: 'sch-1', action: 'CANCEL' })
      });

      const res = await updateStatusRoute(req);
      expect(res.status).toBe(200);
      const json = await res.json();

      expect(json.success).toBe(true);
      expect(json.status).toBe('CANCELLED');
      expect(appliedUpdates.status).toBe('CANCELLED');
      expect(appliedUpdates.revoked_at).toBeDefined();
      expect(appliedUpdates.authorization_version).toBe(2); // Incremented from 1
      expect(json.revokedAt).toBeDefined();
    });

    it('enforces immutable cancellation: cannot pause or resume an already CANCELLED schedule', async () => {
      mockFrom.mockImplementation((table: string) => {
        if (table === 'autopay_schedules') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: {
                id: 'sch-1',
                user_id: TEST_USER_ID,
                status: 'CANCELLED',
                authorization_version: 2,
                revoked_at: 1761300000000
              },
              error: null
            })
          };
        }
        return {};
      });

      const req = new Request('http://localhost/api/autopay/update-status', {
        method: 'POST',
        headers: { authorization: `Bearer ${TEST_VALID_TOKEN}` },
        body: JSON.stringify({ scheduleId: 'sch-1', action: 'RESUME' })
      });

      const res = await updateStatusRoute(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain('permanently cancelled and its authorization revoked');
    });

    it('enforces immutability: update-status rejects altering recipient, amount, frequency or wallet', async () => {
      let appliedUpdates: any = null;

      mockFrom.mockImplementation((table: string) => {
        if (table === 'autopay_schedules') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: {
                id: 'sch-1',
                user_id: TEST_USER_ID,
                status: 'ACTIVE',
                amount: '10.00',
                recipient_address: TEST_RECIPIENT_WALLET,
                sender_wallet: TEST_SENDER_WALLET,
                frequency: 'DAILY',
                authorization_version: 1
              },
              error: null
            }),
            update: jest.fn().mockImplementation((updates: any) => {
              appliedUpdates = updates;
              return {
                eq: jest.fn().mockReturnThis(),
                select: jest.fn().mockReturnThis(),
                single: jest.fn().mockResolvedValue({
                  data: {
                    id: 'sch-1',
                    status: 'PAUSED',
                    authorization_version: 1,
                    updated_at: updates.updated_at
                  },
                  error: null
                })
              };
            })
          };
        }
        return {};
      });

      // Attempt to tamper with amount, recipient, frequency, and sender in update-status payload
      const req = new Request('http://localhost/api/autopay/update-status', {
        method: 'POST',
        headers: { authorization: `Bearer ${TEST_VALID_TOKEN}` },
        body: JSON.stringify({
          scheduleId: 'sch-1',
          action: 'PAUSE',
          amount: 999999,
          recipient_address: '0x3333333333333333333333333333333333333333',
          frequency: 'MONTHLY',
          sender_wallet: '0x4444444444444444444444444444444444444444'
        })
      });

      const res = await updateStatusRoute(req);
      expect(res.status).toBe(200);

      // Verify that appliedUpdates completely ignored the tampered fields
      expect(appliedUpdates.amount).toBeUndefined();
      expect(appliedUpdates.recipient_address).toBeUndefined();
      expect(appliedUpdates.frequency).toBeUndefined();
      expect(appliedUpdates.sender_wallet).toBeUndefined();
      expect(appliedUpdates.status).toBe('PAUSED');
    });
  });
});
