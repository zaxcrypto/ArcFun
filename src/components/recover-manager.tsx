"use client";

import React, { useState, useEffect } from "react";
import { ChainRegistry } from "@/lib/bridge/chain-registry";
import { translateNormalizedError } from "@/lib/errors/error-normalizer";
import { CCTP_DOMAINS, getCctpDomains } from "@/lib/bridge/cctp-provider";
import { useEnvironment } from "@/contexts/EnvironmentContext";
import { Loader2, ArrowLeft, ArrowRight, Search, ShieldAlert, CheckCircle, ExternalLink, ShieldCheck, AlertCircle, RefreshCw, Check, Copy, Info, Clock } from "lucide-react";
import { formatUnits } from "viem";
import Image from "next/image";
import { Turnstile } from "@marsidev/react-turnstile";

// Retrieve stored Turnstile session token for authenticated API calls
function getStoredSessionToken(): string {
  if (process.env.NODE_ENV === "development") {
    return "dev_bypass_token"; // Dev environment bypass token
  }
  try {
    const stored = localStorage.getItem("arcfun_turnstile_verified");
    if (stored) {
      const { sessionToken } = JSON.parse(stored);
      return sessionToken || "";
    }
  } catch (_) { }
  return "";
}

type Step = "search" | "preview" | "executing" | "success" | "error";

interface PreviewData {
  source_network: string;
  destination_network: string;
  destinationDomain: number;
  amount: string;
  recipient: string;
  destinationCaller: string;
  expirationBlock: string;
  nonce: string;
  status: string;
}

type Chain = "Arc Testnet" | "Arc Mainnet" | "Ethereum Sepolia" | "Arbitrum Sepolia" | "Arbitrum Mainnet" | "Base Sepolia" | "Base Mainnet" | "Ink Sepolia" | "Linea Sepolia" | "Monad Testnet" | "Sonic Testnet" | "Unichain Sepolia" | "Optimism Sepolia" | "Solana Devnet" | "Solana Mainnet" | "Injective EVM Testnet" | "Stellar Testnet" | "Avalanche Fuji" | "HyperEVM Testnet" | "Polygon Amoy Testnet";

const CHAIN_LOGOS: Record<string, string> = {
  "Arc Testnet": "/arc-logo.png",
  "Arc Mainnet": "/arc-logo.png",
  "Ethereum Sepolia": "/icons/ethereum.svg",
  "Arbitrum Sepolia": "/icons/arbitrum.svg",
  "Arbitrum Mainnet": "/icons/arbitrum.svg",
  "Base Sepolia": "/icons/base.svg",
  "Base Mainnet": "/icons/base.svg",
  "Ink Sepolia": "/icons/ink.svg",
  "Linea Sepolia": "/icons/linea.svg",
  "Monad Testnet": "/icons/monad.svg",
  "Sonic Testnet": "/icons/sonic.png",
  "Unichain Sepolia": "/icons/unichain.svg",
  "Optimism Sepolia": "/icons/optimism.svg",
  "Solana Devnet": "https://s2.coinmarketcap.com/static/img/coins/64x64/5426.png",
  "Solana Mainnet": "https://s2.coinmarketcap.com/static/img/coins/64x64/5426.png",
  "Injective EVM Testnet": "/icons/injective.png",
  "Stellar Testnet": "https://s2.coinmarketcap.com/static/img/coins/64x64/512.png",
  "Avalanche Fuji": "https://s2.coinmarketcap.com/static/img/coins/64x64/5805.png",
  "HyperEVM Testnet": "https://coin-images.coingecko.com/coins/images/50882/large/hyperliquid.jpg",
  "Polygon Amoy Testnet": "https://s2.coinmarketcap.com/static/img/coins/64x64/3890.png",
  "X Layer Testnet": "/icons/xlayer.png",
};

