/**
 * Autopay Schedule Calculator Unit Tests
 */

import {
  calculateNextExecutionTimestamp,
  getDaysInMonth,
  getZonedParts,
  zonedTimeToUtc,
  parseExecutionTime,
  isValidTimezone,
  formatNextExecutionInTimezone,
  validateScheduleDateAndTime,
  getDefaultExecutionTime,
  getTodayZonedDateString
} from '../lib/autopay/schedule-calculator';

describe('Autopay Schedule Calculator', () => {

  describe('Timezone & Input Validation', () => {
    it('validates IANA timezones correctly', () => {
      expect(isValidTimezone('UTC')).toBe(true);
      expect(isValidTimezone('Asia/Kolkata')).toBe(true);
      expect(isValidTimezone('America/New_York')).toBe(true);
      expect(isValidTimezone('Europe/London')).toBe(true);
      expect(isValidTimezone('Invalid/Timezone_123')).toBe(false);
      expect(isValidTimezone('')).toBe(false);
    });

    it('parses valid 24-hour execution times', () => {
      expect(parseExecutionTime('00:00')).toEqual({ hour: 0, minute: 0 });
      expect(parseExecutionTime('09:30')).toEqual({ hour: 9, minute: 30 });
      expect(parseExecutionTime('23:59')).toEqual({ hour: 23, minute: 59 });
    });

    it('rejects invalid execution times', () => {
      expect(() => parseExecutionTime('24:00')).toThrow();
      expect(() => parseExecutionTime('-1:00')).toThrow();
      expect(() => parseExecutionTime('12:60')).toThrow();
      expect(() => parseExecutionTime('9:30 AM')).toThrow();
      expect(() => parseExecutionTime('invalid')).toThrow();
    });

    it('calculates exact days in month including leap years', () => {
      // 2026 is non-leap year
      expect(getDaysInMonth(2026, 1)).toBe(31);  // Jan
      expect(getDaysInMonth(2026, 2)).toBe(28);  // Feb
      expect(getDaysInMonth(2026, 3)).toBe(31);  // Mar
      expect(getDaysInMonth(2026, 4)).toBe(30);  // Apr

      // 2028 is leap year
      expect(getDaysInMonth(2028, 2)).toBe(29);  // Feb Leap Year
      // 2000 is leap year
      expect(getDaysInMonth(2000, 2)).toBe(29);
      // 2100 is non-leap year (century divisible by 100 but not 400)
      expect(getDaysInMonth(2100, 2)).toBe(28);
    });
  });

  describe('Timezone Conversions & DST Handling', () => {
    it('accurately converts Asia/Kolkata (UTC+5:30) to UTC', () => {
      // 09:00 AM IST = 03:30 AM UTC
      const utcMs = zonedTimeToUtc(2026, 10, 26, 9, 0, 0, 'Asia/Kolkata');
      const iso = new Date(utcMs).toISOString();
      expect(iso).toBe('2026-10-26T03:30:00.000Z');
      
      const parts = getZonedParts(utcMs, 'Asia/Kolkata');
      expect(parts.year).toBe(2026);
      expect(parts.month).toBe(10);
      expect(parts.day).toBe(26);
      expect(parts.hour).toBe(9);
      expect(parts.minute).toBe(0);
    });

    it('handles America/New_York daylight saving time shifts (EDT vs EST)', () => {
      // Summer (EDT = UTC-4): 09:00 AM EDT should be 13:00 UTC
      const summerUtc = zonedTimeToUtc(2026, 7, 15, 9, 0, 0, 'America/New_York');
      expect(new Date(summerUtc).toISOString()).toBe('2026-07-15T13:00:00.000Z');

      // Winter (EST = UTC-5): 09:00 AM EST should be 14:00 UTC
      const winterUtc = zonedTimeToUtc(2026, 12, 15, 9, 0, 0, 'America/New_York');
      expect(new Date(winterUtc).toISOString()).toBe('2026-12-15T14:00:00.000Z');
    });
  });

  describe('Daily Autopay Scheduling', () => {
    it('schedules for today if scheduled time has not passed yet', () => {
      // Current time: 2026-10-26 07:00 AM IST
      const refTime = zonedTimeToUtc(2026, 10, 26, 7, 0, 0, 'Asia/Kolkata');

      const nextExecution = calculateNextExecutionTimestamp({
        frequency: 'DAILY',
        executionTime: '09:00',
        timezone: 'Asia/Kolkata',
        fromTimestamp: refTime
      });

      // Should execute today at 09:00 AM IST
      const expected = zonedTimeToUtc(2026, 10, 26, 9, 0, 0, 'Asia/Kolkata');
      expect(nextExecution).toBe(expected);
      expect(new Date(nextExecution).toISOString()).toBe('2026-10-26T03:30:00.000Z');
    });

    it('schedules for tomorrow if scheduled time has already passed today', () => {
      // Current time: 2026-10-26 10:15 AM IST
      const refTime = zonedTimeToUtc(2026, 10, 26, 10, 15, 0, 'Asia/Kolkata');

      const nextExecution = calculateNextExecutionTimestamp({
        frequency: 'DAILY',
        executionTime: '09:00',
        timezone: 'Asia/Kolkata',
        fromTimestamp: refTime
      });

      // Should execute tomorrow at 09:00 AM IST
      const expected = zonedTimeToUtc(2026, 10, 27, 9, 0, 0, 'Asia/Kolkata');
      expect(nextExecution).toBe(expected);
      expect(new Date(nextExecution).toISOString()).toBe('2026-10-27T03:30:00.000Z');
    });

    it('handles month-end rollover in daily schedule', () => {
      // Current time: Oct 31, 2026 at 11:00 PM UTC
      const refTime = Date.UTC(2026, 9, 31, 23, 0, 0); // Oct 31, 23:00

      const nextExecution = calculateNextExecutionTimestamp({
        frequency: 'DAILY',
        executionTime: '08:00',
        timezone: 'UTC',
        fromTimestamp: refTime
      });

      // Should roll over to Nov 1, 2026 at 08:00 AM UTC
      const expected = Date.UTC(2026, 10, 1, 8, 0, 0); // Nov 1, 08:00
      expect(nextExecution).toBe(expected);
    });

    it('handles year-end rollover in daily schedule', () => {
      // Current time: Dec 31, 2026 at 11:30 PM UTC
      const refTime = Date.UTC(2026, 11, 31, 23, 30, 0);

      const nextExecution = calculateNextExecutionTimestamp({
        frequency: 'DAILY',
        executionTime: '09:00',
        timezone: 'UTC',
        fromTimestamp: refTime
      });

      // Should roll over to Jan 1, 2027 at 09:00 AM UTC
      const expected = Date.UTC(2027, 0, 1, 9, 0, 0);
      expect(nextExecution).toBe(expected);
    });
  });

  describe('Monthly Autopay Scheduling & Month-End Clamping', () => {
    it('schedules on regular day within current month if future', () => {
      // Current: Oct 5, 2026, Target: Day 15 at 10:00 AM
      const refTime = zonedTimeToUtc(2026, 10, 5, 12, 0, 0, 'UTC');

      const nextExecution = calculateNextExecutionTimestamp({
        frequency: 'MONTHLY',
        monthlyDay: 15,
        executionTime: '10:00',
        timezone: 'UTC',
        fromTimestamp: refTime
      });

      expect(nextExecution).toBe(Date.UTC(2026, 9, 15, 10, 0, 0));
    });

    it('advances to next month if target day in current month has passed', () => {
      // Current: Oct 20, 2026, Target: Day 15 at 10:00 AM
      const refTime = zonedTimeToUtc(2026, 10, 20, 12, 0, 0, 'UTC');

      const nextExecution = calculateNextExecutionTimestamp({
        frequency: 'MONTHLY',
        monthlyDay: 15,
        executionTime: '10:00',
        timezone: 'UTC',
        fromTimestamp: refTime
      });

      // Advances to Nov 15, 2026
      expect(nextExecution).toBe(Date.UTC(2026, 10, 15, 10, 0, 0));
    });

    it('clamps Day 31 to Day 28 in non-leap February (2026)', () => {
      // Current: Jan 31, 2026 at 11:00 AM, Target: Day 31 at 09:00 AM
      // Target time for Jan 31 (09:00) has already passed, so it must schedule for February
      const refTime = zonedTimeToUtc(2026, 1, 31, 11, 0, 0, 'UTC');

      const nextExecution = calculateNextExecutionTimestamp({
        frequency: 'MONTHLY',
        monthlyDay: 31,
        executionTime: '09:00',
        timezone: 'UTC',
        fromTimestamp: refTime
      });

      // Feb 2026 has 28 days -> must clamp to Feb 28, 2026 at 09:00 AM
      const parts = getZonedParts(nextExecution, 'UTC');
      expect(parts.year).toBe(2026);
      expect(parts.month).toBe(2);
      expect(parts.day).toBe(28);
      expect(parts.hour).toBe(9);
      expect(parts.minute).toBe(0);
    });

    it('clamps Day 31 to Day 29 in leap-year February (2028)', () => {
      // Current: Jan 31, 2028 at 11:00 AM, Target: Day 31 at 09:00 AM
      const refTime = zonedTimeToUtc(2028, 1, 31, 11, 0, 0, 'UTC');

      const nextExecution = calculateNextExecutionTimestamp({
        frequency: 'MONTHLY',
        monthlyDay: 31,
        executionTime: '09:00',
        timezone: 'UTC',
        fromTimestamp: refTime
      });

      // Feb 2028 has 29 days -> must clamp to Feb 29, 2028 at 09:00 AM
      const parts = getZonedParts(nextExecution, 'UTC');
      expect(parts.year).toBe(2028);
      expect(parts.month).toBe(2);
      expect(parts.day).toBe(29);
      expect(parts.hour).toBe(9);
      expect(parts.minute).toBe(0);
    });

    it('clamps Day 31 to Day 30 in April (30 days)', () => {
      // Current: March 31, 2026 at 11:00 AM, Target: Day 31 at 09:00 AM
      const refTime = zonedTimeToUtc(2026, 3, 31, 11, 0, 0, 'UTC');

      const nextExecution = calculateNextExecutionTimestamp({
        frequency: 'MONTHLY',
        monthlyDay: 31,
        executionTime: '09:00',
        timezone: 'UTC',
        fromTimestamp: refTime
      });

      // April 2026 has 30 days -> must clamp to April 30, 2026 at 09:00 AM
      const parts = getZonedParts(nextExecution, 'UTC');
      expect(parts.year).toBe(2026);
      expect(parts.month).toBe(4);
      expect(parts.day).toBe(30);
      expect(parts.hour).toBe(9);
      expect(parts.minute).toBe(0);
    });

    it('handles year rollover for monthly schedule (Dec to Jan)', () => {
      // Current: Dec 20, 2026 at 10:00 AM, Target: Day 10 at 09:00 AM
      const refTime = zonedTimeToUtc(2026, 12, 20, 10, 0, 0, 'UTC');

      const nextExecution = calculateNextExecutionTimestamp({
        frequency: 'MONTHLY',
        monthlyDay: 10,
        executionTime: '09:00',
        timezone: 'UTC',
        fromTimestamp: refTime
      });

      // Must roll over to Jan 10, 2027
      const parts = getZonedParts(nextExecution, 'UTC');
      expect(parts.year).toBe(2027);
      expect(parts.month).toBe(1);
      expect(parts.day).toBe(10);
      expect(parts.hour).toBe(9);
      expect(parts.minute).toBe(0);
    });
  });

  describe('Weekly Recurrence Schedule Calculations', () => {
    it('schedules for the target day of the week in the current week if time has not passed', () => {
      // 2026-10-25 is a Sunday (day 0) at 08:00 AM UTC
      const refTime = zonedTimeToUtc(2026, 10, 25, 8, 0, 0, 'UTC');

      // Target: Monday (day 1) at 09:00 AM UTC
      const nextExecution = calculateNextExecutionTimestamp({
        frequency: 'WEEKLY',
        weeklyDay: 1, // Monday
        executionTime: '09:00',
        timezone: 'UTC',
        fromTimestamp: refTime
      });

      // Should be tomorrow: Monday, Oct 26, 2026 at 09:00 AM UTC
      const parts = getZonedParts(nextExecution, 'UTC');
      expect(parts.year).toBe(2026);
      expect(parts.month).toBe(10);
      expect(parts.day).toBe(26);
      expect(parts.hour).toBe(9);
      expect(parts.minute).toBe(0);
    });

    it('advances 7 days to next week if target weekday execution time has already passed today', () => {
      // 2026-10-26 is a Monday (day 1) at 10:00 AM UTC (passed 09:00)
      const refTime = zonedTimeToUtc(2026, 10, 26, 10, 0, 0, 'UTC');

      // Target: Monday (day 1) at 09:00 AM UTC
      const nextExecution = calculateNextExecutionTimestamp({
        frequency: 'WEEKLY',
        weeklyDay: 1, // Monday
        executionTime: '09:00',
        timezone: 'UTC',
        fromTimestamp: refTime
      });

      // Should advance by 7 days to Monday, Nov 2, 2026 at 09:00 AM UTC
      const parts = getZonedParts(nextExecution, 'UTC');
      expect(parts.year).toBe(2026);
      expect(parts.month).toBe(11);
      expect(parts.day).toBe(2);
      expect(parts.hour).toBe(9);
      expect(parts.minute).toBe(0);
    });
  });

  describe('Human-Readable Formatting', () => {
    it('formats timestamps clearly in target timezone', () => {
      const utcMs = zonedTimeToUtc(2026, 10, 26, 9, 30, 0, 'Asia/Kolkata');
      const formatted = formatNextExecutionInTimezone(utcMs, 'Asia/Kolkata');
      expect(formatted).toContain('Oct 26, 2026');
      expect(formatted).toContain('9:30 AM');
      expect(formatted).toContain('GMT+5:30');
    });
  });

  describe('Past Date & Execution Time Validation (Security & Integrity)', () => {
    // Current simulated time: 2026-10-26 at 14:30:00 UTC
    const mockNowUtc = Date.UTC(2026, 9, 26, 14, 30, 0);

    it('rejects a startDate that is in the past (yesterday)', () => {
      const res = validateScheduleDateAndTime({
        frequency: 'DAILY',
        startDate: '2026-10-25',
        executionTime: '15:00',
        timezone: 'UTC',
        now: mockNowUtc
      });
      expect(res.isValid).toBe(false);
      expect(res.error).toContain('Start date cannot be in the past');
    });

    it('rejects a past execution time on today for DAILY frequency', () => {
      // 09:00 AM UTC is before 14:30 UTC on today 2026-10-26
      const res = validateScheduleDateAndTime({
        frequency: 'DAILY',
        startDate: '2026-10-26',
        executionTime: '09:00',
        timezone: 'UTC',
        now: mockNowUtc
      });
      expect(res.isValid).toBe(false);
      expect(res.error).toContain('has already passed for today (2026-10-26) in UTC');
    });

    it('accepts a future execution time on today for DAILY frequency', () => {
      // 16:00 UTC is after 14:30 UTC on today 2026-10-26
      const res = validateScheduleDateAndTime({
        frequency: 'DAILY',
        startDate: '2026-10-26',
        executionTime: '16:00',
        timezone: 'UTC',
        now: mockNowUtc
      });
      expect(res.isValid).toBe(true);
      expect(res.error).toBeUndefined();
    });

    it('accepts any execution time if startDate is in the future (tomorrow)', () => {
      // 09:00 AM on tomorrow (2026-10-27) is in the future
      const res = validateScheduleDateAndTime({
        frequency: 'DAILY',
        startDate: '2026-10-27',
        executionTime: '09:00',
        timezone: 'UTC',
        now: mockNowUtc
      });
      expect(res.isValid).toBe(true);
    });

    it('rejects past execution time when weeklyDay is today (Monday)', () => {
      // 2026-10-26 is a Monday (1)
      const res = validateScheduleDateAndTime({
        frequency: 'WEEKLY',
        startDate: '2026-10-26',
        executionTime: '09:00', // Already passed today at 14:30
        timezone: 'UTC',
        weeklyDay: 1, // Monday
        now: mockNowUtc
      });
      expect(res.isValid).toBe(false);
      expect(res.error).toContain('has already passed for today');
    });

    it('accepts weekly schedule if weeklyDay is a future day of the week', () => {
      // 2026-10-26 is Monday; Friday (5) is upcoming
      const res = validateScheduleDateAndTime({
        frequency: 'WEEKLY',
        startDate: '2026-10-26',
        executionTime: '09:00',
        timezone: 'UTC',
        weeklyDay: 5, // Friday
        now: mockNowUtc
      });
      expect(res.isValid).toBe(true);
    });

    it('rejects past execution time when monthlyDay is today (day 26)', () => {
      const res = validateScheduleDateAndTime({
        frequency: 'MONTHLY',
        startDate: '2026-10-26',
        executionTime: '09:00', // Already passed today at 14:30
        timezone: 'UTC',
        monthlyDay: 26,
        now: mockNowUtc
      });
      expect(res.isValid).toBe(false);
      expect(res.error).toContain('has already passed for today');
    });

    it('accepts monthly schedule if monthlyDay is in the future (day 28)', () => {
      const res = validateScheduleDateAndTime({
        frequency: 'MONTHLY',
        startDate: '2026-10-26',
        executionTime: '09:00',
        timezone: 'UTC',
        monthlyDay: 28,
        now: mockNowUtc
      });
      expect(res.isValid).toBe(true);
    });

    it('computes smart default execution time in future for current timezone', () => {
      const defaultTime = getDefaultExecutionTime('UTC', mockNowUtc);
      // Since mockNow is 14:30, next hour is 15:00
      expect(defaultTime).toBe('15:00');
    });
  });

  describe('End Date Expiration & Exhaustion Boundaries', () => {
    it('detects exhaustion when startDate === endDate and first payment completes', () => {
      const timezone = 'Asia/Kolkata';
      const startDate = '2026-10-26';
      const endDate = '2026-10-26';
      const executionTime = '20:36';

      // First run executed on 2026-10-26 at 20:36
      const executionTimestamp = zonedTimeToUtc(2026, 10, 26, 20, 36, 0, timezone);

      // Engine calculates next execution timestamp starting from the execution moment
      const nextExecutionAt = calculateNextExecutionTimestamp({
        frequency: 'DAILY',
        executionTime,
        timezone,
        startDate,
        fromTimestamp: executionTimestamp
      });

      // Next execution in schedule timezone will be 2026-10-27
      const nextExecutionDateStr = getTodayZonedDateString(timezone, nextExecutionAt);
      expect(nextExecutionDateStr).toBe('2026-10-27');

      // Crucial assertion: next execution strictly exceeds endDate -> schedule MUST be marked EXHAUSTED!
      const isExhausted = Boolean(endDate && nextExecutionDateStr > endDate);
      expect(isExhausted).toBe(true);
    });

    it('allows recurring executions until reaching endDate boundary', () => {
      const timezone = 'Asia/Kolkata';
      const startDate = '2026-10-26';
      const endDate = '2026-10-28';
      const executionTime = '10:00';

      // Run 1: 2026-10-26 10:00
      const run1 = zonedTimeToUtc(2026, 10, 26, 10, 0, 0, timezone);
      const next1 = calculateNextExecutionTimestamp({
        frequency: 'DAILY',
        executionTime,
        timezone,
        startDate,
        fromTimestamp: run1
      });
      const date1 = getTodayZonedDateString(timezone, next1);
      expect(date1).toBe('2026-10-27');
      expect(date1 > endDate).toBe(false); // Still active for 2026-10-27

      // Run 2: 2026-10-27 10:00
      const run2 = zonedTimeToUtc(2026, 10, 27, 10, 0, 0, timezone);
      const next2 = calculateNextExecutionTimestamp({
        frequency: 'DAILY',
        executionTime,
        timezone,
        startDate,
        fromTimestamp: run2
      });
      const date2 = getTodayZonedDateString(timezone, next2);
      expect(date2).toBe('2026-10-28');
      expect(date2 > endDate).toBe(false); // Still active for 2026-10-28

      // Run 3: 2026-10-28 10:00 (Final day)
      const run3 = zonedTimeToUtc(2026, 10, 28, 10, 0, 0, timezone);
      const next3 = calculateNextExecutionTimestamp({
        frequency: 'DAILY',
        executionTime,
        timezone,
        startDate,
        fromTimestamp: run3
      });
      const date3 = getTodayZonedDateString(timezone, next3);
      expect(date3).toBe('2026-10-29');
      // Crucial: 2026-10-29 > 2026-10-28 -> Schedule is now EXHAUSTED!
      expect(date3 > endDate).toBe(true);
    });
  });

});

