'use client';

import React, { useState, useEffect, useCallback } from 'react';
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
  DollarSign,
  Calendar,
  ShieldAlert,
  Loader2,
  X,
  AlertCircle
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { AutopayScheduleResponse, FormattedAutopayExecution } from '@/lib/autopay/autopay-types';
import { DAYS_OF_WEEK } from './autopay-panel';

interface AutopayDashboardProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenNewSchedule?: () => void;
}

type FilterTab = 'ALL' | 'ACTIVE' | 'PAUSED' | 'CANCELLED';

export function AutopayDashboard({ isOpen, onClose, onOpenNewSchedule }: AutopayDashboardProps) {
  const [schedules, setSchedules] = useState<AutopayScheduleResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<FilterTab>('ALL');
  const [expandedScheduleId, setExpandedScheduleId] = useState<string | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());

  // Dynamic live countdown: tick every 10 seconds while dashboard is open
  useEffect(() => {
    if (!isOpen) return;
    setNow(Date.now());
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 10000);
    return () => clearInterval(interval);
  }, [isOpen]);

  const fetchSchedules = useCallback(async () => {
    setLoading(true);
    setActionError(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) {
        setSchedules([]);
        return;
      }

      const res = await fetch('/api/autopay/list', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok && data.schedules) {
        setSchedules(data.schedules);
      } else {
        console.error('Failed to load autopay schedules:', data.error);
      }
    } catch (e: any) {
      console.error('Error fetching autopay list:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchSchedules();
    }
  }, [isOpen, fetchSchedules]);

  const handleUpdateStatus = async (scheduleId: string, action: 'PAUSE' | 'RESUME' | 'CANCEL', authorizationVersion: number) => {
    if (action === 'CANCEL') {
      const confirmed = window.confirm(
        'Are you sure you want to cancel this Autopay schedule? This will revoke authorization permanently.'
      );
      if (!confirmed) return;
    }

    setActionLoadingId(scheduleId);
    setActionError(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error('Not authenticated');

      const res = await fetch('/api/autopay/update-status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          scheduleId,
          action,
          authorizationVersion
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update schedule status');
      }

      // Refresh list after change
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

  if (!isOpen) return null;

  const filteredSchedules = schedules.filter(s => {
    if (activeTab === 'ALL') return true;
    if (activeTab === 'ACTIVE') return s.status === 'ACTIVE';
    if (activeTab === 'PAUSED') return s.status === 'PAUSED';
    if (activeTab === 'CANCELLED') return s.status === 'CANCELLED' || s.status === 'EXHAUSTED';
    return true;
  });

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.65)',
      backdropFilter: 'blur(10px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9998,
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
          maxWidth: 580,
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
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
              Autopay Dashboard
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--text-secondary)', display: 'inline-block' }} />
              <span>Recurring USDC · Arc Testnet</span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {onOpenNewSchedule && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenNewSchedule();
                }}
                className="lf-btn-primary"
                style={{
                  padding: '7px 14px',
                  borderRadius: 9999,
                  fontSize: 12,
                  gap: 6
                }}
              >
                <Plus size={14} />
                <span>New Autopay</span>
              </button>
            )}
            <button
              type="button"
              onClick={fetchSchedules}
              disabled={loading}
              className="lf-btn-ghost"
              style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                padding: 0
              }}
              title="Refresh"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="lf-btn-ghost"
              style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                padding: 0
              }}
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Filter Tabs (ArcFun .lf-tabs pill strip) */}
        <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--border)', background: 'var(--surface-soft)' }}>
          <div style={{ display: 'flex', width: '100%', padding: 3, background: 'var(--surface-soft, #f1f5f9)', borderRadius: 9999, border: '1px solid var(--border, #e2e8f0)', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
            {[
              { id: 'ALL', label: `All (${schedules.length})` },
              { id: 'ACTIVE', label: `Active (${schedules.filter(s => s.status === 'ACTIVE').length})` },
              { id: 'PAUSED', label: `Paused (${schedules.filter(s => s.status === 'PAUSED').length})` },
              { id: 'CANCELLED', label: `Cancelled` }
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as FilterTab)}
                style={{
                  flex: 1,
                  textAlign: 'center',
                  borderRadius: 9999,
                  padding: '6px 12px',
                  fontSize: 11,
                  fontWeight: activeTab === tab.id ? 700 : 500,
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
        </div>

        {/* Action Error Banner */}
        {actionError && (
          <div style={{
            margin: '12px 20px 0',
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
            <span>{actionError}</span>
          </div>
        )}

        {/* Schedule List Content */}
        <div style={{ padding: 20, overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }} className="animate-pulse">
              {[0, 1, 2].map((idx) => (
                <div
                  key={idx}
                  style={{
                    background: 'var(--surface-soft)',
                    borderRadius: 18,
                    border: '1px solid var(--border)',
                    padding: 16,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12,
                    opacity: 1 - idx * 0.15
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--border-soft, #e2e8f0)' }} />
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div style={{ height: 13, width: 110, borderRadius: 4, background: 'var(--border, #e2e8f0)' }} />
                        <div style={{ height: 10, width: 75, borderRadius: 3, background: 'var(--border-soft, #e2e8f0)' }} />
                      </div>
                    </div>
                    <div style={{ height: 22, width: 60, borderRadius: 9999, background: 'var(--border-soft, #e2e8f0)' }} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, padding: '10px 12px', background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border-soft)' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div style={{ height: 9, width: 36, borderRadius: 3, background: 'var(--border-soft, #e2e8f0)' }} />
                      <div style={{ height: 12, width: 50, borderRadius: 4, background: 'var(--border, #e2e8f0)' }} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div style={{ height: 9, width: 44, borderRadius: 3, background: 'var(--border-soft, #e2e8f0)' }} />
                      <div style={{ height: 12, width: 48, borderRadius: 4, background: 'var(--border, #e2e8f0)' }} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div style={{ height: 9, width: 50, borderRadius: 3, background: 'var(--border-soft, #e2e8f0)' }} />
                      <div style={{ height: 12, width: 54, borderRadius: 4, background: 'var(--border, #e2e8f0)' }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : filteredSchedules.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: '48px 20px',
              borderRadius: 18,
              border: '1px dashed var(--border)',
              background: 'var(--surface-soft)',
              color: 'var(--text-muted)'
            }}>
              <Clock size={28} style={{ margin: '0 auto 10px', opacity: 0.5 }} />
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                No Autopay schedules found
              </div>
              <div style={{ fontSize: 12, marginTop: 4 }}>
                {activeTab === 'ALL'
                  ? 'You have not set up any recurring payments yet.'
                  : `No schedules currently with status "${activeTab}".`}
              </div>
            </div>
          ) : (
            filteredSchedules.map(schedule => {
              const isExpanded = expandedScheduleId === schedule.id;
              const isActionLoading = actionLoadingId === schedule.id;
              const diffMs = schedule.nextExecutionAt - now;
              const isPastDue = diffMs <= 0 && schedule.status === 'ACTIVE';

              // Format countdown
              let countdown = '';
              if (schedule.status === 'ACTIVE') {
                if (isPastDue) {
                  countdown = 'Due now';
                } else {
                  const days = Math.floor(diffMs / (24 * 60 * 60 * 1000));
                  const hours = Math.floor((diffMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
                  const minutes = Math.floor((diffMs % (60 * 60 * 1000)) / (60 * 1000));
                  countdown = days > 0 ? `${days}d ${hours}h` : `${hours}h ${minutes}m`;
                }
              }

              // Status styles
              let statusBg = 'rgba(113, 113, 122, 0.15)';
              let statusColor = 'var(--text-muted)';
              let statusBorder = 'rgba(113, 113, 122, 0.25)';
              if (schedule.status === 'ACTIVE') {
                statusBg = 'rgba(16, 185, 129, 0.12)';
                statusColor = '#10b981';
                statusBorder = 'rgba(16, 185, 129, 0.25)';
              } else if (schedule.status === 'PAUSED') {
                statusBg = 'rgba(245, 158, 11, 0.12)';
                statusColor = '#f59e0b';
                statusBorder = 'rgba(245, 158, 11, 0.25)';
              } else if (schedule.status === 'EXHAUSTED') {
                statusBg = 'rgba(34, 197, 94, 0.12)';
                statusColor = '#22c55e';
                statusBorder = 'rgba(34, 197, 94, 0.25)';
              }

              return (
                <div
                  key={schedule.id}
                  style={{
                    background: 'var(--surface-soft)',
                    borderRadius: 18,
                    border: '1px solid var(--border)',
                    overflow: 'hidden',
                    transition: 'all 0.2s'
                  }}
                >
                  {/* Summary Header */}
                  <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                          width: 36,
                          height: 36,
                          borderRadius: '50%',
                          background: 'var(--surface)',
                          border: '1px solid var(--border)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}>
                          <img src="/usdc.png" alt="USDC" style={{ width: 18, height: 18, borderRadius: '50%' }} />
                        </div>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                            <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
                              {schedule.amount} USDC
                            </span>
                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                              / {schedule.frequency.toLowerCase()}
                            </span>
                          </div>
                          <div style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span>To: {schedule.recipientAddress.slice(0, 6)}...{schedule.recipientAddress.slice(-4)}</span>
                            <button
                              onClick={() => navigator.clipboard.writeText(schedule.recipientAddress)}
                              style={{ background: 'none', border: 'none', padding: 2, color: 'var(--text-muted)', cursor: 'pointer' }}
                              title="Copy address"
                            >
                              <Copy size={11} />
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Status Badge */}
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 5,
                        padding: '4px 10px',
                        borderRadius: 9999,
                        background: statusBg,
                        border: `1px solid ${statusBorder}`,
                        color: statusColor,
                        fontSize: 10.5,
                        fontWeight: 700
                      }}>
                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: statusColor }} />
                        <span>{schedule.status === 'EXHAUSTED' ? 'COMPLETED' : schedule.status}</span>
                      </div>
                    </div>

                    {/* Schedule Execution Meta */}
                    <div style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 12,
                      fontSize: 11,
                      color: 'var(--text-secondary)',
                      padding: '8px 10px',
                      borderRadius: 12,
                      background: 'var(--surface)',
                      border: '1px solid var(--border)'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <Clock size={12} style={{ color: 'var(--text-muted)' }} />
                        <span>Time: <strong>{schedule.executionTime}</strong> ({schedule.timezone.split('/').pop()?.replace('_', ' ') || schedule.timezone})</span>
                      </div>
                      {schedule.frequency === 'WEEKLY' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <Calendar size={12} style={{ color: 'var(--text-muted)' }} />
                          <span>Every <strong>{DAYS_OF_WEEK.find(d => d.value === schedule.weeklyDay)?.fullLabel || 'Monday'}</strong></span>
                        </div>
                      )}
                      {schedule.frequency === 'MONTHLY' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <Calendar size={12} style={{ color: 'var(--text-muted)' }} />
                          <span>Day <strong>{schedule.monthlyDay}</strong> of month</span>
                        </div>
                      )}
                      {schedule.status === 'ACTIVE' && countdown && (
                        <div style={{ marginLeft: 'auto', color: '#10b981', fontWeight: 600 }}>
                          Next: {countdown}
                        </div>
                      )}
                    </div>

                    {/* Spending Limit Progress */}
                    {schedule.monthlySpendingLimit > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: 'var(--text-muted)' }}>
                          <span>Monthly Limit ({schedule.currentMonthCycle})</span>
                          <span><strong>{schedule.currentMonthSpent}</strong> / {schedule.monthlySpendingLimit} USDC</span>
                        </div>
                        <div style={{ width: '100%', height: 4, borderRadius: 9999, background: 'var(--border)', overflow: 'hidden' }}>
                          <div style={{
                            width: `${Math.min(100, (schedule.currentMonthSpent / schedule.monthlySpendingLimit) * 100)}%`,
                            height: '100%',
                            background: (schedule.currentMonthSpent >= schedule.monthlySpendingLimit) ? 'var(--accent-red)' : 'var(--text-primary)',
                            borderRadius: 9999
                          }} />
                        </div>
                      </div>
                    )}

                    {/* Failure Warning if Consecutive Failures > 0 */}
                    {schedule.consecutiveFailures > 0 && (
                      <div style={{
                        padding: '6px 10px',
                        borderRadius: 10,
                        background: 'rgba(245, 158, 11, 0.1)',
                        border: '1px solid rgba(245, 158, 11, 0.25)',
                        color: '#f59e0b',
                        fontSize: 11,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6
                      }}>
                        <AlertTriangle size={13} style={{ flexShrink: 0 }} />
                        <span>Failures: {schedule.consecutiveFailures}. {schedule.lastErrorReason || 'Transfer attempt failed.'}</span>
                      </div>
                    )}

                    {/* Action Bar */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {schedule.status === 'ACTIVE' && (
                          <button
                            type="button"
                            onClick={() => handleUpdateStatus(schedule.id, 'PAUSE', schedule.authorizationVersion)}
                            disabled={isActionLoading}
                            className="lf-btn-ghost"
                            style={{ padding: '5px 10px', borderRadius: 9999, fontSize: 11, gap: 5 }}
                          >
                            <Pause size={12} />
                            <span>Pause</span>
                          </button>
                        )}

                        {schedule.status === 'PAUSED' && (
                          <button
                            type="button"
                            onClick={() => handleUpdateStatus(schedule.id, 'RESUME', schedule.authorizationVersion)}
                            disabled={isActionLoading}
                            className="lf-btn-ghost"
                            style={{ padding: '5px 10px', borderRadius: 9999, fontSize: 11, gap: 5, color: '#10b981' }}
                          >
                            <Play size={12} />
                            <span>Resume</span>
                          </button>
                        )}

                        {schedule.status !== 'CANCELLED' && schedule.status !== 'EXHAUSTED' && (
                          <button
                            type="button"
                            onClick={() => handleUpdateStatus(schedule.id, 'CANCEL', schedule.authorizationVersion)}
                            disabled={isActionLoading}
                            className="lf-btn-ghost"
                            style={{ padding: '5px 10px', borderRadius: 9999, fontSize: 11, gap: 5, color: 'var(--text-muted)' }}
                            onMouseEnter={e => e.currentTarget.style.color = 'var(--accent-red)'}
                            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
                          >
                            <Trash2 size={12} />
                            <span>Cancel</span>
                          </button>
                        )}
                      </div>

                      {/* History Toggle */}
                      <button
                        type="button"
                        onClick={() => setExpandedScheduleId(isExpanded ? null : schedule.id)}
                        className="lf-btn-ghost"
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: '4px 8px',
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

                  {/* Expanded Executions Accordion */}
                  {isExpanded && (
                    <div style={{
                      background: 'var(--surface)',
                      borderTop: '1px solid var(--border)',
                      padding: '12px 16px'
                    }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                        Recent Execution History
                      </div>
                      {!schedule.recentExecutions || schedule.recentExecutions.length === 0 ? (
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '6px 0' }}>
                          No payment attempts recorded yet.
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {(schedule.recentExecutions || []).map((ex: FormattedAutopayExecution) => (
                            <div
                              key={ex.id}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                background: 'var(--surface-soft)',
                                border: '1px solid var(--border-soft)',
                                padding: '8px 10px',
                                borderRadius: 10,
                                fontSize: 11
                              }}
                            >
                              <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                                    {ex.amount} {ex.token}
                                  </span>
                                  <span style={{
                                    fontSize: 9.5,
                                    fontWeight: 700,
                                    padding: '2px 6px',
                                    borderRadius: 6,
                                    background: ex.status === 'CONFIRMED' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                                    color: ex.status === 'CONFIRMED' ? '#10b981' : 'var(--accent-red)'
                                  }}>
                                    {ex.status}
                                  </span>
                                </div>
                                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                                  {new Date(ex.createdAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                                </div>
                              </div>

                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                {ex.blockchainTxHash ? (
                                  <a
                                    href={`https://testnet.arcscan.io/tx/${ex.blockchainTxHash}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: 4,
                                      color: 'var(--text-secondary)',
                                      textDecoration: 'none',
                                      fontSize: 10,
                                      background: 'var(--surface)',
                                      border: '1px solid var(--border)',
                                      padding: '4px 8px',
                                      borderRadius: 6
                                    }}
                                  >
                                    <span>Explorer</span>
                                    <ExternalLink size={10} />
                                  </a>
                                ) : ex.errorReason ? (
                                  <span style={{ fontSize: 10, color: 'var(--accent-red)', maxWidth: 180, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={ex.errorReason}>
                                    {ex.errorReason}
                                  </span>
                                ) : null}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </motion.div>
    </div>
  );
}
