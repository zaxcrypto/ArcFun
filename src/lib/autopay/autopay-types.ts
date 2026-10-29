/**
 * ArcFun Autopay Types & Constants
 * Production-ready contract definitions for recurring payments on Arc Testnet.
 */

export const AUTOPAY_SUPPORTED_BLOCKCHAIN = 'ARC-TESTNET' as const;
export const AUTOPAY_SUPPORTED_TOKEN = 'USDC' as const;
export const AUTOPAY_USDC_DECIMALS = 6 as const;
export const AUTOPAY_NETWORK_RESERVE = 0.05 as const; // Required spendable reserve for fees

export type AutopayFrequency = 'DAILY' | 'WEEKLY' | 'MONTHLY';

export type AutopayStatus = 'ACTIVE' | 'PAUSED' | 'CANCELLED' | 'EXHAUSTED';

export type AutopayExecutionStatus = 
  | 'QUEUED'
  | 'SUBMITTING'
  | 'PENDING'
  | 'CONFIRMED'
  | 'FAILED';

export interface AutopaySchedule {
  id: string;
  userId: string;
  senderWallet: string;
  circleWalletId: string;
  recipientAddress: string;
  amount: number;
  token: typeof AUTOPAY_SUPPORTED_TOKEN;
  blockchain: typeof AUTOPAY_SUPPORTED_BLOCKCHAIN;
  frequency: AutopayFrequency;
  executionTime: string; // "HH:mm", 24-hour format
  timezone: string;      // IANA timezone identifier, e.g. "Asia/Kolkata", "America/New_York"
  monthlyDay: number | null; // 1-31, null if frequency is not MONTHLY
  weeklyDay?: number | null; // 0-6 (0=Sun, 1=Mon, etc.), null if frequency is not WEEKLY
  startDate: string;     // ISO Date string YYYY-MM-DD
  endDate: string | null; // ISO Date string YYYY-MM-DD or null for ongoing
  description?: string | null;

  // Spending Controls
  maxPerPayment: number;
  monthlySpendingLimit: number;
  currentMonthSpent: number;
  currentMonthCycle: string; // "YYYY-MM"

  // Execution State
  status: AutopayStatus;
  nextExecutionAt: number; // Unix epoch milliseconds UTC
  lastExecutionAt: number | null;
  lastExecutionStatus: 'SUCCESS' | 'FAILED' | 'PENDING' | 'SKIPPED' | null;
  consecutiveFailures: number;
  lastErrorReason?: string | null;

  // Authorization Tracking
  authorizationVersion: number;
  authorizedAt: number;
  revokedAt: number | null;

  createdAt: number;
  updatedAt: number;
}

export interface AutopayExecution {
  id: string;
  scheduleId: string;
  intentId: string;
  circleTxId: string | null;
  blockchainTxHash: string | null;
  amount: number;
  token: string;
  status: AutopayExecutionStatus;
  scheduledFor: number;
  executedAt: number | null;
  errorReason: string | null;
  retryCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface ScheduleCalculationOptions {
  frequency: AutopayFrequency;
  executionTime: string; // "HH:mm"
  timezone: string;      // e.g. "UTC", "Asia/Kolkata"
  monthlyDay?: number | null; // 1-31
  weeklyDay?: number | null;  // 0-6 (0=Sunday, 1=Monday, etc.)
  startDate?: string;    // "YYYY-MM-DD"
  fromTimestamp?: number; // Defaults to Date.now()
}

export interface FormattedAutopayExecution {
  id: string;
  amount: number;
  token: string;
  status: string;
  circleTxId: string | null;
  blockchainTxHash: string | null;
  scheduledFor: number;
  executedAt: number | null;
  errorReason: string | null;
  createdAt: number;
}

export interface AutopayScheduleResponse {
  id: string;
  senderWallet: string;
  recipientAddress: string;
  amount: number;
  token: string;
  blockchain: string;
  frequency: AutopayFrequency;
  executionTime: string;
  timezone: string;
  monthlyDay: number | null;
  weeklyDay?: number | null;
  startDate: string;
  endDate: string | null;
  description: string | null;
  maxPerPayment: number;
  monthlySpendingLimit: number;
  currentMonthSpent: number;
  currentMonthCycle: string;
  status: AutopayStatus;
  nextExecutionAt: number;
  lastExecutionAt: number | null;
  lastExecutionStatus: string | null;
  consecutiveFailures: number;
  lastErrorReason: string | null;
  authorizationVersion: number;
  authorizedAt: number;
  createdAt: number;
  updatedAt: number;
  recentExecutions?: FormattedAutopayExecution[];
}

