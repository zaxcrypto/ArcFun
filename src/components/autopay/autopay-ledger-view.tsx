'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Clock,
  Play,
  Pause,
  Trash2,
  ExternalLink,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Plus,
  RefreshCw,
  Copy,
  ChevronDown,
  ChevronUp,
  Calendar,
  Loader2,
  AlertCircle,
  Repeat,
  Check,
  ShieldCheck,
  User,
  Users
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { AutopayScheduleResponse, FormattedAutopayExecution } from '@/lib/autopay/autopay-types';

interface AutopayLedgerViewProps {
  recipientAddress?: string;
  recipientName?: string;
  senderAddress?: string;
  activeScheduleFallback?: any;
  onOpenSetup?: () => void;
}

type FilterTab = 'ALL' | 'ACTIVE' | 'PAUSED' | 'CANCELLED';
type ScopeTab = 'CONTACT' | 'ALL';

// ─────────────────────────────────────────────────────────────────────────────
// SKELETON SHIMMER LAYOUT FOR AUTOPAY SCHEDULES & EXECUTIONS
// ─────────────────────────────────────────────────────────────────────────────
export function AutopayLedgerSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="arc-skeleton-shimmer"
          style={{
            background: 'var(--surface)',
            borderRadius: 16,
            border: '1px solid var(--border)',
            padding: '16px 18px',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
            minHeight: 120
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 42, height: 42, borderRadius: '50%', background: 'var(--border-soft)' }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ width: 120, height: 16, borderRadius: 4, background: 'var(--border-soft)' }} />
                <div style={{ width: 170, height: 11, borderRadius: 4, background: 'var(--border-soft)' }} />
              </div>
            </div>
            <div style={{ width: 68, height: 22, borderRadius: 9999, background: 'var(--border-soft)' }} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8 }}>
            <div style={{ height: 42, borderRadius: 8, background: 'var(--surface-soft)' }} />
            <div style={{ height: 42, borderRadius: 8, background: 'var(--surface-soft)' }} />
            <div style={{ height: 42, borderRadius: 8, background: 'var(--surface-soft)' }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function AutopayLedgerView({
  recipientAddress,
  recipientName,
  senderAddress,
  activeScheduleFallback,
  onOpenSetup
}: AutopayLedgerViewProps) {
  const [schedules, setSchedules] = useState<AutopayScheduleResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [scopeTab, setScopeTab] = useState<ScopeTab>('CONTACT');
  const [activeTab, setActiveTab] = useState<FilterTab>('ALL');
  const [expandedScheduleId, setExpandedScheduleId] = useState<string | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Rate-limited Refresh State (4s cooldown)
  const [lastRefreshedAt, setLastRefreshedAt] = useState<number>(0);
  const [cooldownSeconds, setCooldownSeconds] = useState<number>(0);
  const isRateLimited = cooldownSeconds > 0;

  // Delete Past History Modal State
  const [showDeleteModal, setShowDeleteModal] = useState<boolean>(false);
  const [isDeletingHistory, setIsDeletingHistory] = useState<boolean>(false);
  const [deleteSuccessMessage, setDeleteSuccessMessage] = useState<string | null>(null);

  // Live countdown ticker updated every second without polling APIs
  const [currentTick, setCurrentTick] = useState<number>(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTick(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Progressive 10-schedule pagination
  const SCHEDULE_PAGE_SIZE = 10;
  const [schedulesVisibleCount, setSchedulesVisibleCount] = useState(SCHEDULE_PAGE_SIZE);
  const [isSchedulesLoadingMore, setIsSchedulesLoadingMore] = useState(false);
  const schedulesSentinelRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSchedulesVisibleCount(SCHEDULE_PAGE_SIZE);
    setIsSchedulesLoadingMore(false);
  }, [activeTab, scopeTab, recipientAddress]);

  const fetchSchedules = useCallback(async () => {
    setLoading(true);
    setActionError(null);
    try {
      let token: string | undefined;
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        token = sessionData?.session?.access_token;
      } catch {}

      if (!token) {
        try {
          const tRes = await fetch('/api/auth/supabase-token');
          if (tRes.ok) {
            const tData = await tRes.json();
            token = tData.token;
          }
        } catch {}
      }

      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      if (senderAddress) headers['x-wallet-address'] = senderAddress;

      let url = '/api/autopay/list';
      if (senderAddress) url += `?sender=${senderAddress.toLowerCase()}`;

      const res = await fetch(url, { headers });
      const data = await res.json();
      if (res.ok && data.schedules) {
        setSchedules(data.schedules);
      } else {
        console.error('Failed to load autopay schedules:', data.error);
        if (activeScheduleFallback) {
          const s = activeScheduleFallback;
          const fallbackObj: AutopayScheduleResponse = {
            id: s.id,
            senderWallet: s.sender_wallet || s.senderWallet || senderAddress || '',
            recipientAddress: s.recipient_address || s.recipientAddress || recipientAddress || '',
            amount: Number(s.amount || 0),
            token: s.token || 'USDC',
            blockchain: s.blockchain || 'ARC-TESTNET',
            frequency: (s.frequency || s.recurring_interval || 'DAILY').toUpperCase(),
            executionTime: s.execution_time || s.executionTime || '09:00',
            timezone: s.timezone || 'UTC',
            monthlyDay: s.monthly_day ?? s.monthlyDay ?? null,
            weeklyDay: s.weekly_day ?? s.weeklyDay ?? null,
            startDate: s.start_date || s.startDate || '',
            endDate: s.end_date || s.endDate || null,
            description: s.description || null,
            maxPerPayment: Number(s.max_per_payment || s.amount || 0),
            monthlySpendingLimit: Number(s.monthly_spending_limit || (s.amount ? s.amount * 31 : 0)),
            currentMonthSpent: Number(s.current_month_spent || 0),
            currentMonthCycle: s.current_month_cycle || '',
            status: s.status || 'ACTIVE',
            nextExecutionAt: Number(s.next_execution_at || s.nextExecutionAt || Date.now() + 86400000),
            lastExecutionAt: s.last_execution_at ? Number(s.last_execution_at) : null,
            lastExecutionStatus: s.last_execution_status || null,
            consecutiveFailures: s.consecutive_failures || 0,
            lastErrorReason: s.last_error_reason || null,
            authorizationVersion: s.authorization_version || 1,
            authorizedAt: Number(s.authorized_at || s.created_at || Date.now()),
            createdAt: Number(s.created_at || Date.now()),
            updatedAt: Number(s.updated_at || Date.now()),
            recentExecutions: s.recentExecutions || []
          };
          setSchedules([fallbackObj]);
        } else {
          setSchedules([]);
        }
      }
    } catch (e: any) {
      console.error('Error fetching autopay list:', e);
      if (activeScheduleFallback) {
        const s = activeScheduleFallback;
        const fallbackObj: AutopayScheduleResponse = {
          id: s.id,
          senderWallet: s.sender_wallet || s.senderWallet || senderAddress || '',
          recipientAddress: s.recipient_address || s.recipientAddress || recipientAddress || '',
          amount: Number(s.amount || 0),
          token: s.token || 'USDC',
          blockchain: s.blockchain || 'ARC-TESTNET',
          frequency: (s.frequency || s.recurring_interval || 'DAILY').toUpperCase(),
          executionTime: s.execution_time || s.executionTime || '09:00',
          timezone: s.timezone || 'UTC',
          monthlyDay: s.monthly_day ?? s.monthlyDay ?? null,
          weeklyDay: s.weekly_day ?? s.weeklyDay ?? null,
          startDate: s.start_date || s.startDate || '',
          endDate: s.end_date || s.endDate || null,
          description: s.description || null,
          maxPerPayment: Number(s.max_per_payment || s.amount || 0),
          monthlySpendingLimit: Number(s.monthly_spending_limit || (s.amount ? s.amount * 31 : 0)),
          currentMonthSpent: Number(s.current_month_spent || 0),
          currentMonthCycle: s.current_month_cycle || '',
          status: s.status || 'ACTIVE',
          nextExecutionAt: Number(s.next_execution_at || s.nextExecutionAt || Date.now() + 86400000),
          lastExecutionAt: s.last_execution_at ? Number(s.last_execution_at) : null,
          lastExecutionStatus: s.last_execution_status || null,
          consecutiveFailures: s.consecutive_failures || 0,
          lastErrorReason: s.last_error_reason || null,
          authorizationVersion: s.authorization_version || 1,
          authorizedAt: Number(s.authorized_at || s.created_at || Date.now()),
          createdAt: Number(s.created_at || Date.now()),
          updatedAt: Number(s.updated_at || Date.now()),
          recentExecutions: s.recentExecutions || []
        };
        setSchedules([fallbackObj]);
      }
    } finally {
      setLoading(false);
    }
  }, [senderAddress, recipientAddress, activeScheduleFallback]);

  const handleRefreshWithRateLimit = useCallback(() => {
    const now = Date.now();
    const COOLDOWN_MS = 4000;
    if (now - lastRefreshedAt < COOLDOWN_MS) {
      return;
    }
    setLastRefreshedAt(now);
    setCooldownSeconds(4);
    fetchSchedules();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('arc_autopay_updated'));
    }
  }, [lastRefreshedAt, fetchSchedules]);

  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const timer = setInterval(() => {
      setCooldownSeconds(prev => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldownSeconds]);

  useEffect(() => {
    fetchSchedules();
  }, [fetchSchedules]);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  const handleUpdateStatus = async (
    scheduleId: string,
    action: 'PAUSE' | 'RESUME' | 'CANCEL',
    authorizationVersion: number
  ) => {
    if (action === 'CANCEL') {
      const confirmed = window.confirm(
        'Are you sure you want to cancel this Autopay schedule? This will permanently revoke the recurring transfer authorization.'
      );
      if (!confirmed) return;
    }

    setActionLoadingId(scheduleId);
    setActionError(null);
    try {
      let token: string | undefined;
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        token = sessionData?.session?.access_token;
      } catch {}

      if (!token) {
        try {
          const tRes = await fetch('/api/auth/supabase-token');
          if (tRes.ok) {
            const tData = await tRes.json();
            token = tData.token;
          }
        } catch {}
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      if (senderAddress) headers['x-wallet-address'] = senderAddress;

      const res = await fetch('/api/autopay/update-status', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          scheduleId,
          action,
          authorizationVersion,
          walletAddress: senderAddress
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update schedule status');
      }

      await fetchSchedules();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('arc_autopay_updated', {
          detail: { scheduleId, action }
        }));
      }
    } catch (err: any) {
      console.error('Status update error:', err);
      setActionError(err.message || 'Failed to update schedule status.');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Filter by contact scope
  const targetRecipientLower = recipientAddress?.toLowerCase();
  const contactSchedules = useMemo(() => {
    if (!targetRecipientLower) return schedules;
    return schedules.filter(s => s.recipientAddress.toLowerCase() === targetRecipientLower);
  }, [schedules, targetRecipientLower]);

  const scopedSchedules = scopeTab === 'CONTACT' && targetRecipientLower ? contactSchedules : schedules;

  const filteredSchedules = useMemo(() => {
    return scopedSchedules.filter(s => {
      if (activeTab === 'ALL') return true;
      if (activeTab === 'ACTIVE') return s.status === 'ACTIVE';
      if (activeTab === 'PAUSED') return s.status === 'PAUSED';
      if (activeTab === 'CANCELLED') return s.status === 'CANCELLED' || s.status === 'EXHAUSTED';
      return true;
    });
  }, [scopedSchedules, activeTab]);

  // Completed or Cancelled schedules that can be permanently deleted
  const pastSchedules = useMemo(() => {
    return scopedSchedules.filter(s => s.status === 'CANCELLED' || s.status === 'EXHAUSTED');
  }, [scopedSchedules]);

  const handleDeletePastHistory = async () => {
    setIsDeletingHistory(true);
    setActionError(null);
    setDeleteSuccessMessage(null);
    try {
      let token: string | undefined;
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        token = sessionData?.session?.access_token;
      } catch {}

      if (!token) {
        try {
          const tRes = await fetch('/api/auth/supabase-token');
          if (tRes.ok) {
            const tData = await tRes.json();
            token = tData.token;
          }
        } catch {}
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      if (senderAddress) headers['x-wallet-address'] = senderAddress;

      const targetIds = pastSchedules.map(s => s.id);
      const res = await fetch('/api/autopay/delete-history', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          recipientAddress: scopeTab === 'CONTACT' ? recipientAddress : undefined,
          scheduleIds: targetIds,
          walletAddress: senderAddress
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete past history');
      }

      setShowDeleteModal(false);
      setDeleteSuccessMessage(data.message || 'Successfully deleted past history.');
      setTimeout(() => setDeleteSuccessMessage(null), 4000);

      await fetchSchedules();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('arc_autopay_updated'));
      }
    } catch (err: any) {
      console.error('Delete history error:', err);
      setActionError(err.message || 'Failed to delete past history.');
    } finally {
      setIsDeletingHistory(false);
    }
  };

  useEffect(() => {
    const sentinel = schedulesSentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (first && first.isIntersecting && !isSchedulesLoadingMore) {
          if (filteredSchedules.length > schedulesVisibleCount) {
            setIsSchedulesLoadingMore(true);
            setTimeout(() => {
              setSchedulesVisibleCount(prev => prev + SCHEDULE_PAGE_SIZE);
              setIsSchedulesLoadingMore(false);
            }, 300);
          }
        }
      },
      { root: null, rootMargin: '100px', threshold: 0.1 }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [schedulesVisibleCount, isSchedulesLoadingMore, filteredSchedules.length]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, fontFamily: 'var(--font-geist), var(--font-inter), -apple-system, BlinkMacSystemFont, sans-serif', letterSpacing: '-0.01em' }}>
      {/* Filters: Scope Switcher (This Contact vs All) & Status Filters + Minimal Rate-Limited Refresh Icon */}
      <div className="autopay-filter-wrapper" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, padding: '2px 0 6px 0' }}>
        {/* Scope switch if recipient exists */}
        {targetRecipientLower && (
          <div className="autopay-scope-bar chat-pill-tabs-bar" style={{ display: 'flex', background: 'var(--surface-soft, #f1f5f9)', borderRadius: 9999, padding: 3, border: '1px solid var(--border, #e2e8f0)', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
            <button
              type="button"
              onClick={() => setScopeTab('CONTACT')}
              className="chat-pill-tab-btn"
              style={{
                padding: '5px 12px',
                fontSize: 11,
                fontWeight: scopeTab === 'CONTACT' ? 700 : 500,
                borderRadius: 9999,
                cursor: 'pointer',
                background: scopeTab === 'CONTACT' ? 'var(--surface, #ffffff)' : 'transparent',
                color: scopeTab === 'CONTACT' ? 'var(--text-primary, #0f172a)' : 'var(--text-secondary, #64748b)',
                border: scopeTab === 'CONTACT' ? '1px solid rgba(0, 0, 0, 0.08)' : '1px solid transparent',
                boxShadow: scopeTab === 'CONTACT' ? '0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.04)' : 'none',
                transition: 'all 0.15s',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 5
              }}
            >
              <User size={12} />
              <span>This Contact ({contactSchedules.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setScopeTab('ALL')}
              className="chat-pill-tab-btn"
              style={{
                padding: '5px 12px',
                fontSize: 11,
                fontWeight: scopeTab === 'ALL' ? 700 : 500,
                borderRadius: 9999,
                cursor: 'pointer',
                background: scopeTab === 'ALL' ? 'var(--surface, #ffffff)' : 'transparent',
                color: scopeTab === 'ALL' ? 'var(--text-primary, #0f172a)' : 'var(--text-secondary, #64748b)',
                border: scopeTab === 'ALL' ? '1px solid rgba(0, 0, 0, 0.08)' : '1px solid transparent',
                boxShadow: scopeTab === 'ALL' ? '0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.04)' : 'none',
                transition: 'all 0.15s',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 5
              }}
            >
              <Users size={12} />
              <span>All Contacts ({schedules.length})</span>
            </button>
          </div>
        )}

        {/* Right Section: Status Filters + Rate-Limited Refresh Icon Button */}
        <div className="autopay-status-bar-row" style={{ display: 'flex', alignItems: 'center', gap: 6, flex: '0 0 auto', justifyContent: 'flex-end', marginLeft: 'auto' }}>
          <div className="autopay-status-pills chat-pill-tabs-bar" style={{ display: 'flex', flex: '0 0 auto', background: 'var(--surface-soft, #f1f5f9)', borderRadius: 9999, padding: 3, border: '1px solid var(--border, #e2e8f0)', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
            {[
              { id: 'ALL', label: `All (${scopedSchedules.length})` },
              { id: 'ACTIVE', label: `Active (${scopedSchedules.filter(s => s.status === 'ACTIVE').length})` },
              { id: 'PAUSED', label: `Paused (${scopedSchedules.filter(s => s.status === 'PAUSED').length})` },
              { id: 'CANCELLED', label: 'Cancelled' }
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as FilterTab)}
                className="chat-pill-tab-btn autopay-filter-pill-btn"
                style={{
                  padding: '5px 8px',
                  fontSize: 11,
                  fontWeight: activeTab === tab.id ? 700 : 500,
                  borderRadius: 9999,
                  cursor: 'pointer',
                  background: activeTab === tab.id ? 'var(--surface, #ffffff)' : 'transparent',
                  color: activeTab === tab.id ? 'var(--text-primary, #0f172a)' : 'var(--text-secondary, #64748b)',
                  border: activeTab === tab.id ? '1px solid rgba(0, 0, 0, 0.08)' : '1px solid transparent',
                  boxShadow: activeTab === tab.id ? '0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.04)' : 'none',
                  transition: 'all 0.15s'
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Minimal Rate-Limited Refresh Icon Button */}
          <button
            type="button"
            onClick={handleRefreshWithRateLimit}
            disabled={loading || isRateLimited}
            title={isRateLimited ? `Please wait ${cooldownSeconds}s before refreshing again` : "Refresh latest history"}
            style={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'var(--surface, #ffffff)',
              border: '1px solid var(--border, #e2e8f0)',
              color: isRateLimited ? 'var(--text-muted)' : 'var(--text-primary)',
              cursor: (loading || isRateLimited) ? 'not-allowed' : 'pointer',
              transition: 'all 0.15s ease',
              boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
              flexShrink: 0
            }}
          >
            <RefreshCw
              size={12}
              className={loading ? 'animate-spin' : ''}
              style={{
                opacity: isRateLimited ? 0.4 : 1,
                transition: 'opacity 0.2s'
              }}
            />
          </button>
        </div>

        {/* Delete Past History button */}
          {pastSchedules.length > 0 && (
            <button
              type="button"
              onClick={() => setShowDeleteModal(true)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#dc2626',
                fontSize: 11,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '4px 8px',
                borderRadius: 8,
                transition: 'all 0.15s'
              }}
              onMouseEnter={e => {
                e.currentTarget.style.color = '#b91c1c';
                e.currentTarget.style.background = 'var(--surface-hover, rgba(0,0,0,0.03))';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.color = '#dc2626';
                e.currentTarget.style.background = 'transparent';
              }}
            >
              <span>Delete Past history &gt;</span>
            </button>
          )}
      </div>

      {/* Success Notification Banner */}
      {deleteSuccessMessage && (
        <div
          style={{
            padding: '6px 2px',
            color: '#16a34a',
            fontSize: 12,
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: 7
          }}
        >
          <CheckCircle2 size={14} style={{ flexShrink: 0 }} />
          <span>{deleteSuccessMessage}</span>
        </div>
      )}

      {/* Action Error Banner */}
      {actionError && (
        <div
          style={{
            padding: '10px 14px',
            borderRadius: 14,
            background: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid rgba(239, 68, 68, 0.25)',
            color: 'var(--accent-red, #ef4444)',
            fontSize: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}
        >
          <AlertCircle size={15} style={{ flexShrink: 0 }} />
          <span>{actionError}</span>
        </div>
      )}

      {/* Schedule Items Stream */}
      {loading ? (
        <AutopayLedgerSkeleton count={3} />
      ) : filteredSchedules.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: '50px 24px',
            background: 'var(--surface)',
            border: '1px dashed var(--border)',
            borderRadius: 16,
            color: 'var(--text-muted)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 12
          }}
        >
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: '50%',
              background: 'var(--border-soft)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-muted)'
            }}
          >
            <Clock size={24} style={{ opacity: 0.6 }} />
          </div>

          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
              {scopeTab === 'CONTACT' && targetRecipientLower
                ? `No Autopay schedules found for ${recipientName || 'this contact'}`
                : 'No Autopay schedules found'}
            </div>
            <div style={{ fontSize: 12, marginTop: 4, maxWidth: 380, color: 'var(--text-muted)' }}>
              {activeTab === 'ALL'
                ? 'Set up automatic recurring USDC transfers once, executed automatically at your chosen schedule.'
                : `No recurring schedules with status "${activeTab}".`}
            </div>
          </div>

          {onOpenSetup && (
            <button
              type="button"
              onClick={onOpenSetup}
              className="lf-btn-primary"
              style={{
                marginTop: 6,
                padding: '10px 22px',
                fontSize: 12,
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: 7,
              }}
            >
              <Plus size={15} strokeWidth={2.4} />
              <span>Set Up Autopay Now</span>
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {(() => {
            const visibleSchedules = filteredSchedules.slice(0, schedulesVisibleCount);
            const hasMoreSchedules = filteredSchedules.length > schedulesVisibleCount;
            return (
              <>
                {visibleSchedules.map(schedule => {
            const isExpanded = expandedScheduleId === schedule.id;
            const isActionLoading = actionLoadingId === schedule.id;
            const now = currentTick;
            const targetTime = Number(schedule.nextExecutionAt) || 0;
            const diffMs = targetTime ? targetTime - now : 0;
            const isPastDue = Boolean(targetTime && diffMs <= 0 && schedule.status === 'ACTIVE');
            const isOneTime = Boolean(
              schedule.startDate &&
              schedule.endDate &&
              schedule.startDate === schedule.endDate
            );

            // Format countdown
            let countdown = '';
            if (schedule.status === 'ACTIVE') {
              if (!targetTime) {
                countdown = 'Active';
              } else if (isPastDue) {
                countdown = 'Due now';
              } else {
                const days = Math.floor(diffMs / (24 * 60 * 60 * 1000));
                const hours = Math.floor((diffMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
                const minutes = Math.floor((diffMs % (60 * 60 * 1000)) / (60 * 1000));
                const seconds = Math.floor((diffMs % (60 * 1000)) / 1000);
                if (days > 0) {
                  countdown = `${days}d ${hours}h`;
                } else if (hours > 0) {
                  countdown = `${hours}h ${minutes}m`;
                } else {
                  countdown = `${minutes}m ${String(seconds).padStart(2, '0')}s`;
                }
              }
            }

            const isCompleted = schedule.status === 'EXHAUSTED';
            const statusLabel = isCompleted ? 'COMPLETED' : schedule.status;

            return (
              <div
                key={schedule.id}
                style={{
                  background: 'var(--surface)',
                  borderRadius: 14,
                  border: '1px solid var(--border)',
                  overflow: 'hidden',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                  transition: 'border-color 0.15s, box-shadow 0.15s'
                }}
              >
                {/* Main Card Header */}
                <div className="autopay-card-inner" style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: '50%',
                          background: 'var(--surface-soft)',
                          border: '1px solid var(--border)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0
                        }}
                      >
                        <img src="/usdc.png" alt="USDC" style={{ width: 22, height: 22, borderRadius: '50%' }} />
                      </div>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                          <span className="autopay-card-amount" style={{ fontSize: 17, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                            {schedule.amount} USDC
                          </span>
                          <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-muted)' }}>
                            / {isOneTime ? 'one-time' : schedule.frequency.toLowerCase()}
                          </span>
                        </div>
                        <div
                          style={{
                            fontSize: 11,
                            fontFamily: 'monospace',
                            color: 'var(--text-muted)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            marginTop: 2
                          }}
                        >
                          <span>
                            To: {schedule.recipientAddress.slice(0, 6)}...{schedule.recipientAddress.slice(-4)}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCopy(schedule.recipientAddress, schedule.id)}
                            style={{
                              background: 'none',
                              border: 'none',
                              padding: 2,
                              color: copiedId === schedule.id ? 'var(--text-primary)' : 'var(--text-muted)',
                              cursor: 'pointer'
                            }}
                            title="Copy address"
                          >
                            {copiedId === schedule.id ? <Check size={12} /> : <Copy size={12} />}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Minimal Clean Status Indicator (no colorful pill backgrounds) */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        fontSize: 11,
                        fontWeight: 700,
                        color: isCompleted ? '#2563eb' : (schedule.status === 'ACTIVE' ? 'var(--text-primary)' : 'var(--text-muted)')
                      }}
                    >
                      <span
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: '50%',
                          background: isCompleted ? '#2563eb' : (schedule.status === 'ACTIVE' ? '#2563eb' : 'var(--text-muted)')
                        }}
                      />
                      <span>{statusLabel}</span>
                    </div>
                  </div>

                  {/* Schedule Details Row + Compact Right-Aligned Monthly Progress Line */}
                  <div
                    className="autopay-card-meta-row"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: 12,
                      fontSize: 11,
                      color: 'var(--text-secondary)',
                      padding: '10px 14px',
                      borderRadius: 10,
                      background: 'var(--surface-soft)',
                      border: '1px solid var(--border-soft)'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <Clock size={12} style={{ color: 'var(--text-muted)' }} />
                        <span>
                          Time: <strong>{schedule.executionTime}</strong> (
                          {schedule.timezone.split('/').pop()?.replace('_', ' ') || schedule.timezone})
                        </span>
                      </div>

                      {isOneTime ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <Calendar size={12} style={{ color: 'var(--text-muted)' }} />
                          <span>
                            Date: <strong>{schedule.startDate}</strong>
                          </span>
                        </div>
                      ) : schedule.frequency === 'WEEKLY' ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <Calendar size={12} style={{ color: 'var(--text-muted)' }} />
                          <span>
                            Every <strong>{schedule.weeklyDay !== undefined && schedule.weeklyDay !== null ? ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][schedule.weeklyDay] : 'Week'}</strong>
                          </span>
                        </div>
                      ) : schedule.frequency === 'MONTHLY' ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <Calendar size={12} style={{ color: 'var(--text-muted)' }} />
                          <span>
                            Day <strong>{schedule.monthlyDay}</strong> of month
                          </span>
                        </div>
                      ) : null}

                      {schedule.status === 'ACTIVE' && countdown && (
                        <div style={{ color: 'var(--text-primary)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Clock size={12} style={{ color: 'var(--text-muted)' }} />
                          <span>Next: {countdown}</span>
                        </div>
                      )}
                    </div>

                    {/* Monthly Limit Progress Indicator */}
                    {!isOneTime && schedule.monthlySpendingLimit > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5, flexShrink: 0, minWidth: 140 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                          <span style={{ color: '#2563eb' }}>{schedule.currentMonthSpent}</span>
                          <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>/</span>
                          <span>{schedule.monthlySpendingLimit} USDC</span>
                        </div>
                        <div style={{ width: '100%', height: 5, borderRadius: 9999, background: 'rgba(0, 0, 0, 0.08)', overflow: 'hidden' }}>
                          <div
                            style={{
                              width: `${Math.min(100, (schedule.currentMonthSpent / schedule.monthlySpendingLimit) * 100)}%`,
                              height: '100%',
                              background: '#2563eb',
                              borderRadius: 9999,
                              transition: 'width 0.3s'
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Failure Warning if Consecutive Failures > 0 */}
                  {schedule.consecutiveFailures > 0 && (
                    <div
                      style={{
                        padding: '8px 12px',
                        borderRadius: 8,
                        background: 'rgba(239, 68, 68, 0.05)',
                        border: '1px solid rgba(239, 68, 68, 0.2)',
                        color: 'var(--text-primary)',
                        fontSize: 11,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8
                      }}
                    >
                      <AlertTriangle size={14} style={{ flexShrink: 0, color: '#ef4444' }} />
                      <span>
                        Failures: {schedule.consecutiveFailures}. {schedule.lastErrorReason || 'Transfer attempt failed.'}
                      </span>
                    </div>
                  )}

                  {/* Action Bar & History Toggle */}
                  <div
                    className="autopay-card-actions"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      borderTop: '1px solid var(--border-soft)',
                      paddingTop: 10,
                      flexWrap: 'wrap',
                      gap: 8
                    }}
                  >
                    <div style={{ display: 'flex', gap: 8 }}>
                      {schedule.status === 'ACTIVE' && (
                        <button
                          type="button"
                          onClick={() => handleUpdateStatus(schedule.id, 'PAUSE', schedule.authorizationVersion)}
                          disabled={isActionLoading}
                          className="lf-btn-ghost"
                          style={{
                            padding: '6px 12px',
                            borderRadius: 9999,
                            fontSize: 11,
                            fontWeight: 600,
                            gap: 5
                          }}
                        >
                          {isActionLoading ? <Loader2 size={12} className="animate-spin" /> : <Pause size={12} />}
                          <span>Pause</span>
                        </button>
                      )}

                      {schedule.status === 'PAUSED' && (
                        <button
                          type="button"
                          onClick={() => handleUpdateStatus(schedule.id, 'RESUME', schedule.authorizationVersion)}
                          disabled={isActionLoading}
                          className="lf-btn-ghost"
                          style={{
                            padding: '6px 12px',
                            borderRadius: 9999,
                            fontSize: 11,
                            fontWeight: 600,
                            gap: 5,
                            color: 'var(--text-primary)'
                          }}
                        >
                          {isActionLoading ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
                          <span>Resume</span>
                        </button>
                      )}

                      {schedule.status !== 'CANCELLED' && schedule.status !== 'EXHAUSTED' && (
                        <button
                          type="button"
                          onClick={() => handleUpdateStatus(schedule.id, 'CANCEL', schedule.authorizationVersion)}
                          disabled={isActionLoading}
                          className="lf-btn-ghost"
                          style={{
                            padding: '6px 12px',
                            borderRadius: 9999,
                            fontSize: 11,
                            fontWeight: 600,
                            gap: 5,
                            color: 'var(--text-muted)'
                          }}
                          onMouseEnter={e => (e.currentTarget.style.color = 'var(--accent-red)')}
                          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
                        >
                          <Trash2 size={12} />
                          <span>Cancel</span>
                        </button>
                      )}
                    </div>

                    {/* Expand History Accordion */}
                    <button
                      type="button"
                      onClick={() => setExpandedScheduleId(isExpanded ? null : schedule.id)}
                      className="lf-btn-ghost"
                      style={{
                        padding: '5px 10px',
                        borderRadius: 8,
                        fontSize: 11,
                        color: 'var(--text-muted)',
                        gap: 4
                      }}
                    >
                      <span>History ({schedule.recentExecutions?.length || 0})</span>
                      {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    </button>
                  </div>
                </div>

                {/* Expanded Execution History */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      style={{
                        borderTop: '1px solid var(--border-soft)',
                        background: 'var(--surface-soft)',
                        padding: '12px 18px'
                      }}
                    >
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Execution Logs
                      </div>

                      {(!schedule.recentExecutions || schedule.recentExecutions.length === 0) ? (
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '10px 0' }}>
                          No executions recorded yet. The first payment will execute at {schedule.executionTime} UTC.
                        </div>
                      ) : (() => {
                        const allExecs = schedule.recentExecutions;
                        const visibleExecs = allExecs.slice(0, 10);
                        const hasMoreExecs = allExecs.length > 10;

                        return (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {visibleExecs.map((exec: FormattedAutopayExecution) => {
                              const isSuccess = exec.status === 'CONFIRMED';
                              const ts = exec.executedAt || exec.createdAt;
                              const execDate = new Date(ts).toLocaleString([], {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              });

                              return (
                                <div
                                  key={exec.id}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    padding: '8px 10px',
                                    borderRadius: 8,
                                    background: 'var(--surface)',
                                    border: '1px solid var(--border-soft)',
                                    fontSize: 11
                                  }}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    {isSuccess ? (
                                      <CheckCircle2 size={13} style={{ color: 'var(--text-primary)' }} />
                                    ) : (
                                      <XCircle size={13} style={{ color: 'var(--accent-red)' }} />
                                    )}
                                    <div>
                                      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                                        {exec.amount} USDC · {exec.status}
                                      </div>
                                      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                                        {execDate}
                                      </div>
                                    </div>
                                  </div>

                                  {exec.blockchainTxHash ? (
                                    <a
                                      href={`https://testnet.arcscan.io/tx/${exec.blockchainTxHash}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 4,
                                        color: 'var(--accent-red)',
                                        textDecoration: 'none',
                                        fontSize: 10.5,
                                        fontWeight: 600
                                      }}
                                    >
                                      <span>ArcScan</span>
                                      <ExternalLink size={10} />
                                    </a>
                                  ) : exec.errorReason ? (
                                    <span style={{ fontSize: 10, color: 'var(--accent-red)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={exec.errorReason}>
                                      {exec.errorReason}
                                    </span>
                                  ) : null}
                                </div>
                              );
                            })}

                            {hasMoreExecs && (
                              <div style={{ textAlign: 'center', paddingTop: 4, fontSize: 10.5, color: 'var(--text-muted)' }}>
                                Showing latest 10 of {allExecs.length} executions
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}

          {/* Shimmer skeleton while loading more schedules */}
          {isSchedulesLoadingMore && (
            <AutopayLedgerSkeleton count={1} />
          )}

          {/* Sentinel element and fallback button */}
          {hasMoreSchedules && (
            <div
              ref={schedulesSentinelRef}
              style={{
                padding: '12px 0 4px 0',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center'
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setIsSchedulesLoadingMore(true);
                  setTimeout(() => {
                    setSchedulesVisibleCount(prev => prev + SCHEDULE_PAGE_SIZE);
                    setIsSchedulesLoadingMore(false);
                  }, 300);
                }}
                disabled={isSchedulesLoadingMore}
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 9999,
                  padding: '7px 18px',
                  fontSize: 11,
                  fontWeight: 700,
                  color: 'var(--text-secondary)',
                  cursor: isSchedulesLoadingMore ? 'default' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                }}
              >
                <RefreshCw size={12} className={isSchedulesLoadingMore ? 'animate-spin' : ''} />
                <span>
                  {isSchedulesLoadingMore
                    ? 'Loading more schedules...'
                    : `Load More Schedules (${filteredSchedules.length - visibleSchedules.length} remaining)`}
                </span>
              </button>
            </div>
          )}

          {!hasMoreSchedules && filteredSchedules.length > SCHEDULE_PAGE_SIZE && (
            <div style={{ textAlign: 'center', padding: '14px 0 4px 0', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>
              ✓ All {filteredSchedules.length} schedules loaded
            </div>
          )}
        </>
      );
    })()}
  </div>
)}

      {/* Delete Past History Confirmation Modal — portalled to body to escape stacking contexts */}
      {showDeleteModal && typeof window !== 'undefined' && createPortal(
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0, 0, 0, 0.45)',
            backdropFilter: 'blur(4px)',
          }}
          onClick={e => { if (e.target === e.currentTarget) setShowDeleteModal(false); }}
        >
          <div
            style={{
              background: 'var(--surface, #ffffff)',
              borderRadius: 18,
              padding: '28px 28px 24px',
              width: 360,
              maxWidth: 'calc(100vw - 32px)',
              boxShadow: '0 20px 60px rgba(0,0,0,0.18), 0 4px 16px rgba(0,0,0,0.1)',
              border: '1px solid var(--border, #e2e8f0)',
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
              fontFamily: 'var(--font-geist), var(--font-inter), -apple-system, BlinkMacSystemFont, sans-serif',
              letterSpacing: '-0.01em',
            }}
          >
            {/* Title */}
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
                Delete Past History
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 4 }}>
                {pastSchedules.length} completed / cancelled record{pastSchedules.length !== 1 ? 's' : ''}
              </div>
            </div>

            {/* Warning Description */}
            <div
              style={{
                fontSize: 12.5,
                color: 'var(--text-secondary)',
                lineHeight: 1.65,
                textAlign: 'center',
              }}
            >
              This will <strong style={{ color: 'var(--text-primary)' }}>permanently delete</strong> all completed and cancelled autopay history from the database including all execution logs.
              <br /><br />
              <span style={{ color: '#2563eb', fontWeight: 700 }}>⚠ This cannot be undone.</span> Once deleted, there is no way to recover this history.
            </div>

            {/* Plain Text Actions */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, paddingTop: 4 }}>
              <button
                type="button"
                onClick={handleDeletePastHistory}
                disabled={isDeletingHistory}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  color: isDeletingHistory ? 'rgba(220,38,38,0.5)' : '#dc2626',
                  fontWeight: 700,
                  fontSize: 13.5,
                  cursor: isDeletingHistory ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  transition: 'color 0.15s',
                  letterSpacing: '-0.01em',
                }}
                onMouseEnter={e => { if (!isDeletingHistory) e.currentTarget.style.color = '#b91c1c'; }}
                onMouseLeave={e => { if (!isDeletingHistory) e.currentTarget.style.color = '#dc2626'; }}
              >
                {isDeletingHistory ? (
                  <><Loader2 size={13} className="animate-spin" /> Deleting…</>
                ) : (
                  'Yes, Delete Permanently'
                )}
              </button>

              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                disabled={isDeletingHistory}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  color: 'var(--text-muted)',
                  fontWeight: 500,
                  fontSize: 12.5,
                  cursor: isDeletingHistory ? 'not-allowed' : 'pointer',
                  transition: 'color 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)'; }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      , document.body)}
    </div>
  );
}
