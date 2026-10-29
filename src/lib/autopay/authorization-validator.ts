/**
 * ArcFun Autopay Authorization & Validation Engine
 * Enforces zero-trust parameters, wallet ownership, limit accounting, and authorization integrity.
 */

import { isAddress } from 'viem';
import { SupabaseClient } from '@supabase/supabase-js';
import {
  AUTOPAY_SUPPORTED_BLOCKCHAIN,
  AUTOPAY_SUPPORTED_TOKEN,
  AutopayFrequency,
  AutopaySchedule
} from './autopay-types';
import {
  isValidTimezone,
  parseExecutionTime,
  calculateNextExecutionTimestamp,
  getTodayZonedDateString,
  validateScheduleDateAndTime
} from './schedule-calculator';

export interface CreateAutopayInput {
  recipientAddress: string;
  amount: number | string;
  frequency: AutopayFrequency;
  executionTime: string; // "HH:mm"
  timezone: string;      // IANA timezone
  monthlyDay?: number | null;
  weeklyDay?: number | null;
  startDate?: string;    // "YYYY-MM-DD"
  endDate?: string | null; // "YYYY-MM-DD" or null
  description?: string | null;
  maxPerPayment?: number | string;
  monthlyLimit?: number | string;
}

export interface ValidatedAutopayConfig {
  userId: string;
  senderWallet: string;
  circleWalletId: string;
  recipientAddress: string;
  amount: number;
  token: typeof AUTOPAY_SUPPORTED_TOKEN;
  blockchain: typeof AUTOPAY_SUPPORTED_BLOCKCHAIN;
  frequency: AutopayFrequency;
  executionTime: string;
  timezone: string;
  monthlyDay: number | null;
  weeklyDay: number | null;
  startDate: string;
  endDate: string | null;
  description: string | null;
  maxPerPayment: number;
  monthlySpendingLimit: number;
  currentMonthSpent: number;
  currentMonthCycle: string;
  nextExecutionAt: number;
}

/**
 * Validates and sanitizes a recurring payment authorization request.
 * Strictly verifies ownership of sender's ArcFun Circle DCW.
 */
