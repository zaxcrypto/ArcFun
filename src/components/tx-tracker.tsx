"use client";

import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import { Check, X, ExternalLink, Copy, RefreshCw, ChevronDown, ChevronUp, ArrowRight, Clock, Shield } from "lucide-react";
import type { Milestone, EngineState, TxSummary } from "@/hooks/use-tx-engine";
import { formatEther } from "viem";
import { ChainRegistry } from "@/lib/bridge/chain-registry";

// ─── Props ────────────────────────────────────────────────────────────────────

export interface TxTrackerProps {
  state: EngineState;
  milestones: Milestone[];
  txHash: string | null;
  burnHash?: string | null;
  mintHash?: string | null;
  error: string | null;
  totalMs: number | null;
  blockNumber: bigint | null;
  summary: TxSummary | null;
  gasUsed?: bigint | null;
  gasPricePaid?: bigint | null;
  onRetry?: () => void;
  onDismiss?: () => void;
  onViewHistory?: () => void;
  flat?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatMs(ms: number | null | undefined): string {
  if (ms == null) return "–";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function milestoneElapsed(m: Milestone): string | null {
  if (m.completedAt && m.startedAt) return formatMs(m.completedAt - m.startedAt);
  if (m.status === "active" && m.startedAt) return "…";
  return null;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <button
      onClick={handleCopy}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 5,
        padding: "6px 12px",
        fontSize: 12,
        fontWeight: 600,
        color: "var(--text-muted)",
        background: "transparent",
        border: "1px solid var(--border-soft)",
        borderRadius: 7,
        cursor: "pointer",
        transition: "all 0.15s ease",
      }}
    >
      <Copy size={11} />
      {copied ? "Copied!" : label}
    </button>
  );
}

// ─── Tx Hash Chip ─────────────────────────────────────────────────────────────

function TxHashChip({ label, hash, explorerUrl }: { label: string; hash: string; explorerUrl?: string | null }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(hash).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const truncated = hash.length > 16 ? `${hash.slice(0, 6)}…${hash.slice(-4)}` : hash;
  const isGreen = label.toLowerCase().includes("mint");

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 7,
        padding: "5px 10px",
        background: "var(--bg-default)",
        border: "1px solid var(--border-soft)",
        borderRadius: 8,
      }}
    >
      <span
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: isGreen ? "#059669" : "var(--text-muted)",
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          whiteSpace: "nowrap",
          flexShrink: 0,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: "'Geist Mono', ui-monospace, monospace",
          color: "var(--text-primary)",
          fontSize: 10.5,
          fontWeight: 500,
          letterSpacing: "-0.01em",
          opacity: 0.85,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          minWidth: 0,
        }}
      >
        {truncated}
      </span>
      <div style={{ display: "flex", alignItems: "center", gap: 2, marginLeft: "auto", flexShrink: 0 }}>
        <button
          onClick={handleCopy}
          title={copied ? "Copied!" : "Copy hash"}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 22,
            height: 22,
            padding: 0,
            background: copied ? "rgba(16,185,129,0.12)" : "transparent",
            border: "none",
            borderRadius: 5,
            cursor: "pointer",
            color: copied ? "#10b981" : "var(--text-muted)",
            transition: "all 0.15s ease",
          }}
        >
          {copied ? <Check size={11} strokeWidth={2.5} /> : <Copy size={11} />}
        </button>
        {explorerUrl && (
          <a
            href={explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="View on explorer"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 22,
              height: 22,
              borderRadius: 5,
              color: "var(--text-muted)",
              transition: "all 0.15s ease",
              textDecoration: "none",
            }}
          >
            <ExternalLink size={11} />
          </a>
        )}
      </div>
    </div>
  );
}

// ─── Node component (vertical stepper row) ───────────────────────────────────

