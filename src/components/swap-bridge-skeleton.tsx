"use client";

import React, { useState, useEffect } from "react";
import { useTheme } from "next-themes";

interface SwapBridgeSkeletonProps {
  sidebarCollapsed?: boolean;
}

export function SwapBridgeSkeleton({ sidebarCollapsed: propCollapsed }: SwapBridgeSkeletonProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme !== "light";

  const [collapsed, setCollapsed] = useState(propCollapsed ?? false);

  useEffect(() => {
    if (propCollapsed !== undefined) {
      setCollapsed(propCollapsed);
    } else if (typeof window !== "undefined") {
      const saved = localStorage.getItem("arc_sidebar_collapsed");
      if (saved !== null) {
        setCollapsed(saved === "true");
      } else {
        setCollapsed(window.innerWidth < 1024);
      }
    }
  }, [propCollapsed]);

  return (
    <div
      className="swap-main-content pt-4 md:pt-[10vh] lg:pt-[14vh] select-none pointer-events-none"
      style={{
        flex: 1,
        width: "100%",
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        justifyContent: "flex-start",
        position: "relative",
        transition: "padding-left 0.3s cubic-bezier(0.22, 1, 0.36, 1)",
        paddingLeft: collapsed ? "clamp(24px, 5.5vw, 96px)" : "0px",
      }}
    >
      {/* ── Sub-navigation Pill Bar Skeleton ── */}
      <div
        className="subnav-pill-bar"
        style={{
          width: "100%",
          maxWidth: 424,
          display: "flex",
          justifyContent: "center",
          marginBottom: 20,
          zIndex: 20,
        }}
      >
        <div
          className="subnav-pill-bar-box"
          style={{
            background: isDark ? "#151922" : "var(--surface-soft, #f1f5f9)",
            border: isDark ? "1px solid rgba(255, 255, 255, 0.08)" : "1px solid var(--border, #e2e8f0)",
            boxShadow: isDark ? "none" : "0 1px 2px rgba(0,0,0,0.02)",
            display: "flex",
            alignItems: "center",
            padding: 3,
            borderRadius: 9999,
            gap: 2,
          }}
        >
          <div
            style={{
              padding: "6px 18px",
              borderRadius: 9999,
              fontSize: 13,
              fontWeight: 700,
              background: isDark ? "#283040" : "#ffffff",
              color: isDark ? "#ffffff" : "#0f172a",
              border: isDark ? "1px solid rgba(255, 255, 255, 0.12)" : "1px solid rgba(0, 0, 0, 0.08)",
              boxShadow: isDark ? "none" : "0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.04)",
            }}
          >
            Bridge
          </div>
          <div style={{ padding: "6px 16px", borderRadius: 9999, fontSize: 13, fontWeight: 500, color: isDark ? "#94a3b8" : "#64748b" }}>
            Recover
          </div>
          <div style={{ padding: "6px 16px", borderRadius: 9999, fontSize: 13, fontWeight: 500, color: isDark ? "#94a3b8" : "#64748b" }}>
            History
          </div>
          <div style={{ padding: "6px 16px", borderRadius: 9999, fontSize: 13, fontWeight: 500, color: isDark ? "#94a3b8" : "#64748b" }}>
            Faucet Hub
          </div>
        </div>
      </div>

      {/* ── Main Bridge Workspace (2-Column >1150px, stacked <1150px) ── */}
      <div className="w-full max-w-[1440px] flex flex-col min-[1150px]:flex-row items-start justify-start gap-8 min-[1150px]:gap-12">
        {/* LEFT: Bridge Card & Details Skeleton */}
        <div
          className="swap-card-wrapper"
          style={{
            position: "relative",
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            gap: 16,
            width: "100%",
            maxWidth: 424,
            margin: 0,
            flexShrink: 0,
          }}
        >
          <div
            className="lf-card swap-main-card animate-pulse"
            style={{
              padding: 24,
              display: "flex",
              flexDirection: "column",
              gap: 20,
              borderRadius: 24,
              background: "var(--surface-glass)",
              border: "1px solid var(--border)",
              boxShadow: "0 8px 30px rgba(0, 0, 0, 0.06), 0 1px 3px rgba(0, 0, 0, 0.04)",
              width: "100%",
              maxWidth: 424,
            }}
          >
            {/* Header row */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 13, color: "var(--text-muted)", fontWeight: 600 }}>
                Cross-chain transfers
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <div className="h-3 w-24 bg-slate-200 dark:bg-white/10 rounded-full" />
                <div className="w-8 h-8 rounded-xl bg-slate-200 dark:bg-white/10" />
              </div>
            </div>

            {/* From Box */}
            <div
              className="swap-input-box"
              style={{
                padding: 14,
                borderRadius: 20,
                background: "var(--surface-soft, rgba(0,0,0,0.03))",
                border: "1px solid var(--border-soft)",
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 13, color: "var(--text-muted)", fontWeight: 600 }}>From</span>
                <div className="h-3.5 w-28 bg-slate-200 dark:bg-white/10 rounded-full" />
              </div>

              {/* Chain Selector placeholder */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "8px 12px",
                  borderRadius: 14,
                  background: "var(--surface, rgba(255,255,255,0.6))",
                  border: "1px solid var(--border-soft)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div className="w-6 h-6 rounded-full bg-blue-500/20" />
                  <div className="h-4 w-20 bg-slate-200 dark:bg-white/10 rounded-md" />
                </div>
                <div className="w-3.5 h-3.5 rounded bg-slate-200 dark:bg-white/10" />
              </div>

              {/* Token and Amount placeholder */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 4 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "6px 12px",
                    borderRadius: 99,
                    background: "var(--surface, rgba(255,255,255,0.6))",
                    border: "1px solid var(--border-soft)",
                  }}
                >
                  <div className="w-5 h-5 rounded-full bg-blue-500/30" />
                  <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)" }}>USDC</span>
                </div>
                <div style={{ fontSize: 36, fontWeight: 800, color: "var(--text-muted)", opacity: 0.4 }}>0</div>
              </div>
            </div>

            {/* Switch / Flip Button placeholder */}
            <div style={{ display: "flex", justifyContent: "center", margin: "-12px 0", position: "relative", zIndex: 10 }}>
              <div
                style={{
                  borderRadius: "50%",
                  width: 36,
                  height: 36,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  color: "var(--text-muted)",
                }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="7 10 12 15 17 10" />
                  <polyline points="17 14 12 9 7 14" />
                </svg>
              </div>
            </div>

            {/* To Box */}
            <div
              className="swap-input-box"
              style={{
                padding: 14,
                borderRadius: 20,
                background: "var(--surface-soft, rgba(0,0,0,0.03))",
                border: "1px solid var(--border-soft)",
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 13, color: "var(--text-muted)", fontWeight: 600 }}>To</span>
                <div className="h-3.5 w-24 bg-slate-200 dark:bg-white/10 rounded-full" />
              </div>

              {/* Chain Selector placeholder */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "8px 12px",
                  borderRadius: 14,
                  background: "var(--surface, rgba(255,255,255,0.6))",
                  border: "1px solid var(--border-soft)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div className="w-6 h-6 rounded-full bg-slate-400/20" />
                  <div className="h-4 w-28 bg-slate-200 dark:bg-white/10 rounded-md" />
                </div>
                <div className="w-3.5 h-3.5 rounded bg-slate-200 dark:bg-white/10" />
              </div>

              {/* Token and Amount placeholder */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 4 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "6px 12px",
                    borderRadius: 99,
                    background: "var(--surface, rgba(255,255,255,0.6))",
                    border: "1px solid var(--border-soft)",
                  }}
                >
                  <div className="w-5 h-5 rounded-full bg-blue-500/30" />
                  <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)" }}>USDC</span>
                </div>
              </div>
            </div>

            {/* Slider placeholder */}
            <div style={{ margin: "14px 6px 4px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14 }}>
              <div className="h-1.5 flex-1 bg-slate-200 dark:bg-white/10 rounded-full" />
              <span style={{ fontSize: 13, color: "var(--text-muted)", fontWeight: 700, minWidth: "36px", textAlign: "right" }}>0%</span>
            </div>

            {/* Submit Button placeholder */}
            <div
              style={{
                width: "100%",
                height: 52,
                borderRadius: 16,
                background: "var(--surface-soft, rgba(0,0,0,0.05))",
                border: "1px solid var(--border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--text-muted)",
                fontSize: 15,
                fontWeight: 700,
              }}
            >
              Enter an amount
            </div>
          </div>
        </div>

        {/* RIGHT: Live Market Price Chart Skeleton (Desktop dual-panel only) */}
        <div className="hidden min-[1150px]:flex w-full flex-1 min-w-0 flex-col pt-1">
          <div
            className="relative flex flex-col w-full bg-transparent border-0 shadow-none p-0 select-none animate-pulse"
            style={{ minHeight: 465 }}
          >
            {/* Header */}
            <div className="flex items-start justify-between w-full pb-4 gap-4">
              <div className="flex flex-col gap-2">
                {/* Logo + USDC */}
                <div className="flex items-center gap-2">
                  <div className="w-[18px] h-[18px] rounded-full bg-blue-500/30" />
                  <span className="text-sm font-medium text-[var(--text-secondary,#8E8E93)]">USDC</span>
                </div>
                {/* Price */}
                <div className="h-9 w-44 bg-slate-200 dark:bg-white/10 rounded-lg mt-1" />
                {/* Delta */}
                <div className="h-4 w-32 bg-slate-200 dark:bg-white/10 rounded-md mt-1" />
              </div>

              {/* Right header controls */}
              <div className="flex flex-wrap items-center gap-2 self-start pt-0.5">
                {/* Timeframe pill skeleton */}
                <div
                  style={{
                    background: isDark ? "#151922" : "var(--surface-soft, #f1f5f9)",
                    border: isDark ? "1px solid rgba(255, 255, 255, 0.08)" : "1px solid var(--border, #e2e8f0)",
                  }}
                  className="flex items-center gap-1 p-1 rounded-full shadow-sm"
                >
                  {["1H", "1D", "1W", "1M", "1Y", "All"].map((tf) => (
                    <div
                      key={tf}
                      style={{
                        background: tf === "1D" ? (isDark ? "#283040" : "#ffffff") : "transparent",
                        color: tf === "1D" ? (isDark ? "#ffffff" : "#0f172a") : (isDark ? "#94a3b8" : "#64748b"),
                      }}
                      className="px-2.5 sm:px-3 py-1 rounded-full text-xs font-bold"
                    >
                      {tf}
                    </div>
                  ))}
                </div>

                {/* Chart mode buttons */}
                <div
                  style={{
                    background: isDark ? "#151922" : "var(--surface-soft, #f1f5f9)",
                    border: isDark ? "1px solid rgba(255, 255, 255, 0.08)" : "1px solid var(--border, #e2e8f0)",
                  }}
                  className="flex items-center gap-1 p-1 rounded-full shadow-sm"
                >
                  <div className="w-7 h-7 rounded-full bg-slate-200 dark:bg-white/10" />
                  <div className="w-7 h-7 rounded-full bg-slate-200 dark:bg-white/10" />
                  <div className="w-7 h-7 rounded-full bg-slate-200 dark:bg-white/10" />
                </div>

                {/* Refresh button */}
                <div
                  style={{
                    background: isDark ? "#151922" : "var(--surface-soft, #f1f5f9)",
                    border: isDark ? "1px solid rgba(255, 255, 255, 0.08)" : "1px solid var(--border, #e2e8f0)",
                  }}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--text-muted)]"
                >
                  <div className="w-3.5 h-3.5 rounded-full bg-slate-200 dark:bg-white/10" />
                </div>
              </div>
            </div>

            {/* Chart Canvas Area */}
            <div
              className="relative w-full overflow-hidden rounded-2xl flex items-center justify-center border border-[var(--border-soft)]"
              style={{
                height: 465,
                backgroundImage: isDark
                  ? "radial-gradient(rgba(255, 255, 255, 0.16) 1px, transparent 1px)"
                  : "radial-gradient(rgba(15, 23, 42, 0.10) 1px, transparent 1px)",
                backgroundSize: "20px 20px",
                backgroundPosition: "10px 10px",
              }}
            >
              {/* Decorative wave graph preview */}
              <svg
                className="w-full h-44 opacity-25 px-6"
                viewBox="0 0 800 200"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M 0 110 Q 120 70, 240 100 T 480 85 T 700 115 T 800 100"
                  stroke="#3b82f6"
                  strokeWidth="2.5"
                  strokeDasharray="4 4"
                />
              </svg>

              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 backdrop-blur-[1px]">
                <div className="w-6 h-6 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
                <span className="text-xs font-semibold text-[var(--text-muted)]">Loading live market interface…</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