export async function validateAndPrepareAutopay(
  input: CreateAutopayInput,
  user: { id: string },
  supabaseAdmin: SupabaseClient
): Promise<ValidatedAutopayConfig> {
  const {
    recipientAddress,
    amount: rawAmount,
    frequency,
    executionTime,
    timezone,
    monthlyDay,
    startDate: rawStartDate,
    endDate: rawEndDate,
    description,
    maxPerPayment: rawMaxPerPayment,
    monthlyLimit: rawMonthlyLimit
  } = input;

  // 1. Recipient Address Validation
  if (!recipientAddress || typeof recipientAddress !== 'string') {
    throw new Error('Valid recipient address is required');
  }
  const cleanRecipient = recipientAddress.trim().toLowerCase();
  if (!isAddress(cleanRecipient)) {
    throw new Error('Invalid EVM recipient address format');
  }
  if (cleanRecipient === '0x0000000000000000000000000000000000000000') {
    throw new Error('Cannot send Autopay payments to the zero address');
  }

  // 2. Amount Validation (USDC)
  const amount = typeof rawAmount === 'string' ? parseFloat(rawAmount) : Number(rawAmount);
  if (isNaN(amount) || amount <= 0) {
    throw new Error('Amount must be a positive number greater than 0');
  }
  // Decimal precision check (USDC max 6 decimals)
  const decimalParts = amount.toString().split('.');
  if (decimalParts[1] && decimalParts[1].length > 6) {
    throw new Error('USDC amount cannot exceed 6 decimal places');
  }

  // 3. Frequency & Time Validation
  if (frequency !== 'DAILY' && frequency !== 'WEEKLY' && frequency !== 'MONTHLY') {
    throw new Error('Frequency must be either "DAILY", "WEEKLY", or "MONTHLY"');
  }

  // Execution time format HH:mm (24-hour)
  parseExecutionTime(executionTime);

  // Timezone validation
  if (!isValidTimezone(timezone)) {
    throw new Error(`Invalid or unsupported timezone: "${timezone}". Must be a valid IANA timezone identifier.`);
  }

  // Monthly day validation
  let validatedMonthlyDay: number | null = null;
  if (frequency === 'MONTHLY') {
    if (monthlyDay === undefined || monthlyDay === null) {
      throw new Error('monthlyDay (1-31) is required when frequency is MONTHLY');
    }
    const mDay = Number(monthlyDay);
    if (!Number.isInteger(mDay) || mDay < 1 || mDay > 31) {
      throw new Error('monthlyDay must be an integer between 1 and 31');
    }
    validatedMonthlyDay = mDay;
  }

  // Weekly day validation (0=Sun, 1=Mon, ..., 6=Sat)
  let validatedWeeklyDay: number | null = null;
  if (frequency === 'WEEKLY') {
    if (input.weeklyDay !== undefined && input.weeklyDay !== null) {
      const wDay = Number(input.weeklyDay);
      if (!Number.isInteger(wDay) || wDay < 0 || wDay > 6) {
        throw new Error('weeklyDay must be an integer between 0 (Sunday) and 6 (Saturday)');
      }
      validatedWeeklyDay = wDay;
    }
  }

  // 4. Start Date & End Date Validation (in selected timezone)
  const todayIso = getTodayZonedDateString(timezone);
  const startDate = rawStartDate ? rawStartDate.trim() : todayIso;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    throw new Error('startDate must be in YYYY-MM-DD format');
  }

  // If weeklyDay not explicitly supplied, derive from civil weekday of startDate
  if (frequency === 'WEEKLY' && validatedWeeklyDay === null) {
    const [y, m, d] = startDate.split('-').map(Number);
    validatedWeeklyDay = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  }

  // Enforce zero-tolerance validation for past start date or past execution time today
  const scheduleValidation = validateScheduleDateAndTime({
    frequency,
    startDate,
    executionTime,
    timezone,
    weeklyDay: validatedWeeklyDay,
    monthlyDay: validatedMonthlyDay
  });
  if (!scheduleValidation.isValid) {
    throw new Error(scheduleValidation.error || 'Invalid schedule timing');
  }

  let endDate: string | null = null;
  if (rawEndDate && typeof rawEndDate === 'string' && rawEndDate.trim() !== '') {
    endDate = rawEndDate.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      throw new Error('endDate must be in YYYY-MM-DD format');
    }
    if (endDate < startDate) {
      throw new Error('endDate cannot be earlier than startDate');
    }
  }

  // 5. Spending Limits Validation
  const maxPerPayment = rawMaxPerPayment !== undefined && rawMaxPerPayment !== null
    ? (typeof rawMaxPerPayment === 'string' ? parseFloat(rawMaxPerPayment) : Number(rawMaxPerPayment))
    : amount;

  if (isNaN(maxPerPayment) || maxPerPayment < amount) {
    throw new Error(`maxPerPayment (${maxPerPayment}) cannot be less than payment amount (${amount})`);
  }

  // Monthly spending limit
  const defaultMonthlyLimit = frequency === 'DAILY' ? amount * 31 : (frequency === 'WEEKLY' ? amount * 5 : amount);
  const monthlySpendingLimit = rawMonthlyLimit !== undefined && rawMonthlyLimit !== null
    ? (typeof rawMonthlyLimit === 'string' ? parseFloat(rawMonthlyLimit) : Number(rawMonthlyLimit))
    : defaultMonthlyLimit;

  if (isNaN(monthlySpendingLimit) || monthlySpendingLimit < maxPerPayment) {
    throw new Error(`monthlySpendingLimit (${monthlySpendingLimit}) cannot be less than maxPerPayment (${maxPerPayment})`);
  }

  // 6. ArcFun Circle Wallet Ownership Verification
  // MUST strictly look up by authenticated user.id and blockchain = 'ARC-TESTNET'
  const { data: wallet, error: walletErr } = await supabaseAdmin
    .from('arc_wallets')
    .select('circle_wallet_id, wallet_address, status')
    .eq('user_id', user.id)
    .eq('blockchain', AUTOPAY_SUPPORTED_BLOCKCHAIN)
    .maybeSingle();

  if (walletErr || !wallet || !wallet.circle_wallet_id || !wallet.wallet_address) {
    const err = new Error(
      'ArcFun Wallet (Circle DCW) is not initialized or not found for this account on Arc Testnet. Please initialize your ArcFun Wallet first.'
    );
    (err as any).code = 'ARCFUN_WALLET_NOT_FOUND';
    (err as any).status = 404;
    throw err;
  }

  const senderWallet = wallet.wallet_address.toLowerCase();
  if (senderWallet === cleanRecipient) {
    throw new Error('Cannot configure Autopay to send funds to your own ArcFun Wallet address');
  }

  // 7. Active Schedules Abuse Prevention (Limit max active schedules per user to 20)
  const { count: activeCount, error: countErr } = await supabaseAdmin
    .from('autopay_schedules')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('status', 'ACTIVE');

  if (!countErr && (activeCount || 0) >= 20) {
    const err = new Error('Maximum limit of 20 active Autopay schedules reached. Please cancel or pause an unused schedule.');
    (err as any).status = 429;
    throw err;
  }

  // 8. Calculate Next Execution Timestamp
  const nextExecutionAt = calculateNextExecutionTimestamp({
    frequency,
    executionTime,
    timezone,
    monthlyDay: validatedMonthlyDay,
    weeklyDay: validatedWeeklyDay,
    startDate,
    fromTimestamp: Date.now()
  });

  // Calculate current month cycle (YYYY-MM) in target timezone
  const dateObj = new Date(nextExecutionAt);
  const cycleYear = dateObj.getUTCFullYear();
  const cycleMonth = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
  const currentMonthCycle = `${cycleYear}-${cycleMonth}`;

  return {
    userId: user.id,
    senderWallet,
    circleWalletId: wallet.circle_wallet_id,
    recipientAddress: cleanRecipient,
    amount,
    token: AUTOPAY_SUPPORTED_TOKEN,
    blockchain: AUTOPAY_SUPPORTED_BLOCKCHAIN,
    frequency,
    executionTime: executionTime.trim(),
    timezone,
    monthlyDay: validatedMonthlyDay,
    weeklyDay: validatedWeeklyDay,
    startDate,
    endDate,
    description: description ? description.trim().slice(0, 100) : null,
    maxPerPayment,
    monthlySpendingLimit,
    currentMonthSpent: 0.00,
    currentMonthCycle,
    nextExecutionAt
  };
}
