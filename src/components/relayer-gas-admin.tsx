"use client";

import React, { useState, useEffect } from "react";
import { RefreshCw, Copy, Check, ShieldAlert, CheckCircle2, AlertTriangle, ExternalLink, Fuel } from "lucide-react";

interface ChainGasBalance {
  chain: string;
  symbol: string;
  balance: string;
  usdValue: string;
  status: "HEALTHY" | "LOW" | "CRITICAL";
  lastUpdated: string;
  error?: string;
}

export function RelayerGasManagement() {
  const [evmAddress, setEvmAddress] = useState<string>("");
  const [stellarAddress, setStellarAddress] = useState<string>("");
  const [solAddress, setSolAddress] = useState<string>("");
  const [balances, setBalances] = useState<ChainGasBalance[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshingChain, setRefreshingChain] = useState<string | null>(null);
  const [copiedEvm, setCopiedEvm] = useState(false);
  const [copiedStellar, setCopiedStellar] = useState(false);
  const [copiedSol, setCopiedSol] = useState(false);

  const fetchAllBalances = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/relayer-balances");
      const data = await res.json();
      if (data.success) {
        setEvmAddress(data.evmAddress || "");
        setStellarAddress(data.stellarAddress || "");
        setSolAddress(data.solAddress || "");
        setBalances(data.balances || []);
      }
    } catch (err) {
      console.error("Failed to fetch relayer balances:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchSingleChainBalance = async (chainName: string) => {
    setRefreshingChain(chainName);
    try {
      const res = await fetch("/api/admin/relayer-balances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chain: chainName })
      });
      const data = await res.json();
      if (data.success && data.balance) {
        setBalances(prev => prev.map(b => b.chain === chainName ? data.balance : b));
      }
    } catch (err) {
      console.error(`Failed to refresh balance for ${chainName}:`, err);
    } finally {
      setRefreshingChain(null);
    }
  };

  useEffect(() => {
    fetchAllBalances();
  }, []);

  const copyToClipboard = (text: string, type: "evm" | "stellar" | "sol") => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    if (type === "stellar") {
      setCopiedStellar(true);
      setTimeout(() => setCopiedStellar(false), 2000);
    } else if (type === "sol") {
      setCopiedSol(true);
      setTimeout(() => setCopiedSol(false), 2000);
    } else {
      setCopiedEvm(true);
      setTimeout(() => setCopiedEvm(false), 2000);
    }
  };

  const getStatusBadge = (status: "HEALTHY" | "LOW" | "CRITICAL") => {
    switch (status) {
      case "HEALTHY":
        return (
          <span style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            padding: "3px 10px",
            fontSize: 11,
            fontWeight: 700,
            color: "#10b981",
            background: "rgba(16, 185, 129, 0.1)",
            border: "1px solid rgba(16, 185, 129, 0.25)",
            borderRadius: 20
          }}>
            <CheckCircle2 size={12} /> HEALTHY
          </span>
        );
      case "LOW":
        return (
          <span style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            padding: "3px 10px",
            fontSize: 11,
            fontWeight: 700,
            color: "#d97706",
            background: "rgba(217, 119, 6, 0.1)",
            border: "1px solid rgba(217, 119, 6, 0.25)",
            borderRadius: 20
          }}>
            <AlertTriangle size={12} /> LOW GAS
          </span>
        );
      case "CRITICAL":
        return (
          <span style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            padding: "3px 10px",
            fontSize: 11,
            fontWeight: 700,
            color: "#dc2626",
            background: "rgba(220, 38, 38, 0.1)",
            border: "1px solid rgba(220, 38, 38, 0.25)",
            borderRadius: 20
          }}>
            <ShieldAlert size={12} /> CRITICAL
          </span>
        );
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* ── Top Relayer Addresses Card ──────────────────────────────────────── */}
      <div className="lf-card arc-premium-coating" style={{ padding: "20px 24px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              background: "rgba(16, 185, 129, 0.12)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--accent)"
            }}>
              <Fuel size={20} />
            </div>
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
                Backend Relayer Gas Monitor
              </h3>
              <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "2px 0 0" }}>
                Real-time on-chain native gas reserves for auto-minting across all bridge networks
              </p>
            </div>
          </div>

          <button
            onClick={fetchAllBalances}
            disabled={loading}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 16px",
              fontSize: 13,
              fontWeight: 600,
              color: "var(--text-primary)",
              background: "var(--surface-hover)",
              border: "1px solid var(--border-soft)",
              borderRadius: 8,
              cursor: loading ? "not-allowed" : "pointer",
              transition: "all 0.2s ease"
            }}
          >
            <RefreshCw size={14} style={{ animation: loading ? "arcSpin 1s linear infinite" : "none" }} />
            {loading ? "Refreshing..." : "Refresh All"}
          </button>
        </div>

        {/* Addresses Box */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 12 }}>
          {/* EVM Address */}
          <div style={{
            padding: "12px 16px",
            background: "var(--surface)",
            border: "1px solid var(--border-soft)",
            borderRadius: 10,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between"
          }}>
            <div>
              <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                EVM Relayer Wallet
              </span>
              <div style={{ fontFamily: "monospace", fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)", marginTop: 2 }}>
                {evmAddress ? `${evmAddress.slice(0, 10)}...${evmAddress.slice(-8)}` : "Loading..."}
              </div>
            </div>
            {evmAddress && (
              <button
                onClick={() => copyToClipboard(evmAddress, "evm")}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: copiedEvm ? "#10b981" : "var(--text-muted)",
                  display: "flex",
                  alignItems: "center",
                  padding: 6
                }}
                title="Copy EVM Address"
              >
                {copiedEvm ? <Check size={16} /> : <Copy size={16} />}
              </button>
            )}
          </div>

          {/* Stellar Address */}
          <div style={{
            padding: "12px 16px",
            background: "var(--surface)",
            border: "1px solid var(--border-soft)",
            borderRadius: 10,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between"
          }}>
            <div>
              <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Stellar Relayer Wallet
              </span>
              <div style={{ fontFamily: "monospace", fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)", marginTop: 2 }}>
                {stellarAddress ? `${stellarAddress.slice(0, 10)}...${stellarAddress.slice(-8)}` : "Loading..."}
              </div>
            </div>
            {stellarAddress && (
              <button
                onClick={() => copyToClipboard(stellarAddress, "stellar")}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: copiedStellar ? "#10b981" : "var(--text-muted)",
                  display: "flex",
                  alignItems: "center",
                  padding: 6
                }}
                title="Copy Stellar Address"
              >
                {copiedStellar ? <Check size={16} /> : <Copy size={16} />}
              </button>
            )}
          </div>

          {/* Solana Address */}
          <div style={{
            padding: "12px 16px",
            background: "var(--surface)",
            border: "1px solid var(--border-soft)",
            borderRadius: 10,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between"
          }}>
            <div>
              <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Solana Relayer Wallet
              </span>
              <div style={{ fontFamily: "monospace", fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)", marginTop: 2 }}>
                {solAddress ? `${solAddress.slice(0, 10)}...${solAddress.slice(-8)}` : "Loading..."}
              </div>
            </div>
            {solAddress && (
              <button
                onClick={() => copyToClipboard(solAddress, "sol")}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: copiedSol ? "#10b981" : "var(--text-muted)",
                  display: "flex",
                  alignItems: "center",
                  padding: 6
                }}
                title="Copy Solana Address"
              >
                {copiedSol ? <Check size={16} /> : <Copy size={16} />}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Balances Table Card ──────────────────────────────────────────────── */}
      <div className="lf-card arc-premium-coating" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: 13 }}>
            <thead>
              <tr style={{
                background: "rgba(0,0,0,0.04)",
                borderBottom: "1px solid var(--border-soft)",
                fontSize: 11,
                fontWeight: 700,
                color: "var(--text-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.05em"
              }}>
                <th style={{ padding: "14px 18px" }}>Network / Chain</th>
                <th style={{ padding: "14px 18px" }}>Native Token</th>
                <th style={{ padding: "14px 18px" }}>Relayer Balance</th>
                <th style={{ padding: "14px 18px" }}>Est. Value (USD)</th>
                <th style={{ padding: "14px 18px" }}>Status</th>
                <th style={{ padding: "14px 18px", textAlign: "right" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading && balances.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: 32, textAlign: "center", color: "var(--text-muted)" }}>
                    <RefreshCw size={20} style={{ animation: "arcSpin 1s linear infinite", margin: "0 auto 8px" }} />
                    <div>Fetching on-chain gas balances across all chains...</div>
                  </td>
                </tr>
              ) : balances.map((b) => {
                const isRefreshing = refreshingChain === b.chain;
                return (
                  <tr key={b.chain} style={{ borderBottom: "1px solid var(--border-soft)", transition: "background 0.15s ease" }}>
                    <td style={{ padding: "14px 18px", fontWeight: 700, color: "var(--text-primary)" }}>
                      {b.chain}
                    </td>
                    <td style={{ padding: "14px 18px", fontWeight: 600, color: "var(--text-muted)" }}>
                      {b.symbol}
                    </td>
                    <td style={{ padding: "14px 18px", fontWeight: 700, fontFamily: "monospace", color: "var(--text-primary)" }}>
                      {b.balance} {b.symbol}
                    </td>
                    <td style={{ padding: "14px 18px", fontWeight: 600, color: "var(--text-muted)" }}>
                      ~${b.usdValue} USD
                    </td>
                    <td style={{ padding: "14px 18px" }}>
                      {getStatusBadge(b.status)}
                    </td>
                    <td style={{ padding: "14px 18px", textAlign: "right" }}>
                      <button
                        onClick={() => fetchSingleChainBalance(b.chain)}
                        disabled={isRefreshing || loading}
                        style={{
                          background: "none",
                          border: "none",
                          cursor: isRefreshing || loading ? "not-allowed" : "pointer",
                          color: "var(--accent)",
                          padding: 6,
                          borderRadius: 6,
                          transition: "all 0.2s"
                        }}
                        title={`Fetch latest balance for ${b.chain}`}
                      >
                        <RefreshCw size={15} style={{ animation: isRefreshing ? "arcSpin 1s linear infinite" : "none" }} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
