'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Clock,
  Calendar,
  Shield,
  AlertCircle,
  Check,
  ChevronRight,
  Info,
  Sliders,
  DollarSign,
  User,
  Copy,
  Lock,
  ArrowRight
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { AutopayFrequency } from '@/lib/autopay/autopay-types';
import {
  isValidTimezone,
  getTodayZonedDateString,
  validateScheduleDateAndTime,
  getDefaultExecutionTime
} from '@/lib/autopay/schedule-calculator';

interface AutopaySetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (createdSchedule: any) => void;
  recipientAddress: string;
  recipientName?: string;
  recipientPhoto?: string;
  initialAmount?: string;
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

const DAYS_OF_WEEK = [
  { value: 1, shortLabel: 'Mon', fullLabel: 'Monday' },
  { value: 2, shortLabel: 'Tue', fullLabel: 'Tuesday' },
  { value: 3, shortLabel: 'Wed', fullLabel: 'Wednesday' },
  { value: 4, shortLabel: 'Thu', fullLabel: 'Thursday' },
  { value: 5, shortLabel: 'Fri', fullLabel: 'Friday' },
  { value: 6, shortLabel: 'Sat', fullLabel: 'Saturday' },
  { value: 0, shortLabel: 'Sun', fullLabel: 'Sunday' }
];