export function RecoverManager() {
  const { mode } = useEnvironment();
  const [step, setStep] = useState<Step>("search");
  const [sourceNetwork, setSourceNetwork] = useState<string>("");
  const [burnTxHash, setBurnTxHash] = useState<string>("");

  const [isSearching, setIsSearching] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [canRetry, setCanRetry] = useState<boolean>(true);
  const [copied, setCopied] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [showTurnstile, setShowTurnstile] = useState(false);
  const [turnstileVerifying, setTurnstileVerifying] = useState(false);
  const [turnstileError, setTurnstileError] = useState<string | null>(null);
  const [turnstileRetryCount, setTurnstileRetryCount] = useState(0);
  const [turnstileManualRetry, setTurnstileManualRetry] = useState(false);

  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [mintTxHash, setMintTxHash] = useState<string | null>(null);
  const [progressPct, setProgressPct] = useState(0);
  const executingStep = progressPct < 50 ? 0 : progressPct < 100 ? 1 : 2;

  const [showFromChainPicker, setShowFromChainPicker] = useState(false);

  const activeDomains = getCctpDomains(mode);
  const availableNetworks = ChainRegistry.getActiveChains(mode)
    .filter(c => Object.keys(activeDomains).includes(c.name))
    .map(c => c.name);

  // Reset search state on environment toggle
  useEffect(() => {
    setSourceNetwork("");
    setBurnTxHash("");
    setPreviewData(null);
    setStep("search");
    setErrorMsg(null);
  }, [mode]);

  const handleSearch = async () => {
    if (!burnTxHash.trim()) {
      setErrorMsg("Please enter a valid burn transaction hash");
      return;
    }

    setIsSearching(true);
    setErrorMsg(null);

    try {
      const res = await fetch("/api/bridge/universal-recover/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_network: sourceNetwork,
          burn_tx_hash: burnTxHash.trim(),
          environment: mode
        })
      });

      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await res.text();
        throw new Error(`Server returned non-JSON response: ${text.slice(0, 150)}...`);
      }

      const data = await res.json();
      if (!res.ok) {
        throw { isStructuredError: true, payload: data.error || { code: "ERR_INTERNAL" } };
      }

      setPreviewData(data.preview);
      setStep("preview");
    } catch (e: any) {
      const errorInput = e.isStructuredError ? e.payload : e.message;
      if (errorInput?.code === "ERR_ALREADY_CLAIMED" || errorInput === "ERR_ALREADY_CLAIMED") {
        setMintTxHash("ALREADY_CLAIMED_ON_CHAIN");
        setStep("success");
      } else {
        const translation = translateNormalizedError(errorInput);
        setErrorMsg(translation.message);
        setCanRetry(translation.canRetry);
      }
    } finally {
      setIsSearching(false);
    }
  };

  const handleTurnstileSuccess = async (token: string) => {
    setTurnstileVerifying(true);
    setTurnstileError(null);
    try {
      const res = await fetch("/api/verify-turnstile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (data.success) {
        setShowTurnstile(false);
        localStorage.setItem("arcfun_turnstile_verified", JSON.stringify({ sessionToken: data.sessionToken }));
        handleExecute(data.sessionToken);
      } else {
        setTurnstileError("Verification failed. Please try again.");
      }
    } catch (err) {
      setTurnstileError("Network error. Please try again.");
    } finally {
      setTurnstileVerifying(false);
    }
  };

  const handleTurnstileError = () => {
    if (turnstileRetryCount < 2) {
      // Auto-retry by forcing a remount (changing the key)
      setTurnstileRetryCount(prev => prev + 1);
    } else {
      setTurnstileError("Widget failed to load.");
      setTurnstileManualRetry(true);
    }
  };

  const handleExecute = async (tokenOverride?: string) => {
    if (!previewData || step === "executing") return;

    const isLocal = typeof window !== 'undefined' && 
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
    const currentToken = isLocal ? "local-dev-bypass" : (tokenOverride || getStoredSessionToken());
    if (!currentToken) {
      setShowTurnstile(true);
      return;
    }

    setStep("executing");
    setProgressPct(0);
    setErrorMsg(null);

    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), 65000);

    const interval = setInterval(() => {
      setProgressPct((prev) => {
        if (prev >= 98) return 98;
        if (prev < 40) return prev + 1.2; // Fast
        if (prev < 70) return prev + 0.6; // Medium
        if (prev < 90) return prev + 0.2; // Slow
        return prev + 0.05; // Slow-mo
      });
    }, 100);

    try {
      const res = await fetch("/api/bridge/universal-recover/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${currentToken}` },
        body: JSON.stringify({
          source_network: sourceNetwork,
          burn_tx_hash: burnTxHash.trim(),
          environment: mode
        }),
        signal: abortController.signal
      });
      clearTimeout(timeoutId);

      if (res.status === 403) {
        setShowTurnstile(true);
        setStep("preview"); // Reset step to let them retry gracefully
        return;
      }

      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await res.text();
        throw new Error(`Server returned non-JSON response: ${text.slice(0, 150)}...`);
      }

      const data = await res.json();
      if (!res.ok) {
        throw { isStructuredError: true, payload: data.error || { code: "ERR_INTERNAL" } };
      }

      setMintTxHash(data.mint_tx_hash);
      setProgressPct(100);

      setTimeout(() => {
        setStep("success");
      }, 600); // Give it a moment to show 100% completion
    } catch (e: any) {
      clearTimeout(timeoutId);
      if (e.name === 'AbortError') {
        setErrorMsg("Confirmation is taking longer than expected. The recovery transaction may still be processing on the destination network. Please retry after a minute to check the latest status.");
        setCanRetry(true);
      } else {
        const errorInput = e.isStructuredError ? e.payload : e.message;
        const translation = translateNormalizedError(errorInput);
        setErrorMsg(translation.message);
        setCanRetry(translation.canRetry);
      }
      setStep("error");
    } finally {
      clearInterval(interval);
    }
  };

  const reset = () => {
    setStep("search");
    setPreviewData(null);
    setBurnTxHash("");
    setErrorMsg(null);
    setCanRetry(true);
    setMintTxHash(null);
    setCopied(false);
  };

  return (
    <div
      className="lf-card swap-main-card"
      style={{
        overflow: "visible",
        padding: 24,
        display: "flex",
        flexDirection: "column",
        gap: 20,
        borderRadius: 24,
        boxShadow: "0 12px 40px rgba(0,0,0,0.08), inset 0 1px 1px rgba(255,255,255,0.05)",
        width: "100%",
        maxWidth: 424,
        minHeight: 520,
        flexShrink: 0,
        position: "relative",
        zIndex: showFromChainPicker ? 100 : 10,
        transform: step !== "search" ? "translateX(-212px)" : "translateX(0px)",
        transition: "transform 0.4s cubic-bezier(0.32, 0.72, 0, 1)"
      }}>
      <div style={{ width: "100%", flex: 1, display: "flex", flexDirection: "column" }}>

        {/* ALWAYS SHOW SEARCH UI on the left */}
        <div className="fade-in" style={{ opacity: step !== "search" ? 0.4 : 1, pointerEvents: step !== "search" ? "none" : "auto", transition: "opacity 0.3s", display: "flex", flexDirection: "column", height: "100%", flex: 1 }}>

          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
            <button
              onClick={() => setShowInfo(!showInfo)}
              style={{ background: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 4, borderRadius: "50%", color: showInfo ? "var(--text-primary)" : "var(--text-muted)", transition: "color 0.2s" }}
            >
              <Info size={18} />
            </button>
          </div>

          {showInfo && (
            <div className="fade-in" style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: "16px 20px", marginBottom: 16, boxShadow: "0 4px 12px rgba(0,0,0,0.05)" }}>
              <h4 style={{ margin: "0 0 12px 0", fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>How it works:</h4>
              <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6, display: "flex", flexDirection: "column", gap: 6 }}>
                <li>Select the source blockchain</li>
                <li>Paste the burn transaction hash</li>
                <li>Verify the transfer details</li>
                <li>Click Recover Transfer</li>
              </ul>
              <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px dashed var(--border-soft)", fontSize: 12, color: "var(--text-muted)", fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }}>
                <ShieldCheck size={14} /> Only supports Circle CCTP transfers
              </div>
            </div>
          )}

          <div className="swap-input-box" style={{ background: "var(--surface)", padding: 16, borderRadius: 20, border: "1px solid var(--border)", marginBottom: 16 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 12, display: "block" }}>Source Network</label>

            <div style={{ position: "relative" }}>
              <button
                onClick={() => setShowFromChainPicker(p => !p)}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 10,
                  background: "var(--bg-default)", border: "1px solid var(--border)",
                  borderRadius: 14, padding: "12px 16px", cursor: "pointer",
                  color: "var(--text-primary)", fontWeight: 700, fontSize: 15,
                  justifyContent: "space-between",
                  transition: "border-color 0.2s",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {sourceNetwork ? (
                    <>
                      <img src={CHAIN_LOGOS[sourceNetwork]} alt={sourceNetwork}
                        style={{ width: 24, height: 24, borderRadius: "50%", objectFit: "cover" }}
                        onError={e => { e.currentTarget.src = "/globe.svg"; }} />
                      {sourceNetwork}
                    </>
                  ) : (
                    <span style={{ opacity: 0.5, fontWeight: 500 }}>Select source chain</span>
                  )}
                </div>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                  style={{ opacity: 0.5, transform: showFromChainPicker ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>

              {showFromChainPicker && (
                <>
                  <div className="chain-picker-backdrop" onClick={(e) => { e.stopPropagation(); setShowFromChainPicker(false); }} style={{ position: "fixed", inset: 0, zIndex: 9998 }} />
                  <div className="chain-picker-dropdown" style={{
                    position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0,
                    background: "var(--surface)", border: "1px solid var(--border)",
                    borderRadius: 18, padding: 6, overflowY: "auto", overflowX: "hidden", maxHeight: 280, zIndex: 9999,
                    boxShadow: "0 16px 36px -4px rgba(0,0,0,0.24), 0 0 0 1px var(--border-soft)",
                    animation: "txIn 0.18s cubic-bezier(0,0,0.2,1)",
                  }}>
                    {availableNetworks.map(c => {
                      const isSelected = c === sourceNetwork;
                      return (
                        <button key={c} onClick={() => { setSourceNetwork(c); setShowFromChainPicker(false); }}
                          style={{
                            width: "100%", display: "flex", alignItems: "center", gap: 12,
                            padding: "10px 14px", borderRadius: 12,
                            background: isSelected ? "var(--bg-default, rgba(128,128,128,0.08))" : "transparent",
                            border: "none", cursor: "pointer", color: "var(--text-primary)",
                            fontWeight: isSelected ? 700 : 500, fontSize: 14,
                            fontFamily: "var(--font-geist), var(--font-inter), sans-serif",
                            textAlign: "left", transition: "background 0.15s",
                          }}
                        >
                          <img src={CHAIN_LOGOS[c]} alt={c}
                            style={{ width: 22, height: 22, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
                            onError={e => { e.currentTarget.src = "/globe.svg"; }} />
                          <span>{c}</span>
                          {isSelected && (
                            <span style={{
                              marginLeft: "auto",
                              fontSize: 11,
                              fontWeight: 600,
                              fontFamily: "var(--font-geist), var(--font-inter), sans-serif",
                              color: "var(--text-primary)",
                              background: "var(--surface-soft, rgba(128, 128, 128, 0.12))",
                              border: "1px solid var(--border-soft)",
                              borderRadius: 99,
                              padding: "2px 8px",
                              letterSpacing: "-0.01em",
                            }}>Selected</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="swap-input-box" style={{ background: "var(--surface)", padding: 16, borderRadius: 20, border: "1px solid var(--border)", marginBottom: 24 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 12, display: "block" }}>Burn Transaction Hash</label>
            <div style={{ position: "relative" }}>
              <Search size={18} color="#9ca3af" style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)" }} />
              <input
                type="text"
                placeholder="0x..."
                value={burnTxHash}
                onChange={(e) => setBurnTxHash(e.target.value)}
                style={{ width: "100%", padding: "14px 16px 14px 44px", background: "var(--bg-default)", border: "1px solid var(--border)", borderRadius: 14, color: "var(--text-primary)", fontSize: 14, fontFamily: "monospace", outline: "none" }}
              />
            </div>
          </div>

          {step === "search" && errorMsg && (
            <div style={{ padding: 14, background: "rgba(220, 38, 38, 0.1)", border: "1px solid rgba(220, 38, 38, 0.2)", borderRadius: 14, marginBottom: 16 }}>
              <p style={{ color: "#ef4444", fontSize: 13, fontWeight: 500, margin: 0 }}>{errorMsg}</p>
            </div>
          )}

          <div style={{ flex: 1 }} />

          <button
            className="cyber-button swap-action-btn"
            onClick={handleSearch}
            disabled={isSearching || !burnTxHash.trim() || !sourceNetwork}
            style={{ width: "100%", marginTop: "auto" }}
          >
            <span>{isSearching ? <Loader2 size={18} className="spin" /> : "Verify Transfer"}</span>
          </button>
        </div>

        {/* RIGHT PANEL FOR PREVIEW, EXECUTING, ERROR, SUCCESS */}
        <div
          className="route-details-card absolute inset-0 md:left-full md:right-auto md:ml-6 md:w-[424px] w-full shrink-0 flex flex-col gap-4 p-6 max-md:overflow-y-auto"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border-soft)",
            borderRadius: 24,
            boxShadow: "0 12px 40px rgba(0,0,0,0.10), 0 2px 8px rgba(0,0,0,0.06), inset 0 1px 1px rgba(255,255,255,0.07)",
            opacity: step !== "search" ? 1 : 0,
            pointerEvents: step !== "search" ? "auto" : "none",
            visibility: step !== "search" ? "visible" : "hidden",
            transition: "opacity 0.4s ease, transform 0.4s cubic-bezier(0.32, 0.72, 0, 1), visibility 0.4s",
            zIndex: 10,
          }}
        >
          {step === "preview" && previewData && (
            <div className="fade-in" style={{ display: "flex", flexDirection: "column", gap: 16, height: "100%" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h3 style={{ fontSize: 15, fontWeight: 800, color: "var(--text-primary)", margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
                  Route Details
                </h3>
                <button onClick={() => setStep("search")} style={{ background: "transparent", border: "none", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 6, cursor: "pointer", padding: 0 }}>
                  <ArrowLeft size={16} /> <span style={{ fontSize: 13, fontWeight: 600 }}>Back</span>
                </button>
              </div>

              <div style={{ textAlign: "center", margin: "16px 0" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, margin: "0 auto 12px" }}>
                  <img src={CHAIN_LOGOS[previewData.source_network]} alt={previewData.source_network} style={{ width: 44, height: 44, borderRadius: "50%", objectFit: "cover", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }} onError={e => { e.currentTarget.src = "/globe.svg"; }} />
                  <div style={{ color: "var(--text-muted)", opacity: 0.7 }}>
                    <ArrowRight size={20} strokeWidth={2.5} />
                  </div>
                  <img src={CHAIN_LOGOS[previewData.destination_network]} alt={previewData.destination_network} style={{ width: 44, height: 44, borderRadius: "50%", objectFit: "cover", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }} onError={e => { e.currentTarget.src = "/globe.svg"; }} />
                </div>
                <h2 style={{ fontSize: 18, fontWeight: 800, margin: "0 0 4px", color: "var(--text-primary)" }}>Ready to Recover</h2>
                <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: 0 }}>The payload has been securely verified.</p>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 0, background: "var(--bg-default)", borderRadius: 16, border: "1px solid var(--border-soft)", overflow: "hidden" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", borderBottom: "1px solid var(--border-soft)" }}>
                  <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600 }}>Expected Output</span>
                  <span style={{ fontSize: 14, fontWeight: 800, color: "var(--text-primary)" }}>{formatUnits(BigInt(previewData.amount), 6)} USDC</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", borderBottom: "1px solid var(--border-soft)", gap: 8 }}>
                  <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600, flexShrink: 0 }}>Route</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 5, whiteSpace: "nowrap", flexWrap: "nowrap", flexShrink: 0 }}>
                    <img src={CHAIN_LOGOS[previewData.source_network]} alt="Source" style={{ width: 14, height: 14, borderRadius: "50%", flexShrink: 0 }} onError={(e) => { e.currentTarget.src = "/globe.svg"; }} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)", whiteSpace: "nowrap" }}>{previewData.source_network.replace(" Mainnet", "").replace(" Sepolia", "").replace(" Testnet", "").replace(" Devnet", "")}</span>
                    <span style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 2px", flexShrink: 0 }}>→</span>
                    <img src={CHAIN_LOGOS[previewData.destination_network]} alt="Dest" style={{ width: 14, height: 14, borderRadius: "50%", flexShrink: 0 }} onError={(e) => { e.currentTarget.src = "/globe.svg"; }} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)", whiteSpace: "nowrap" }}>{previewData.destination_network.replace(" Mainnet", "").replace(" Sepolia", "").replace(" Testnet", "").replace(" Devnet", "")}</span>
                  </div>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", borderBottom: "1px solid var(--border-soft)" }}>
                  <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600 }}>Recipient</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)", fontFamily: "monospace" }}>{previewData.recipient.slice(0, 8)}...{previewData.recipient.slice(-6)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px" }}>
                  <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600 }}>Relayer</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#10b981", display: "flex", alignItems: "center", gap: 4 }}>
                    <CheckCircle size={14} /> Public
                  </span>
                </div>
              </div>

              {showTurnstile ? (
                <div className="fade-in" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "16px", background: "var(--bg-default)", borderRadius: 16, border: "1px solid var(--border-soft)", marginTop: "auto" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--text-primary)" }}>
                    <ShieldCheck size={18} color="#3b82f6" />
                    <span style={{ fontSize: 13, fontWeight: 700 }}>Security Verification</span>
                  </div>
                  
                  {turnstileVerifying ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "16px 0", color: "var(--text-muted)" }}>
                      <Loader2 size={16} className="spin" />
                      <span style={{ fontSize: 13 }}>Verifying...</span>
                    </div>
                  ) : turnstileManualRetry ? (
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "12px 0" }}>
                      <span style={{ fontSize: 12, color: "#ef4444", textAlign: "center" }}>{turnstileError || "Verification failed."}</span>
                      <button 
                        onClick={() => {
                          setTurnstileRetryCount(0);
                          setTurnstileManualRetry(false);
                          setTurnstileError(null);
                        }}
                        style={{ display: "flex", alignItems: "center", justifyContent: "center", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "50%", width: 36, height: 36, cursor: "pointer", color: "var(--text-primary)", transition: "all 0.2s" }}
                        title="Retry Verification"
                      >
                        <RefreshCw size={16} />
                      </button>
                    </div>
                  ) : (
                    <Turnstile
                      key={`turnstile-${turnstileRetryCount}`}
                      siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || ""}
                      onSuccess={handleTurnstileSuccess}
                      onError={handleTurnstileError}
                      options={{ theme: "auto", retry: "never" }}
                    />
                  )}

                  {!turnstileManualRetry && turnstileError && <span style={{ fontSize: 12, color: "#ef4444", textAlign: "center" }}>{turnstileError}</span>}
                </div>
              ) : (
                <button
                  className="cyber-button swap-action-btn"
                  onClick={() => handleExecute()}
                  style={{ width: "100%", marginTop: "auto" }}
                >
                  <span>Recover Transfer</span>
                </button>
              )}
            </div>
          )}

          {step === "executing" && previewData && (
            <div className="fade-in" style={{ display: "flex", flexDirection: "column", gap: 20, height: "100%" }}>
              <style>{`
                @keyframes arcSpin { to { transform: rotate(360deg); } }
              `}</style>

              {/* Header */}
              <div style={{ display: "flex", alignItems: "center", gap: 12, paddingBottom: 16, borderBottom: "1px solid var(--border-soft)" }}>
                <div style={{ width: 32, height: 32, borderRadius: "50%", border: "2px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, position: "relative" }}>
                  <div style={{ position: "absolute", inset: -2, borderRadius: "50%", border: "2px solid transparent", borderTopColor: "var(--text-primary)", animation: "arcSpin 0.9s linear infinite" }} />
                  <div style={{ width: 6, height: 6, background: "var(--text-secondary)", borderRadius: "50%", opacity: 0.4 }} />
                </div>
                <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.01em" }}>Recovering Transfer...</div>
                  <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 2, fontWeight: 500 }}>Relaying payload to destination.</div>
                </div>
                <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", letterSpacing: "0.02em" }}>Processing...</span>
              </div>

              {/* Horizontal Timeline */}
              <div style={{ position: "relative", display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "8px 0" }}>
                <div style={{ position: "absolute", top: 21, left: "16.66%", right: "16.66%", height: 1.5, background: "var(--border-soft)", borderRadius: 2, zIndex: 0, overflow: "hidden" }}>
                  <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, #064e3b 0%, #10b981 100%)", width: `${progressPct}%`, transition: "width 0.15s linear" }} />
                </div>

                {/* Node 1 */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 7, zIndex: 1, minWidth: 0, flex: 1 }}>
                  <div style={{ position: "relative", width: 26, height: 26, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, background: "linear-gradient(135deg, #064e3b 0%, #10b981 100%)", boxShadow: "inset 0 1.5px 2px rgba(255,255,255,0.25)" }}>
                    <Check size={13} color="#fff" strokeWidth={2.5} />
                  </div>
                  <span style={{ fontSize: 10.5, fontWeight: 600, textAlign: "center", lineHeight: 1.35, color: "var(--text-muted)", letterSpacing: "0.01em" }}>Attestation</span>
                </div>

                {/* Node 2 */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 7, zIndex: 1, minWidth: 0, flex: 1 }}>
                  <div style={{ position: "relative", width: 26, height: 26, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, background: executingStep > 0 ? "linear-gradient(135deg, #064e3b 0%, #10b981 100%)" : "var(--bg-default)", boxShadow: executingStep > 0 ? "inset 0 1.5px 2px rgba(255,255,255,0.25)" : "none" }}>
                    {executingStep > 0 ? (
                      <Check size={13} color="#fff" strokeWidth={2.5} />
                    ) : (
                      <>
                        <div style={{ position: "absolute", inset: -3, borderRadius: "50%", border: "2px solid transparent", borderTopColor: "var(--text-primary)", borderRightColor: "rgba(0,0,0,0.12)", borderBottomColor: "rgba(0,0,0,0.12)", borderLeftColor: "rgba(0,0,0,0.12)", animation: "arcSpin 0.9s linear infinite" }} />
                        <div style={{ width: 5, height: 5, background: "var(--text-primary)", borderRadius: "50%", opacity: 0.5 }} />
                      </>
                    )}
                  </div>
                  <span style={{ fontSize: 10.5, fontWeight: 600, textAlign: "center", lineHeight: 1.35, color: executingStep > 0 ? "var(--text-muted)" : "var(--text-primary)", letterSpacing: "0.01em" }}>Payload</span>
                </div>

                {/* Node 3 */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 7, zIndex: 1, minWidth: 0, flex: 1 }}>
                  <div style={{ position: "relative", width: 26, height: 26, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, background: executingStep > 1 ? "linear-gradient(135deg, #064e3b 0%, #10b981 100%)" : "var(--bg-default)", border: executingStep > 1 ? "none" : "1.5px solid var(--border)", boxShadow: executingStep > 1 ? "inset 0 1.5px 2px rgba(255,255,255,0.25)" : "none" }}>
                    {executingStep > 1 ? (
                      <Check size={13} color="#fff" strokeWidth={2.5} />
                    ) : executingStep === 1 ? (
                      <>
                        <div style={{ position: "absolute", inset: -3, borderRadius: "50%", border: "2px solid transparent", borderTopColor: "var(--text-primary)", borderRightColor: "rgba(0,0,0,0.12)", borderBottomColor: "rgba(0,0,0,0.12)", borderLeftColor: "rgba(0,0,0,0.12)", animation: "arcSpin 0.9s linear infinite" }} />
                        <div style={{ width: 5, height: 5, background: "var(--text-primary)", borderRadius: "50%", opacity: 0.5 }} />
                      </>
                    ) : null}
                  </div>
                  <span style={{ fontSize: 10.5, fontWeight: 600, textAlign: "center", lineHeight: 1.35, color: executingStep > 1 ? "var(--text-muted)" : executingStep === 1 ? "var(--text-primary)" : "var(--text-muted)", letterSpacing: "0.01em" }}>Finalize</span>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 0, background: "var(--bg-default)", borderRadius: 16, border: "1px solid var(--border-soft)", overflow: "hidden", marginTop: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", borderBottom: "1px solid var(--border-soft)" }}>
                  <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600 }}>Expected Output</span>
                  <span style={{ fontSize: 14, fontWeight: 800, color: "var(--text-primary)" }}>{formatUnits(BigInt(previewData.amount), 6)} USDC</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", borderBottom: "1px solid var(--border-soft)" }}>
                  <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600 }}>Route</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <img src={CHAIN_LOGOS[previewData.source_network]} alt="Source" style={{ width: 14, height: 14, borderRadius: "50%" }} onError={(e) => { e.currentTarget.src = "/globe.svg"; }} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>{previewData.source_network.replace(" Sepolia", "").replace(" Testnet", "")}</span>
                    <span style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 1px" }}>→</span>
                    <img src={CHAIN_LOGOS[previewData.destination_network]} alt="Dest" style={{ width: 14, height: 14, borderRadius: "50%" }} onError={(e) => { e.currentTarget.src = "/globe.svg"; }} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>{previewData.destination_network.replace(" Sepolia", "").replace(" Testnet", "")}</span>
                  </div>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", borderBottom: "1px solid var(--border-soft)" }}>
                  <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600 }}>Recipient</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)", fontFamily: "monospace" }}>{previewData.recipient.slice(0, 8)}...{previewData.recipient.slice(-6)}</span>
                </div>
              </div>

              <div style={{ flex: 1 }} />
            </div>
          )}

          {step === "error" && (
            <div className="fade-in" style={{ textAlign: "center", display: "flex", flexDirection: "column", height: "100%" }}>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                {errorMsg?.includes("pending") ? (
                  <Clock size={48} color="#f59e0b" style={{ margin: "0 auto 24px" }} />
                ) : (
                  <AlertCircle size={48} color="#ef4444" style={{ margin: "0 auto 24px" }} />
                )}
                <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 16, color: "var(--text-primary)" }}>
                  {errorMsg?.includes("pending") ? "Verification Pending" : "Recovery Failed"}
                </h3>
                <div style={{ background: errorMsg?.includes("pending") ? "rgba(245, 158, 11, 0.1)" : "rgba(220, 38, 38, 0.1)", border: `1px solid ${errorMsg?.includes("pending") ? "rgba(245, 158, 11, 0.2)" : "rgba(220, 38, 38, 0.2)"}`, borderRadius: 12, padding: 16, marginBottom: 24, wordBreak: "break-word" }}>
                  <p style={{ color: errorMsg?.includes("pending") ? "#f59e0b" : "#ef4444", fontSize: 13, margin: 0 }}>{errorMsg}</p>
                </div>
              </div>
              {canRetry ? (
                <button className="cyber-button swap-action-btn" onClick={() => handleExecute()} style={{ width: "100%", marginTop: "auto" }}>
                  <span>Try Again</span>
                </button>
              ) : (
                <button className="cyber-button swap-action-btn" onClick={reset} style={{ width: "100%", marginTop: "auto", background: "var(--surface)" }}><span>Start Over</span></button>
              )}
            </div>
          )}

          {step === "success" && (
            <div className="fade-in" style={{ textAlign: "center", display: "flex", flexDirection: "column", height: "100%" }}>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                <div style={{ width: 64, height: 64, background: "rgba(16, 185, 129, 0.1)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px" }}>
                  <CheckCircle size={32} color="#10b981" />
                </div>
                <h3 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8, color: "var(--text-primary)" }}>Recovery Complete</h3>
                <p style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 24 }}>The CCTP transfer was successfully minted on the destination chain.</p>

                {mintTxHash && mintTxHash !== "ALREADY_CLAIMED_ON_CHAIN" && (
                  <div className="swap-input-box" style={{ background: "var(--bg-default)", borderRadius: 16, border: "1px solid var(--border-soft)", marginBottom: 24, textAlign: "left", overflow: "hidden" }}>

                    <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border-soft)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 13, color: "var(--text-secondary)", fontWeight: 600 }}>Destination Blockchain</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {previewData?.destination_network && CHAIN_LOGOS[previewData.destination_network] && (
                          <Image src={CHAIN_LOGOS[previewData.destination_network]} alt="Chain" width={16} height={16} style={{ borderRadius: "50%" }} />
                        )}
                        <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{previewData?.destination_network || "Unknown"}</span>
                      </div>
                    </div>

                    <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border-soft)", display: "grid", gridTemplateColumns: "auto 1fr 140px", alignItems: "center", gap: 12 }}>
                      <span style={{ fontSize: 13, color: "var(--text-secondary)", fontWeight: 600, whiteSpace: "nowrap" }}>Mint Hash</span>
                      <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", fontFamily: "monospace", textAlign: "right", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>
                        {mintTxHash.slice(0, 10)}...{mintTxHash.slice(-8)}
                      </span>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, width: 140 }}>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(mintTxHash);
                            setCopied(true);
                            setTimeout(() => setCopied(false), 2000);
                          }}
                          style={{ flex: 1, height: 26, background: "var(--surface)", border: "1px solid var(--border-soft)", cursor: "pointer", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", gap: 4, color: "var(--text-secondary)" }}
                          title="Copy Hash"
                        >
                          {copied ? <><Check size={12} color="#10b981" /></> : <Copy size={12} />}
                        </button>
                        <div style={{ flex: 1 }}></div>
                      </div>
                    </div>

                    {(() => {
                      const explorerUrl = previewData ? ChainRegistry.getExplorerTxUrl(previewData.destination_network, mintTxHash) : null;
                      if (explorerUrl) {
                        return (
                          <div style={{ padding: "14px 16px", display: "grid", gridTemplateColumns: "auto 1fr 140px", alignItems: "center", gap: 12 }}>
                            <span style={{ fontSize: 13, color: "var(--text-secondary)", fontWeight: 600, whiteSpace: "nowrap" }}>Explorer</span>
                            <a
                              href={explorerUrl}
                              target="_blank"
                              rel="noreferrer"
                              style={{ fontSize: 14, fontWeight: 600, color: "var(--accent-purple)", fontFamily: "monospace", textDecoration: "none", textAlign: "right", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}
                            >
                              {new URL(explorerUrl).hostname.replace('explorer.', '')}/...{mintTxHash.slice(-6)}
                            </a>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, width: 140 }}>
                              <button
                                onClick={() => {
                                  navigator.clipboard.writeText(explorerUrl);
                                  setCopiedUrl(true);
                                  setTimeout(() => setCopiedUrl(false), 2000);
                                }}
                                style={{ flex: 1, height: 26, background: "var(--surface)", border: "1px solid var(--border-soft)", cursor: "pointer", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", gap: 4, color: "var(--text-secondary)" }}
                                title="Copy Link"
                              >
                                {copiedUrl ? <><Check size={12} color="#10b981" /></> : <Copy size={12} />}
                              </button>
                              <a
                                href={explorerUrl}
                                target="_blank"
                                rel="noreferrer"
                                style={{ flex: 1, height: 26, background: "var(--surface)", border: "1px solid var(--border-soft)", color: "var(--text-secondary)", textDecoration: "none", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}
                                title="Open Explorer"
                              >
                                <span style={{ fontSize: 11, fontWeight: 600 }}>Open</span> <ExternalLink size={12} />
                              </a>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    })()}
                  </div>
                )}

                {mintTxHash === "ALREADY_CLAIMED_ON_CHAIN" && (
                  <div className="swap-input-box" style={{ background: "var(--bg)", borderRadius: 16, padding: 16, border: "1px solid var(--border)", marginBottom: 24 }}>
                    <p style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, margin: 0 }}>
                      <CheckCircle size={18} color="#10b981" /> Already Minted on Destination
                    </p>
                  </div>
                )}

              </div>
              <button className="cyber-button swap-action-btn" onClick={reset} style={{ width: "100%", marginTop: "auto" }}><span>Recover Another</span></button>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
