/* eslint-disable @typescript-eslint/no-explicit-any */
import { processDueAutopaySchedules } from '@/lib/autopay/execution-engine';
import { POST as workerPostRoute, GET as workerGetRoute } from '@/app/api/autopay/worker/route';
import * as paymentService from '@/lib/circle/payment-service';

// Mock payment-service
jest.mock('@/lib/circle/payment-service', () => ({
  executeTransfer: jest.fn(),
  getTokenIdBySymbol: jest.fn(),
  getTransactionStatus: jest.fn()
}));

// Mock Supabase Admin client
const mockRpc = jest.fn();
const mockFrom = jest.fn();

jest.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: {
    rpc: (fn: string, params: any) => mockRpc(fn, params),
    from: (table: string) => mockFrom(table)
  }
}));

describe('ArcFun Autopay Execution Engine & Scheduled Worker', () => {
  const TEST_SCHEDULE_ID = 'sch-uuid-111';
  const TEST_USER_ID = '00000000-0000-0000-0000-000000000001';
  const TEST_CIRCLE_WALLET_ID = 'circle-dcw-wallet-id';
  const TEST_SENDER_WALLET = '0x1111111111111111111111111111111111111111';
  const TEST_RECIPIENT_WALLET = '0x2222222222222222222222222222222222222222';
  const TEST_USDC_TOKEN_ID = 'token-id-usdc-arc-testnet';

  const baseScheduleRow = {
    id: TEST_SCHEDULE_ID,
    user_id: TEST_USER_ID,
    sender_wallet: TEST_SENDER_WALLET,
    circle_wallet_id: TEST_CIRCLE_WALLET_ID,
    recipient_address: TEST_RECIPIENT_WALLET,
    amount: 10.0,
    token: 'USDC',
    blockchain: 'ARC-TESTNET',
    frequency: 'DAILY',
    execution_time: '12:00',
    timezone: 'UTC',
    monthly_day: null,
    start_date: '2026-10-01',
    end_date: null,
    max_per_payment: 15.0,
    monthly_spending_limit: 310.0,
    current_month_spent: 0.0,
    current_month_cycle: '2026-10',
    status: 'ACTIVE',
    next_execution_at: 1761400000000,
    consecutive_failures: 0,
    authorization_version: 1
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockFrom.mockImplementation(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      not: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue({ data: [], error: null }),
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
      single: jest.fn().mockResolvedValue({ data: null, error: null }),
      insert: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: { id: 'exec-mock-id' }, error: null })
      }),
      update: jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({ error: null })
      })
    }));

    (paymentService.getTokenIdBySymbol as jest.Mock).mockResolvedValue(TEST_USDC_TOKEN_ID);
    (paymentService.executeTransfer as jest.Mock).mockResolvedValue({
      id: 'circle-tx-successful-id',
      state: 'COMPLETE',
      txHash: '0xmockchainhash'
    });
    (paymentService.getTransactionStatus as jest.Mock).mockResolvedValue(null);
  });

  // =========================================================================
  // 1. processDueAutopaySchedules Unit Tests
  // =========================================================================
  describe('1. Execution Engine (processDueAutopaySchedules)', () => {
    it('throws error when acquire_due_autopay_schedules RPC fails', async () => {
      mockRpc.mockResolvedValue({ data: null, error: { message: 'Database connection dropped' } });

      await expect(processDueAutopaySchedules()).rejects.toThrow(
        'Failed to acquire due Autopay schedules: Database connection dropped'
      );
    });

    it('returns empty summary when no schedules are due', async () => {
      mockRpc.mockResolvedValue({ data: [], error: null });

      const res = await processDueAutopaySchedules();
      expect(res.processedCount).toBe(0);
      expect(res.successCount).toBe(0);
      expect(res.details).toHaveLength(0);
    });

    it('skips schedule if it is no longer ACTIVE', async () => {
      mockRpc.mockResolvedValue({
        data: [{ schedule_id: TEST_SCHEDULE_ID, authorization_version: 1 }],
        error: null
      });

      mockFrom.mockImplementation((table: string) => {
        if (table === 'autopay_schedules') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: { ...baseScheduleRow, status: 'PAUSED' },
              error: null
            })
          };
        }
        return {};
      });

      const res = await processDueAutopaySchedules();
      expect(res.processedCount).toBe(1);
      expect(res.skippedCount).toBe(1);
      expect(res.details[0].status).toBe('SKIPPED');
      expect(res.details[0].error).toContain('Schedule status is not ACTIVE');
    });

    it('skips schedule if authorization version conflicts', async () => {
      mockRpc.mockResolvedValue({
        data: [{ schedule_id: TEST_SCHEDULE_ID, authorization_version: 1 }],
        error: null
      });

      mockFrom.mockImplementation((table: string) => {
        if (table === 'autopay_schedules') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: { ...baseScheduleRow, authorization_version: 2 }, // Updated concurrently
              error: null
            })
          };
        }
        return {};
      });

      const res = await processDueAutopaySchedules();
      expect(res.processedCount).toBe(1);
      expect(res.skippedCount).toBe(1);
      expect(res.details[0].error).toContain('Authorization version conflict');
    });

    it('marks schedule EXHAUSTED and skips if monthly spending limit is reached', async () => {
      mockRpc.mockResolvedValue({
        data: [{ schedule_id: TEST_SCHEDULE_ID, authorization_version: 1 }],
        error: null
      });

      let updatedSchedule: any = null;

      mockFrom.mockImplementation((table: string) => {
        if (table === 'autopay_schedules') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: {
                ...baseScheduleRow,
                amount: 50.0,
                max_per_payment: 50.0,
                monthly_spending_limit: 100.0,
                current_month_spent: 80.0 // 80 + 50 = 130 > 100
              },
              error: null
            }),
            update: jest.fn().mockImplementation((updates: any) => {
              updatedSchedule = updates;
              return { eq: jest.fn().mockResolvedValue({ error: null }) };
            })
          };
        }
        return {};
      });

      const res = await processDueAutopaySchedules();
      expect(res.skippedCount).toBe(1);
      expect(res.details[0].error).toContain('Monthly spending limit');
      expect(updatedSchedule.status).toBe('EXHAUSTED');
    });

    it('successfully executes transfer via Circle DCW, advances timestamp, and records execution', async () => {
      mockRpc.mockResolvedValue({
        data: [{ schedule_id: TEST_SCHEDULE_ID, authorization_version: 1 }],
        error: null
      });

      let scheduleUpdates: any = null;
      let insertedExecution: any = null;
      let executionUpdates: any = null;

      mockFrom.mockImplementation((table: string) => {
        if (table === 'autopay_schedules') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: { ...baseScheduleRow },
              error: null
            }),
            update: jest.fn().mockImplementation((updates: any) => {
              scheduleUpdates = updates;
              return { eq: jest.fn().mockResolvedValue({ error: null }) };
            })
          };
        }
        if (table === 'arc_wallets') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: { status: 'ACTIVE', circle_wallet_id: TEST_CIRCLE_WALLET_ID, wallet_address: TEST_SENDER_WALLET },
              error: null
            })
          };
        }
        if (table === 'autopay_executions') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
            insert: jest.fn().mockImplementation((payload: any) => {
              insertedExecution = payload;
              return {
                select: jest.fn().mockReturnThis(),
                single: jest.fn().mockResolvedValue({ data: { id: 'exec-uuid-999', ...payload }, error: null })
              };
            }),
            update: jest.fn().mockImplementation((updates: any) => {
              executionUpdates = updates;
              return { eq: jest.fn().mockResolvedValue({ error: null }) };
            })
          };
        }
        if (table === 'payments') {
          return {
            update: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({ error: null })
            }),
            upsert: jest.fn().mockResolvedValue({ error: null }),
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null })
              })
            })
          };
        }
        if (table === 'payment_ledger') {
          return {
            upsert: jest.fn().mockResolvedValue({ error: null })
          };
        }
        if (table === 'chats' || table === 'messages') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null })
              })
            }),
            insert: jest.fn().mockResolvedValue({ error: null }),
            update: jest.fn().mockReturnValue({
              contains: jest.fn().mockResolvedValue({ error: null })
            })
          };
        }
        return {};
      });

      const res = await processDueAutopaySchedules();

      expect(res.processedCount).toBe(1);
      expect(res.successCount).toBe(1);
      expect(res.details[0].status).toBe('CONFIRMED');
      expect(res.details[0].circleTxId).toBe('circle-tx-successful-id');

      // Verify Circle call
      expect(paymentService.executeTransfer).toHaveBeenCalledWith(
        TEST_CIRCLE_WALLET_ID,
        TEST_USDC_TOKEN_ID,
        TEST_RECIPIENT_WALLET,
        '10.000000',
        expect.any(String),
        'HIGH'
      );

      // Verify Database updates
      expect(insertedExecution).toBeDefined();
      expect(insertedExecution.status).toBe('PENDING');

      expect(executionUpdates.status).toBe('CONFIRMED');
      expect(executionUpdates.circle_tx_id).toBe('circle-tx-successful-id');

      expect(scheduleUpdates.current_month_spent).toBe(10.0);
      expect(scheduleUpdates.next_execution_at).toBeGreaterThan(Date.now());
      expect(scheduleUpdates.consecutive_failures).toBe(0);
      expect(scheduleUpdates.last_execution_status).toBe('CONFIRMED');
    });

    it('handles insufficient funds error, increments failures, and auto-pauses at 3 failures', async () => {
      mockRpc.mockResolvedValue({
        data: [{ schedule_id: TEST_SCHEDULE_ID, authorization_version: 1 }],
        error: null
      });

      (paymentService.executeTransfer as jest.Mock).mockRejectedValue(
        new Error('Insufficient token balance in developer wallet')
      );

      let scheduleUpdates: any = null;

      mockFrom.mockImplementation((table: string) => {
        if (table === 'autopay_schedules') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: {
                ...baseScheduleRow,
                consecutive_failures: 2 // Previous 2 failures; this will trigger threshold >= 3
              },
              error: null
            }),
            update: jest.fn().mockImplementation((updates: any) => {
              scheduleUpdates = updates;
              return { eq: jest.fn().mockResolvedValue({ error: null }) };
            })
          };
        }
        if (table === 'arc_wallets') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: { status: 'ACTIVE', circle_wallet_id: TEST_CIRCLE_WALLET_ID, wallet_address: TEST_SENDER_WALLET },
              error: null
            })
          };
        }
        if (table === 'autopay_executions') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
            insert: jest.fn().mockReturnValue({
              select: jest.fn().mockReturnThis(),
              single: jest.fn().mockResolvedValue({ data: { id: 'exec-uuid-err' }, error: null })
            }),
            update: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({ error: null })
            })
          };
        }
        return {};
      });

      const res = await processDueAutopaySchedules();

      expect(res.processedCount).toBe(1);
      expect(res.failureCount).toBe(1);
      expect(res.details[0].status).toBe('FAILED');
      expect(res.details[0].error).toContain('Insufficient token balance');

      // Schedule should be auto-paused to protect user & network
      expect(scheduleUpdates.status).toBe('PAUSED');
      expect(scheduleUpdates.consecutive_failures).toBe(3);
      expect(scheduleUpdates.last_error_reason).toContain('Auto-paused after 3 consecutive failures');
    });

    it('preserves PENDING state without blindly retrying or auto-pausing when transfer submission status is uncertain (network timeout)', async () => {
      mockRpc.mockResolvedValue({
        data: [{ schedule_id: TEST_SCHEDULE_ID, authorization_version: 1 }],
        error: null
      });

      const timeoutError: any = new Error('Gateway Timeout connecting to Circle API');
      timeoutError.code = 'ETIMEDOUT';
      timeoutError.response = { status: 504 };
      (paymentService.executeTransfer as jest.Mock).mockRejectedValue(timeoutError);

      let executionUpdates: any = null;
      let scheduleUpdated = false;

      mockFrom.mockImplementation((table: string) => {
        if (table === 'autopay_schedules') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: { ...baseScheduleRow, consecutive_failures: 0 },
              error: null
            }),
            update: jest.fn().mockImplementation(() => {
              scheduleUpdated = true;
              return { eq: jest.fn().mockResolvedValue({ error: null }) };
            })
          };
        }
        if (table === 'arc_wallets') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: { status: 'ACTIVE', circle_wallet_id: TEST_CIRCLE_WALLET_ID, wallet_address: TEST_SENDER_WALLET },
              error: null
            })
          };
        }
        if (table === 'autopay_executions') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
            insert: jest.fn().mockReturnValue({
              select: jest.fn().mockReturnThis(),
              single: jest.fn().mockResolvedValue({ data: { id: 'exec-uuid-uncertain' }, error: null })
            }),
            update: jest.fn().mockImplementation((updates: any) => {
              executionUpdates = updates;
              return { eq: jest.fn().mockResolvedValue({ error: null }) };
            })
          };
        }
        return {};
      });

      const res = await processDueAutopaySchedules();

      // Uncertain transaction must NOT be counted as definitive failure or auto-paused
      expect(res.failureCount).toBe(0);
      expect(res.skippedCount).toBe(1);
      expect(res.details[0].status).toBe('SKIPPED');
      expect(res.details[0].error).toContain('Submission status uncertain due to timeout');

      // Execution row must be kept PENDING with reconciliation note
      expect(executionUpdates).toBeDefined();
      expect(executionUpdates.status).toBe('PENDING');
      expect(executionUpdates.error_reason).toContain('Submission status uncertain');

      // Schedule consecutive failures must NOT be incremented
      expect(scheduleUpdated).toBe(false);
    });

    it('marks execution PENDING and retains circle_tx_id when transaction is INITIATED without on-chain confirmation', async () => {
      mockRpc.mockResolvedValue({
        data: [{ schedule_id: TEST_SCHEDULE_ID, authorization_version: 1 }],
        error: null
      });

      // Circle accepts transaction but it has not mined yet
      (paymentService.executeTransfer as jest.Mock).mockResolvedValue({
        id: 'circle-tx-pending-123',
        state: 'INITIATED',
        txHash: undefined
      });

      let scheduleUpdates: any = null;
      let executionUpdates: any = null;

      mockFrom.mockImplementation((table: string) => {
        if (table === 'autopay_schedules') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: { ...baseScheduleRow },
              error: null
            }),
            update: jest.fn().mockImplementation((updates: any) => {
              scheduleUpdates = updates;
              return { eq: jest.fn().mockResolvedValue({ error: null }) };
            })
          };
        }
        if (table === 'arc_wallets') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: { status: 'ACTIVE', circle_wallet_id: TEST_CIRCLE_WALLET_ID, wallet_address: TEST_SENDER_WALLET },
              error: null
            })
          };
        }
        if (table === 'autopay_executions') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
            insert: jest.fn().mockReturnValue({
              select: jest.fn().mockReturnThis(),
              single: jest.fn().mockResolvedValue({ data: { id: 'exec-uuid-pending' }, error: null })
            }),
            update: jest.fn().mockImplementation((updates: any) => {
              executionUpdates = updates;
              return { eq: jest.fn().mockResolvedValue({ error: null }) };
            })
          };
        }
        if (table === 'payments') {
          return {
            update: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({ error: null })
            }),
            upsert: jest.fn().mockResolvedValue({ error: null }),
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null })
              })
            })
          };
        }
        if (table === 'payment_ledger') {
          return {
            upsert: jest.fn().mockResolvedValue({ error: null })
          };
        }
        if (table === 'chats' || table === 'messages') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null })
              })
            }),
            insert: jest.fn().mockResolvedValue({ error: null }),
            update: jest.fn().mockReturnValue({
              contains: jest.fn().mockResolvedValue({ error: null })
            })
          };
        }
        return {};
      });

      const res = await processDueAutopaySchedules();

      expect(res.processedCount).toBe(1);
      expect(res.details[0].status).toBe('PENDING');
      expect(res.details[0].circleTxId).toBe('circle-tx-pending-123');

      // Crucial: Status must be PENDING, not prematurely CONFIRMED
      expect(executionUpdates.status).toBe('PENDING');
      expect(executionUpdates.circle_tx_id).toBe('circle-tx-pending-123');
      expect(executionUpdates.blockchain_tx_hash).toBeNull();

      // Schedule last_execution_status should also be PENDING
      expect(scheduleUpdates.last_execution_status).toBe('PENDING');
      expect(scheduleUpdates.consecutive_failures).toBe(0);
    });

    it('correctly parses nested Circle error details for insufficient funds and schedules safe backoff without immediate pause', async () => {
      mockRpc.mockResolvedValue({
        data: [{ schedule_id: TEST_SCHEDULE_ID, authorization_version: 1 }],
        error: null
      });

      // Simulated Circle error with top-level "API parameter invalid" masking nested insufficient balance
      const circleNestedError: any = new Error('Request failed with status code 400');
      circleNestedError.response = {
        data: {
          code: 2,
          message: 'API parameter invalid',
          details: [
            {
              location: 'amount',
              message: 'the asset amount owned by the wallet is insufficient for the transaction.'
            }
          ]
        }
      };

      (paymentService.executeTransfer as jest.Mock).mockRejectedValue(circleNestedError);

      let scheduleUpdates: any = null;
      let executionUpdates: any = null;

      mockFrom.mockImplementation((table: string) => {
        if (table === 'autopay_schedules') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: {
                ...baseScheduleRow,
                consecutive_failures: 0
              },
              error: null
            }),
            update: jest.fn().mockImplementation((updates: any) => {
              scheduleUpdates = updates;
              return { eq: jest.fn().mockResolvedValue({ error: null }) };
            })
          };
        }
        if (table === 'arc_wallets') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: { status: 'ACTIVE', circle_wallet_id: TEST_CIRCLE_WALLET_ID, wallet_address: TEST_SENDER_WALLET },
              error: null
            })
          };
        }
        if (table === 'autopay_executions') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
            insert: jest.fn().mockReturnValue({
              select: jest.fn().mockReturnThis(),
              single: jest.fn().mockResolvedValue({ data: { id: 'exec-uuid-insufficient' }, error: null })
            }),
            update: jest.fn().mockImplementation((updates: any) => {
              executionUpdates = updates;
              return { eq: jest.fn().mockResolvedValue({ error: null }) };
            })
          };
        }
        return {};
      });

      const res = await processDueAutopaySchedules();

      expect(res.failureCount).toBe(1);
      expect(executionUpdates.status).toBe('FAILED');
      expect(executionUpdates.error_reason).toContain('the asset amount owned by the wallet is insufficient for the transaction.');

      // Must NOT immediately auto-pause on 1st insufficient funds error
      expect(scheduleUpdates.status).toBeUndefined(); // Remains ACTIVE
      expect(scheduleUpdates.consecutive_failures).toBe(1);
      // Next execution pushed forward with backoff (at least 30 minutes)
      expect(scheduleUpdates.next_execution_at).toBeGreaterThan(Date.now() + 29 * 60 * 1000);
    });

    it('reconciles pending executions actively polling Circle and marks CONFIRMED with blockchain_tx_hash', async () => {
      // Simulate an existing PENDING execution in the database
      const pendingExecutionRow = {
        id: 'pending-exec-1',
        schedule_id: TEST_SCHEDULE_ID,
        circle_tx_id: 'circle-pending-op-888',
        status: 'PENDING'
      };

      // Mock getTransactionStatus returning COMPLETE with on-chain txHash
      (paymentService.getTransactionStatus as jest.Mock).mockResolvedValue({
        id: 'circle-pending-op-888',
        state: 'COMPLETE',
        txHash: '0xconfirmedblockchainhash777'
      });

      // No new schedules acquired
      mockRpc.mockResolvedValue({ data: [], error: null });

      let reconciledExecutionUpdate: any = null;
      let reconciledScheduleUpdate: any = null;

      mockFrom.mockImplementation((table: string) => {
        if (table === 'autopay_executions') {
          return {
            select: jest.fn().mockReturnThis(),
            in: jest.fn().mockReturnThis(),
            not: jest.fn().mockReturnThis(),
            order: jest.fn().mockReturnThis(),
            limit: jest.fn().mockResolvedValue({ data: [pendingExecutionRow], error: null }),
            update: jest.fn().mockImplementation((updates: any) => {
              reconciledExecutionUpdate = updates;
              return { eq: jest.fn().mockResolvedValue({ error: null }) };
            })
          };
        }
        if (table === 'autopay_schedules') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                maybeSingle: jest.fn().mockResolvedValue({
                  data: { ...baseScheduleRow, status: 'ACTIVE' },
                  error: null
                })
              })
            }),
            update: jest.fn().mockImplementation((updates: any) => {
              reconciledScheduleUpdate = updates;
              return { eq: jest.fn().mockResolvedValue({ error: null }) };
            })
          };
        }
        if (table === 'payment_ledger' || table === 'payments') {
          return {
            update: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({ error: null })
            })
          };
        }
        return {};
      });

      const res = await processDueAutopaySchedules();

      // Reconciliation should have updated execution to CONFIRMED
      expect(reconciledExecutionUpdate).toBeDefined();
      expect(reconciledExecutionUpdate.status).toBe('CONFIRMED');
      expect(reconciledExecutionUpdate.blockchain_tx_hash).toBe('0xconfirmedblockchainhash777');

      // Schedule status updated to CONFIRMED
      expect(reconciledScheduleUpdate).toBeDefined();
      expect(reconciledScheduleUpdate.last_execution_status).toBe('CONFIRMED');
    });
  });

  // =========================================================================
  // 2. Scheduled Worker API Endpoint (/api/autopay/worker)
  // =========================================================================
  describe('2. Scheduled Worker API Endpoint (/api/autopay/worker)', () => {
    const originalCronSecret = process.env.CRON_SECRET;

    afterEach(() => {
      process.env.CRON_SECRET = originalCronSecret;
    });

    it('returns 503 Service Unavailable when CRON_SECRET is not configured', async () => {
      delete process.env.CRON_SECRET;

      const req = new Request('http://localhost/api/autopay/worker', {
        method: 'POST',
        headers: { authorization: 'Bearer some-key' }
      });

      const res = await workerPostRoute(req);
      expect(res.status).toBe(503);
      const json = await res.json();
      expect(json.error).toContain('Scheduler worker is disabled');
    });

    it('returns 401 Unauthorized when authorization header is missing or incorrect', async () => {
      process.env.CRON_SECRET = 'super-secret-cron-token-123';

      const req1 = new Request('http://localhost/api/autopay/worker', { method: 'POST' });
      const res1 = await workerPostRoute(req1);
      expect(res1.status).toBe(401);

      const req2 = new Request('http://localhost/api/autopay/worker', {
        method: 'POST',
        headers: { authorization: 'Bearer wrong-secret' }
      });
      const res2 = await workerPostRoute(req2);
      expect(res2.status).toBe(401);
    });

    it('returns 200 with batch execution summary on valid CRON_SECRET authorization', async () => {
      process.env.CRON_SECRET = 'super-secret-cron-token-123';

      mockRpc.mockResolvedValue({ data: [], error: null });

      const req = new Request('http://localhost/api/autopay/worker?batchSize=15', {
        method: 'POST',
        headers: { authorization: 'Bearer super-secret-cron-token-123' }
      });

      const res = await workerPostRoute(req);
      expect(res.status).toBe(200);
      const json = await res.json();

      expect(json.success).toBe(true);
      expect(json.summary).toBeDefined();
      expect(json.summary.processed).toBe(0);
      expect(mockRpc).toHaveBeenCalledWith('acquire_due_autopay_schedules', {
        p_limit: 15,
        p_now_epoch: expect.any(Number)
      });
    });

    it('supports GET requests for standard cron runners (e.g. Vercel Cron)', async () => {
      process.env.CRON_SECRET = 'super-secret-cron-token-123';

      mockRpc.mockResolvedValue({ data: [], error: null });

      const req = new Request('http://localhost/api/autopay/worker', {
        method: 'GET',
        headers: { authorization: 'Bearer super-secret-cron-token-123' }
      });

      const res = await workerGetRoute(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
    });
  });
});
