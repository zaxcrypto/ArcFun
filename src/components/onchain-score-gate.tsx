/* eslint-disable */
"use client";

import { useState, useEffect } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { Loader2, ShieldAlert, CheckCircle2, XCircle, ArrowRight, Activity, ShieldCheck, Lock, MessageSquare, SearchCode } from "lucide-react";
import { fetchArcStats, type ArcAccountStats } from "@/lib/arc-api";
import { calculateArcScore, type ArcScore } from "@/lib/arc-score";
import { supabase } from "@/lib/supabase";

import { TurnstileModal } from "@/components/turnstile-modal";

export function OnchainScoreGate({ 
  moduleName, 
  onSuccess 
}: { 
  moduleName: "swap" | "bridge"; 
  onSuccess: () => void;
}) {
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();
  
  const [arcStats, setArcStats] = useState<ArcAccountStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [score, setScore] = useState<ArcScore | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [isGettingAccess, setIsGettingAccess] = useState(false);
  const [showTurnstile, setShowTurnstile] = useState(false);

  // --- SUPABASE STATE ---
  const [supaSettings, setSupaSettings] = useState<any | null>(null);
  const [supaSettingsLoading, setSupaSettingsLoading] = useState(true);
  const [supaRequestStatus, setSupaRequestStatus] = useState<string | null>(null);
  const [supaRequestStatusLoading, setSupaRequestStatusLoading] = useState(true);

  useEffect(() => {
    supabase.from("onchain_access_settings").select("*").then(({ data, error }) => {
      if (error || !data || data.length === 0) {
        if (error) console.warn(`[Supabase Fallback] Component: onchain-score-gate (supaSettings) | Error: ${error.message}`);
        // Apply default fallback if empty or errors out
        setSupaSettings({
          swapMode: "Score Protected",
          bridgeMode: "Score Protected"
        });
      } else {
        const parsed: any = {};
        data.forEach((row: any) => {
          if (row.module === "swap") parsed.swapMode = row.mode;
          if (row.module === "bridge") parsed.bridgeMode = row.mode;
        });
        setSupaSettings({
          swapMode: parsed.swapMode || "Score Protected",
          bridgeMode: parsed.bridgeMode || "Score Protected"
        });
      }
      setSupaSettingsLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!address) {
      setSupaRequestStatus("none");
      setSupaRequestStatusLoading(false);
      setSupaSettingsLoading(false);
      return;
    }
    
    // We must wait for master settings to know if we even need to fetch
    if (supaSettingsLoading) return;
    
    const currentMode = moduleName === "swap" ? supaSettings?.swapMode : supaSettings?.bridgeMode;
    const isVerifiedLocally = !!sessionStorage.getItem(`arc_verified_${address}`);
    
    // If the mode doesn't require checking request status, skip the DB call
    if (
      currentMode === "Open To Everyone" || 
      currentMode === "Admin Only" || 
      (currentMode === "Score Protected" && isVerifiedLocally)
    ) {
      setSupaRequestStatus("none");
      setSupaRequestStatusLoading(false);
      return;
    }
    
    // Otherwise, fetch from Supabase
    setSupaRequestStatusLoading(true);
    supabase.from("access_requests").select("request_status").eq("wallet_address", address.toLowerCase()).single().then(({ data, error }) => {
      if (error && error.code !== "PGRST116") { 
        console.warn(`[Supabase Fallback] Component: onchain-score-gate (status) | Error: ${error.message}`);
      } else if (data) {
        setSupaRequestStatus(data.request_status);
      } else {
        setSupaRequestStatus("none");
      }
      setSupaRequestStatusLoading(false);
    });
  }, [address, supaSettingsLoading, supaSettings, moduleName]);



  const mode = moduleName === "swap" ? supaSettings?.swapMode : supaSettings?.bridgeMode;

  useEffect(() => {
    let mounted = true;

    if (mode === "Open To Everyone") {
      if (mounted) onSuccess();
    } else if (mode === "Score Protected" && address && sessionStorage.getItem(`arc_verified_${address}`)) {
      if (mounted) onSuccess();
    }

    return () => { mounted = false; };
  }, [mode, supaRequestStatus, address, onSuccess]);

  const runVerification = async () => {
    if (!address) return;
    setVerifying(true);
    setLoadingStats(true);
    try {
      const stats = await fetchArcStats(address);
      setArcStats(stats);
      const calculated = calculateArcScore(stats, 0); // tokens deployed usually 0 for general users
      setScore(calculated);
    } catch (err) {
      console.error(err);
    }
    setLoadingStats(false);
  };

  const handleGetInstantAccess = async (tokenOverride?: string) => {
    if (!address) return;
    
    const turnstileData = JSON.parse(localStorage.getItem("arcfun_turnstile_verified") || "{}");
    const sessionToken = tokenOverride || turnstileData.sessionToken || "";
    
    if (!sessionToken) {
      setShowTurnstile(true);
      return;
    }

    setIsGettingAccess(true);
    try {
      const signature = await signMessageAsync({
        message: `Authorize my wallet ${address} for ArcFun Swap.`
      });

      const res = await fetch("/api/auto-whitelist", {
        method: "POST",
        headers: { "Authorization": `Bearer ${sessionToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ address, signature })
      });

      if (res.status === 403 && !tokenOverride) {
        // Token expired, show turnstile
        setShowTurnstile(true);
        setIsGettingAccess(false);
        return;
      }

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        alert(`Authorization Failed: ${errorData.error || "Server error"}`);
        throw new Error("Failed to authorize on blockchain");
      }

      sessionStorage.setItem(`arc_verified_${address}`, "true");
      sessionStorage.setItem(`arc_whitelisted_${address}`, "true");
      onSuccess();
    } catch (err: any) {
      console.error("Instant access error:", err);
      if (!err.message?.includes("User rejected")) {
        // Only alert if it's not a user rejection of the signature
        alert(err.message || "An error occurred during authorization.");
      }
    }
    setIsGettingAccess(false);
  };

  const handleRequestAccess = async () => {
    if (!address || !score) return;
    try {
      const signature = await signMessageAsync({
        message: `Requesting ArcFun access for wallet ${address} with Onchain Score: ${score.total}`
      });

      // SUPABASE PRIMARY WRITE
      const { error } = await supabase.from("access_requests").upsert({
        wallet_address: address.toLowerCase(),
        score: score.total,
        components: score.breakdown,
        signature,
        timestamp: Date.now(),
        request_status: "pending"
      }, { onConflict: "wallet_address" });

      if (error) {
      }

      // Update local state to immediately show pending
      setSupaRequestStatus("pending");
    } catch (e) {
      console.error(e);
    }
  };

  if (supaSettingsLoading || supaRequestStatusLoading) {
    return (
      <div className="animate-fade-up" style={{ padding: "40px 0", textAlign: "center" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
          <Loader2 style={{ animation: "spin 1s linear infinite", color: "var(--text-primary)" }} size={32} />
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "var(--text-primary)" }}>Loading ArcFun Swap Engine...</div>
            <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>Preparing trading environment</div>
          </div>
        </div>
      </div>
    );
  }

  if (!supaSettings) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: "100px 20px" }}>
        <Loader2 style={{ animation: "spin 1s linear infinite", opacity: 0.5 }} />
      </div>
    );
  }

  if (mode === "Admin Only") {
    return (
      <div className="animate-fade-up" style={{ padding: "40px 0", textAlign: "center" }}>
        <div style={{ width: 64, height: 64, borderRadius: 16, background: "rgba(255,255,255,0.03)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px" }}>
          <Lock style={{ width: 28, height: 28, color: "var(--text-muted)" }} />
        </div>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: "var(--text-primary)", marginBottom: 8 }}>Building In Progress</h2>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.5 }}>
          Only admins can access this feature right now.<br/>Please check back later.
        </p>
      </div>
    );
  }



  if (mode === "Score Protected" && supaRequestStatus !== "approved" && (!verifying || loadingStats)) {
    return (
      <div className="animate-fade-up" style={{ padding: "30px 0", textAlign: "center", position: "relative", overflow: "hidden" }}>
        
        {loadingStats ? (
          <div style={{ padding: "20px 0" }}>
            <div style={{ position: "relative", width: 80, height: 80, margin: "0 auto 32px" }}>
              <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "2px dashed rgba(179,0,0,0.4)", animation: "spin 4s linear infinite" }} />
              <div style={{ position: "absolute", inset: 4, borderRadius: "50%", border: "2px solid rgba(179,0,0,0.1)" }} />
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <SearchCode style={{ width: 32, height: 32, color: "#e53935", animation: "pulse 1.5s ease-in-out infinite" }} />
              </div>
              <div style={{ position: "absolute", left: 0, right: 0, height: 2, background: "rgba(179,0,0,0.8)", boxShadow: "0 0 10px #b30000", animation: "scan 2s ease-in-out infinite alternate" }} />
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: "var(--text-primary)", marginBottom: 12 }}>Analyzing Wallet</h2>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", maxWidth: 260, margin: "0 auto" }}>
              Scanning on-chain history across Arc Testnet and supported chains...
            </p>
            <style dangerouslySetInnerHTML={{__html: `
              @keyframes scan { 0% { top: 0%; opacity: 0; } 10% { opacity: 1; } 90% { opacity: 1; } 100% { top: 100%; opacity: 0; } }
            `}} />
          </div>
        ) : (
          <>
            <div style={{ width: 64, height: 64, borderRadius: "50%", background: "rgba(179,0,0,0.1)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px", boxShadow: "0 0 20px rgba(179,0,0,0.2)" }}>
              <ShieldAlert style={{ width: 28, height: 28, color: "var(--text-primary)" }} />
            </div>
            <h2 style={{ fontSize: 24, fontWeight: 800, color: "var(--text-primary)", marginBottom: 12 }}>Bot Protection</h2>
            <p style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 32 }}>
              Please check your Onchain Score before accessing ArcFun.
            </p>
            
            <button
              onClick={runVerification}
              style={{ width: "100%", background: "var(--arc-multi-gradient)", color: "#fff", padding: "14px 24px", borderRadius: 12, border: "none", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, fontSize: 14, fontWeight: 800, cursor: "pointer", boxShadow: "0 4px 20px rgba(179,0,0,0.3)" }}
            >
              <Activity size={18} />
              <span>Check Onchain Score</span>
            </button>
          </>
        )}
      </div>
    );
  }

  if (score && score.total < 50 && supaRequestStatus !== "approved") {
    return (
      <div className="animate-fade-up" style={{ padding: "30px 0" }}>
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{ width: 48, height: 48, borderRadius: "50%", background: "rgba(179,0,0,0.1)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}>
            <XCircle style={{ width: 24, height: 24, color: "#ef4444" }} />
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: "var(--text-primary)", marginBottom: 4 }}>Access Denied</h2>
          <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>Low Onchain Score</p>
        </div>

        <div style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 10, padding: 16, marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600, marginBottom: 4 }}>Current Score</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: "#ef4444" }}>{score.total}</div>
          </div>
          <div style={{ width: 1, height: 40, background: "var(--border-soft)" }} />
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600, marginBottom: 4 }}>Required Score</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: "var(--text-primary)" }}>50</div>
          </div>
        </div>

        {supaRequestStatus === "pending" ? (
          <div style={{ padding: "12px", background: "rgba(255,255,255,0.03)", border: "1px solid var(--border-soft)", borderRadius: 10, textAlign: "center", color: "var(--text-muted)", fontSize: 13, fontWeight: 600 }}>
            Access request is pending admin review.
          </div>
        ) : supaRequestStatus === "rejected" || supaRequestStatus === "revoked" ? (
          <div style={{ padding: "12px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 10, textAlign: "center", color: "#ef4444", fontSize: 13, fontWeight: 600 }}>
            Your access request was denied.
          </div>
        ) : (
          <button
            onClick={handleRequestAccess}
            style={{ width: "100%", background: "var(--arc-multi-gradient)", color: "#fff", padding: "12px", borderRadius: 10, border: "none", fontSize: 13, fontWeight: 800, cursor: "pointer", marginBottom: 12, boxShadow: "0 4px 20px rgba(179,0,0,0.3)" }}
          >
            Request Access
          </button>
        )}

        <button 
          onClick={() => {
            window.open("https://x.com/0x_zax", "_blank");
          }}
          style={{ width: "100%", padding: "12px", background: "rgba(255,255,255,0.02)", border: "1px solid var(--border-soft)", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, color: "var(--text-secondary)", fontSize: 13, fontWeight: 600, cursor: "pointer", marginTop: supaRequestStatus === "none" ? 0 : 12, transition: "background 0.2s" }}
          onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.05)"}
          onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.02)"}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4l11.733 16h4.267l-11.733 -16z" /><path d="M4 20l6.768 -6.768m2.46 -2.46l6.772 -6.772" /></svg>
          Contact via DM for easier access
        </button>
      </div>
    );
  }

  if (score && score.total >= 50 && supaRequestStatus !== "approved" && !sessionStorage.getItem(`arc_verified_${address}`)) {
    return (
      <div className="animate-fade-up" style={{ padding: "30px 0" }}>
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(22, 163, 74, 0.1)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px", boxShadow: "0 0 20px rgba(22, 163, 74, 0.2)" }}>
            <ShieldCheck style={{ width: 28, height: 28, color: "#16a34a" }} />
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: "var(--text-primary)", marginBottom: 4 }}>You are Eligible!</h2>
          <p style={{ fontSize: 14, color: "var(--text-secondary)" }}>Your Onchain Score is {score.total}</p>
        </div>

        <div style={{ background: "rgba(22, 163, 74, 0.05)", border: "1px solid rgba(22, 163, 74, 0.2)", borderRadius: 10, padding: "12px 16px", marginBottom: 24, textAlign: "center", color: "#16a34a", fontSize: 13, fontWeight: 600 }}>
          You have passed the security threshold. Sign to authorize your wallet on the smart contract.
        </div>

        <button
          onClick={() => handleGetInstantAccess()}
          disabled={isGettingAccess}
          className="cyber-button"
          style={{ width: "100%", padding: "14px", borderRadius: 12, border: "none", fontSize: 14, fontWeight: 800, cursor: isGettingAccess ? "not-allowed" : "pointer", opacity: isGettingAccess ? 0.7 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
        >
          {isGettingAccess ? (
            <>
              <Loader2 className="animate-spin" size={18} />
              Authorizing on Blockchain...
            </>
          ) : (
            <>
              Get Access
              <ArrowRight size={18} />
            </>
          )}
        </button>

        <TurnstileModal 
          isOpen={showTurnstile} 
          onClose={() => setShowTurnstile(false)} 
          onSuccess={(token) => {
            setShowTurnstile(false);
            if (token) {
              localStorage.setItem("arcfun_turnstile_verified", JSON.stringify({ sessionToken: token }));
              handleGetInstantAccess(token);
            }
          }} 
        />
      </div>
    );
  }

  if (mode === "Score Protected" && supaRequestStatus === "approved" && !sessionStorage.getItem(`arc_verified_${address}`)) {
    return (
      <div className="animate-fade-up" style={{ padding: "24px 0", textAlign: "center" }}>
        <div style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(22, 163, 74, 0.1)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px", boxShadow: "0 0 20px rgba(22, 163, 74, 0.2)" }}>
          <ShieldCheck style={{ width: 28, height: 28, color: "#16a34a" }} />
        </div>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: "var(--text-primary)", marginBottom: 4 }}>Access Approved</h2>
        <p style={{ fontSize: 14, color: "var(--text-secondary)" }}>An admin has manually approved your wallet.</p>
        
        <div style={{ background: "rgba(22, 163, 74, 0.05)", border: "1px solid rgba(22, 163, 74, 0.2)", borderRadius: 10, padding: "12px 16px", margin: "24px 0", textAlign: "center", color: "#16a34a", fontSize: 13, fontWeight: 600 }}>
          Sign to authorize your wallet on the smart contract.
        </div>

        <button
          onClick={() => handleGetInstantAccess()}
          disabled={isGettingAccess}
          className="cyber-button"
          style={{ width: "100%", padding: "14px", borderRadius: 12, border: "none", fontSize: 14, fontWeight: 800, cursor: isGettingAccess ? "not-allowed" : "pointer", opacity: isGettingAccess ? 0.7 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
        >
          {isGettingAccess ? (
            <>
              <Loader2 className="animate-spin" size={18} />
              Authorizing on Blockchain...
            </>
          ) : (
            <>
              Get Access
              <ArrowRight size={18} />
            </>
          )}
        </button>

        <TurnstileModal 
          isOpen={showTurnstile} 
          onClose={() => setShowTurnstile(false)} 
          onSuccess={(token) => {
            setShowTurnstile(false);
            if (token) {
              localStorage.setItem("arcfun_turnstile_verified", JSON.stringify({ sessionToken: token }));
              handleGetInstantAccess(token);
            }
          }} 
        />
      </div>
    );
  }

  if (!address) {
    return (
      <div className="animate-fade-up" style={{ padding: "40px 0", textAlign: "center" }}>
        <div style={{ width: 64, height: 64, borderRadius: "50%", background: "rgba(255,255,255,0.03)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px", border: "1px solid var(--border-soft)" }}>
          <ShieldAlert style={{ width: 28, height: 28, color: "var(--text-muted)" }} />
        </div>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: "var(--text-primary)", marginBottom: 12 }}>Wallet Required</h2>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 24, maxWidth: 300, margin: "0 auto" }}>
          Please connect your EVM wallet to access the ArcFun {moduleName === "swap" ? "Swap" : "Bridge"}.
        </p>
      </div>
    );
  }

  return null;
}
