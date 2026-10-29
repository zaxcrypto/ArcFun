"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Activity, ChevronDown, ChevronUp, ExternalLink, RefreshCw, CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";

interface LiveTx {
  id: string;
  wallet_address: string;
  source_chain: string;
  destination_chain: string;
  token_symbol: string;
  amount: string;
  burn_tx_hash: string;
  mint_tx_hash?: string;
  bridge_status: string;
  created_at: string;
  updated_at?: string;
}

function getChainLogo(chain: string): string {
  if (!chain) return "/globe.svg";
  const name = chain.toLowerCase();

  if (name.includes("arc")) return "/arc-logo.png";
  if (name.includes("ink")) return "/icons/ink.svg";
  if (name.includes("linea")) return "/icons/linea.svg";
  if (name.includes("arbitrum")) return "/icons/arbitrum.svg";
  if (name.includes("base")) return "/icons/base.svg";
  if (name.includes("monad")) return "/icons/monad.svg";
  if (name.includes("sonic")) return "/icons/sonic.png";
  if (name.includes("unichain")) return "/icons/unichain.svg";
  if (name.includes("optimism")) return "/icons/optimism.svg";
  if (name.includes("x layer") || name.includes("xlayer")) return "/icons/xlayer.png";
  if (name.includes("solana") || name.includes("sol")) return "https://s2.coinmarketcap.com/static/img/coins/64x64/5426.png";
  if (name.includes("stellar")) return "https://s2.coinmarketcap.com/static/img/coins/64x64/512.png";
  if (name.includes("avalanche") || name.includes("avax") || name.includes("fuji")) return "https://s2.coinmarketcap.com/static/img/coins/64x64/5805.png";
  if (name.includes("hyper")) return "https://coin-images.coingecko.com/coins/images/50882/large/hyperliquid.jpg";
  if (name.includes("polygon") || name.includes("amoy")) return "https://s2.coinmarketcap.com/static/img/coins/64x64/3890.png";
  if (name.includes("injective")) return "/icons/injective.png";
  if (name.includes("ethereum") || name.includes("sepolia") || name.includes("eth")) return "/icons/ethereum.svg";

  return "/globe.svg";
}

function formatAddress(addr: string): string {
  if (!addr) return "0x...";
  if (addr.length <= 10) return addr;
  return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
}

function timeAgo(dateStr: string): string {
  const diffSec = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diffSec < 10) return "Just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${Math.floor(diffHours / 24)}d ago`;
}

function getExplorerUrl(chain: string, txHash: string): string | null {
  if (!txHash) return null;
  if (chain === "X Layer Testnet") return `https://www.okx.com/web3/explorer/xlayer-test/tx/${txHash}`;
  if (chain.includes("Solana")) return `https://solscan.io/tx/${txHash}?cluster=devnet`;
  if (chain === "Stellar Testnet") return `https://stellar.expert/explorer/testnet/tx/${txHash}`;
  if (chain === "Arc Testnet") return `https://testnet.arcscan.app/tx/${txHash}`;
  if (chain === "Arc Mainnet" || chain === "Arc") return `https://explorer.arc.io/tx/${txHash}`;
  if (chain === "Base Mainnet") return `https://basescan.org/tx/${txHash}`;
  if (chain === "Arbitrum Mainnet") return `https://arbiscan.io/tx/${txHash}`;
  if (chain === "Base Sepolia") return `https://sepolia.basescan.org/tx/${txHash}`;
  if (chain === "Ethereum Sepolia") return `https://sepolia.etherscan.io/tx/${txHash}`;
  if (chain === "Arbitrum Sepolia") return `https://sepolia.arbiscan.io/tx/${txHash}`;
  return null;
}

