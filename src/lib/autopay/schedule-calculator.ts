/**
 * ArcFun Autopay Schedule Calculator
 * Deterministic, timezone-aware daily and monthly recurrence engine with zero external dependencies.
 */

import { AutopayFrequency, ScheduleCalculationOptions } from './autopay-types';

export interface ZonedDateParts {
  year: number;
  month: number; // 1-12
  day: number;   // 1-31
  hour: number;  // 0-23
  minute: number;// 0-59
  second: number;// 0-59
}

/**
 * Validates if a timezone string is a valid IANA timezone identifier.
 */
export function isValidTimezone(timeZone: string): boolean {
  if (!timeZone || typeof timeZone !== 'string') return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Returns the exact number of days in a given year and month (1-12).
 */
export function getDaysInMonth(year: number, month: number): number {
  if (month < 1 || month > 12) {
    throw new Error(`Invalid month: ${month}. Must be between 1 and 12.`);
  }
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Parses "HH:mm" time string into hours and minutes.
 */
export function parseExecutionTime(timeStr: string): { hour: number; minute: number } {
  if (!timeStr || typeof timeStr !== 'string') {
    throw new Error('Execution time must be a string in "HH:mm" 24-hour format');
  }
  const trimmed = timeStr.trim();
  if (!/^\d{1,2}:\d{2}$/.test(trimmed)) {
    throw new Error(`Invalid execution time format: "${timeStr}". Expected "HH:mm" 24-hour format.`);
  }
  const parts = trimmed.split(':');
  const hour = parseInt(parts[0], 10);
  const minute = parseInt(parts[1], 10);
  if (isNaN(hour) || hour < 0 || hour > 23) {
    throw new Error(`Invalid hour in execution time: "${parts[0]}". Must be between 0 and 23.`);
  }
  if (isNaN(minute) || minute < 0 || minute > 59) {
    throw new Error(`Invalid minute in execution time: "${parts[1]}". Must be between 0 and 59.`);
  }
  return { hour, minute };
}

/**
 * Decomposes a UTC timestamp into local date/time parts in the specified timezone.
 */
export function getZonedParts(timestamp: number, timeZone: string): ZonedDateParts {
  if (!isValidTimezone(timeZone)) {
    throw new Error(`Invalid or unsupported timezone: "${timeZone}"`);
  }
  const date = new Date(timestamp);
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false
  });

  const parts = formatter.formatToParts(date);
  const map: Record<string, string> = {};
  for (const p of parts) {
    map[p.type] = p.value;
  }

  let hour = parseInt(map.hour, 10);
  if (hour === 24) hour = 0; // Normalize midnight if returned as 24

  return {
    year: parseInt(map.year, 10),
    month: parseInt(map.month, 10),
    day: parseInt(map.day, 10),
    hour,
    minute: parseInt(map.minute, 10),
    second: parseInt(map.second, 10)
  };
}

/**
 * Returns today's civil date string formatted as "YYYY-MM-DD" in the specified timezone.
 * Replaces unreliable toISOString().split('T')[0] which returns UTC date.
 */
export function getTodayZonedDateString(timeZone: string, timestamp: number = Date.now()): string {
  const parts = getZonedParts(timestamp, timeZone);
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

/**
 * Converts local wall-clock date & time in a given timezone to UTC epoch milliseconds.
 * Implements bidirectional verification to handle Daylight Saving Time (DST) shifts.
 */
export function zonedTimeToUtc(
  year: number,
  month: number, // 1-12
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string
): number {
  if (!isValidTimezone(timeZone)) {
    throw new Error(`Invalid or unsupported timezone: "${timeZone}"`);
  }

  // Initial UTC guess
  const guessUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  const guessParts = getZonedParts(guessUtc, timeZone);
  const guessZonedUtc = Date.UTC(
    guessParts.year,
    guessParts.month - 1,
    guessParts.day,
    guessParts.hour,
    guessParts.minute,
    guessParts.second
  );

  const offset = guessUtc - guessZonedUtc;
  const targetUtc = guessUtc + offset;

  // Verification pass to handle DST boundaries
  const verifyParts = getZonedParts(targetUtc, timeZone);
  const verifyZonedUtc = Date.UTC(
    verifyParts.year,
    verifyParts.month - 1,
    verifyParts.day,
    verifyParts.hour,
    verifyParts.minute,
    verifyParts.second
  );

  if (verifyZonedUtc !== guessUtc) {
    const secondaryOffset = guessUtc - verifyZonedUtc;
    return targetUtc + secondaryOffset;
  }

  return targetUtc;
}

function addDaysToCivilDate(year: number, month: number, day: number, days: number): { year: number; month: number; day: number } {
  const d = new Date(Date.UTC(year, month - 1, day + days));
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate()
  };
}

