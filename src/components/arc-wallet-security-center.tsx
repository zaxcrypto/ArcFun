"use client";

import React, { useState, useEffect } from "react";
import { Shield, Lock, Eye, EyeOff, Save, Loader2, ArrowLeft, ChevronRight, Fingerprint, Activity, DollarSign, CheckCircle2, X, Check } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { motion, AnimatePresence } from "framer-motion";
import { startRegistration } from "@simplewebauthn/browser";
import { useArcWalletAuth } from "@/components/arc-wallet-auth-provider";

type Policy = {
  passkey_mode: string;
  passkey_threshold: number;
  has_password?: boolean;
  has_passkey?: boolean;
  password_enabled?: boolean;
  max_transaction_amount: number;
  daily_transfer_limit: number;
  privacy_hide_balances: boolean;
};

export function ArcWalletSecurityCenter({
  onBack,
  initialPolicy,
  onPolicyChange,
  isBalancesHidden,
  toggleHideBalances,
  onStartSecuritySetup,
  focusSection
}: {
  onBack: () => void,
  initialPolicy?: Policy | null,
  onPolicyChange?: (policy: Policy) => void,
  isBalancesHidden?: boolean,
  toggleHideBalances?: () => void,
  onStartSecuritySetup?: () => void,
  focusSection?: 'limits' | null
}) {
  const { requestAuthentication } = useArcWalletAuth();
  const [policy, setPolicy] = useState<Policy | null>(initialPolicy || null);
  const [draft, setDraft] = useState<Record<string, any> | null>(() => {
    if (initialPolicy) {
      return {
        ...initialPolicy,
        passkey_threshold: String(initialPolicy.passkey_threshold ?? "100"),
        max_transaction_amount: String(initialPolicy.max_transaction_amount ?? "500"),
        daily_transfer_limit: String(initialPolicy.daily_transfer_limit ?? "1000"),
      };
    }
    return null;
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(!initialPolicy);
  const [saving, setSaving] = useState(false);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [activeSelector, setActiveSelector] = useState<{ field: string; title: string; options: { value: string | number; label: string }[] } | null>(null);
  const [supportsPasskeys, setSupportsPasskeys] = useState<boolean>(true);

  // Sync with initialPolicy if it arrives after mount
  useEffect(() => {
    if (initialPolicy && !policy) {
      setPolicy(initialPolicy);
      setDraft({
        ...initialPolicy,
        passkey_threshold: String(initialPolicy.passkey_threshold ?? "100"),
        max_transaction_amount: String(initialPolicy.max_transaction_amount ?? "500"),
        daily_transfer_limit: String(initialPolicy.daily_transfer_limit ?? "1000"),
      });
      setLoading(false);
    }
  }, [initialPolicy, policy]);

  useEffect(() => {
    let isMounted = true;
    async function checkSupport() {
      if (typeof window === 'undefined') return;
      if (!window.PublicKeyCredential) {
        if (isMounted) setSupportsPasskeys(false);
        return;
      }

      if (typeof window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function') {
        try {
          const available = await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
          if (isMounted) setSupportsPasskeys(available);
        } catch (e) {
          if (isMounted) setSupportsPasskeys(false);
        }
      } else {
        if (isMounted) setSupportsPasskeys(false);
      }
    }
    checkSupport();
    fetchPolicy();
    return () => { isMounted = false; };
  }, []);

  const fetchPolicy = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch("/api/wallet/security", {
        headers: { Authorization: `Bearer ${session.access_token}` }
      });
      const json = await res.json();
      if (json.policy) {
        setPolicy(json.policy);
        setDraft({
          ...json.policy,
          passkey_threshold: String(json.policy.passkey_threshold ?? "100"),
          max_transaction_amount: String(json.policy.max_transaction_amount ?? "500"),
          daily_transfer_limit: String(json.policy.daily_transfer_limit ?? "1000"),
        });
        if (onPolicyChange) onPolicyChange(json.policy);
      }
    } catch (e) {
      console.error("Failed to load security policies", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (focusSection === 'limits' && !loading) {
      const timer = setTimeout(() => {
        const el = document.getElementById('security-policies-group');
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        const input = document.getElementById('security-max-tx-input');
        if (input) {
          (input as HTMLInputElement).focus();
          (input as HTMLInputElement).select();
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [focusSection, loading]);

  const validateNumber = (val: string) => {
    if (val.trim() === '') return 'Required';
    const num = Number(val);
    if (isNaN(num)) return 'Invalid number';
    if (num < 0) return 'Cannot be negative';
    if (num === Infinity) return 'Too large';
    return null;
  };

  const handleChange = (field: string, value: string | boolean | number) => {
    if (!draft) return;

    setDraft(prev => ({ ...prev, [field]: value }));

    if (field === 'passkey_threshold' || field === 'max_transaction_amount' || field === 'daily_transfer_limit') {
      const error = validateNumber(value as string);
      setErrors(prev => ({
        ...prev,
        [field]: error || ""
      }));
    }
  };

  const hasChanges = () => {
    if (!policy || !draft) return false;
    if (draft.passkey_mode !== policy.passkey_mode) return true;
    if (draft.privacy_hide_balances !== policy.privacy_hide_balances) return true;
    // For numbers, only count as change if valid and different
    if (!errors.passkey_threshold && Number(draft.passkey_threshold) !== policy.passkey_threshold) return true;
    if (!errors.max_transaction_amount && Number(draft.max_transaction_amount) !== policy.max_transaction_amount) return true;
    if (!errors.daily_transfer_limit && Number(draft.daily_transfer_limit) !== policy.daily_transfer_limit) return true;

    return false;
  };

  const handleReset = () => {
    if (!policy) return;
    setDraft({
      ...policy,
      passkey_threshold: String(policy.passkey_threshold),
      max_transaction_amount: String(policy.max_transaction_amount),
      daily_transfer_limit: String(policy.daily_transfer_limit),
    });
    setErrors({
      passkey_threshold: "",
      max_transaction_amount: "",
      daily_transfer_limit: "",
    });
  };

  const hasErrors = Object.values(errors).some(e => e !== "");

  const handleSave = async (autoSaveDraft?: Record<string, any>) => {
    if (hasErrors && !autoSaveDraft) return;

    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      let updates: any = {};

      if (autoSaveDraft) {
        updates = { ...autoSaveDraft };
      } else {
        updates = {
          passkey_mode: draft?.passkey_mode,
          passkey_threshold: Number(draft?.passkey_threshold),
          max_transaction_amount: Number(draft?.max_transaction_amount),
          daily_transfer_limit: Number(draft?.daily_transfer_limit),
        };
      }

      const res = await fetch("/api/wallet/security", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify(updates)
      });
      let json = await res.json();

      if (res.status === 403 || json.error?.includes("Unauthorized")) {
        if (policy?.has_passkey || policy?.has_password) {
          const authResult = await requestAuthentication(0, policy?.has_password || false, "change security settings");

          const retryPayload: any = { ...updates, ...authResult };
          if (retryPayload.password) {
            retryPayload.current_password = retryPayload.password;
            delete retryPayload.password;
          }

          const retryRes = await fetch("/api/wallet/security", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session.access_token}`
            },
            body: JSON.stringify(retryPayload)
          });
          json = await retryRes.json();
        }
      }

      if (json.error) {
        throw new Error(json.error);
      }

      if (json.policy) {
        setPolicy(json.policy);
        setDraft({
          ...json.policy,
          passkey_threshold: String(json.policy.passkey_threshold),
          max_transaction_amount: String(json.policy.max_transaction_amount),
          daily_transfer_limit: String(json.policy.daily_transfer_limit),
        });
      }
    } catch (e: any) {
      console.error("Failed to save policies", e);
      alert(e.message || "Failed to save policies");
    } finally {
      setSaving(false);
    }
  };

  const handleSavePassword = async () => {
    if (!newPassword) return;
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const bodyPayload: any = { new_password: newPassword };
      if (policy?.has_password) {
        if (!currentPassword) {
          alert("Current password is required to set a new password.");
          setSaving(false);
          return;
        }
        bodyPayload.current_password = currentPassword;
      }

      const res = await fetch("/api/wallet/security", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify(bodyPayload)
      });
      const json = await res.json();
      if (json.error) {
        throw new Error(json.error);
      }
      if (json.policy) {
        setPolicy(json.policy);
      }
      setNewPassword("");
      setConfirmPassword("");
      setCurrentPassword("");
      setExpandedSection(null);
    } catch (e: any) {
      console.error("Failed to save password", e);
      let msg = e.message || "Failed to save password";
      const genericErrors = ["Internal Server Error", "Service Error", "Unknown Error", "Unexpected token"];
      if (genericErrors.some(g => msg.includes(g))) msg = "The network is busy. Please try again.";
      alert(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleRegisterPasskey = async () => {
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const optRes = await fetch('/api/auth/passkey/generate-registration-options', {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });
      const optData = await optRes.json();
      if (!optData.success) throw new Error(optData.error || "Failed to generate passkey options");

      let attResp;
      try {
        attResp = await startRegistration(optData.options);
      } catch (err: any) {
        if (err.name === 'NotAllowedError') {
          throw new Error("Registration cancelled.");
        }
        throw new Error("Passkey ceremony failed: " + err.message);
      }

      const verRes = await fetch('/api/auth/passkey/verify-registration', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ registrationResponse: attResp })
      });
      const verData = await verRes.json();

      if (!verData.success) {
        throw new Error(verData.error || "Failed to verify passkey");
      }

      setPolicy({ ...policy!, has_passkey: true });
    } catch (e: any) {
      console.error(e);
      let msg = e.message;
      const genericErrors = ["Internal Server Error", "Service Error", "Unknown Error", "Unexpected token"];
      if (genericErrors.some(g => msg.includes(g))) msg = "The network is busy. Please try again.";
      alert(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleReplacePasskey = async () => {
    if (!currentPassword) {
      alert("Current password is required to replace a passkey.");
      return;
    }
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      // 1. Authenticate with password and generate registration options
      const optRes = await fetch('/api/auth/passkey/replace-credential', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ password: currentPassword })
      });
      const optData = await optRes.json();
      if (!optData.success) throw new Error(optData.error || "Failed to initiate passkey replacement");

      // 2. Perform WebAuthn Registration
      let attResp;
      try {
        attResp = await startRegistration(optData.options);
      } catch (err: any) {
        if (err.name === 'NotAllowedError') {
          throw new Error("Registration cancelled.");
        }
        throw new Error("Passkey ceremony failed: " + err.message);
      }

      // 3. Verify Registration
      const verRes = await fetch('/api/auth/passkey/verify-registration', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ registrationResponse: attResp })
      });
      const verData = await verRes.json();

      if (!verData.success) {
        throw new Error(verData.error || "Failed to verify passkey");
      }

      setPolicy({ ...policy!, has_passkey: true });
      setCurrentPassword("");
      setExpandedSection(null);
    } catch (e: any) {
      console.error(e);
      let msg = e.message;
      const genericErrors = ["Internal Server Error", "Service Error", "Unknown Error", "Unexpected token"];
      if (genericErrors.some(g => msg.includes(g))) msg = "The network is busy. Please try again.";
      alert(msg);
    } finally {
      setSaving(false);
    }
  };



  if (!draft) {
    return (
      <div className="flex-1 h-full min-h-0 flex flex-col bg-white dark:bg-[#070709] rounded-2xl overflow-hidden font-sans relative w-full animate-in fade-in duration-200">
        {/* Header with back button */}
        <div className="flex items-center justify-between px-4 pt-3.5 pb-2.5 shrink-0 bg-white dark:bg-[#070709] z-10 border-b border-slate-100 dark:border-white/5">
          <button onClick={onBack} className="p-1.5 -ml-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 transition-colors text-[var(--text-primary)]">
            <ArrowLeft size={18} />
          </button>
          <h2 className="font-semibold text-[14px] text-[var(--text-primary)]">Security & Settings</h2>
          <div className="w-8 flex justify-end">
            <Loader2 className="w-3.5 h-3.5 text-[#5351FF] animate-spin" />
          </div>
        </div>

        {/* Skeleton content layout */}
        <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-6 space-y-4 hide-scrollbar pt-2">
          {/* Group 1: Authentication */}
          <div>
            <div className="h-2.5 w-24 bg-slate-200 dark:bg-white/10 rounded mb-2 animate-pulse" />
            <div className="bg-white dark:bg-[#0c0d14] rounded-[16px] flex flex-col border border-slate-200/80 dark:border-[var(--border)] overflow-hidden shadow-sm divide-y divide-slate-100 dark:divide-white/5">
              <div className="p-3.5 flex items-center justify-between animate-pulse">
                <div className="flex items-center gap-2.5">
                  <div className="w-4 h-4 rounded-full bg-slate-200 dark:bg-white/10" />
                  <div className="h-3.5 w-20 bg-slate-200 dark:bg-white/10 rounded" />
                </div>
                <div className="h-3.5 w-16 bg-slate-200 dark:bg-white/10 rounded" />
              </div>
              <div className="p-3.5 flex items-center justify-between animate-pulse">
                <div className="flex items-center gap-2.5">
                  <div className="w-4 h-4 rounded-full bg-slate-200 dark:bg-white/10" />
                  <div className="h-3.5 w-24 bg-slate-200 dark:bg-white/10 rounded" />
                </div>
                <div className="h-3.5 w-20 bg-slate-200 dark:bg-white/10 rounded" />
              </div>
            </div>
          </div>

          {/* Group 2: Transaction Limits */}
          <div>
            <div className="h-2.5 w-32 bg-slate-200 dark:bg-white/10 rounded mb-2 animate-pulse" />
            <div className="bg-white dark:bg-[#0c0d14] rounded-[16px] flex flex-col border border-slate-200/80 dark:border-[var(--border)] overflow-hidden shadow-sm divide-y divide-slate-100 dark:divide-white/5">
              <div className="p-3.5 flex items-center justify-between animate-pulse">
                <div className="flex items-center gap-2.5">
                  <div className="w-4 h-4 rounded-full bg-slate-200 dark:bg-white/10" />
                  <div className="h-3.5 w-28 bg-slate-200 dark:bg-white/10 rounded" />
                </div>
                <div className="h-3.5 w-14 bg-slate-200 dark:bg-white/10 rounded" />
              </div>
              <div className="p-3.5 flex items-center justify-between animate-pulse">
                <div className="flex items-center gap-2.5">
                  <div className="w-4 h-4 rounded-full bg-slate-200 dark:bg-white/10" />
                  <div className="h-3.5 w-24 bg-slate-200 dark:bg-white/10 rounded" />
                </div>
                <div className="h-3.5 w-16 bg-slate-200 dark:bg-white/10 rounded" />
              </div>
            </div>
          </div>

          {/* Group 3: Privacy */}
          <div>
            <div className="h-2.5 w-20 bg-slate-200 dark:bg-white/10 rounded mb-2 animate-pulse" />
            <div className="bg-white dark:bg-[#0c0d14] rounded-[16px] flex flex-col border border-slate-200/80 dark:border-[var(--border)] overflow-hidden shadow-sm p-3.5">
              <div className="flex items-center justify-between animate-pulse">
                <div className="flex items-center gap-2.5">
                  <div className="w-4 h-4 rounded-full bg-slate-200 dark:bg-white/10" />
                  <div className="h-3.5 w-28 bg-slate-200 dark:bg-white/10 rounded" />
                </div>
                <div className="w-8 h-4 rounded-full bg-slate-200 dark:bg-white/10" />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!policy) {
    return <div className="p-8 text-center text-[var(--accent-red)]">Failed to load Security Center</div>;
  }

  const ToggleSwitch = ({ active }: { active: boolean }) => (
    <div className={`w-9 h-5 rounded-full p-0.5 transition-colors duration-200 ${active ? 'bg-[#00D494]' : 'bg-[var(--border)]'}`}>
      <div className={`w-4 h-4 bg-white rounded-full transition-transform duration-200 shadow-sm ${active ? 'translate-x-4' : 'translate-x-0'}`} />
    </div>
  );

  return (
    <div className="flex-1 h-full min-h-0 flex flex-col bg-white dark:bg-[#070709] rounded-2xl overflow-hidden font-sans relative w-full">
      <div className="flex items-center justify-between px-4 pt-3.5 pb-2.5 shrink-0 bg-white dark:bg-[#070709] z-10 border-b border-slate-100 dark:border-white/5">
        <button onClick={onBack} className="p-1.5 -ml-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 transition-colors text-[var(--text-primary)]">
          <ArrowLeft size={18} />
        </button>
        <h2 className="font-semibold text-[14px] text-[var(--text-primary)]">Security & Settings</h2>
        <div className="w-8"></div>
      </div>

      <div className={`flex-1 min-h-0 overflow-y-auto px-4 ${hasChanges() ? 'pb-24' : 'pb-6'} space-y-4 hide-scrollbar transition-all duration-200`}>

        {/* Authentication Group */}
        <div>
          <h3 className="text-[11px] text-[var(--text-muted)] font-semibold mb-1 px-1 uppercase tracking-wider">Authentication</h3>
          <div className="bg-white dark:bg-[#0c0d14] rounded-[16px] flex flex-col border border-slate-200/80 dark:border-[var(--border)] overflow-hidden shadow-sm">

            {/* Passkey Mode */}
            <div
              className={`flex items-center justify-between px-3 py-3 border-b border-[var(--border-soft)] ${supportsPasskeys ? 'cursor-pointer hover:bg-slate-50 dark:hover:bg-white/5' : 'opacity-70'} transition-colors`}
              onClick={() => {
                if (!supportsPasskeys) return;
                if (!policy.has_passkey) {
                  if (onStartSecuritySetup) {
                    onStartSecuritySetup();
                  }
                } else {
                  setActiveSelector({
                    field: 'passkey_mode',
                    title: 'Require Passkey',
                    options: [
                      { value: 'ALWAYS', label: 'Always' },
                      { value: 'THRESHOLD', label: 'Above Threshold' },
                      { value: 'DISABLED', label: 'Never' }
                    ]
                  });
                }
              }}
            >
              <div className="flex items-center gap-2.5 text-[13px] font-medium text-[var(--text-primary)] whitespace-nowrap">
                <Fingerprint className="w-4 h-4 text-[var(--text-muted)]" />
                Passkey
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-[13px] font-medium text-[var(--text-secondary)]">
                  {!supportsPasskeys
                    ? "Not available on this device"
                    : (policy.has_passkey ? "Enabled" : "Not configured")}
                </span>
                {supportsPasskeys && <ChevronRight className="w-4 h-4 text-[var(--text-muted)]" />}
              </div>
            </div>

            {/* Replace Passkey (only if passkey and password exist) */}
            {policy.has_passkey && policy.has_password && (
              <>
                <div
                  onClick={() => setExpandedSection(expandedSection === 'replace-passkey' ? null : 'replace-passkey')}
                  className="flex items-center justify-between px-3 py-3 border-b border-[var(--border-soft)] cursor-pointer hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
                >
                  <div className="flex items-center gap-2.5 text-[13px] font-medium text-[var(--text-primary)] whitespace-nowrap pl-4">
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-muted)]" />
                    Replace Passkey
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <ChevronRight className={`w-4 h-4 text-[var(--text-muted)] transition-transform ${expandedSection === 'replace-passkey' ? 'rotate-90' : ''}`} />
                  </div>
                </div>

                {expandedSection === 'replace-passkey' && (
                  <div className="p-4 bg-[#F8FAFC] dark:bg-[#0c0d14] border-b border-slate-100 dark:border-[var(--border-soft)] flex flex-col gap-3">
                    <p className="text-[11px] text-[var(--text-muted)] mb-1 leading-relaxed px-1">
                      Lost your passkey? Authenticate with your password to replace it with a new one.
                    </p>
                    <div className="flex flex-col gap-3 w-full">
                      <input
                        type="password"
                        placeholder="Current Password"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        className="w-full bg-white dark:bg-[#151722] border border-slate-200 dark:border-[var(--border)] rounded-xl px-4 py-3 text-[14px] text-[var(--text-primary)] outline-none focus:border-[#5351FF] transition-colors"
                      />
                      <button
                        onClick={handleReplacePasskey}
                        disabled={saving || !currentPassword}
                        className="cyber-button w-full"
                        style={{ height: 44 }}
                      >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>Verify & Replace</span>}
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Password Fallback */}
            <div
              onClick={() => setExpandedSection(expandedSection === 'password' ? null : 'password')}
              className="flex items-center justify-between px-3 py-3 border-b border-[var(--border-soft)] cursor-pointer hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
            >
              <div className="flex items-center gap-2.5 text-[13px] font-medium text-[var(--text-primary)] whitespace-nowrap">
                <Lock className="w-4 h-4 text-[var(--text-muted)]" />
                Password
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-[13px] font-medium text-[var(--text-secondary)]">
                  {policy.has_password ? "Configured" : "Not Set"}
                </span>
                <ChevronRight className={`w-4 h-4 text-[var(--text-muted)] transition-transform ${expandedSection === 'password' ? 'rotate-90' : ''}`} />
              </div>
            </div>

            {expandedSection === 'password' && (
              <div className="p-4 bg-[#F8FAFC] dark:bg-[#0c0d14] border-b border-slate-100 dark:border-[var(--border-soft)] flex flex-col gap-3">
                <p className="text-[11px] text-[var(--text-muted)] mb-1 leading-relaxed px-1">
                  {policy.has_password ? "Update your fallback authentication password." : "Set a strong password as a fallback authentication method."}
                </p>
                <div className="flex flex-col gap-3 w-full">
                  {policy.has_password && (
                    <input
                      type="password"
                      placeholder="Current Password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      className="w-full bg-white dark:bg-[#151722] border border-slate-200 dark:border-[var(--border)] rounded-xl px-4 py-3 text-[14px] text-[var(--text-primary)] outline-none focus:border-[#5351FF] transition-colors"
                    />
                  )}
                  <input
                    type="password"
                    placeholder="New Password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full bg-white dark:bg-[#151722] border border-slate-200 dark:border-[var(--border)] rounded-xl px-4 py-3 text-[14px] text-[var(--text-primary)] outline-none focus:border-[#5351FF] transition-colors"
                  />

                  <div className="px-1 flex flex-col gap-1.5 mb-1">
                    {[
                      { label: "Minimum 8 characters", valid: newPassword.length >= 8 },
                      { label: "One uppercase letter", valid: /[A-Z]/.test(newPassword) },
                      { label: "One lowercase letter", valid: /[a-z]/.test(newPassword) },
                      { label: "One number", valid: /[0-9]/.test(newPassword) },
                      { label: "One special character", valid: /[^A-Za-z0-9]/.test(newPassword) }
                    ].map((req, i) => (
                      <div key={i} className="flex items-center gap-2 text-[12px]">
                        {req.valid ? (
                          <Check className="w-3.5 h-3.5 text-green-500" strokeWidth={3} />
                        ) : (
                          <X className="w-3.5 h-3.5 text-red-500 opacity-70" strokeWidth={3} />
                        )}
                        <span className={req.valid ? "text-[var(--text-primary)]" : "text-[var(--text-muted)]"}>{req.label}</span>
                      </div>
                    ))}
                  </div>

                  <div className="relative">
                    <input
                      type="password"
                      placeholder="Confirm Password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className={`w-full bg-white dark:bg-[#151722] border rounded-xl px-4 py-3 text-[14px] text-[var(--text-primary)] outline-none transition-colors ${confirmPassword.length > 0
                          ? (newPassword === confirmPassword ? 'border-green-500/50 focus:border-green-500' : 'border-red-500/50 focus:border-red-500')
                          : 'border-[var(--border)] focus:border-[#5351FF]'
                        }`}
                    />
                    {confirmPassword.length > 0 && newPassword === confirmPassword && (
                      <Check className="w-4 h-4 text-green-500 absolute right-4 top-1/2 -translate-y-1/2" strokeWidth={3} />
                    )}
                  </div>
                  {confirmPassword.length > 0 && newPassword !== confirmPassword && (
                    <div className="text-red-500 text-[12px] px-1 -mt-1">Passwords do not match</div>
                  )}

                  <div className="flex justify-end mt-2">
                    <button
                      onClick={handleSavePassword}
                      disabled={
                        !newPassword ||
                        saving ||
                        (policy.has_password && !currentPassword) ||
                        newPassword.length < 8 ||
                        !/[A-Z]/.test(newPassword) ||
                        !/[a-z]/.test(newPassword) ||
                        !/[0-9]/.test(newPassword) ||
                        !/[^A-Za-z0-9]/.test(newPassword) ||
                        newPassword !== confirmPassword
                      }
                      className="bg-[#5351FF] text-white px-6 py-2.5 rounded-[12px] font-semibold text-[13px] disabled:opacity-50 disabled:bg-[var(--surface-hover)] disabled:text-[var(--text-muted)] transition-all flex items-center justify-center min-w-[100px]"
                    >
                      {saving ? <Loader2 className="animate-spin w-4 h-4" /> : "Save Password"}
                    </button>
                  </div>
                </div>
              </div>
            )}


          </div>
        </div>

        {/* Policies Group */}
        <div id="security-policies-group" className="scroll-mt-4">
          <div className="flex items-center justify-between mb-1 px-1">
            <h3 className="text-[11px] text-[var(--text-muted)] font-semibold uppercase tracking-wider">Policies</h3>
            {focusSection === 'limits' && (
              <span className="text-[11px] font-semibold text-[#3B82F6] flex items-center gap-1 animate-pulse">
                Update limits here
              </span>
            )}
          </div>
          <div className={`bg-white dark:bg-[#0c0d14] rounded-[16px] flex flex-col overflow-hidden transition-all duration-300 ${focusSection === 'limits'
              ? 'border-2 border-[#3B82F6] ring-4 ring-[#3B82F6]/20 shadow-lg'
              : 'border border-slate-200/80 dark:border-[var(--border)] shadow-sm'
            }`}>

            <div className="flex flex-col px-3 py-3 border-b border-[var(--border-soft)]">
              <div className="flex items-center justify-between mb-0.5">
                <div className="flex items-center gap-2.5 text-[13px] font-medium text-[var(--text-primary)] whitespace-nowrap">
                  <DollarSign className="w-4 h-4 text-[var(--text-muted)]" />
                  Max Per Transaction
                </div>
                <div className="flex items-center gap-1 shrink-0 bg-[var(--surface-hover)] border border-[var(--border)] rounded-lg px-2.5 py-1 hover:border-[var(--text-muted)] focus-within:border-[#5351FF] focus-within:ring-1 focus-within:ring-[#5351FF]/30 transition-all cursor-text" onClick={(e) => { const i = e.currentTarget.querySelector('input'); if (i) i.focus(); }}>
                  <span className="text-[13px] font-medium text-[var(--text-muted)]">$</span>
                  <input
                    id="security-max-tx-input"
                    type="text"
                    value={draft.max_transaction_amount}
                    onChange={(e) => handleChange('max_transaction_amount', e.target.value)}
                    className="w-16 bg-transparent text-right text-[13px] font-bold text-[var(--text-primary)] outline-none transition-colors"
                  />
                </div>
              </div>
              {errors.max_transaction_amount && <span className="text-[10px] text-[var(--accent-red)] text-right font-medium pr-1 mt-1">{errors.max_transaction_amount}</span>}
            </div>

            <div className="flex flex-col px-3 py-3">
              <div className="flex items-center justify-between mb-0.5">
                <div className="flex items-center gap-2.5 text-[13px] font-medium text-[var(--text-primary)] whitespace-nowrap">
                  <Activity className="w-4 h-4 text-[var(--text-muted)]" />
                  Daily Limit
                </div>
                <div className="flex items-center gap-1 shrink-0 bg-[var(--surface-hover)] border border-[var(--border)] rounded-lg px-2.5 py-1 hover:border-[var(--text-muted)] focus-within:border-[#5351FF] focus-within:ring-1 focus-within:ring-[#5351FF]/30 transition-all cursor-text" onClick={(e) => { const i = e.currentTarget.querySelector('input'); if (i) i.focus(); }}>
                  <span className="text-[13px] font-medium text-[var(--text-muted)]">$</span>
                  <input
                    id="security-daily-limit-input"
                    type="text"
                    value={draft.daily_transfer_limit}
                    onChange={(e) => handleChange('daily_transfer_limit', e.target.value)}
                    className="w-16 bg-transparent text-right text-[13px] font-bold text-[var(--text-primary)] outline-none transition-colors"
                  />
                </div>
              </div>
              {errors.daily_transfer_limit && <span className="text-[10px] text-[var(--accent-red)] text-right font-medium pr-1 mt-1">{errors.daily_transfer_limit}</span>}
            </div>

          </div>
        </div>

        {/* Display Group */}
        <div>
          <h3 className="text-[11px] text-[var(--text-muted)] font-semibold mb-1 px-1 uppercase tracking-wider">Display & Notifications</h3>
          <div className="bg-white dark:bg-[#0c0d14] rounded-[16px] flex flex-col border border-slate-200/80 dark:border-[var(--border)] overflow-hidden shadow-sm">

            <div
              onClick={() => toggleHideBalances && toggleHideBalances()}
              className="flex items-center justify-between px-3 py-3 border-b border-[var(--border-soft)] cursor-pointer hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
            >
              <div className="flex items-center gap-2.5 text-[13px] font-medium text-[var(--text-primary)] whitespace-nowrap">
                {isBalancesHidden ? <EyeOff className="w-4 h-4 text-[var(--text-muted)]" /> : <Eye className="w-4 h-4 text-[var(--text-muted)]" />}
                Hide Balances
              </div>
              <div className="shrink-0">
                <ToggleSwitch active={!!isBalancesHidden} />
              </div>
            </div>


          </div>
        </div>

      </div>

      {/* Floating Save Changes Middle Popup */}
      <AnimatePresence>
        {hasChanges() && (
          <motion.div
            initial={{ y: 35, x: "-50%", opacity: 0, scale: 0.94 }}
            animate={{ y: 0, x: "-50%", opacity: 1, scale: 1 }}
            exit={{ y: 35, x: "-50%", opacity: 0, scale: 0.94 }}
            transition={{ type: "spring", damping: 26, stiffness: 340 }}
            className="absolute bottom-4 left-1/2 z-30 bg-white/95 dark:bg-[#12131a]/95 backdrop-blur-xl border border-slate-200/90 dark:border-white/15 rounded-full p-1.5 pl-3 pr-1.5 shadow-[0_16px_36px_rgba(0,0,0,0.18)] dark:shadow-[0_20px_48px_rgba(0,0,0,0.7)] flex items-center gap-2 select-none whitespace-nowrap"
          >
            <button
              type="button"
              onClick={handleReset}
              disabled={saving}
              className="px-3 py-1.5 rounded-full text-[12.5px] font-semibold text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-slate-100 dark:hover:bg-white/10 transition-colors cursor-pointer disabled:opacity-40"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={() => handleSave()}
              disabled={hasErrors || saving}
              className="h-9 px-4 rounded-full bg-[#27272a] text-white hover:bg-[#3f3f46] border border-[#3f3f46] dark:bg-[#27272a] dark:text-white dark:hover:bg-[#3f3f46] dark:border-white/20 font-bold text-[12.5px] tracking-wide flex items-center gap-1.5 shadow-sm active:scale-95 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5 stroke-[2.4]" />
              )}
              <span>{saving ? "Saving..." : "Save Changes"}</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Custom Sliding Selector Bottom Sheet */}
      <AnimatePresence>
        {activeSelector && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute inset-0 bg-white/75 dark:bg-black/60 backdrop-blur-sm z-40"
              onClick={() => setActiveSelector(null)}
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 280 }}
              className="absolute bottom-0 left-0 right-0 max-h-[85%] bg-white dark:bg-[#0c0d14] rounded-t-[20px] z-50 border-t border-slate-200/80 dark:border-[var(--border)] shadow-2xl flex flex-col overflow-hidden"
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-[var(--border-soft)] shrink-0">
                <h3 className="font-bold text-[14px] text-[var(--text-primary)]">{activeSelector.title}</h3>
                <button
                  onClick={() => setActiveSelector(null)}
                  className="p-1.5 -mr-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors rounded-full hover:bg-slate-100 dark:hover:bg-white/5"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="p-3 pb-3.5 overflow-y-auto hide-scrollbar flex flex-col gap-1.5">
                {activeSelector.options.map((option, idx) => {
                  const isSelected = draft[activeSelector.field] === option.value;
                  const isLocked = activeSelector.field === 'passkey_mode' && option.value === 'DISABLED';

                  return (
                    <div key={idx} className="flex flex-col">
                      <div
                        className={`flex items-center justify-between py-2.5 px-3.5 rounded-[12px] transition-colors ${isLocked
                          ? 'opacity-50 cursor-not-allowed bg-[var(--surface-hover)] text-[var(--text-muted)]'
                          : isSelected
                            ? 'bg-[var(--text-primary)] text-[var(--bg)] cursor-pointer shadow-xs'
                            : 'hover:bg-slate-100 dark:hover:bg-white/5 text-[var(--text-primary)] cursor-pointer border border-transparent'
                          }`}
                        onClick={(e) => {
                          if (isLocked) {
                            e.preventDefault();
                            return;
                          }
                          handleChange(activeSelector.field, option.value);
                          if (activeSelector.field === 'passkey_mode' && option.value === 'THRESHOLD') {
                            // Leave it open to show the amount input
                          } else {
                            setActiveSelector(null);
                          }
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] font-semibold">{option.label}</span>
                          {isLocked && <Lock className="w-3.5 h-3.5" />}
                        </div>
                        {isSelected && !isLocked && <CheckCircle2 className="w-4 h-4" />}
                      </div>

                      {/* Inline Threshold Input specifically for Passkey Mode -> THRESHOLD */}
                      <AnimatePresence>
                        {activeSelector.field === 'passkey_mode' && option.value === 'THRESHOLD' && isSelected && (
                          <motion.div
                            initial={{ height: 0, opacity: 0, marginTop: 0 }}
                            animate={{ height: "auto", opacity: 1, marginTop: 6 }}
                            exit={{ height: 0, opacity: 0, marginTop: 0 }}
                            className="overflow-hidden"
                          >
                            <div className="flex items-center gap-2 bg-[var(--surface-hover)] p-2 rounded-[12px] border border-[var(--border)]">
                              <span className="text-[12px] font-medium text-[var(--text-muted)] pl-2">Above ($)</span>
                              <input
                                type="text"
                                value={draft.passkey_threshold}
                                onChange={(e) => handleChange('passkey_threshold', e.target.value)}
                                className="flex-1 bg-transparent text-right text-[13px] font-bold text-[var(--text-primary)] outline-none min-w-0"
                                placeholder="0.00"
                              />
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveSelector(null);
                                }}
                                disabled={!!errors.passkey_threshold || !draft.passkey_threshold}
                                className="cyber-button ml-1 disabled:opacity-50"
                                style={{ width: "auto", height: 26, padding: "0 12px", fontSize: 11 }}
                              >
                                <span>Save</span>
                              </button>
                            </div>
                            {errors.passkey_threshold && (
                              <p className="text-[10px] text-[var(--accent-red)] text-right font-medium mt-1 pr-2">
                                {errors.passkey_threshold}
                              </p>
                            )}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