export function LiveBridgeFeed() {
  const [isOpen, setIsOpen] = useState(false);
  const [transactions, setTransactions] = useState<LiveTx[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchInitialFeed = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/bridge/live-feed?limit=15");
      if (res.ok) {
        const data = await res.json();
        if (data.transactions) {
          setTransactions(data.transactions);
        }
      }
    } catch (e) {
      console.error("Failed to fetch initial live feed:", e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInitialFeed();

    // ── Supabase Realtime Push Subscription (Zero Polling) ──
    const channel = supabase
      .channel("public:bridge_transactions")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bridge_transactions" },
        (payload) => {
          const newOrUpdated = payload.new as LiveTx;
          if (!newOrUpdated || !newOrUpdated.id) return;

          setTransactions((prev) => {
            const exists = prev.some((tx) => tx.id === newOrUpdated.id);
            let updated: LiveTx[];
            if (exists) {
              updated = prev.map((tx) => (tx.id === newOrUpdated.id ? { ...tx, ...newOrUpdated } : tx));
            } else {
              updated = [newOrUpdated, ...prev].slice(0, 20);
            }
            return updated;
          });

          if (!isOpen) {
            setUnreadCount((c) => Math.min(c + 1, 9));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchInitialFeed, isOpen]);

  const toggleOpen = () => {
    setIsOpen((prev) => {
      if (!prev) setUnreadCount(0);
      return !prev;
    });
  };

  return (
    <div
      className="hidden md:flex"
      style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        zIndex: 99,
        flexDirection: "column",
        alignItems: "flex-end",
        fontFamily: "var(--font-sans, system-ui, sans-serif)",
      }}
    >
      {/* ── COLLAPSED DRAWER CARD ── */}
      {isOpen && (
        <div
          style={{
            width: 360,
            maxHeight: 440,
            background: "rgba(18, 20, 29, 0.92)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            border: "1px solid rgba(255, 255, 255, 0.12)",
            borderRadius: 20,
            boxShadow: "0 20px 50px rgba(0,0,0,0.5), 0 4px 16px rgba(0,0,0,0.3)",
            marginBottom: 10,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            transition: "all 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: "14px 18px",
              borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              background: "rgba(255, 255, 255, 0.03)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: "#22c55e",
                    boxShadow: "0 0 10px #22c55e",
                    display: "inline-block",
                  }}
                />
              </div>
              <span style={{ fontWeight: 700, fontSize: 14, color: "#fff", letterSpacing: "0.02em" }}>
                Global Activity Feed
              </span>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button
                onClick={fetchInitialFeed}
                title="Refresh feed"
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--text-muted, #94a3b8)",
                  cursor: "pointer",
                  padding: 4,
                  display: "flex",
                  alignItems: "center",
                }}
              >
                <RefreshCw size={13} className={isLoading ? "animate-spin" : ""} />
              </button>
              <button
                onClick={toggleOpen}
                style={{
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  color: "#fff",
                  borderRadius: 8,
                  padding: 4,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                }}
              >
                <ChevronDown size={16} />
              </button>
            </div>
          </div>

          {/* Feed List */}
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "10px 12px",
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            {transactions.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
                No recent activity found.
              </div>
            ) : (
              transactions.map((tx) => {
                const isCompleted = tx.bridge_status === "COMPLETED";
                const isFailed = tx.bridge_status === "FAILED";
                const isPending = !isCompleted && !isFailed;
                const burnUrl = getExplorerUrl(tx.source_chain, tx.burn_tx_hash);
                const mintUrl = tx.mint_tx_hash ? getExplorerUrl(tx.destination_chain, tx.mint_tx_hash) : null;

                return (
                  <div
                    key={tx.id}
                    style={{
                      background: "rgba(255, 255, 255, 0.03)",
                      border: "1px solid rgba(255, 255, 255, 0.06)",
                      borderRadius: 14,
                      padding: "10px 12px",
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                      transition: "background 0.2s",
                    }}
                  >
                    {/* Top Row: Chains & Status */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <img
                          src={getChainLogo(tx.source_chain)}
                          alt={tx.source_chain}
                          style={{ width: 18, height: 18, borderRadius: "50%", objectFit: "cover" }}
                          onError={(e) => { e.currentTarget.src = "/globe.svg"; }}
                        />
                        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", fontWeight: 600 }}>➔</span>
                        <img
                          src={getChainLogo(tx.destination_chain)}
                          alt={tx.destination_chain}
                          style={{ width: 18, height: 18, borderRadius: "50%", objectFit: "cover" }}
                          onError={(e) => { e.currentTarget.src = "/globe.svg"; }}
                        />
                        <span style={{ fontSize: 12, fontWeight: 700, color: "#fff", marginLeft: 4 }}>
                          {tx.amount} {tx.token_symbol || "USDC"}
                        </span>
                      </div>

                      {/* Status Badge */}
                      <div>
                        {isCompleted ? (
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 700,
                              color: "#4ade80",
                              background: "rgba(74, 222, 128, 0.12)",
                              border: "1px solid rgba(74, 222, 128, 0.2)",
                              padding: "2px 8px",
                              borderRadius: 99,
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4,
                            }}
                          >
                            <CheckCircle2 size={10} /> Success
                          </span>
                        ) : isFailed ? (
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 700,
                              color: "#f87171",
                              background: "rgba(248, 113, 113, 0.12)",
                              border: "1px solid rgba(248, 113, 113, 0.2)",
                              padding: "2px 8px",
                              borderRadius: 99,
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4,
                            }}
                          >
                            <AlertCircle size={10} /> Failed
                          </span>
                        ) : (
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 700,
                              color: "#60a5fa",
                              background: "rgba(96, 165, 250, 0.12)",
                              border: "1px solid rgba(96, 165, 250, 0.2)",
                              padding: "2px 8px",
                              borderRadius: 99,
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4,
                            }}
                          >
                            <Clock size={10} className="animate-spin" /> Processing
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Bottom Row: User & Time & Explorer Link */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 11, color: "rgba(255,255,255,0.45)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span>User: {formatAddress(tx.wallet_address)}</span>
                        <span>•</span>
                        <span>{timeAgo(tx.created_at)}</span>
                      </div>

                      {(burnUrl || mintUrl) && (
                        <a
                          href={(mintUrl || burnUrl)!}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            color: "#3b82f6",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 3,
                            textDecoration: "none",
                            fontSize: 11,
                            fontWeight: 600,
                          }}
                        >
                          Explorer <ExternalLink size={10} />
                        </a>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ── TRIGGER BUTTON ── */}
      <button
        onClick={toggleOpen}
        style={{
          background: "rgba(18, 20, 29, 0.95)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          border: "1px solid rgba(255, 255, 255, 0.14)",
          borderRadius: 99,
          padding: "10px 18px",
          color: "#fff",
          fontWeight: 700,
          fontSize: 13,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 10,
          boxShadow: "0 8px 30px rgba(0,0,0,0.4), 0 2px 8px rgba(0,0,0,0.2)",
          transition: "transform 0.2s, background 0.2s",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1.03)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
      >
        <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "#22c55e",
              boxShadow: "0 0 10px #22c55e",
              display: "inline-block",
            }}
          />
        </div>
        <Activity size={15} style={{ color: "#3b82f6" }} />
        <span>Live Feed</span>

        {unreadCount > 0 && (
          <span
            style={{
              background: "#ef4444",
              color: "#fff",
              fontSize: 10,
              fontWeight: 800,
              borderRadius: 99,
              padding: "1px 6px",
              marginLeft: 2,
            }}
          >
            +{unreadCount}
          </span>
        )}

        {isOpen ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
      </button>
    </div>
  );
}