export function AutopaySetupModal({
  isOpen,
  onClose,
  onSuccess,
  recipientAddress,
  recipientName,
  recipientPhoto,
  initialAmount = '10'
}: AutopaySetupModalProps) {
  // Form State
  const [frequency, setFrequency] = useState<AutopayFrequency>('DAILY');
  const [weeklyDay, setWeeklyDay] = useState<number>(() => new Date().getDay());
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
  const [endDate, setEndDate] = useState<string>('');
  const [hasEndDate, setHasEndDate] = useState(false);
  const [description, setDescription] = useState('');
  
  // Custom Spending Limits
  const [customLimitsEnabled, setCustomLimitsEnabled] = useState(false);
  const [maxPerPayment, setMaxPerPayment] = useState('');
  const [monthlyLimit, setMonthlyLimit] = useState('');
  const [consentAcknowledged, setConsentAcknowledged] = useState(false);

  // UI State
  const [step, setStep] = useState<1 | 2 | 3>(1); // 1: Config, 2: Review & Authorize, 3: Success
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [createdSchedule, setCreatedSchedule] = useState<any>(null);

  // Derived Values
  const amtNum = parseFloat(amount) || 0;
  const computedMaxPerPayment = customLimitsEnabled && maxPerPayment ? parseFloat(maxPerPayment) : amtNum;
  const computedMonthlyLimit = customLimitsEnabled && monthlyLimit
    ? parseFloat(monthlyLimit)
    : (frequency === 'DAILY' ? amtNum * 31 : (frequency === 'WEEKLY' ? amtNum * 5 : amtNum));

  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setErrorMessage(null);
      setConsentAcknowledged(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const validateConfigStep = (): boolean => {
    setErrorMessage(null);
    if (!recipientAddress || !recipientAddress.startsWith('0x') || recipientAddress.length !== 42) {
      setErrorMessage('Invalid recipient EVM address format.');
      return false;
    }
    if (isNaN(amtNum) || amtNum <= 0) {
      setErrorMessage('Please enter a positive recurring amount.');
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
      setErrorMessage('Please confirm your authorization consent to proceed.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      // 1. Get Supabase session token
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) {
        throw new Error('You must be logged in to configure recurring Autopay.');
      }

      // 2. Build payload
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
        monthlyLimit: computedMonthlyLimit
      };

      // 3. POST to /api/autopay/create
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
        throw new Error(data.error || 'Failed to create Autopay schedule');
      }

      setCreatedSchedule(data.schedule);
      setStep(3);
      if (onSuccess) onSuccess(data.schedule);

    } catch (err: any) {
      console.error('Autopay setup error:', err);
      setErrorMessage(err.message || 'Failed to authorize Autopay schedule.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.65)',
      backdropFilter: 'blur(10px)',
      WebkitBackdropFilter: 'blur(10px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 999999,
      padding: 16
    }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        transition={{ type: 'spring', stiffness: 350, damping: 30 }}
        className="lf-card"
        style={{
          width: '100%',
          maxWidth: 440,
          background: 'var(--surface-glass, #111114)',
          borderRadius: 24,
          border: '1px solid var(--border)',
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.35)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '90vh'
        }}
      >
        {/* Header */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--surface)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: 'var(--surface-soft)',
              border: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-primary)'
            }}>
              <Clock size={16} />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
                {step === 3 ? 'Autopay Authorized' : (step === 2 ? 'Review Authorization' : 'Recurring Autopay')}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--text-secondary)', display: 'inline-block' }} />
                <span>Arc Testnet · ArcFun Wallet</span>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: 6,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.15s'
            }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--text-primary)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
          >
            <X size={16} />
          </button>
        </div>

        {/* Content Body */}
        <div style={{ padding: '18px 20px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {errorMessage && (
            <div style={{
              padding: '10px 14px',
              borderRadius: 14,
              background: 'rgba(239, 68, 68, 0.08)',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              color: 'var(--accent-red, #ef4444)',
              fontSize: 12,
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}>
              <AlertCircle size={15} style={{ flexShrink: 0 }} />
              <span>{errorMessage}</span>
            </div>
          )}

          {step === 1 && (
            <>
              {/* Recipient Header Pill */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 14px',
                borderRadius: 16,
                background: 'var(--surface-soft)',
                border: '1px solid var(--border)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {recipientPhoto ? (
                    <img src={recipientPhoto} alt="Recipient" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{
                      width: 32,
                      height: 32,
                      borderRadius: '50%',
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--text-primary)',
                      fontSize: 13,
                      fontWeight: 700
                    }}>
                      {recipientName ? recipientName[0].toUpperCase() : 'U'}
                    </div>
                  )}
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                      {recipientName || 'Recipient'}
                    </div>
                    <div style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--text-muted)' }}>
                      {recipientAddress ? `${recipientAddress.slice(0, 6)}...${recipientAddress.slice(-4)}` : ''}
                    </div>
                  </div>
                </div>

                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '4px 10px',
                  borderRadius: 9999,
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  fontSize: 11,
                  fontWeight: 600,
                  color: 'var(--text-primary)'
                }}>
                  <img src="/arc-logo.png" alt="Arc" style={{ width: 14, height: 14, borderRadius: '50%' }} />
                  <span>Arc Testnet</span>
                </div>
              </div>

              {/* Amount Box (Mirrors ArcFun Chat PayPanel) */}
              <div style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 20,
                padding: '16px 14px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 6,
                boxShadow: '0 2px 10px rgba(0,0,0,0.03)'
              }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Recurring Amount
                </span>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%' }}>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    placeholder="0"
                    value={amount}
                    onChange={e => {
                      const val = e.target.value;
                      if (val === '' || parseFloat(val) >= 0) setAmount(val);
                    }}
                    autoFocus
                    style={{
                      background: 'none',
                      border: 'none',
                      outline: 'none',
                      fontSize: 42,
                      fontWeight: 700,
                      color: 'var(--text-primary)',
                      textAlign: 'center',
                      width: amount ? `${Math.max(amount.length + 1, 2)}ch` : '2ch',
                      minWidth: '2ch',
                      maxWidth: '8ch',
                      letterSpacing: '-0.04em',
                      padding: 0,
                      lineHeight: 1
                    }}
                  />
                </div>

                <div style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 7,
                  background: 'var(--surface-soft)',
                  border: '1px solid var(--border)',
                  borderRadius: 9999,
                  padding: '5px 12px',
                  marginTop: 4
                }}>
                  <img src="/usdc.png" alt="USDC" style={{ width: 16, height: 16, borderRadius: '50%' }} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>USDC</span>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>· Arc Testnet</span>
                </div>
              </div>

              {/* Payment Frequency Switcher (ArcFun .lf-tabs pill strip) */}
              <div>
                <span className="lf-label" style={{ marginBottom: 6 }}>Payment Frequency</span>
                <div
                  style={{
                    display: 'flex',
                    width: '100%',
                    padding: 3,
                    background: 'var(--surface-soft, #f1f5f9)',
                    borderRadius: 9999,
                    border: '1px solid var(--border, #e2e8f0)',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setFrequency('DAILY')}
                    style={{
                      flex: 1,
                      textAlign: 'center',
                      borderRadius: 9999,
                      padding: '8px 10px',
                      fontSize: 12,
                      fontWeight: frequency === 'DAILY' ? 700 : 500,
                      cursor: 'pointer',
                      background: frequency === 'DAILY' ? 'var(--surface, #ffffff)' : 'transparent',
                      color: frequency === 'DAILY' ? 'var(--text-primary, #0f172a)' : 'var(--text-secondary, #64748b)',
                      border: frequency === 'DAILY' ? '1px solid var(--border, rgba(0, 0, 0, 0.08))' : '1px solid transparent',
                      boxShadow: frequency === 'DAILY' ? '0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.04)' : 'none',
                      transition: 'all 0.15s'
                    }}
                  >
                    Daily
                  </button>
                  <button
                    type="button"
                    onClick={() => setFrequency('WEEKLY')}
                    style={{
                      flex: 1,
                      textAlign: 'center',
                      borderRadius: 9999,
                      padding: '8px 10px',
                      fontSize: 12,
                      fontWeight: frequency === 'WEEKLY' ? 700 : 500,
                      cursor: 'pointer',
                      background: frequency === 'WEEKLY' ? 'var(--surface, #ffffff)' : 'transparent',
                      color: frequency === 'WEEKLY' ? 'var(--text-primary, #0f172a)' : 'var(--text-secondary, #64748b)',
                      border: frequency === 'WEEKLY' ? '1px solid var(--border, rgba(0, 0, 0, 0.08))' : '1px solid transparent',
                      boxShadow: frequency === 'WEEKLY' ? '0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.04)' : 'none',
                      transition: 'all 0.15s'
                    }}
                  >
                    Weekly
                  </button>
                  <button
                    type="button"
                    onClick={() => setFrequency('MONTHLY')}
                    style={{
                      flex: 1,
                      textAlign: 'center',
                      borderRadius: 9999,
                      padding: '8px 10px',
                      fontSize: 12,
                      fontWeight: frequency === 'MONTHLY' ? 700 : 500,
                      cursor: 'pointer',
                      background: frequency === 'MONTHLY' ? 'var(--surface, #ffffff)' : 'transparent',
                      color: frequency === 'MONTHLY' ? 'var(--text-primary, #0f172a)' : 'var(--text-secondary, #64748b)',
                      border: frequency === 'MONTHLY' ? '1px solid var(--border, rgba(0, 0, 0, 0.08))' : '1px solid transparent',
                      boxShadow: frequency === 'MONTHLY' ? '0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.04)' : 'none',
                      transition: 'all 0.15s'
                    }}
                  >
                    Monthly
                  </button>
                </div>
              </div>

              {/* Weekly Day Selector (when Weekly) */}
              {frequency === 'WEEKLY' && (
                <div style={{
                  padding: '12px 14px',
                  borderRadius: 16,
                  background: 'var(--surface-soft)',
                  border: '1px solid var(--border)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Execution Day
                    </span>
                    <span style={{
                      fontSize: 11.5,
                      fontWeight: 700,
                      color: 'var(--text-primary)',
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      padding: '2px 8px',
                      borderRadius: 9999
                    }}>
                      Every {DAYS_OF_WEEK.find(d => d.value === weeklyDay)?.fullLabel || 'Monday'}
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: 4 }}>
                    {DAYS_OF_WEEK.map(d => (
                      <button
                        key={d.value}
                        type="button"
                        onClick={() => setWeeklyDay(d.value)}
                        style={{
                          flex: 1,
                          padding: '6px 2px',
                          borderRadius: 8,
                          background: weeklyDay === d.value ? 'var(--surface, #ffffff)' : 'transparent',
                          border: `1px solid ${weeklyDay === d.value ? 'var(--border, rgba(0, 0, 0, 0.08))' : 'transparent'}`,
                          color: weeklyDay === d.value ? 'var(--text-primary, #0f172a)' : 'var(--text-muted, #64748b)',
                          fontSize: 11,
                          fontWeight: weeklyDay === d.value ? 700 : 500,
                          cursor: 'pointer',
                          boxShadow: weeklyDay === d.value ? '0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.04)' : 'none',
                          transition: 'all 0.15s'
                        }}
                      >
                        {d.shortLabel}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Monthly Day Slider / Picker */}
              {frequency === 'MONTHLY' && (
                <div style={{
                  padding: '12px 14px',
                  borderRadius: 16,
                  background: 'var(--surface-soft)',
                  border: '1px solid var(--border)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Execution Day
                    </span>
                    <span style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: 'var(--text-primary)',
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      padding: '2px 8px',
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
                    style={{
                      width: '100%',
                      cursor: 'pointer',
                      accentColor: 'var(--text-primary)'
                    }}
                  />

                  {/* Quick Select Chips */}
                  <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                    {[
                      { day: 1, label: '1st of Month' },
                      { day: 15, label: '15th' },
                      { day: 31, label: 'Last Day (31st)' }
                    ].map(preset => (
                      <button
                        key={preset.day}
                        type="button"
                        onClick={() => setMonthlyDay(preset.day)}
                        style={{
                          flex: 1,
                          padding: '5px 8px',
                          borderRadius: 8,
                          background: monthlyDay === preset.day ? 'var(--surface, #ffffff)' : 'transparent',
                          border: `1px solid ${monthlyDay === preset.day ? 'var(--border, rgba(0, 0, 0, 0.08))' : 'transparent'}`,
                          color: monthlyDay === preset.day ? 'var(--text-primary, #0f172a)' : 'var(--text-muted, #64748b)',
                          fontSize: 10.5,
                          fontWeight: 600,
                          cursor: 'pointer',
                          boxShadow: monthlyDay === preset.day ? '0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.04)' : 'none',
                          transition: 'all 0.15s'
                        }}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>

                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.4 }}>
                    Months with fewer days (e.g. Feb 28/29, Apr 30) automatically execute on the last calendar day.
                  </div>
                </div>
              )}

              {/* Execution Time & Timezone (Matched ArcFun Input Styling) */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.3fr', gap: 10 }}>
                <div style={{
                  padding: '10px 12px',
                  borderRadius: 14,
                  background: 'var(--surface-soft)',
                  border: '1px solid var(--border)'
                }}>
                  <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>
                    Time
                  </label>
                  <input
                    type="time"
                    value={executionTime}
                    onChange={e => setExecutionTime(e.target.value)}
                    style={{
                      width: '100%',
                      background: 'none',
                      border: 'none',
                      outline: 'none',
                      fontSize: 13,
                      fontWeight: 600,
                      color: 'var(--text-primary)'
                    }}
                  />
                </div>

                <div style={{
                  padding: '10px 12px',
                  borderRadius: 14,
                  background: 'var(--surface-soft)',
                  border: '1px solid var(--border)'
                }}>
                  <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>
                    Timezone
                  </label>
                  <select
                    value={timezone}
                    onChange={e => setTimezone(e.target.value)}
                    style={{
                      width: '100%',
                      background: 'none',
                      border: 'none',
                      outline: 'none',
                      fontSize: 12,
                      fontWeight: 600,
                      color: 'var(--text-primary)',
                      cursor: 'pointer'
                    }}
                  >
                    {COMMON_TIMEZONES.map(tz => (
                      <option key={tz.id} value={tz.id} style={{ background: '#18181c', color: '#fff' }}>
                        {tz.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Expandable Advanced Controls */}
              <div style={{
                borderRadius: 14,
                border: '1px solid var(--border)',
                background: 'var(--surface-soft)',
                overflow: 'hidden',
                flexShrink: 0
              }}>
                <button
                  type="button"
                  onClick={() => setCustomLimitsEnabled(!customLimitsEnabled)}
                  style={{
                    width: '100%',
                    minHeight: 40,
                    padding: '10px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-primary)',
                    fontSize: 11,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    cursor: 'pointer'
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <Sliders size={13} style={{ flexShrink: 0, color: 'var(--text-secondary)' }} />
                    <span>Spending Limits & Notes</span>
                  </span>
                  <span style={{ fontSize: 10.5, color: 'var(--text-muted)', fontWeight: 600 }}>
                    {customLimitsEnabled ? 'Hide' : 'Customize'}
                  </span>
                </button>

                {customLimitsEnabled && (
                  <div style={{ padding: '0 14px 14px', display: 'flex', flexDirection: 'column', gap: 10, borderTop: '1px solid var(--border-soft)', paddingTop: 10 }}>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
                        <span>Max Cap Per Payment</span>
                        <span>{computedMaxPerPayment} USDC</span>
                      </div>
                      <input
                        type="number"
                        placeholder={`Defaults to ${amtNum} USDC`}
                        value={maxPerPayment}
                        onChange={e => setMaxPerPayment(e.target.value)}
                        className="lf-input"
                        style={{ padding: '8px 12px', fontSize: 12 }}
                      />
                    </div>

                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
                        <span>Monthly Spending Cap</span>
                        <span>{computedMonthlyLimit} USDC</span>
                      </div>
                      <input
                        type="number"
                        placeholder={`Defaults to ${computedMonthlyLimit} USDC`}
                        value={monthlyLimit}
                        onChange={e => setMonthlyLimit(e.target.value)}
                        className="lf-input"
                        style={{ padding: '8px 12px', fontSize: 12 }}
                      />
                    </div>

                    <div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
                        <span>Note (Optional)</span>
                      </div>
                      <input
                        type="text"
                        placeholder="e.g. Monthly rent, subscription"
                        value={description}
                        onChange={e => setDescription(e.target.value.slice(0, 50))}
                        className="lf-input"
                        style={{ padding: '8px 12px', fontSize: 12 }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {step === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Review Card */}
              <div style={{
                background: 'var(--surface-soft)',
                border: '1px solid var(--border)',
                borderRadius: 18,
                padding: '16px'
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
                  Authorization Summary
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                    <span style={{ color: 'var(--text-muted)' }}>Recurring Amount</span>
                    <span style={{ fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 5 }}>
                      <img src="/usdc.png" alt="USDC" style={{ width: 14, height: 14, borderRadius: '50%' }} />
                      {amtNum} USDC
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                    <span style={{ color: 'var(--text-muted)' }}>Schedule</span>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                      {hasEndDate && endDate && endDate === startDate
                        ? `One-time on ${startDate} at ${executionTime}`
                        : frequency === 'DAILY'
                        ? `Every day at ${executionTime}`
                        : frequency === 'WEEKLY'
                        ? `Every ${DAYS_OF_WEEK.find(d => d.value === weeklyDay)?.fullLabel || 'Monday'} at ${executionTime}`
                        : `Every month on day ${monthlyDay} at ${executionTime}`}
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                    <span style={{ color: 'var(--text-muted)' }}>Timezone</span>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: 12 }}>
                      {timezone}
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                    <span style={{ color: 'var(--text-muted)' }}>Monthly Spending Limit</span>
                    <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                      {computedMonthlyLimit} USDC
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                    <span style={{ color: 'var(--text-muted)' }}>Per-Payment Cap</span>
                    <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                      {computedMaxPerPayment} USDC
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, borderTop: '1px solid var(--border-soft)', paddingTop: 10 }}>
                    <span style={{ color: 'var(--text-muted)' }}>Recipient</span>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: 12 }}>
                      {recipientAddress.slice(0, 8)}...{recipientAddress.slice(-6)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Security & Non-Custodial Disclosure */}
              <div style={{
                padding: '12px 14px',
                borderRadius: 14,
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                display: 'flex',
                gap: 10
              }}>
                <img
                  src="/arcfun-logo.png"
                  alt="ArcFun"
                  style={{ width: 20, height: 20, borderRadius: 6, objectFit: 'cover', flexShrink: 0, marginTop: 2 }}
                />
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  <strong style={{ color: 'var(--text-primary)' }}>Signature-free recurring execution:</strong> Future payments will be automatically transferred from your ArcFun Circle Developer-Controlled Wallet on Arc Testnet. You can pause or cancel anytime from your dashboard.
                </div>
              </div>

              {/* Explicit Consent Checkbox */}
              <label style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
                cursor: 'pointer',
                padding: '8px 4px'
              }}>
                <input
                  type="checkbox"
                  checked={consentAcknowledged}
                  onChange={e => setConsentAcknowledged(e.target.checked)}
                  style={{
                    width: 16,
                    height: 16,
                    marginTop: 2,
                    cursor: 'pointer',
                    accentColor: 'var(--text-primary)'
                  }}
                />
                <span style={{ fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.4 }}>
                  I authorize ArcFun to execute recurring transfers of {amtNum} USDC up to my monthly limit of {computedMonthlyLimit} USDC.
                </span>
              </label>
            </div>
          )}

          {step === 3 && createdSchedule && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '16px 8px', gap: 14 }}>
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
                <h4 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 6px 0' }}>
                  {createdSchedule.endDate && createdSchedule.endDate === createdSchedule.startDate ? 'Payment Scheduled!' : 'Autopay Scheduled!'}
                </h4>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
                  Your {createdSchedule.endDate && createdSchedule.endDate === createdSchedule.startDate ? 'one-time scheduled payment' : 'recurring payment'} of <strong style={{ color: 'var(--text-primary)' }}>{createdSchedule.amount} USDC</strong> will execute automatically on Arc Testnet.
                </p>
              </div>

              <div style={{
                width: '100%',
                padding: '12px 14px',
                borderRadius: 14,
                background: 'var(--surface-soft)',
                border: '1px solid var(--border)',
                fontSize: 12,
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                textAlign: 'left'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Execution:</span>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                    {new Date(createdSchedule.nextExecutionAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Frequency:</span>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                    {createdSchedule.endDate && createdSchedule.endDate === createdSchedule.startDate ? 'ONE-TIME' : createdSchedule.frequency}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div style={{
          padding: '14px 20px',
          borderTop: '1px solid var(--border)',
          display: 'flex',
          gap: 10,
          background: 'var(--surface)'
        }}>
          {step === 1 && (
            <>
              <button
                type="button"
                onClick={onClose}
                className="lf-btn-ghost"
                style={{ flex: 1, padding: '11px 0', borderRadius: 9999, fontSize: 13 }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleProceedToReview}
                className="lf-btn-primary"
                style={{ flex: 1.4, padding: '11px 0', borderRadius: 9999, fontSize: 13 }}
              >
                <span>Review Authorization</span>
                <ChevronRight size={14} />
              </button>
            </>
          )}

          {step === 2 && (
            <>
              <button
                type="button"
                onClick={() => setStep(1)}
                disabled={isSubmitting}
                className="lf-btn-ghost"
                style={{ flex: 1, padding: '11px 0', borderRadius: 9999, fontSize: 13 }}
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleAuthorizeAutopay}
                disabled={isSubmitting || !consentAcknowledged}
                className="lf-btn-primary"
                style={{ flex: 1.6, padding: '11px 0', borderRadius: 9999, fontSize: 13 }}
              >
                {isSubmitting ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span className="animate-spin">⟳</span> Authorizing...
                  </span>
                ) : (
                  <span>Authorize Autopay</span>
                )}
              </button>
            </>
          )}

          {step === 3 && (
            <button
              type="button"
              onClick={onClose}
              className="lf-btn-primary"
              style={{ width: '100%', padding: '12px 0', borderRadius: 9999, fontSize: 13 }}
            >
              Done
            </button>
          )}
        </div>
      </motion.div>
    </div>,
    document.body
  );
}