/**
 * Core Autopay calculation engine.
 * Computes the exact next UTC execution timestamp for a Daily, Weekly, or Monthly schedule.
 */
export function calculateNextExecutionTimestamp(options: ScheduleCalculationOptions): number {
  const {
    frequency,
    executionTime,
    timezone,
    monthlyDay,
    weeklyDay,
    startDate,
    fromTimestamp = Date.now()
  } = options;

  if (!isValidTimezone(timezone)) {
    throw new Error(`Invalid timezone: "${timezone}"`);
  }

  const { hour, minute } = parseExecutionTime(executionTime);

  // If a startDate is given, parse it (YYYY-MM-DD)
  let startZoned: { year: number; month: number; day: number } | null = null;
  if (startDate) {
    const sParts = startDate.trim().split('-');
    if (sParts.length === 3) {
      const y = parseInt(sParts[0], 10);
      const m = parseInt(sParts[1], 10);
      const d = parseInt(sParts[2], 10);
      if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
        startZoned = { year: y, month: m, day: d };
      }
    }
  }

  const currentZoned = getZonedParts(fromTimestamp, timezone);

  // Determine starting reference date in the target timezone
  let refYear = currentZoned.year;
  let refMonth = currentZoned.month;
  let refDay = currentZoned.day;

  if (startZoned) {
    const startUtcCandidate = zonedTimeToUtc(
      startZoned.year,
      startZoned.month,
      startZoned.day,
      hour,
      minute,
      0,
      timezone
    );
    if (startUtcCandidate > fromTimestamp) {
      refYear = startZoned.year;
      refMonth = startZoned.month;
      refDay = startZoned.day;
    }
  }

  if (frequency === 'DAILY') {
    // Attempt today's execution time
    let candidateUtc = zonedTimeToUtc(refYear, refMonth, refDay, hour, minute, 0, timezone);

    // If candidate has already passed or equals fromTimestamp, advance to next day
    if (candidateUtc <= fromTimestamp) {
      const maxDaysInCurrentMonth = getDaysInMonth(refYear, refMonth);
      if (refDay < maxDaysInCurrentMonth) {
        refDay += 1;
      } else {
        refDay = 1;
        if (refMonth < 12) {
          refMonth += 1;
        } else {
          refMonth = 1;
          refYear += 1;
        }
      }
      candidateUtc = zonedTimeToUtc(refYear, refMonth, refDay, hour, minute, 0, timezone);
    }

    return candidateUtc;
  }

  if (frequency === 'WEEKLY') {
    const currentCivilWeekday = new Date(Date.UTC(refYear, refMonth - 1, refDay)).getUTCDay(); // 0 = Sun, 1 = Mon...
    const targetWeekday = (weeklyDay !== undefined && weeklyDay !== null && weeklyDay >= 0 && weeklyDay <= 6)
      ? weeklyDay
      : currentCivilWeekday;

    let daysAhead = (targetWeekday - currentCivilWeekday + 7) % 7;
    let targetCivil = addDaysToCivilDate(refYear, refMonth, refDay, daysAhead);
    let candidateUtc = zonedTimeToUtc(targetCivil.year, targetCivil.month, targetCivil.day, hour, minute, 0, timezone);

    // If candidate has already passed or equals fromTimestamp, advance by 7 days (next week)
    if (candidateUtc <= fromTimestamp) {
      targetCivil = addDaysToCivilDate(targetCivil.year, targetCivil.month, targetCivil.day, 7);
      candidateUtc = zonedTimeToUtc(targetCivil.year, targetCivil.month, targetCivil.day, hour, minute, 0, timezone);
    }

    return candidateUtc;
  }

  if (frequency === 'MONTHLY') {
    const targetDay = monthlyDay && monthlyDay >= 1 && monthlyDay <= 31 ? monthlyDay : refDay;

    // First attempt in refYear, refMonth
    const daysInCurrentMonth = getDaysInMonth(refYear, refMonth);
    const clampedDay = Math.min(targetDay, daysInCurrentMonth);
    let candidateUtc = zonedTimeToUtc(refYear, refMonth, clampedDay, hour, minute, 0, timezone);

    // If candidate has already passed, advance by one month
    if (candidateUtc <= fromTimestamp) {
      let nextYear = refYear;
      let nextMonth = refMonth + 1;
      if (nextMonth > 12) {
        nextMonth = 1;
        nextYear += 1;
      }

      const daysInNextMonth = getDaysInMonth(nextYear, nextMonth);
      const nextClampedDay = Math.min(targetDay, daysInNextMonth);
      candidateUtc = zonedTimeToUtc(nextYear, nextMonth, nextClampedDay, hour, minute, 0, timezone);
    }

    return candidateUtc;
  }

  throw new Error(`Unsupported frequency: "${frequency}"`);
}

