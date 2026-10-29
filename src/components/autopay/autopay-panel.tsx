'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Clock,
  Calendar,
  Shield,
  AlertCircle,
  Check,
  ChevronRight,
  Sliders,
  User,
  Copy,
  Lock,
  ArrowRightLeft,
  Loader2,
  ExternalLink,
  Globe,
  Repeat
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAccount } from 'wagmi';
import { AutopayFrequency } from '@/lib/autopay/autopay-types';
import {
  isValidTimezone,
  getTodayZonedDateString,
  validateScheduleDateAndTime,
  getDefaultExecutionTime
} from '@/lib/autopay/schedule-calculator';
import { getGradientForAddress } from '@/components/chat-manager';

interface AutopayPanelProps {
  onClose: () => void;
  onSwitchToPay?: () => void;
  onOpenDashboard?: () => void;
  recipientAddress: string;
  recipientName?: string;
  recipientPhoto?: string;
  customContacts?: Record<string, { name?: string; colorIndex?: number }>;
  initialAmount?: string;
  onScheduleCreated?: (schedule: any) => Promise<void> | void;
}

const COMMON_TIMEZONES = [
  { id: 'UTC', label: 'UTC (Universal Coordinated Time)' },
  { id: 'America/New_York', label: 'New York (EDT/EST, UTC-4/-5)' },
  { id: 'America/Los_Angeles', label: 'Los Angeles (PDT/PST, UTC-7/-8)' },
  { id: 'America/Chicago', label: 'Chicago (CDT/CST, UTC-5/-6)' },
  { id: 'Europe/London', label: 'London (BST/GMT, UTC+1/+0)' },
  { id: 'Europe/Paris', label: 'Paris (CEST/CET, UTC+2/+1)' },
  { id: 'Europe/Berlin', label: 'Berlin (CEST/CET, UTC+2/+1)' },
  { id: 'Asia/Dubai', label: 'Dubai (GST, UTC+4)' },
  { id: 'Asia/Kolkata', label: 'India (IST, UTC+5:30)' },
  { id: 'Asia/Singapore', label: 'Singapore (SGT, UTC+8)' },
  { id: 'Asia/Tokyo', label: 'Tokyo (JST, UTC+9)' },
  { id: 'Australia/Sydney', label: 'Sydney (AEST/AEDT, UTC+10/+11)' }
];

export const DAYS_OF_WEEK = [
  { value: 1, shortLabel: 'Mon', fullLabel: 'Monday' },
  { value: 2, shortLabel: 'Tue', fullLabel: 'Tuesday' },
  { value: 3, shortLabel: 'Wed', fullLabel: 'Wednesday' },
  { value: 4, shortLabel: 'Thu', fullLabel: 'Thursday' },
  { value: 5, shortLabel: 'Fri', fullLabel: 'Friday' },
  { value: 6, shortLabel: 'Sat', fullLabel: 'Saturday' },
  { value: 0, shortLabel: 'Sun', fullLabel: 'Sunday' }
];