function MilestoneNode({
  m,
  isAttestationPending,
  isLast,
  burnHash,
  mintHash,
  burnExplorerUrl,
  mintExplorerUrl,
}: {
  m: Milestone;
  isAttestationPending?: boolean;
  isLast: boolean;
  burnHash?: string | null;
  mintHash?: string | null;
  burnExplorerUrl?: string | null;
  mintExplorerUrl?: string | null;
}) {
  const isDone = m.status === "done";
  const isFailed = m.status === "failed";
  const isAttesting = isAttestationPending && (m.status === "active" || m.id === "final" || m.id === "claim");
  const isActive = m.status === "active" && !isAttestationPending;
  const elapsed = isAttesting ? "⏱ Awaiting" : milestoneElapsed(m);

  // Which hashes to show beneath this node?
  const showBurn = isDone && (m.id === "burn" || m.id === "exec") && burnHash;
  const showMint = isDone && (m.id === "mint" || m.id === "final" || m.id === "claim") && mintHash && mintHash !== "ALREADY_CLAIMED_ON_CHAIN";

  const dotColor = isDone
    ? "linear-gradient(135deg, #064e3b 0%, #10b981 100%)"
    : isFailed
      ? "linear-gradient(135deg, #7f1d1d 0%, #dc2626 100%)"
      : "var(--bg-default)";

  const dotBorder = isDone || isFailed
    ? "none"
    : isAttesting
      ? "1.5px solid var(--text-primary)"
      : isActive
        ? "1.5px solid var(--text-primary)"
        : "1.5px solid var(--border)";

  const labelColor = (isDone || isFailed || isActive || isAttesting)
    ? "var(--text-primary)"
    : "var(--text-muted)";

  return (
    <div style={{ display: "flex", gap: 0, minWidth: 0 }}>
      {/* Left column: dot + vertical connector */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          flexShrink: 0,
          width: 28,
        }}
      >
        {/* Circle dot */}
        <div
          style={{
            position: "relative",
            width: 24,
            height: 24,
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            background: dotColor,
            border: dotBorder,
            transition: "all 0.3s ease",
            boxShadow: isDone
              ? "inset 0 1.5px 2px rgba(255,255,255,0.25)"
              : isFailed
                ? "inset 0 1.5px 2px rgba(255,255,255,0.25)"
                : isAttesting
                  ? "0 0 0 3px rgba(255,255,255,0.08)"
                  : "none",
          }}
        >
          {isDone && <Check size={12} color="#fff" strokeWidth={2.5} />}
          {isFailed && <X size={12} color="#fff" strokeWidth={2.5} />}
          {isAttesting && <Clock size={11} color="var(--text-primary)" strokeWidth={2.2} />}
          {isActive && (
            <div
              style={{
                width: 13,
                height: 13,
                borderRadius: "50%",
                border: "2px solid var(--border-soft)",
                borderTopColor: "var(--text-primary)",
                animation: "arcSpin 0.8s linear infinite",
              }}
            />
          )}
        </div>

        {/* Vertical connector — hidden for last item */}
        {!isLast && (
          <div
            style={{
              width: 1.5,
              flex: 1,
              minHeight: 16,
              background: isDone
                ? "linear-gradient(180deg, #10b981 0%, rgba(16,185,129,0.2) 100%)"
                : "var(--border-soft)",
              margin: "3px 0",
              transition: "background 0.3s ease",
            }}
          />
        )}
      </div>

      {/* Right column: label + elapsed + optional hash chip */}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          paddingLeft: 10,
          paddingBottom: isLast ? 0 : 14,
          paddingTop: 2,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "space-between" }}>
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: labelColor,
              letterSpacing: "0.005em",
              transition: "color 0.25s ease",
            }}
          >
            {m.label}
          </span>
          {(isDone || isFailed || isActive || isAttesting) && elapsed && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 500,
                color: isFailed ? "#dc2626" : "var(--text-muted)",
                flexShrink: 0,
              }}
            >
              {elapsed}
            </span>
          )}
        </div>

        {/* Inline Burn hash chip */}
        {showBurn && burnHash && (
          <div style={{ marginTop: 7 }}>
            <TxHashChip label="Burn Tx" hash={burnHash} explorerUrl={burnExplorerUrl} />
          </div>
        )}

        {/* Inline Mint hash chip */}
        {showMint && mintHash && (
          <div style={{ marginTop: 7 }}>
            <TxHashChip label="Mint Tx" hash={mintHash} explorerUrl={mintExplorerUrl} />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export interface TxTrackerRef {
  dismiss: () => void;
}

export const TxTracker = forwardRef<TxTrackerRef, TxTrackerProps>((
  {
    state,
    milestones,
    txHash,
    burnHash,
    mintHash,
    error,
    totalMs,
    blockNumber,
    summary,
    gasUsed,
    gasPricePaid,
    onRetry,
    onDismiss,
    onViewHistory,
    flat,
  }, ref) => {
  const [isClosing, setIsClosing] = useState(false);
  const [showTimeline, setShowTimeline] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll into view when tracker opens
  useEffect(() => {
    if (state !== "idle" && !isClosing) {
      const timer = setTimeout(() => {
        containerRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
        });
      }, 60);
      return () => clearTimeout(timer);
    }
  }, [state, isClosing]);

  useImperativeHandle(ref, () => ({
    dismiss: handleDismiss,
  }));

  const handleDismiss = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      onDismiss?.();
    }, 380);
  };

  if (state === "idle") return null;

  const isFailed = state === "failed";
  const isAlreadyCompleted = state === "already_completed";
  const isSuccess = state === "success" || isAlreadyCompleted;
  const isRunning = state === "running";
  const isPending = state === "pending";
  const isMintRejected = state === "mint_rejected";
  const isClaimManualRequired = state === "claim_manual_required";
  const isAttestationPending = state === "attestation_pending";

  // ── Progress line calculation ──────────────────────────────────────────────
  const doneCount = milestones.filter((m) => m.status === "done").length;
  const activeIdx = milestones.findIndex(
    (m) => m.status === "active" || m.status === "failed"
  );
  const total = milestones.length - 1;
  const progress =
    isAttestationPending
      ? 100
      : total <= 0
        ? 100
        : activeIdx !== -1
          ? (activeIdx / total) * 100
          : doneCount === milestones.length
            ? 100
            : (doneCount / total) * 100;

  // ── Header icons / labels ─────────────────────────────────────────────────
  const headerIcon = isSuccess ? (
    <div
      style={{
        width: 32,
        height: 32,
        borderRadius: "50%",
        background: "linear-gradient(135deg, #064e3b 0%, #10b981 100%)",
        boxShadow: "inset 0 1.5px 2px rgba(255,255,255,0.25)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        animation: "premium-pulse 2s infinite ease-in-out",
      }}
    >
      <Check size={15} color="#fff" strokeWidth={2.5} />
    </div>
  ) : isFailed ? (
    <div
      style={{
        width: 32,
        height: 32,
        borderRadius: "50%",
        background: "linear-gradient(135deg, #7f1d1d 0%, #dc2626 100%)",
        boxShadow: "inset 0 1.5px 2px rgba(255,255,255,0.25)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <X size={15} color="#fff" strokeWidth={2.5} />
    </div>
  ) : isAttestationPending ? (
    <div
      style={{
        width: 32,
        height: 32,
        borderRadius: "50%",
        background: "var(--bg-default)",
        border: "1px solid var(--border-soft)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <Clock size={15} color="var(--text-primary)" strokeWidth={2.2} />
    </div>
  ) : isMintRejected ? (
    <div
      style={{
        width: 32,
        height: 32,
        borderRadius: "50%",
        background: "linear-gradient(135deg, #78350f 0%, #d97706 100%)",
        boxShadow: "inset 0 1.5px 2px rgba(255,255,255,0.25)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <X size={15} color="#fff" strokeWidth={2.5} />
    </div>
  ) : (
    <div
      style={{
        width: 32,
        height: 32,
        borderRadius: "50%",
        border: "2px solid var(--border)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        position: "relative",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: -2,
          borderRadius: "50%",
          border: "2px solid transparent",
          borderTopColor: "var(--text-primary)",
          animation: "arcSpin 0.9s linear infinite",
        }}
      />
      <div
        style={{
          width: 6,
          height: 6,
          background: "var(--text-secondary)",
          borderRadius: "50%",
          opacity: 0.4,
        }}
      />
    </div>
  );

  const headerTitle = isAlreadyCompleted
    ? "Already Claimed"
    : isSuccess
      ? summary?.type === "bridge"
        ? (burnHash && mintHash ? "Bridge Completed" : "Bridge Not Confirmed")
        : "Swap Completed"
      : isAttestationPending
        ? "Attestation in Progress"
        : isClaimManualRequired
          ? "Manual Claim Required"
          : isMintRejected
            ? "Mint Cancelled in Wallet"
            : isPending
              ? "Pending"
              : isFailed
                ? summary?.type === "bridge"
                  ? "Bridge Failed"
                  : "Swap Failed"
                : summary?.type === "bridge"
                  ? "Bridging Tokens"
                  : "Swapping Tokens";

  const activeM = milestones.find((m) => m.status === "active");

  const statusText = isSuccess
    ? "Bridge completed successfully"
    : isAttestationPending
      ? "Circle Iris attesting on-chain — block finality pending (1–5 mins)..."
      : isClaimManualRequired
        ? "The automated mint is taking longer. Your USDC is safe."
        : isMintRejected
          ? "Your funds are safe on-chain and claimable anytime from Bridge History."
          : isRunning
            ? (activeM?.id === "appr" ? "Approve token transfer in wallet..."
              : activeM?.id === "burn" ? "Confirm burn transaction in wallet..."
              : activeM?.id === "attestation" ? "Fetching Iris / Circle attestation (1–5 mins)..."
              : activeM?.id === "mint" ? "Minting tokens on destination network..."
              : "Please wait while transaction confirms (1 - 5 mins)...")
            : isPending
              ? "Verifying block finality on source chain (1 - 5 mins)..."
              : isFailed
                ? "Stopped at: " +
                (milestones.find((m) => m.status === "failed")?.label ?? "Unknown step")
                : "Please wait for 1 - 5 mins";

  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `
          @keyframes arcSpin {
            to { transform: rotate(360deg); }
          }
          @keyframes txIn {
            from { opacity: 0; transform: translateY(-6px); }
            to   { opacity: 1; transform: translateY(0); }
          }
          @keyframes txOut {
            from { opacity: 1; transform: translateY(0); }
            to   { opacity: 0; transform: translateY(-6px); }
          }
        `,
        }}
      />
      <div
        ref={containerRef}
        style={{
          ...(flat ? {} : {
            marginTop: 14,
            borderRadius: 16,
            border: "1px solid var(--border-soft)",
            background: "var(--surface)",
            backdropFilter: "blur(12px)",
            boxShadow: "0 2px 10px rgba(0,0,0,0.03)",
          }),
          overflow: "hidden",
          animation: flat ? "none" : isClosing
            ? "txOut 0.38s cubic-bezier(0.4, 0, 1, 1) forwards"
            : "txIn 0.38s cubic-bezier(0, 0, 0.2, 1)",
        }}
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 18px",
            borderBottom: showTimeline ? "1px solid var(--border-soft)" : "none",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <div
              style={{
                fontSize: 13.5,
                fontWeight: 700,
                color: isFailed ? "#dc2626" : isSuccess ? "#059669" : "var(--text-primary)",
                letterSpacing: "-0.01em",
              }}
            >
              {headerTitle}
            </div>
            <div
              style={{
                fontSize: 11,
                color: "var(--text-muted)",
                fontWeight: 500,
              }}
            >
              {statusText}
            </div>
          </div>

          {/* Right side: total time + collapse button */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            {isSuccess && totalMs !== null && (
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "var(--text-muted)",
                  letterSpacing: "0.01em",
                  background: "var(--bg-default)",
                  padding: "3px 8px",
                  borderRadius: 6,
                  border: "1px solid var(--border-soft)",
                }}
              >
                {formatMs(totalMs)}
              </span>
            )}

            {(isRunning || isPending || isAttestationPending) && (
              <span
                style={{
                  fontSize: 10.5,
                  fontWeight: 600,
                  color: "var(--text-muted)",
                  letterSpacing: "0.01em",
                  background: "var(--bg-default)",
                  padding: "3px 8px",
                  borderRadius: 6,
                  border: "1px solid var(--border-soft)",
                }}
              >
                1 - 5 mins
              </span>
            )}

            {/* Collapse / expand timeline */}
            <button
              onClick={() => setShowTimeline((p) => !p)}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--text-muted)",
                display: "flex",
                alignItems: "center",
                padding: 4,
              }}
            >
              {showTimeline ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          </div>
        </div>

        {/* ── Vertical Stepper ────────────────────────────────────────── */}
        {showTimeline && (
          <div style={{ padding: "14px 16px 14px" }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {milestones.map((m, i) => (
                <MilestoneNode
                  key={m.id}
                  m={m}
                  isAttestationPending={isAttestationPending}
                  isLast={i === milestones.length - 1}
                  burnHash={burnHash}
                  mintHash={mintHash}
                  burnExplorerUrl={summary?.sourceChain ? ChainRegistry.getExplorerTxUrl(summary.sourceChain, burnHash ?? "") : null}
                  mintExplorerUrl={summary?.destChain ? ChainRegistry.getExplorerTxUrl(summary.destChain, mintHash ?? "") : null}
                />
              ))}
            </div>

            {/* ── Failure reason ──────────────────────────────────────────── */}
            {isFailed && error && (
              <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
                <div
                  style={{
                    padding: "11px 14px",
                    background: "rgba(220,38,38,0.04)",
                    border: "1px solid rgba(220,38,38,0.15)",
                    borderRadius: 9,
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    gap: 10,
                  }}
                >
                  <div>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: "#dc2626",
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                      }}
                    >
                      Reason
                    </span>
                    <p
                      style={{
                        margin: "3px 0 0",
                        fontSize: 12.5,
                        fontWeight: 500,
                        color: "var(--text-primary)",
                        lineHeight: 1.5,
                      }}
                    >
                      {error}
                    </p>
                  </div>
                  {error && <CopyButton value={error} label="Copy" />}
                </div>

                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, flexWrap: "nowrap", width: "100%" }}>
                  {onRetry && (
                    <button
                      onClick={onRetry}
                      style={{
                        padding: "8px 14px",
                        fontSize: 12,
                        fontWeight: 600,
                        color: "var(--surface)",
                        background: "var(--text-primary)",
                        border: "none",
                        borderRadius: 8,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        boxShadow: "0 2px 8px rgba(0,0,0,0.18)",
                        transition: "all 0.2s",
                        whiteSpace: "nowrap",
                        flexShrink: 0
                      }}
                    >
                      <RefreshCw size={13} />
                      <span style={{ whiteSpace: "nowrap" }}>{burnHash ? "Retry Claim" : "Retry Bridge"}</span>
                    </button>
                  )}
                  {onViewHistory && (
                    <button
                      onClick={onViewHistory}
                      style={{
                        padding: "8px 14px",
                        fontSize: 12,
                        fontWeight: 600,
                        color: "var(--text-primary)",
                        background: "transparent",
                        border: "1px solid var(--border-soft)",
                        borderRadius: 8,
                        cursor: "pointer",
                        transition: "all 0.2s",
                        whiteSpace: "nowrap",
                        flexShrink: 0
                      }}
                    >
                      View in History
                    </button>
                  )}
                  <button
                    onClick={handleDismiss}
                    style={{
                      padding: "8px 14px",
                      fontSize: 12,
                      fontWeight: 600,
                      color: "var(--text-muted)",
                      background: "transparent",
                      border: "1px solid transparent",
                      borderRadius: 8,
                      cursor: "pointer",
                      transition: "all 0.2s",
                      whiteSpace: "nowrap",
                      flexShrink: 0
                    }}
                  >
                    Close
                  </button>
                </div>
              </div>
            )}
            {/* ── Attestation Pending Reassuring Notice ─────────────────────── */}
            {isAttestationPending && (
              <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 14 }}>
                <div
                  style={{
                    padding: "12px 14px",
                    background: "var(--bg-default)",
                    border: "1px solid var(--border-soft)",
                    borderRadius: 10,
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>
                    Circle Iris Attestation in Progress • Auto-Relaying Active
                  </div>
                  <p style={{ margin: "3px 0 0", fontSize: 11.5, fontWeight: 500, color: "var(--text-muted)", lineHeight: 1.45 }}>
                    Circle CCTP is confirming block finality on the source chain. Relayer is actively polling in the background and will execute the destination mint automatically once ready. Your funds are 100% secure on-chain. You can wait here or check{" "}
                    <span
                      onClick={onViewHistory || handleDismiss}
                      style={{
                        color: "#3b82f6",
                        fontWeight: 600,
                        cursor: "pointer",
                        textDecoration: "underline",
                        textUnderlineOffset: "2px",
                      }}
                    >
                      Bridge History
                    </span>.
                  </p>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
                  {onRetry && (
                    <button
                      onClick={onRetry}
                      style={{
                        flex: 1,
                        height: 38,
                        padding: "0 16px",
                        fontSize: 12.5,
                        fontWeight: 600,
                        color: "var(--surface)",
                        background: "var(--text-primary)",
                        border: "none",
                        borderRadius: 8,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 6,
                        boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
                        transition: "all 0.2s ease"
                      }}
                    >
                      <RefreshCw size={13} />
                      Retry Claim
                    </button>
                  )}
                  <button
                    onClick={onViewHistory || handleDismiss}
                    style={{
                      flex: 1,
                      height: 38,
                      padding: "0 16px",
                      fontSize: 12.5,
                      fontWeight: 600,
                      color: "var(--text-primary)",
                      background: "transparent",
                      border: "1px solid var(--border-soft)",
                      borderRadius: 8,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      transition: "all 0.2s ease"
                    }}
                  >
                    View in History
                  </button>
                </div>

                <div
                  style={{
                    marginTop: 16,
                    marginBottom: -4,
                    fontSize: 11,
                    fontWeight: 500,
                    color: "var(--text-muted)",
                    textAlign: "center",
                  }}
                >
                  Need support? Contact us on{" "}
                  <a
                    href="https://t.me/+N7Nf5H3QzckyOGJl"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      color: "#3b82f6",
                      fontWeight: 600,
                      textDecoration: "none",
                      cursor: "pointer",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")}
                    onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}
                  >
                    Telegram
                  </a>
                </div>
              </div>
            )}
            {/* ── Manual Claim Required Notice ───────────────────────────── */}
            {isClaimManualRequired && (
              <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
                <div
                  style={{
                    padding: "12px 14px",
                    background: "var(--bg-default)",
                    border: "1px solid var(--border-soft)",
                    borderRadius: 9,
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    gap: 10,
                  }}
                >
                  <div>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-primary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      Manual Claim Available
                    </span>
                    <p style={{ margin: "3px 0 0", fontSize: 12.5, fontWeight: 500, color: "var(--text-primary)", lineHeight: 1.5 }}>
                      The automated mint is taking longer than expected. Your USDC is 100% secure, and you can claim it manually to complete the transfer.
                    </p>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, flexWrap: "nowrap" }}>
                  {onRetry && (
                    <button
                      onClick={onRetry}
                      style={{
                        padding: "8px 14px",
                        fontSize: 12,
                        fontWeight: 600,
                        color: "var(--surface)",
                        background: "var(--text-primary)",
                        border: "none",
                        borderRadius: 8,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        boxShadow: "0 2px 8px rgba(0,0,0,0.18)",
                        transition: "all 0.2s",
                        whiteSpace: "nowrap",
                        flexShrink: 0
                      }}
                    >
                      <RefreshCw size={13} />
                      <span style={{ whiteSpace: "nowrap" }}>Retry Claim</span>
                    </button>
                  )}
                  <button
                    onClick={onViewHistory || handleDismiss}
                    style={{
                      padding: "8px 14px",
                      fontSize: 12,
                      fontWeight: 600,
                      color: "var(--text-primary)",
                      background: "transparent",
                      border: "1px solid var(--border-soft)",
                      borderRadius: 8,
                      cursor: "pointer",
                      transition: "all 0.2s",
                      whiteSpace: "nowrap",
                      flexShrink: 0
                    }}
                  >
                    View in History
                  </button>
                </div>
              </div>
            )}
            {/* ── Mint Rejected Notice ───────────────────────────────────── */}
            {isMintRejected && (
              <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
                <div
                  style={{
                    padding: "11px 14px",
                    background: "rgba(217,119,6,0.08)",
                    border: "1px solid rgba(217,119,6,0.25)",
                    borderRadius: 9,
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    gap: 10,
                  }}
                >
                  <div>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "#d97706", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      Mint Cancelled
                    </span>
                    <p style={{ margin: "3px 0 0", fontSize: 12.5, fontWeight: 500, color: "var(--text-primary)", lineHeight: 1.5 }}>
                      {error || "Mint transaction was cancelled in your wallet. Your funds are safe on-chain and claimable anytime from Bridge History."}
                    </p>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
                  <button
                    onClick={onViewHistory || handleDismiss}
                    style={{
                      padding: "8px 20px",
                      fontSize: 12,
                      fontWeight: 600,
                      color: "var(--text-primary)",
                      background: "transparent",
                      border: "1px solid var(--border-soft)",
                      borderRadius: 8,
                      cursor: "pointer",
                      transition: "all 0.2s"
                    }}
                  >
                    View in History
                  </button>
                  <button
                    onClick={handleDismiss}
                    style={{
                      padding: "8px 20px",
                      fontSize: 12,
                      fontWeight: 600,
                      color: "var(--text-muted)",
                      background: "transparent",
                      border: "1px solid transparent",
                      borderRadius: 8,
                      cursor: "pointer",
                      transition: "all 0.2s"
                    }}
                  >
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Additional Success Data & Done Button ── */}
        {isSuccess && summary && (
          <div style={{ padding: "0 18px 18px", display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--bg-default)", padding: 14, borderRadius: 12, border: "1px solid var(--border-soft)" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600 }}>
                  {summary.type === "bridge" ? "Burn" : "Sent"}
                </span>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text-primary)" }}>{summary.fromAmt} {summary.fromAsset}</span>
              </div>
              <ArrowRight size={15} color="var(--text-muted)" />
              <div style={{ display: "flex", flexDirection: "column", gap: 3, alignItems: "flex-end" }}>
                <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600 }}>
                  {summary.type === "bridge" ? "Mint" : "Received"}
                </span>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: "#059669" }}>{summary.toAmt || summary.fromAmt} {summary.toAsset}</span>
              </div>
            </div>

            {gasUsed && gasPricePaid && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11, color: "var(--text-muted)", padding: "0 4px" }}>
                <span style={{ fontWeight: 600 }}>Network Fee</span>
                <span style={{ fontWeight: 600, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: 4 }}>
                  <img src="/usdc.png" alt="USDC" style={{ width: 12, height: 12, borderRadius: "50%" }} onError={(e) => e.currentTarget.style.display = "none"} />
                  {formatEther(gasUsed * gasPricePaid).slice(0, 8)} USDC
                </span>
              </div>
            )}

            {/* Blue curved Done button placed at the very bottom below the amount card */}
            <button
              onClick={handleDismiss}
              style={{
                width: "100%",
                height: 42,
                borderRadius: 22,
                fontSize: 13.5,
                fontWeight: 600,
                color: "#ffffff",
                background: "#2563eb",
                border: "none",
                cursor: "pointer",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                boxShadow: "none",
                outline: "none",
                transition: "all 0.15s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "#1d4ed8";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "#2563eb";
              }}
            >
              Done
            </button>
          </div>
        )}
      </div>
    </>
  );
});

// Re-export types so swap-bridge.tsx can import from a single place
export type { Milestone, EngineState, TxSummary };