/**
 * Human-readable format of an execution timestamp in the target timezone.
 */
export function formatNextExecutionInTimezone(
  timestamp: number,
  timeZone: string,
  locale: string = 'en-US'
): string {
  if (!isValidTimezone(timeZone)) return new Date(timestamp).toUTCString();
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZoneName: 'short'
  }).format(new Date(timestamp));
}

export interface ScheduleDateValidationResult {
  isValid: boolean;
  error?: string;
}

/**
 * Validates that the schedule's startDate and executionTime are not in the past.
 * Strictly prevents configuring recurring schedules whose first execution has already elapsed today.
 */
export function validateScheduleDateAndTime(options: {
  frequency: AutopayFrequency;
  startDate?: string;
  executionTime: string;
  timezone: string;
  weeklyDay?: number | null;
  monthlyDay?: number | null;
  now?: number;
}): ScheduleDateValidationResult {
  const { frequency, startDate, executionTime, timezone, weeklyDay, monthlyDay, now = Date.now() } = options;

  if (!isValidTimezone(timezone)) {
    return { isValid: false, error: `Invalid timezone: "${timezone}"` };
  }

  let parsedTime: { hour: number; minute: number };
  try {
    parsedTime = parseExecutionTime(executionTime);
  } catch (e: any) {
    return { isValid: false, error: e.message || 'Invalid execution time format' };
  }

  const todayInTz = getTodayZonedDateString(timezone, now);
  const effectiveStartDate = startDate && startDate.trim() ? startDate.trim() : todayInTz;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveStartDate)) {
    return { isValid: false, error: 'startDate must be in YYYY-MM-DD format' };
  }

  // Rule 1: Start date cannot be earlier than today in target timezone
  if (effectiveStartDate < todayInTz) {
    return {
      isValid: false,
      error: `Start date cannot be in the past (${effectiveStartDate} is earlier than today ${todayInTz} in ${timezone}).`
    };
  }

  // Rule 2: If start date is today in target timezone, verify first execution is not in the past
  if (effectiveStartDate === todayInTz) {
    const [sYear, sMonth, sDay] = effectiveStartDate.split('-').map(Number);
    const executionUtc = zonedTimeToUtc(sYear, sMonth, sDay, parsedTime.hour, parsedTime.minute, 0, timezone);
    // 30 seconds clock skew tolerance
    const isPastTimeToday = executionUtc < (now - 30000);

    if (frequency === 'DAILY') {
      if (isPastTimeToday) {
        return {
          isValid: false,
          error: `Selected execution time (${executionTime}) has already passed for today (${todayInTz}) in ${timezone}. Please select a future time or choose a later start date.`
        };
      }
    } else if (frequency === 'WEEKLY') {
      const currentCivilWeekday = new Date(Date.UTC(sYear, sMonth - 1, sDay)).getUTCDay();
      const targetWeekday = (weeklyDay !== undefined && weeklyDay !== null && weeklyDay >= 0 && weeklyDay <= 6)
        ? weeklyDay
        : currentCivilWeekday;
      if (targetWeekday === currentCivilWeekday && isPastTimeToday) {
        return {
          isValid: false,
          error: `Selected execution time (${executionTime}) has already passed for today (${todayInTz}) in ${timezone}. Please select a future time or choose a later start date.`
        };
      }
    } else if (frequency === 'MONTHLY') {
      const targetDay = monthlyDay && monthlyDay >= 1 && monthlyDay <= 31 ? monthlyDay : sDay;
      if (targetDay === sDay && isPastTimeToday) {
        return {
          isValid: false,
          error: `Selected execution time (${executionTime}) has already passed for today (${todayInTz}) in ${timezone}. Please select a future time or choose a later start date.`
        };
      }
    }
  }

  return { isValid: true };
}

