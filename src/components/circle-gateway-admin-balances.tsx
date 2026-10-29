"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  RefreshCw,
  Copy,
  Check,
  ExternalLink,
  Coins,
  Wallet,
  ShieldCheck,
  ArrowUpRight,
} from "lucide-react";
import { formatUnits } from "viem";
import {
  GATEWAY_DOMAINS_LIST,
  GATEWAY_NETWORKS,
  ARCFUN_FEE_TREASURY_WALLET,
  type GatewayNetworkConfig,
} from "@/config/gateway-config";
import { CircleGatewayClient } from "@/lib/bridge/gateway-client";

export function CircleGatewayAdminBalances() {
  const [gatewayBalances, setGatewayBalances] = useState<Record<number, string>>({});
  const [walletBalances, setWalletBalances] = useState<Record<number, string>>({});
  const [loadingChains, setLoadingChains] = useState<Record<number, boolean>>({});
  const [isRefreshingAll, setIsRefreshingAll] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isCopied, setIsCopied] = useState(false);

  // ─── Fetch On-Chain USDC Balance via RPC ───────────────────────────────────
  const fetchSingleChainWalletBalance = async (network: GatewayNetworkConfig): Promise<string> => {
    try {
      if (!network.rpcUrl || !network.usdcAddress) return "0.00";
      const res = await fetch(network.rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "eth_call",
          params: [
            {
              to: network.usdcAddress,
              data: `0x70a08231000000000000000000000000${ARCFUN_FEE_TREASURY_WALLET.replace("0x", "")}`,
            },
            "latest",
          ],
        }),
      });
      const json = await res.json();
      if (json.result) {
        const val = BigInt(json.result);
        return formatUnits(val, 6);
      }
    } catch (err) {
      console.warn(`[Gateway Admin] Failed to fetch onchain balance for ${network.name}:`, err);
    }
    return "0.00";
  };

  // ─── Fetch All Gateway & On-Chain Balances ──────────────────────────────────
  const fetchAllBalances = useCallback(async () => {
    setIsRefreshingAll(true);
    try {
      // 1. Fetch Gateway Unified Balances from Circle Gateway API
      const gwRes = await CircleGatewayClient.getBalances(ARCFUN_FEE_TREASURY_WALLET);
      const gwMap: Record<number, string> = {};
      (gwRes.balances || []).forEach((b) => {
        gwMap[b.domain] = parseFloat(b.balance || "0").toFixed(4);
      });
      setGatewayBalances(gwMap);

      // 2. Fetch On-Chain USDC Wallet Balances for each network
      const walletMap: Record<number, string> = {};
      await Promise.all(
        GATEWAY_DOMAINS_LIST.map(async (net) => {
          const bal = await fetchSingleChainWalletBalance(net);
          walletMap[net.domainId] = parseFloat(bal).toFixed(4);
        })
      );
      setWalletBalances(walletMap);
      setLastUpdated(new Date());
    } catch (err) {
      console.error("[Gateway Admin] Error fetching balances:", err);
    } finally {
      setIsRefreshingAll(false);
    }
  }, []);

  // ─── Fetch Single Chain on Demand ──────────────────────────────────────────
  const refreshSingleChain = async (domainId: number) => {
    const net = GATEWAY_NETWORKS[domainId];
    if (!net) return;

    setLoadingChains((prev) => ({ ...prev, [domainId]: true }));
    try {
      // Re-fetch Gateway balance
      const gwRes = await CircleGatewayClient.getBalances(ARCFUN_FEE_TREASURY_WALLET);
      const target = (gwRes.balances || []).find((b) => b.domain === domainId);
      setGatewayBalances((prev) => ({
        ...prev,
        [domainId]: target ? parseFloat(target.balance || "0").toFixed(4) : "0.0000",
      }));

      // Re-fetch on-chain balance
      const onchain = await fetchSingleChainWalletBalance(net);
      setWalletBalances((prev) => ({
        ...prev,
        [domainId]: parseFloat(onchain).toFixed(4),
      }));
    } catch (err) {
      console.error(`[Gateway Admin] Refresh failed for domain ${domainId}:`, err);
    } finally {
      setLoadingChains((prev) => ({ ...prev, [domainId]: false }));
    }
  };

  useEffect(() => {
    fetchAllBalances();
  }, [fetchAllBalances]);

  // ─── Calculations ──────────────────────────────────────────────────────────
  const totalGatewayPool = Object.values(gatewayBalances).reduce(
    (acc, v) => acc + (parseFloat(v) || 0),
    0
  );
  const totalWalletOnchain = Object.values(walletBalances).reduce(
    (acc, v) => acc + (parseFloat(v) || 0),
    0
  );
  const grandTotal = totalGatewayPool + totalWalletOnchain;

  const handleCopyWallet = () => {
    navigator.clipboard.writeText(ARCFUN_FEE_TREASURY_WALLET);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  return (
    <div
      style={{
        background: "var(--surface)",
        borderRadius: 20,
        border: "1px solid var(--border)",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        boxShadow: "var(--shadow-card, 0 4px 20px rgba(0, 0, 0, 0.03))",
      }}
    >
      {/* ── Header ── */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "18px 22px",
          borderBottom: "1px solid var(--border)",
          flexWrap: "wrap",
          gap: 14,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 12,
              background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              boxShadow: "none",
              flexShrink: 0,
            }}
          >
            <Coins size={20} />
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
              <span style={{ fontWeight: 800, fontSize: 16.5, color: "var(--text-primary)", letterSpacing: "-0.01em" }}>
                Circle Gateway Balances & Fee Treasury
              </span>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  padding: "3px 9px",
                  borderRadius: 9999,
                  background: "rgba(37, 99, 235, 0.1)",
                  color: "#2563eb",
                  border: "1px solid rgba(37, 99, 235, 0.25)",
                  letterSpacing: "0.02em",
                }}
              >
                1% Platform & Protocol Fee
              </span>
            </div>
            <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0, marginTop: 3 }}>
              Live multi-chain fee balances across all {GATEWAY_DOMAINS_LIST.length} Circle Gateway networks for ArcFun platform treasury.
            </p>
          </div>
        </div>

        {/* Global Refresh & Wallet Bar */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            onClick={fetchAllBalances}
            disabled={isRefreshingAll}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6.5,
              background: "var(--surface-soft, rgba(255, 255, 255, 0.04))",
              border: "1px solid var(--border)",
              color: "var(--text-primary)",
              padding: "8px 15px",
              borderRadius: 11,
              fontSize: 12.5,
              fontWeight: 600,
              cursor: isRefreshingAll ? "not-allowed" : "pointer",
              transition: "all 0.15s ease",
            }}
            className="hover:border-[var(--text-secondary)] active:scale-95"
            title="Refresh all Gateway and On-Chain balances"
          >
            <RefreshCw
              size={13}
              style={{
                animation: isRefreshingAll ? "spin 1s linear infinite" : "none",
              }}
            />
            <span>{isRefreshingAll ? "Fetching..." : "Refresh All"}</span>
          </button>
        </div>
      </div>

      <div style={{ padding: "20px 22px", display: "flex", flexDirection: "column", gap: 18 }}>
        {/* Treasury Wallet Info Pill */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "var(--surface-soft, rgba(255, 255, 255, 0.03))",
            border: "1px solid var(--border)",
            borderRadius: 14,
            padding: "11px 16px",
            flexWrap: "wrap",
            gap: 10,
            fontSize: 12.5,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <Wallet size={15} style={{ color: "#2563eb", flexShrink: 0 }} />
            <span style={{ color: "var(--text-muted)", fontWeight: 500 }}>
              Fee Treasury Wallet:
            </span>
            <span style={{ color: "var(--text-primary)", fontFamily: "monospace", fontWeight: 700, fontSize: 12 }}>
              {ARCFUN_FEE_TREASURY_WALLET}
            </span>
            <button
              onClick={handleCopyWallet}
              style={{
                background: "transparent",
                border: "none",
                color: isCopied ? "#10b981" : "var(--text-muted)",
                cursor: "pointer",
                padding: 3,
                display: "inline-flex",
                alignItems: "center",
                transition: "color 0.15s ease",
              }}
              className="hover:text-[var(--text-primary)]"
              title="Copy Address"
            >
              {isCopied ? <Check size={14} /> : <Copy size={14} />}
            </button>
          </div>

          {lastUpdated && (
            <span style={{ color: "var(--text-muted)", fontSize: 11.5, fontWeight: 500 }}>
              Last sync: {lastUpdated.toLocaleTimeString()}
            </span>
          )}
        </div>

        {/* ── Summary Cards Row ── */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 14,
          }}
        >
          {/* Total Gateway Pool */}
          <div
            style={{
              background: "var(--surface-soft, rgba(255, 255, 255, 0.03))",
              border: "1px solid var(--border)",
              borderRadius: 16,
              padding: "16px 18px",
              display: "flex",
              flexDirection: "column",
              gap: 5,
            }}
          >
            <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Gateway Unified Balance
            </span>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#2563eb", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em" }}>
              {totalGatewayPool.toFixed(4)}{" "}
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)" }}>USDC</span>
            </div>
            <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
              Instant cross-chain liquidity in Gateway pool
            </span>
          </div>

          {/* Total Onchain Wallet */}
          <div
            style={{
              background: "var(--surface-soft, rgba(255, 255, 255, 0.03))",
              border: "1px solid var(--border)",
              borderRadius: 16,
              padding: "16px 18px",
              display: "flex",
              flexDirection: "column",
              gap: 5,
            }}
          >
            <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em" }}>
              On-Chain Wallet Balance
            </span>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#10b981", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em" }}>
              {totalWalletOnchain.toFixed(4)}{" "}
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)" }}>USDC</span>
            </div>
            <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
              Minted / settled directly into treasury address
            </span>
          </div>

          {/* Grand Total */}
          <div
            style={{
              background: "var(--surface-soft, rgba(255, 255, 255, 0.03))",
              border: "1px solid var(--border)",
              borderRadius: 16,
              padding: "16px 18px",
              display: "flex",
              flexDirection: "column",
              gap: 5,
            }}
          >
            <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Total Treasury USDC
            </span>
            <div style={{ fontSize: 22, fontWeight: 800, color: "var(--text-primary)", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em" }}>
              {grandTotal.toFixed(4)}{" "}
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)" }}>USDC</span>
            </div>
            <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
              Combined across all {GATEWAY_DOMAINS_LIST.length} supported networks
            </span>
          </div>
        </div>

        {/* ── Individual Chains Balance Grid ── */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
            gap: 14,
          }}
        >
          {GATEWAY_DOMAINS_LIST.map((net) => {
            const gwBal = gatewayBalances[net.domainId] || "0.0000";
            const walBal = walletBalances[net.domainId] || "0.0000";
            const isLoadingThis = loadingChains[net.domainId] || isRefreshingAll;
            const hasPositiveWalletBal = parseFloat(walBal) > 0;
            const hasPositiveGwBal = parseFloat(gwBal) > 0;

            return (
              <div
                key={net.domainId}
                style={{
                  background: "var(--surface-soft, rgba(255, 255, 255, 0.03))",
                  borderRadius: 16,
                  border: "1px solid var(--border)",
                  padding: "16px 18px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 13,
                  position: "relative",
                  transition: "all 0.2s ease",
                }}
                className="hover:border-[var(--text-secondary)]"
              >
                {/* Chain Header: Official Logo + Chain Name + Refresh */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                    <div
                      style={{
                        position: "relative",
                        width: 32,
                        height: 32,
                        borderRadius: 10,
                        background: "var(--surface, rgba(255, 255, 255, 0.06))",
                        border: "1px solid var(--border)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                        overflow: "hidden",
                        padding: 3,
                      }}
                    >
                      <img
                        src={net.icon}
                        alt={net.name}
                        style={{
                          width: "100%",
                          height: "100%",
                          borderRadius: 7,
                          objectFit: "cover",
                        }}
                        onError={(e) => {
                          e.currentTarget.src = "/globe.svg";
                        }}
                      />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: 700,
                          color: "var(--text-primary)",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {net.name}
                      </div>
                      <div style={{ fontSize: 10.5, color: "var(--text-muted)", fontWeight: 500 }}>
                        Domain {net.domainId} · Chain {net.chainId}
                      </div>
                    </div>
                  </div>

                  {/* Individual Refresh Icon */}
                  <button
                    onClick={() => refreshSingleChain(net.domainId)}
                    disabled={isLoadingThis}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "var(--text-muted)",
                      cursor: isLoadingThis ? "not-allowed" : "pointer",
                      padding: 5,
                      borderRadius: 8,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                      transition: "all 0.15s ease",
                    }}
                    className="hover:text-[var(--text-primary)] hover:bg-[var(--surface)] active:scale-90"
                    title={`Refresh ${net.name} balance`}
                  >
                    <RefreshCw
                      size={13}
                      style={{
                        animation: isLoadingThis ? "spin 1s linear infinite" : "none",
                      }}
                    />
                  </button>
                </div>

                {/* Balances Display Card */}
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 9,
                    background: "var(--surface, rgba(255, 255, 255, 0.05))",
                    border: "1px solid var(--border)",
                    borderRadius: 12,
                    padding: "11px 13px",
                    fontSize: 12,
                  }}
                >
                  {/* Gateway Pool Balance */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ color: "var(--text-muted)", fontWeight: 500 }}>Gateway Balance:</span>
                    <span
                      style={{
                        color: hasPositiveGwBal ? "#2563eb" : "var(--text-primary)",
                        fontWeight: 700,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {gwBal} USDC
                    </span>
                  </div>

                  {/* On-Chain Wallet Balance */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ color: "var(--text-muted)", fontWeight: 500 }}>Wallet Balance:</span>
                    <span
                      style={{
                        color: hasPositiveWalletBal ? "#10b981" : "var(--text-muted)",
                        fontWeight: 700,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {walBal} USDC
                    </span>
                  </div>
                </div>

                {/* Explorer Link */}
                <a
                  href={`${net.explorerUrl}/address/${ARCFUN_FEE_TREASURY_WALLET}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 4,
                    fontSize: 11.5,
                    color: "var(--text-secondary, #6b7280)",
                    textDecoration: "none",
                    paddingTop: 1,
                    fontWeight: 500,
                    transition: "color 0.15s ease",
                  }}
                  className="hover:text-[var(--text-primary)] hover:underline underline-offset-2"
                >
                  <span>View Explorer</span>
                  <ArrowUpRight size={12} />
                </a>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