export function LiveFeedHistoryView() {
  const [transactions, setTransactions] = useState<LiveTx[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchInitialFeed = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/bridge/live-feed?limit=25");
      if (res.ok) {
        const data = await res.json();
        if (data.transactions) {
          setTransactions(data.transactions);
        }
      }
    } catch (e) {
      console.error("Failed to fetch history live feed:", e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInitialFeed();

    const channel = supabase
      .channel("public:bridge_transactions_history")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bridge_transactions" },
        (payload) => {
          const newOrUpdated = payload.new as LiveTx;
          if (!newOrUpdated || !newOrUpdated.id) return;

          setTransactions((prev) => {
            const exists = prev.some((tx) => tx.id === newOrUpdated.id);
            if (exists) {
              return prev.map((tx) => (tx.id === newOrUpdated.id ? { ...tx, ...newOrUpdated } : tx));
            } else {
              return [newOrUpdated, ...prev].slice(0, 30);
            }
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchInitialFeed]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, width: "100%" }}>
      {/* Header Bar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 2px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 10px #22c55e" }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>
            Live Global Cross-Chain Feed
          </span>
          <span style={{ fontSize: 11, color: "var(--text-muted)", background: "var(--surface)", border: "1px solid var(--border-soft)", padding: "2px 8px", borderRadius: 99 }}>
            {transactions.length} recent
          </span>
        </div>

        <button
          onClick={fetchInitialFeed}
          disabled={isLoading}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 12px",
            borderRadius: 8,
            fontSize: 11,
            fontWeight: 700,
            background: "var(--surface)",
            border: "1px solid var(--border-soft)",
            color: "var(--text-muted)",
            cursor: "pointer",
          }}
        >
          <RefreshCw size={12} className={isLoading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {/* Feed Cards / Items */}
      {isLoading && transactions.length === 0 ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: "50px 20px", color: "var(--text-muted)" }}>
          <RefreshCw size={24} className="animate-spin" />
          <span style={{ fontSize: 13, fontWeight: 600 }}>Fetching live global transactions…</span>
        </div>
      ) : transactions.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--text-muted)", fontSize: 13 }}>
          No recent global transactions found.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {transactions.map((tx) => {
            const isCompleted = tx.bridge_status === "COMPLETED";
            const isFailed = tx.bridge_status === "FAILED";
            const burnUrl = getExplorerUrl(tx.source_chain, tx.burn_tx_hash);
            const mintUrl = tx.mint_tx_hash ? getExplorerUrl(tx.destination_chain, tx.mint_tx_hash) : null;

            return (
              <div
                key={tx.id}
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border-soft)",
                  borderRadius: 16,
                  padding: "14px 16px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                  transition: "all 0.2s ease",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
                }}
              >
                {/* Top Row: Chains & Amount & Status */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, background: "var(--bg-default)", padding: "4px 10px", borderRadius: 10, border: "1px solid var(--border-soft)" }}>
                      <img
                        src={getChainLogo(tx.source_chain)}
                        alt={tx.source_chain}
                        style={{ width: 18, height: 18, borderRadius: "50%", objectFit: "cover" }}
                        onError={(e) => { e.currentTarget.src = "/globe.svg"; }}
                      />
                      <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-primary)" }}>
                        {tx.source_chain.replace(" Sepolia", "").replace(" Testnet", "").replace(" Devnet", "")}
                      </span>
                    </div>

                    <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 700 }}>➔</span>

                    <div style={{ display: "flex", alignItems: "center", gap: 6, background: "var(--bg-default)", padding: "4px 10px", borderRadius: 10, border: "1px solid var(--border-soft)" }}>
                      <img
                        src={getChainLogo(tx.destination_chain)}
                        alt={tx.destination_chain}
                        style={{ width: 18, height: 18, borderRadius: "50%", objectFit: "cover" }}
                        onError={(e) => { e.currentTarget.src = "/globe.svg"; }}
                      />
                      <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-primary)" }}>
                        {tx.destination_chain.replace(" Sepolia", "").replace(" Testnet", "").replace(" Devnet", "")}
                      </span>
                    </div>
                  </div>

                  {/* Amount Badge */}
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 14, fontWeight: 800, color: "var(--text-primary)" }}>
                      {tx.amount} {tx.token_symbol || "USDC"}
                    </span>

                    {/* Status Badge */}
                    {isCompleted ? (
                      <span style={{ fontSize: 10, fontWeight: 700, color: "#16a34a", background: "rgba(22,163,74,0.12)", border: "1px solid rgba(22,163,74,0.2)", padding: "3px 9px", borderRadius: 99, display: "inline-flex", alignItems: "center", gap: 4 }}>
                        <CheckCircle2 size={11} /> Success
                      </span>
                    ) : isFailed ? (
                      <span style={{ fontSize: 10, fontWeight: 700, color: "#dc2626", background: "rgba(220,38,38,0.12)", border: "1px solid rgba(220,38,38,0.2)", padding: "3px 9px", borderRadius: 99, display: "inline-flex", alignItems: "center", gap: 4 }}>
                        <AlertCircle size={11} /> Failed
                      </span>
                    ) : (
                      <span style={{ fontSize: 10, fontWeight: 700, color: "#2563eb", background: "rgba(37,99,235,0.12)", border: "1px solid rgba(37,99,235,0.2)", padding: "3px 9px", borderRadius: 99, display: "inline-flex", alignItems: "center", gap: 4 }}>
                        <Clock size={11} className="animate-spin" /> Processing
                      </span>
                    )}
                  </div>
                </div>

                {/* Bottom Row: Sender & Relative Time & Links */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 11, color: "var(--text-muted)", paddingTop: 4, borderTop: "1px dashed var(--border-soft)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span>User: <strong style={{ color: "var(--text-primary)", fontFamily: "monospace" }}>{formatAddress(tx.wallet_address)}</strong></span>
                    <span>•</span>
                    <span>{timeAgo(tx.created_at)}</span>
                  </div>

                  {(burnUrl || mintUrl) && (
                    <a
                      href={(mintUrl || burnUrl)!}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: "#3b82f6", display: "inline-flex", alignItems: "center", gap: 4, textDecoration: "none", fontWeight: 700 }}
                    >
                      Explorer <ExternalLink size={11} />
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