/**
 * Returns a recommended default execution time in "HH:mm" format,
 * calculated as the next upcoming hour in the specified timezone.
 */
export function getDefaultExecutionTime(timezone: string = 'Asia/Kolkata', nowMs: number = Date.now()): string {
  const parts = getZonedParts(nowMs, timezone);
  let nextHour = parts.hour + 1;
  if (nextHour >= 24) {
    nextHour = 0;
  }
  return `${String(nextHour).padStart(2, '0')}:00`;
}

/**
 * Centralized, authoritative helper to advance an active Autopay schedule after confirmed execution.
 * Enforces:
 * 1. Only advances if schedule is ACTIVE and latest/last execution is CONFIRMED.
 * 2. Checks end_date boundary and marks EXHAUSTED if reached.
 * 3. Advances schedule placeholder row in payments (by schedule.id) without touching historical execution rows.
 */
export interface ScheduleCycleAdvancementResult {
  advanced: boolean;
  isExhausted: boolean;
  nextExecutionAt: number | null;
  status: 'ACTIVE' | 'EXHAUSTED';
}

export async function advanceConfirmedScheduleCycle(
  supabaseAdmin: any,
  schedule: {
    id: string;
    status: string;
    frequency: string;
    execution_time: string;
    timezone?: string;
    monthly_day?: number | null;
    weekly_day?: number | null;
    start_date: string;
    end_date?: string | null;
    next_execution_at?: number | null;
    last_execution_status?: string | null;
  },
  latestExecution?: {
    status?: string | null;
    blockchain_tx_hash?: string | null;
  } | null,
  nowEpoch: number = Date.now()
): Promise<ScheduleCycleAdvancementResult> {
  if (schedule.status !== 'ACTIVE') {
    return {
      advanced: false,
      isExhausted: schedule.status === 'EXHAUSTED',
      nextExecutionAt: schedule.next_execution_at ? Number(schedule.next_execution_at) : null,
      status: schedule.status as any
    };
  }

  const isConfirmed =
    schedule.last_execution_status === 'CONFIRMED' ||
    (latestExecution && (latestExecution.status === 'CONFIRMED' || !!latestExecution.blockchain_tx_hash));

  const isNextPast = Boolean(schedule.next_execution_at && Number(schedule.next_execution_at) <= nowEpoch);

  if (!isConfirmed || !isNextPast) {
    return {
      advanced: false,
      isExhausted: false,
      nextExecutionAt: schedule.next_execution_at ? Number(schedule.next_execution_at) : null,
      status: 'ACTIVE'
    };
  }

  const tz = schedule.timezone || 'Asia/Kolkata';
  const todayIso = getTodayZonedDateString(tz, nowEpoch);
  const isOneTime = Boolean(schedule.start_date && schedule.end_date && schedule.start_date === schedule.end_date);

  // If one-time schedule already completed or passed
  if (isOneTime) {
    const { error: updErr } = await supabaseAdmin
      .from('autopay_schedules')
      .update({
        status: 'EXHAUSTED',
        next_execution_at: null,
        last_execution_status: 'CONFIRMED',
        updated_at: nowEpoch
      })
      .eq('id', schedule.id);

    // If next_execution_at has a NOT NULL constraint on this database, update without nullifying it
    if (updErr) {
      await supabaseAdmin
        .from('autopay_schedules')
        .update({
          status: 'EXHAUSTED',
          last_execution_status: 'CONFIRMED',
          updated_at: nowEpoch
        })
        .eq('id', schedule.id);
    }

    await supabaseAdmin
      .from('payments')
      .update({
        active: false,
        next_payment_at: null,
        status: 'confirmed',
        ...(latestExecution?.blockchain_tx_hash ? { tx_hash: latestExecution.blockchain_tx_hash } : {})
      })
      .eq('id', schedule.id);

    return { advanced: true, isExhausted: true, nextExecutionAt: null, status: 'EXHAUSTED' };
  }

  // Calculate next timestamp
  const nextTimestamp = calculateNextExecutionTimestamp({
    frequency: schedule.frequency as AutopayFrequency,
    executionTime: schedule.execution_time,
    timezone: tz,
    monthlyDay: schedule.monthly_day,
    weeklyDay: schedule.weekly_day,
    startDate: schedule.start_date,
    fromTimestamp: nowEpoch
  });

  const nextZoned = getTodayZonedDateString(tz, nextTimestamp);
  const isExhausted = Boolean(
    schedule.end_date && (schedule.end_date < todayIso || nextZoned > schedule.end_date)
  );

  if (isExhausted) {
    const { error: updErr } = await supabaseAdmin
      .from('autopay_schedules')
      .update({
        status: 'EXHAUSTED',
        next_execution_at: null,
        last_execution_status: 'CONFIRMED',
        updated_at: nowEpoch
      })
      .eq('id', schedule.id);

    if (updErr) {
      await supabaseAdmin
        .from('autopay_schedules')
        .update({
          status: 'EXHAUSTED',
          last_execution_status: 'CONFIRMED',
          updated_at: nowEpoch
        })
        .eq('id', schedule.id);
    }

    await supabaseAdmin
      .from('payments')
      .update({
        active: false,
        next_payment_at: null,
        status: 'confirmed',
        ...(latestExecution?.blockchain_tx_hash ? { tx_hash: latestExecution.blockchain_tx_hash } : {})
      })
      .eq('id', schedule.id);

    return { advanced: true, isExhausted: true, nextExecutionAt: null, status: 'EXHAUSTED' };
  }

  // Advance to next valid cycle
  await supabaseAdmin
    .from('autopay_schedules')
    .update({
      next_execution_at: nextTimestamp,
      last_execution_status: 'CONFIRMED',
      updated_at: nowEpoch
    })
    .eq('id', schedule.id);

  await supabaseAdmin
    .from('payments')
    .update({
      active: true,
      next_payment_at: new Date(nextTimestamp).toISOString(),
      status: 'confirmed',
      ...(latestExecution?.blockchain_tx_hash ? { tx_hash: latestExecution.blockchain_tx_hash } : {})
    })
    .eq('id', schedule.id);

  return { advanced: true, isExhausted: false, nextExecutionAt: nextTimestamp, status: 'ACTIVE' };
}