export function AutopayPanel({
  onClose,
  onSwitchToPay,
  onOpenDashboard,
  recipientAddress,
  recipientName,
  recipientPhoto,
  customContacts = {},
  initialAmount = '10',
  onScheduleCreated
}: AutopayPanelProps) {
  // Form State
  const [frequency, setFrequency] = useState<AutopayFrequency>('DAILY');
  const [weeklyDay, setWeeklyDay] = useState<number>(() => {
    return new Date().getDay(); // Default to today's weekday
  });
  const [amount, setAmount] = useState(initialAmount);
  const [timezone, setTimezone] = useState(() => {
    try {
      const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
      return isValidTimezone(detected) ? detected : 'UTC';
    } catch {
      return 'UTC';
    }
  });
  const [executionTime, setExecutionTime] = useState(() => {
    try {
      const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const tz = isValidTimezone(detected) ? detected : 'UTC';
      return getDefaultExecutionTime(tz);
    } catch {
      return '12:00';
    }
  });

  const [monthlyDay, setMonthlyDay] = useState<number>(1);
  const [startDate, setStartDate] = useState(() => {
    try {
      const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const tz = isValidTimezone(detected) ? detected : 'UTC';
      return getTodayZonedDateString(tz);
    } catch {
      return getTodayZonedDateString('UTC');
    }
  });
  const [isCustomStartDate, setIsCustomStartDate] = useState(false);
  const [endDate, setEndDate] = useState<string>('');
  const [hasEndDate, setHasEndDate] = useState(false);
  const [description, setDescription] = useState('');

  // Real-time schedule timing validation warning (prevents configuring past times for today)
  const timingError = React.useMemo(() => {
    if (!startDate || !executionTime) return null;
    const res = validateScheduleDateAndTime({
      frequency,
      startDate,
      executionTime,
      timezone,
      weeklyDay,
      monthlyDay
    });
    return res.isValid ? null : (res.error || null);
  }, [frequency, startDate, executionTime, timezone, weeklyDay, monthlyDay]);

  // Keep default startDate aligned with today in the selected timezone until user customizes
  useEffect(() => {
    if (!isCustomStartDate) {
      setStartDate(getTodayZonedDateString(timezone));
    }
  }, [timezone, isCustomStartDate]);

  // Custom Spending Limits
  const [customLimitsEnabled, setCustomLimitsEnabled] = useState(false);
  const [maxPerPayment, setMaxPerPayment] = useState('');
  const [monthlyLimit, setMonthlyLimit] = useState('');
  const [consentAcknowledged, setConsentAcknowledged] = useState(false);

  // Flow Steps: 1 = Config, 2 = Review, 3 = Success
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [createdSchedule, setCreatedSchedule] = useState<any>(null);

  // Browser Wallet & ArcFun Wallet Authentication Detection
  const { address: connectedBrowserAddress } = useAccount();
  const [isArcWalletAuthenticated, setIsArcWalletAuthenticated] = useState<boolean>(false);

  const verifyAuthStatus = React.useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session || !session.access_token) {
        setIsArcWalletAuthenticated(false);
        return false;
      }
      if (connectedBrowserAddress && session.user?.email) {
        const expectedEmail = `${connectedBrowserAddress.toLowerCase()}@arcfun.xyz`;
        if (session.user.email.toLowerCase() !== expectedEmail) {
          setIsArcWalletAuthenticated(false);
          return false;
        }
      }
      setIsArcWalletAuthenticated(true);
      return true;
    } catch {
      setIsArcWalletAuthenticated(false);
      return false;
    }
  }, [connectedBrowserAddress]);

  useEffect(() => {
    verifyAuthStatus();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.access_token) {
        verifyAuthStatus();
      } else {
        setIsArcWalletAuthenticated(false);
      }
    });

    const handleWalletConnected = () => {
      verifyAuthStatus();
    };

    window.addEventListener('arc-wallet-connected', handleWalletConnected);
    window.addEventListener('focus', verifyAuthStatus);

    let interval: NodeJS.Timeout | null = null;
    if (step === 2 && !isArcWalletAuthenticated) {
      interval = setInterval(verifyAuthStatus, 1500);
    }

    return () => {
      subscription.unsubscribe();
      window.removeEventListener('arc-wallet-connected', handleWalletConnected);
      window.removeEventListener('focus', verifyAuthStatus);
      if (interval) clearInterval(interval);
    };
  }, [verifyAuthStatus, step, isArcWalletAuthenticated]);

  // Existing Active/Paused Schedule Conflict State
  const [existingSchedule, setExistingSchedule] = useState<{
    id: string;
    amount: number;
    token: string;
    frequency: string;
    status: string;
    authorizationVersion: number;
    executionTime?: string;
    timezone?: string;
  } | null>(null);
  const [isCheckingExisting, setIsCheckingExisting] = useState(false);
  const [isCancellingExisting, setIsCancellingExisting] = useState(false);
  const [cancellationError, setCancellationError] = useState<string | null>(null);

  const checkExistingSchedule = React.useCallback(async () => {
    if (!recipientAddress || !recipientAddress.startsWith('0x') || recipientAddress.length !== 42) {
      setExistingSchedule(null);
      return;
    }
    setIsCheckingExisting(true);
    setCancellationError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setIsCheckingExisting(false);
        return;
      }
      const res = await fetch(`/api/autopay/list?recipient=${recipientAddress.toLowerCase()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        const activeOrPaused = (data?.schedules || []).find(
          (s: any) =>
            s.recipientAddress?.toLowerCase() === recipientAddress.toLowerCase() &&
            (s.status === 'ACTIVE' || s.status === 'PAUSED')
        );
        if (activeOrPaused) {
          setExistingSchedule({
            id: activeOrPaused.id,
            amount: Number(activeOrPaused.amount),
            token: activeOrPaused.token || 'USDC',
            frequency: activeOrPaused.frequency,
            status: activeOrPaused.status,
            authorizationVersion: activeOrPaused.authorizationVersion || 1,
            executionTime: activeOrPaused.executionTime,
            timezone: activeOrPaused.timezone
          });
        } else {
          setExistingSchedule(null);
        }
      }
    } catch (e) {
      console.warn('Failed to check existing schedule:', e);
    } finally {
      setIsCheckingExisting(false);
    }
  }, [recipientAddress]);

  useEffect(() => {
    checkExistingSchedule();
  }, [checkExistingSchedule]);

  const handleCancelExistingSchedule = async () => {
    if (!existingSchedule) return;
    const confirmed = window.confirm(
      'Are you sure you want to cancel the existing Autopay schedule for this recipient? This will revoke authorization permanently so you can create a new one.'
    );
    if (!confirmed) return;

    setIsCancellingExisting(true);
    setCancellationError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('Not authenticated');

      const res = await fetch('/api/autopay/update-status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          scheduleId: existingSchedule.id,
          action: 'CANCEL',
          authorizationVersion: existingSchedule.authorizationVersion || 1
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to cancel existing schedule');
      }

      // Successful cancellation: clear existing schedule state and unlock setup form
      setExistingSchedule(null);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('arc_autopay_updated', {
          detail: { scheduleId: existingSchedule.id, action: 'CANCEL' }
        }));
      }
    } catch (err: any) {
      console.error('Cancellation error:', err);
      setCancellationError(err.message || 'Failed to cancel existing schedule.');
    } finally {
      setIsCancellingExisting(false);
    }
  };

  const handleOpenArcWallet = () => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('open-arc-wallet'));
    }
  };

  const contactAlias = recipientName || (recipientAddress ? `${recipientAddress.slice(0, 6)}...${recipientAddress.slice(-4)}` : 'User');
  const avatarGradient = recipientAddress ? getGradientForAddress(recipientAddress, customContacts[recipientAddress.toLowerCase()]?.colorIndex) : 'linear-gradient(135deg, #3b82f6, #1d4ed8)';

  const amtNum = parseFloat(amount) || 0;
  const computedMaxPerPayment = customLimitsEnabled && maxPerPayment ? parseFloat(maxPerPayment) : amtNum;
  const computedMonthlyLimit = customLimitsEnabled && monthlyLimit
    ? parseFloat(monthlyLimit)
    : (frequency === 'DAILY' ? amtNum * 31 : (frequency === 'WEEKLY' ? amtNum * 5 : amtNum));

  const validateConfigStep = (): boolean => {
    setErrorMessage(null);
    if (!recipientAddress || !recipientAddress.startsWith('0x') || recipientAddress.length !== 42) {
      setErrorMessage('Invalid recipient EVM address format.');
      return false;
    }
    if (isNaN(amtNum) || amtNum <= 0) {
      setErrorMessage('Please enter a valid recurring payment amount.');
      return false;
    }
    if (!/^\d{1,2}:\d{2}$/.test(executionTime)) {
      setErrorMessage('Execution time must be in HH:mm 24-hour format.');
      return false;
    }
    if (frequency === 'MONTHLY' && (monthlyDay < 1 || monthlyDay > 31)) {
      setErrorMessage('Monthly payment day must be between 1 and 31.');
      return false;
    }

    if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
      setErrorMessage('Valid start date (YYYY-MM-DD) is required.');
      return false;
    }
    const scheduleValidation = validateScheduleDateAndTime({
      frequency,
      startDate,
      executionTime,
      timezone,
      weeklyDay,
      monthlyDay
    });
    if (!scheduleValidation.isValid) {
      setErrorMessage(scheduleValidation.error || 'Invalid schedule timing.');
      return false;
    }
    if (hasEndDate && endDate) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
        setErrorMessage('End date must be in YYYY-MM-DD format.');
        return false;
      }
      if (endDate < startDate) {
        setErrorMessage('End date cannot be earlier than start date.');
        return false;
      }
    }
    if (customLimitsEnabled) {
      if (computedMaxPerPayment < amtNum) {
        setErrorMessage(`Per-payment cap (${computedMaxPerPayment}) cannot be less than payment amount (${amtNum}).`);
        return false;
      }
      if (computedMonthlyLimit < computedMaxPerPayment) {
        setErrorMessage(`Monthly spending limit (${computedMonthlyLimit}) cannot be less than per-payment cap (${computedMaxPerPayment}).`);
        return false;
      }
    }
    return true;
  };

  const handleProceedToReview = () => {
    if (validateConfigStep()) {
      setStep(2);
    }
  };

  const handleAuthorizeAutopay = async () => {
    if (!consentAcknowledged) {
      setErrorMessage('Please check the consent checkbox to authorize recurring transfers.');
      return;
    }

    if (!isArcWalletAuthenticated) {
      handleOpenArcWallet();
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) {
        setIsArcWalletAuthenticated(false);
        handleOpenArcWallet();
        return;
      }

      const payload = {
        recipientAddress,
        amount: amtNum,
        frequency,
        executionTime,
        timezone,
        monthlyDay: frequency === 'MONTHLY' ? monthlyDay : null,
        weeklyDay: frequency === 'WEEKLY' ? weeklyDay : null,
        startDate,
        endDate: hasEndDate && endDate ? endDate : null,
        description: description.trim() || null,
        maxPerPayment: computedMaxPerPayment,
        monthlyLimit: computedMonthlyLimit,
        senderChatAddress: connectedBrowserAddress || undefined
      };

      const res = await fetch('/api/autopay/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409 && data.code === 'ACTIVE_SCHEDULE_EXISTS' && data.existingSchedule) {
          setExistingSchedule(data.existingSchedule);
          setStep(1);
          setErrorMessage(data.error);
          return;
        }
        throw new Error(data.error || 'Failed to authorize Autopay');
      }

      setCreatedSchedule(data.schedule);
      setStep(3);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('arc_autopay_updated'));
      }
      if (onScheduleCreated) {
        try {
          await onScheduleCreated(data.schedule);
        } catch (callErr) {
          console.warn('onScheduleCreated error:', callErr);
        }
      }
    } catch (err: any) {
      console.error('Autopay setup error:', err);
      setErrorMessage(err.message || 'Failed to authorize Autopay schedule.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{
      height: "100%",
      display: "flex",
      flexDirection: "column",
      background: "var(--surface)",
      position: "relative",
      overflow: "hidden",
      fontFamily: "var(--font-sans, system-ui)"
    }}>
      {/* Header — Identical to PayPanel */}
      <div className="p-3 px-6 pb-4 md:p-[14px] md:px-4 md:pb-5 gap-2 md:gap-3 mx-auto w-full max-w-[380px] md:max-w-none" style={{
        background: "var(--border-soft)",
        borderBottom: "1px solid var(--border)",
        boxShadow: "0 4px 15px rgba(0,0,0,0.03)",
        display: "flex",
        flexDirection: "column",
        borderRadius: "0 0 28px 28px",
        flexShrink: 0
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ position: "relative" }}>
              <div className="w-8 h-8 md:w-[42px] md:h-[42px]" style={{ borderRadius: "50%", border: "1px solid var(--border-soft)", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", background: avatarGradient }}>
                {recipientPhoto ? (
                  <img src={recipientPhoto} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <User style={{ width: "60%", height: "60%", color: "#fff" }} />
                )}
              </div>
            </div>
            <div>
              <div className="text-[13px] md:text-[14px]" style={{ fontWeight: 800, color: "var(--text-primary)" }}>
                Autopay to {contactAlias}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 1 }}>
                <span style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "monospace" }}>
                  {recipientAddress ? `${recipientAddress.slice(0, 8)}...${recipientAddress.slice(-6)}` : ''}
                </span>
                <Copy onClick={() => navigator.clipboard.writeText(recipientAddress)} style={{ width: 11, height: 11, color: "var(--text-muted)", cursor: "pointer" }} />
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button
              onClick={onClose}
              style={{
                width: 30,
                height: 30,
                borderRadius: "50%",
                background: "var(--surface-hover)",
                border: "1px solid var(--border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                color: "var(--text-secondary)"
              }}
            >
              <X style={{ width: 15, height: 15 }} />
            </button>
          </div>
        </div>
      </div>

      {/* Main Body */}
      <div className="p-3 px-6 md:p-[14px] md:px-4 md:pb-4 gap-2 md:gap-3 mx-auto w-full max-w-[380px] md:max-w-none" style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        overflowY: "auto"
      }}>


        {errorMessage && !existingSchedule && errorMessage !== 'You must be logged in to configure recurring Autopay.' && (
          <div style={{
            padding: "9px 12px",
            borderRadius: 12,
            background: "transparent",
            border: "1px solid var(--border)",
            color: "#dc2626",
            fontSize: 11.5,
            display: "flex",
            alignItems: "center",
            gap: 7
          }}>
            <AlertCircle size={14} style={{ flexShrink: 0, color: "#dc2626" }} />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* STEP 1: CONFIGURATION OR EXISTING SCHEDULE CONFLICT */}
        {step === 1 && isCheckingExisting && (
          <div style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            padding: "32px 0",
            flex: 1
          }}>
            <div style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              background: "rgba(37, 99, 235, 0.08)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center"
            }}>
              <Loader2 size={18} style={{ color: "var(--accent, #2563eb)", animation: "spin 1s linear infinite" }} />
            </div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 500 }}>
              Checking existing schedule…
            </div>
            <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {step === 1 && !isCheckingExisting && (
          existingSchedule ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {/* Conflict Notification Card using existing ArcFun border and surface tokens */}
              <div style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 16,
                padding: "18px 16px",
                display: "flex",
                flexDirection: "column",
                gap: 12,
                boxShadow: "0 1px 3px rgba(0,0,0,0.02)"
              }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                  <div style={{
                    width: 32,
                    height: 32,
                    borderRadius: "50%",
                    background: "rgba(37, 99, 235, 0.08)",
                    color: "var(--accent, #2563eb)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0
                  }}>
                    <Repeat style={{ width: 16, height: 16 }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: "var(--text-primary)" }}>
                      {existingSchedule.status === 'PAUSED' ? 'Paused Autopay Exists' : 'Active Autopay Already Exists'}
                    </div>
                    <div style={{ fontSize: 11.5, color: "var(--text-secondary)", marginTop: 2, lineHeight: 1.4 }}>
                      You already have a {existingSchedule.status.toLowerCase()} Autopay schedule for this recipient. You can have at most one active schedule per recipient.
                    </div>
                  </div>
                </div>

                {/* Schedule Summary Pill */}
                <div style={{
                  background: "var(--surface-soft, #f8fafc)",
                  border: "1px solid var(--border-soft, #e2e8f0)",
                  borderRadius: 12,
                  padding: "12px 14px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  textAlign: "center"
                }}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    Existing Plan
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 800, marginTop: 4 }}>
                    <span style={{ color: "#1d4ed8" }}>{existingSchedule.amount.toFixed(2)}</span>{" "}
                    <span style={{ color: "var(--text-primary)" }}>{existingSchedule.token}</span>{" "}
                    <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>• {existingSchedule.frequency}</span>
                  </div>
                </div>

                {cancellationError && (
                  <div style={{
                    padding: "6px 0",
                    color: "#dc2626",
                    fontSize: 11.5,
                    fontWeight: 600
                  }}>
                    {cancellationError}
                  </div>
                )}

                {/* Action Buttons */}
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
                  <button
                    type="button"
                    onClick={() => {
                      if (onOpenDashboard) {
                        onClose();
                        onOpenDashboard();
                      }
                    }}
                    style={{
                      width: "100%",
                      padding: "10px 14px",
                      borderRadius: 12,
                      background: "transparent",
                      border: "none",
                      color: "var(--accent, #2563eb)",
                      fontSize: 12.5,
                      fontWeight: 700,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
                      transition: "all 0.15s"
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.color = "#1d4ed8";
                      e.currentTarget.style.background = "var(--surface-hover, rgba(0,0,0,0.03))";
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.color = "var(--accent, #2563eb)";
                      e.currentTarget.style.background = "transparent";
                    }}
                  >
                    <span>View Existing Autopay</span>
                    <ChevronRight style={{ width: 14, height: 14 }} />
                  </button>

                  <button
                    type="button"
                    onClick={handleCancelExistingSchedule}
                    disabled={isCancellingExisting}
                    style={{
                      width: "100%",
                      padding: "10px 14px",
                      borderRadius: 12,
                      background: "transparent",
                      border: "none",
                      color: "#dc2626",
                      fontSize: 12.5,
                      fontWeight: 700,
                      cursor: isCancellingExisting ? "not-allowed" : "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
                      opacity: isCancellingExisting ? 0.5 : 1,
                      transition: "all 0.15s"
                    }}
                    onMouseEnter={e => {
                      if (!isCancellingExisting) {
                        e.currentTarget.style.color = "#b91c1c";
                        e.currentTarget.style.background = "var(--surface-hover, rgba(0,0,0,0.03))";
                      }
                    }}
                    onMouseLeave={e => {
                      if (!isCancellingExisting) {
                        e.currentTarget.style.color = "#dc2626";
                        e.currentTarget.style.background = "transparent";
                      }
                    }}
                  >
                    {isCancellingExisting ? "Cancelling..." : "Cancel Existing Autopay"}
                  </button>
                </div>
              </div>
            </div>
          ) : (
          <>
            {/* Amount Box (Identical to PayPanel) */}
            <div className="p-3 md:p-4 rounded-[16px] md:rounded-[20px]" style={{
              background: "var(--surface)",
              border: "1px solid var(--border-soft)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              boxShadow: "0 2px 12px rgba(0,0,0,0.04)",
              flexShrink: 0
            }}>
              <span style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                Recurring Amount
              </span>

              {/* Big Amount Input */}
              <div className="mt-1 md:mt-[6px]" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                <input
                  type="number"
                  min="0"
                  step="any"
                  placeholder="0"
                  value={amount}
                  onChange={e => {
                    const val = e.target.value;
                    if (val === "" || parseFloat(val) >= 0) setAmount(val);
                  }}
                  onKeyDown={e => { if (e.key === "-" || e.key === "e") e.preventDefault(); }}
                  className="text-[40px] md:text-[52px]"
                  style={{
                    background: "none",
                    border: "none",
                    outline: "none",
                    fontWeight: 700,
                    color: "var(--text-primary)",
                    width: amount ? `${Math.max(amount.length + 1, 2)}ch` : "2ch",
                    minWidth: "2ch",
                    maxWidth: "10ch",
                    textAlign: "center",
                    letterSpacing: "-0.04em",
                    padding: 0,
                    lineHeight: 1
                  }}
                  autoFocus
                />
              </div>

              {/* Network & Asset Pills */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
                <div style={{
                  background: "var(--surface-soft)",
                  border: "1px solid var(--border)",
                  borderRadius: 24,
                  padding: "6px 12px",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 12,
                  fontWeight: 700,
                  color: "var(--text-primary)"
                }}>
                  <img src="/usdc.png" alt="USDC" style={{ width: 16, height: 16, borderRadius: "50%" }} />
                  <span>USDC</span>
                </div>
                <div style={{
                  background: "var(--surface-soft)",
                  border: "1px solid var(--border)",
                  borderRadius: 24,
                  padding: "6px 12px",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 12,
                  fontWeight: 600,
                  color: "var(--text-primary)"
                }}>
                  <img src="/arc-logo.png" alt="Arc" style={{ width: 15, height: 15, borderRadius: "50%" }} />
                  <span>Arc Testnet</span>
                </div>
              </div>
            </div>

            {/* Frequency Switcher (.lf-tabs pill strip) */}
            <div style={{ flexShrink: 0 }}>
              <span className="lf-label" style={{ marginBottom: 6 }}>Payment Frequency</span>
              <div
                style={{
                  display: "flex",
                  width: "100%",
                  padding: 3,
                  background: "var(--surface-soft, #f1f5f9)",
                  borderRadius: 9999,
                  border: "1px solid var(--border, #e2e8f0)",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.02)"
                }}
              >
                <button
                  type="button"
                  onClick={() => setFrequency("DAILY")}
                  style={{
                    flex: 1,
                    textAlign: "center",
                    borderRadius: 9999,
                    padding: "8px 10px",
                    fontSize: 12,
                    fontWeight: frequency === "DAILY" ? 700 : 500,
                    cursor: "pointer",
                    background: frequency === "DAILY" ? "var(--surface, #ffffff)" : "transparent",
                    color: frequency === "DAILY" ? "var(--text-primary, #0f172a)" : "var(--text-secondary, #64748b)",
                    border: frequency === "DAILY" ? "1px solid var(--border, rgba(0, 0, 0, 0.08))" : "1px solid transparent",
                    boxShadow: frequency === "DAILY" ? "0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.04)" : "none",
                    transition: "all 0.15s"
                  }}
                >
                  Daily
                </button>
                <button
                  type="button"
                  onClick={() => setFrequency("WEEKLY")}
                  style={{
                    flex: 1,
                    textAlign: "center",
                    borderRadius: 9999,
                    padding: "8px 10px",
                    fontSize: 12,
                    fontWeight: frequency === "WEEKLY" ? 700 : 500,
                    cursor: "pointer",
                    background: frequency === "WEEKLY" ? "var(--surface, #ffffff)" : "transparent",
                    color: frequency === "WEEKLY" ? "var(--text-primary, #0f172a)" : "var(--text-secondary, #64748b)",
                    border: frequency === "WEEKLY" ? "1px solid var(--border, rgba(0, 0, 0, 0.08))" : "1px solid transparent",
                    boxShadow: frequency === "WEEKLY" ? "0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.04)" : "none",
                    transition: "all 0.15s"
                  }}
                >
                  Weekly
                </button>
                <button
                  type="button"
                  onClick={() => setFrequency("MONTHLY")}
                  style={{
                    flex: 1,
                    textAlign: "center",
                    borderRadius: 9999,
                    padding: "8px 10px",
                    fontSize: 12,
                    fontWeight: frequency === "MONTHLY" ? 700 : 500,
                    cursor: "pointer",
                    background: frequency === "MONTHLY" ? "var(--surface, #ffffff)" : "transparent",
                    color: frequency === "MONTHLY" ? "var(--text-primary, #0f172a)" : "var(--text-secondary, #64748b)",
                    border: frequency === "MONTHLY" ? "1px solid var(--border, rgba(0, 0, 0, 0.08))" : "1px solid transparent",
                    boxShadow: frequency === "MONTHLY" ? "0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.04)" : "none",
                    transition: "all 0.15s"
                  }}
                >
                  Monthly
                </button>
              </div>
            </div>

            {/* Weekly Day Selector (when Weekly) */}
            {frequency === "WEEKLY" && (
              <div style={{
                padding: "12px 14px",
                borderRadius: 16,
                background: "var(--surface-soft)",
                border: "1px solid var(--border)",
                flexShrink: 0
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase" }}>
                    Execution Day
                  </span>
                  <span style={{
                    fontSize: 11.5,
                    fontWeight: 700,
                    color: "var(--text-primary)",
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    padding: "2px 8px",
                    borderRadius: 9999
                  }}>
                    Every {DAYS_OF_WEEK.find(d => d.value === weeklyDay)?.fullLabel || "Monday"}
                  </span>
                </div>

                <div style={{ display: "flex", gap: 4 }}>
                  {DAYS_OF_WEEK.map(d => (
                    <button
                      key={d.value}
                      type="button"
                      onClick={() => setWeeklyDay(d.value)}
                      style={{
                        flex: 1,
                        padding: "6px 2px",
                        borderRadius: 8,
                        background: weeklyDay === d.value ? "var(--surface, #ffffff)" : "transparent",
                        border: `1px solid ${weeklyDay === d.value ? "var(--border, rgba(0, 0, 0, 0.08))" : "transparent"}`,
                        color: weeklyDay === d.value ? "var(--text-primary, #0f172a)" : "var(--text-muted, #64748b)",
                        fontSize: 11,
                        fontWeight: weeklyDay === d.value ? 700 : 500,
                        cursor: "pointer",
                        boxShadow: weeklyDay === d.value ? "0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.04)" : "none",
                        transition: "all 0.15s"
                      }}
                    >
                      {d.shortLabel}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Monthly Day Slider (when Monthly) */}
            {frequency === "MONTHLY" && (
              <div style={{
                padding: "12px 14px",
                borderRadius: 16,
                background: "var(--surface-soft)",
                border: "1px solid var(--border)",
                flexShrink: 0
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase" }}>
                    Execution Day
                  </span>
                  <span style={{
                    fontSize: 11.5,
                    fontWeight: 700,
                    color: "var(--text-primary)",
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    padding: "2px 8px",
                    borderRadius: 9999
                  }}>
                    Day {monthlyDay}
                  </span>
                </div>

                <input
                  type="range"
                  min="1"
                  max="31"
                  value={monthlyDay}
                  onChange={e => setMonthlyDay(parseInt(e.target.value, 10))}
                  style={{ width: "100%", cursor: "pointer", accentColor: "var(--text-primary)" }}
                />

                <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                  {[
                    { day: 1, label: "1st" },
                    { day: 15, label: "15th" },
                    { day: 31, label: "Last Day" }
                  ].map(preset => (
                    <button
                      key={preset.day}
                      type="button"
                      onClick={() => setMonthlyDay(preset.day)}
                      style={{
                        flex: 1,
                        padding: "4px 8px",
                        borderRadius: 8,
                        background: monthlyDay === preset.day ? "var(--surface, #ffffff)" : "transparent",
                        border: `1px solid ${monthlyDay === preset.day ? "var(--border, rgba(0, 0, 0, 0.08))" : "transparent"}`,
                        color: monthlyDay === preset.day ? "var(--text-primary, #0f172a)" : "var(--text-muted, #64748b)",
                        fontSize: 10.5,
                        fontWeight: 600,
                        cursor: "pointer",
                        boxShadow: monthlyDay === preset.day ? "0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.04)" : "none",
                        transition: "all 0.15s"
                      }}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Execution Schedule 2x2 Grid: Time, Timezone, Start Date, End Date (Equal Size & Height) */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, flexShrink: 0 }}>
              {/* Box 1: Time */}
              <div style={{
                height: 60,
                padding: "8px 12px",
                borderRadius: 14,
                background: "var(--surface-soft)",
                border: timingError ? "1px solid var(--accent-red, #ef4444)" : "1px solid var(--border)",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                boxSizing: "border-box",
                transition: "border 0.2s ease"
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", height: 16 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 700, color: timingError ? "var(--accent-red, #ef4444)" : "var(--text-muted)", textTransform: "uppercase" }}>
                    <Clock size={11} />
                    <span>Time</span>
                  </label>
                  {timingError && (
                    <span style={{ fontSize: 9.5, fontWeight: 700, color: "var(--accent-red, #ef4444)", letterSpacing: "0.02em" }}>
                      Past Time
                    </span>
                  )}
                </div>
                <div style={{ height: 22, display: "flex", alignItems: "center", width: "100%" }}>
                  <input
                    type="time"
                    value={executionTime}
                    onChange={e => {
                      setExecutionTime(e.target.value);
                      if (errorMessage) setErrorMessage(null);
                    }}
                    style={{
                      width: "100%",
                      height: "100%",
                      background: "none",
                      border: "none",
                      outline: "none",
                      fontSize: 12.5,
                      fontWeight: 600,
                      color: "var(--text-primary)",
                      padding: 0
                    }}
                  />
                </div>
              </div>

              {/* Box 2: Timezone */}
              <div style={{
                height: 60,
                padding: "8px 12px",
                borderRadius: 14,
                background: "var(--surface-soft)",
                border: "1px solid var(--border)",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                boxSizing: "border-box"
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", height: 16 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
                    <Globe size={11} />
                    <span>Timezone</span>
                  </label>
                </div>
                <div style={{ height: 22, display: "flex", alignItems: "center", width: "100%" }}>
                  <select
                    value={timezone}
                    onChange={e => {
                      const newTz = e.target.value;
                      setTimezone(newTz);
                      if (errorMessage) setErrorMessage(null);
                    }}
                    style={{
                      width: "100%",
                      height: "100%",
                      background: "none",
                      border: "none",
                      outline: "none",
                      fontSize: 11.5,
                      fontWeight: 600,
                      color: "var(--text-primary)",
                      cursor: "pointer",
                      padding: 0
                    }}
                  >
                    {COMMON_TIMEZONES.map(tz => (
                      <option key={tz.id} value={tz.id} style={{ background: "var(--surface)", color: "var(--text-primary)" }}>
                        {tz.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Box 3: Start Date */}
              <div style={{
                height: 60,
                padding: "8px 12px",
                borderRadius: 14,
                background: "var(--surface-soft)",
                border: (startDate && startDate < getTodayZonedDateString(timezone)) ? "1px solid var(--accent-red, #ef4444)" : "1px solid var(--border)",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                boxSizing: "border-box",
                transition: "border 0.2s ease"
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", height: 16 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 700, color: (startDate && startDate < getTodayZonedDateString(timezone)) ? "var(--accent-red, #ef4444)" : "var(--text-muted)", textTransform: "uppercase" }}>
                    <Calendar size={11} />
                    <span>Start Date</span>
                  </label>
                </div>
                <div style={{ height: 22, display: "flex", alignItems: "center", width: "100%" }}>
                  <input
                    type="date"
                    min={getTodayZonedDateString(timezone)}
                    value={startDate}
                    onChange={e => {
                      setStartDate(e.target.value);
                      setIsCustomStartDate(true);
                      if (errorMessage) setErrorMessage(null);
                    }}
                    style={{
                      width: "100%",
                      height: "100%",
                      background: "none",
                      border: "none",
                      outline: "none",
                      fontSize: 12,
                      fontWeight: 600,
                      color: "var(--text-primary)",
                      cursor: "pointer",
                      padding: 0
                    }}
                  />
                </div>
              </div>

              {/* Box 4: End Date (Optional) */}
              <div style={{
                height: 60,
                padding: "8px 12px",
                borderRadius: 14,
                background: "var(--surface-soft)",
                border: "1px solid var(--border)",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                boxSizing: "border-box"
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", height: 16 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
                    <Calendar size={11} />
                    <span>End Date</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const next = !hasEndDate;
                      setHasEndDate(next);
                      if (!next) setEndDate('');
                      else if (!endDate) setEndDate(startDate);
                    }}
                    style={{
                      background: "none",
                      border: "none",
                      padding: 0,
                      fontSize: 9.5,
                      fontWeight: 700,
                      color: hasEndDate ? "#10b981" : "var(--text-muted)",
                      cursor: "pointer"
                    }}
                  >
                    {hasEndDate ? "Active" : "+ Optional"}
                  </button>
                </div>
                <div style={{ height: 22, display: "flex", alignItems: "center", width: "100%" }}>
                  {hasEndDate ? (
                    <input
                      type="date"
                      min={startDate}
                      value={endDate}
                      onChange={e => setEndDate(e.target.value)}
                      style={{
                        width: "100%",
                        height: "100%",
                        background: "none",
                        border: "none",
                        outline: "none",
                        fontSize: 12,
                        fontWeight: 600,
                        color: "var(--text-primary)",
                        cursor: "pointer",
                        padding: 0
                      }}
                    />
                  ) : (
                    <div
                      onClick={() => {
                        setHasEndDate(true);
                        if (!endDate) setEndDate(startDate);
                      }}
                      style={{
                        width: "100%",
                        height: "100%",
                        display: "flex",
                        alignItems: "center",
                        fontSize: 11.5,
                        color: "var(--text-muted)",
                        cursor: "pointer"
                      }}
                    >
                      No end date (Indefinite)
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Custom Spending Limits Drawer */}
            <div style={{
              borderRadius: 14,
              border: "1px solid var(--border)",
              background: "var(--surface-soft)",
              overflow: "hidden",
              flexShrink: 0
            }}>
              <button
                type="button"
                onClick={() => setCustomLimitsEnabled(!customLimitsEnabled)}
                style={{
                  width: "100%",
                  minHeight: 40,
                  padding: "10px 14px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  background: "none",
                  border: "none",
                  color: "var(--text-primary)",
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  cursor: "pointer"
                }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <Sliders size={13} style={{ flexShrink: 0, color: "var(--text-secondary)" }} />
                  <span>Spending Limits & Notes</span>
                </span>
                <span style={{ fontSize: 10.5, color: "var(--text-muted)", fontWeight: 600 }}>
                  {customLimitsEnabled ? "Hide" : "Customize"}
                </span>
              </button>

              {customLimitsEnabled && (
                <div style={{ padding: "0 12px 12px", display: "flex", flexDirection: "column", gap: 8, borderTop: "1px solid var(--border-soft)", paddingTop: 8 }}>
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, color: "var(--text-muted)", marginBottom: 3 }}>
                      <span>Per-Payment Cap</span>
                      <span>{computedMaxPerPayment} USDC</span>
                    </div>
                    <input
                      type="number"
                      placeholder={`Defaults to ${amtNum} USDC`}
                      value={maxPerPayment}
                      onChange={e => setMaxPerPayment(e.target.value)}
                      className="lf-input"
                      style={{ padding: "7px 12px", fontSize: 11.5 }}
                    />
                  </div>

                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, color: "var(--text-muted)", marginBottom: 3 }}>
                      <span>Monthly Spending Cap</span>
                      <span>{computedMonthlyLimit} USDC</span>
                    </div>
                    <input
                      type="number"
                      placeholder={`Defaults to ${computedMonthlyLimit} USDC`}
                      value={monthlyLimit}
                      onChange={e => setMonthlyLimit(e.target.value)}
                      className="lf-input"
                      style={{ padding: "7px 12px", fontSize: 11.5 }}
                    />
                  </div>

                  <div>
                    <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginBottom: 3 }}>
                      <span>Note (Optional)</span>
                    </div>
                    <input
                      type="text"
                      placeholder="e.g. Monthly rent, subscription"
                      value={description}
                      onChange={e => setDescription(e.target.value.slice(0, 50))}
                      className="lf-input"
                      style={{ padding: "7px 12px", fontSize: 11.5 }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Actions Section with matching padding */}
            <div style={{ marginTop: 12, flexShrink: 0, display: "flex", flexDirection: "column", gap: 10, paddingBottom: "24px", paddingTop: "10px" }}>
              {/* Wallet Info Pill (Centered above Review button, compact width with curved border) */}
              <div style={{
                alignSelf: "center",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 9999,
                padding: "7px 18px",
                boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04)"
              }}>
                <img
                  src="/arcfun-logo.png"
                  alt="ArcFun"
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 5,
                    objectFit: "cover",
                    flexShrink: 0
                  }}
                />
                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.01em" }}>
                  ArcFun Wallet
                </span>
              </div>

              {/* Review CTA Button */}
              <button
                type="button"
                onClick={handleProceedToReview}
                className="lf-btn-primary"
                style={{
                  width: "100%",
                  padding: "13px 20px",
                  borderRadius: 9999,
                  fontSize: 13,
                  fontWeight: 700
                }}
              >
                <span>Review Authorization</span>
                <ChevronRight size={14} />
              </button>
            </div>
          </>
        ))}

        {/* STEP 2: REVIEW & AUTHORIZE */}
        {step === 2 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{
              background: "var(--surface-soft)",
              border: "1px solid var(--border)",
              borderRadius: 18,
              padding: "14px"
            }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>
                Authorization Summary
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12.5 }}>
                  <span style={{ color: "var(--text-muted)" }}>Recurring Amount</span>
                  <span style={{ fontWeight: 700, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: 5 }}>
                    <img src="/usdc.png" alt="USDC" style={{ width: 14, height: 14, borderRadius: "50%" }} />
                    {amtNum} USDC
                  </span>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12.5 }}>
                  <span style={{ color: "var(--text-muted)" }}>Schedule</span>
                  <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                    {hasEndDate && endDate && endDate === startDate
                      ? `One-time on ${startDate} at ${executionTime}`
                      : frequency === "DAILY"
                      ? `Every day at ${executionTime}`
                      : frequency === "WEEKLY"
                      ? `Every ${DAYS_OF_WEEK.find(d => d.value === weeklyDay)?.fullLabel || "Monday"} at ${executionTime}`
                      : `Every month on day ${monthlyDay} at ${executionTime}`}
                  </span>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12.5 }}>
                  <span style={{ color: "var(--text-muted)" }}>Start Date</span>
                  <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                    {startDate}
                  </span>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12.5 }}>
                  <span style={{ color: "var(--text-muted)" }}>End Date</span>
                  <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                    {hasEndDate && endDate ? endDate : "Indefinite"}
                  </span>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12.5 }}>
                  <span style={{ color: "var(--text-muted)" }}>Timezone</span>
                  <span style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: 11.5 }}>
                    {timezone}
                  </span>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12.5 }}>
                  <span style={{ color: "var(--text-muted)" }}>Monthly Cap</span>
                  <span style={{ fontWeight: 700, color: "var(--text-primary)" }}>
                    {computedMonthlyLimit} USDC
                  </span>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12.5 }}>
                  <span style={{ color: "var(--text-muted)" }}>Per-Payment Cap</span>
                  <span style={{ fontWeight: 700, color: "var(--text-primary)" }}>
                    {computedMaxPerPayment} USDC
                  </span>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, borderTop: "1px solid var(--border-soft)", paddingTop: 8 }}>
                  <span style={{ color: "var(--text-muted)" }}>Recipient</span>
                  <span style={{ fontWeight: 600, color: "var(--text-primary)", fontFamily: "monospace" }}>
                    {recipientAddress.slice(0, 8)}...{recipientAddress.slice(-6)}
                  </span>
                </div>
              </div>
            </div>

            {/* Non-custodial disclosure */}
            <div style={{
              padding: "10px 12px",
              borderRadius: 12,
              background: "var(--surface)",
              border: "1px solid var(--border)",
              display: "flex",
              gap: 8
            }}>
              <img
                src="/arcfun-logo.png"
                alt="ArcFun"
                style={{ width: 18, height: 18, borderRadius: 5, objectFit: "cover", flexShrink: 0, marginTop: 2 }}
              />
              <div style={{ fontSize: 10.5, color: "var(--text-secondary)", lineHeight: 1.45 }}>
                Automated transfers execute from your ArcFun Circle Wallet on Arc Testnet up to your monthly cap. Pause or cancel anytime.
              </div>
            </div>

            {/* Explicit Consent Checkbox */}
            <label style={{ display: "flex", alignItems: "flex-start", gap: 9, cursor: "pointer", padding: "4px 2px" }}>
              <input
                type="checkbox"
                checked={consentAcknowledged}
                onChange={e => setConsentAcknowledged(e.target.checked)}
                style={{ width: 15, height: 15, marginTop: 2, cursor: "pointer", accentColor: "var(--text-primary)" }}
              />
              <span style={{ fontSize: 11.5, color: "var(--text-primary)", lineHeight: 1.4 }}>
                I authorize ArcFun to execute recurring transfers of {amtNum} USDC up to my monthly limit of {computedMonthlyLimit} USDC.
              </span>
            </label>

            {!isArcWalletAuthenticated && (
              <div style={{
                color: "#2563eb",
                fontSize: 11,
                lineHeight: 1.4,
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "2px 2px",
                background: "none",
                border: "none"
              }}>
                <Lock size={12} style={{ flexShrink: 0 }} />
                <span>Browser wallet verification required. Click &quot;Sign in ArcFun Wallet&quot; to unlock.</span>
              </div>
            )}

            {/* Action buttons */}
            <div style={{ display: "flex", gap: 8, marginTop: "auto", paddingBottom: "24px", paddingTop: "10px" }}>
              <button
                type="button"
                onClick={() => setStep(1)}
                disabled={isSubmitting}
                className="lf-btn-ghost"
                style={{ flex: "0 0 76px", padding: "12px 0", borderRadius: 9999, fontSize: 12.5 }}
              >
                Back
              </button>
              {!isArcWalletAuthenticated ? (
                <button
                  type="button"
                  onClick={handleOpenArcWallet}
                  className="lf-btn-primary"
                  style={{
                    flex: 1,
                    padding: "12px 10px",
                    borderRadius: 9999,
                    fontSize: 12,
                    fontWeight: 700,
                    whiteSpace: "nowrap",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6
                  }}
                >
                  <Lock size={13} style={{ flexShrink: 0 }} />
                  <span className="inline md:hidden">Sign In</span>
                  <span className="hidden md:inline">Sign in ArcFun Wallet</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleAuthorizeAutopay}
                  disabled={isSubmitting || !consentAcknowledged}
                  className="lf-btn-primary"
                  style={{ flex: 1, padding: "12px 10px", borderRadius: 9999, fontSize: 12.5, whiteSpace: "nowrap" }}
                >
                  {isSubmitting ? (
                    <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, whiteSpace: "nowrap" }}>
                      <Loader2 size={14} className="animate-spin" /> Authorizing...
                    </span>
                  ) : (
                    <span>Authorize Autopay</span>
                  )}
                </button>
              )}
            </div>
          </div>
        )}

        {/* STEP 3: SUCCESS */}
        {step === 3 && createdSchedule && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "20px 8px", gap: 14 }}>
            {/* Professional Clean Live Success Tick */}
            <div style={{
              position: "relative",
              width: 56,
              height: 56,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              animation: "liveBadgePop 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards"
            }}>
              {/* Subtle outer soft ring (no neon/smoke) */}
              <div style={{
                position: "absolute",
                inset: 0,
                borderRadius: "50%",
                background: "rgba(21, 128, 61, 0.08)",
                border: "1px solid rgba(21, 128, 61, 0.18)"
              }} />

              {/* Rich dark green solid badge */}
              <div style={{
                width: 44,
                height: 44,
                borderRadius: "50%",
                background: "#15803d",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 2px 10px rgba(21, 128, 61, 0.25)",
                position: "relative",
                zIndex: 1
              }}>
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth="3.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path
                    d="M4.5 12.75l5 5 10-11"
                    style={{
                      strokeDasharray: 28,
                      strokeDashoffset: 0,
                      animation: "liveCheckStroke 0.42s cubic-bezier(0.65, 0, 0.45, 1) forwards"
                    }}
                  />
                </svg>
              </div>
            </div>

            <div>
              <h4 style={{ fontSize: 17, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 6px 0" }}>
                {createdSchedule.endDate && createdSchedule.endDate === createdSchedule.startDate ? "Payment Scheduled!" : "Autopay Scheduled!"}
              </h4>
              <p style={{ fontSize: 12.5, color: "var(--text-muted)", margin: 0, lineHeight: 1.5 }}>
                Your {createdSchedule.endDate && createdSchedule.endDate === createdSchedule.startDate ? "one-time scheduled payment" : "recurring payment"} of <strong style={{ color: "var(--text-primary)" }}>{createdSchedule.amount} USDC</strong> is now active on Arc Testnet.
              </p>
            </div>

            <div style={{
              width: "100%",
              padding: "12px 14px",
              borderRadius: 14,
              background: "var(--surface-soft)",
              border: "1px solid var(--border)",
              fontSize: 11.5,
              display: "flex",
              flexDirection: "column",
              gap: 6,
              textAlign: "left"
            }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--text-muted)" }}>Execution:</span>
                <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                  {new Date(createdSchedule.nextExecutionAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--text-muted)" }}>Frequency:</span>
                <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                  {createdSchedule.endDate && createdSchedule.endDate === createdSchedule.startDate ? "ONE-TIME" : createdSchedule.frequency}
                </span>
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, width: "100%", marginTop: "auto", paddingBottom: "24px", paddingTop: "10px" }}>
              {onOpenDashboard && (
                <button
                  type="button"
                  onClick={onOpenDashboard}
                  className="lf-btn-ghost"
                  style={{ flex: 1, padding: "12px 0", borderRadius: 9999, fontSize: 12.5 }}
                >
                  View Auto-Pays
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="lf-btn-primary"
                style={{ flex: 1, padding: "12px 0", borderRadius: 9999, fontSize: 12.5 }}
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
