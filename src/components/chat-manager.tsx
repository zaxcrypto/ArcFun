"use client";

import { useState, useEffect, useRef, useMemo, useCallback, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { useAccount, useSendTransaction, useBalance, useSignMessage, useGasPrice, useWriteContract, useSwitchChain, useChainId, usePublicClient } from "wagmi";
import { parseEther, formatEther, parseUnits, formatUnits } from "viem";
import { motion, AnimatePresence } from "framer-motion";
import { USDC_ADDRESS, EURC_ADDRESS, SUPPORTED_CHAINS, EURC_CHAINS, ERC20_APPROVE_ABI, CROSS_CHAIN_REGISTRY, CHAIN_ID_MAP } from "@/config/swap-contract";
import { ERC20_ABI } from "@/config/contracts";
import { withEvmFailover } from "@/lib/evm-rpc";
import { ChainRegistry } from "@/lib/bridge/chain-registry";
import { createPublicClient, http } from "viem";
import {
  Search, Plus, Send, SendHorizontal, Smile, Image as ImageIcon, Sparkles,
  MoreVertical, Check, CheckCheck, Pin, Archive, EyeOff, Eye,
  DollarSign, Clock, Play, Pause, Trash, ArrowLeft, ArrowRight, Reply,
  Copy, Edit3, User, Wallet, ExternalLink, Lock, AlertCircle,
  X, ChevronRight, ChevronDown, ChevronUp, MessageSquare, Info, Star, Calendar, ShieldCheck, Shield, Paperclip, Repeat, StopCircle, Link2, Download, Loader2, RefreshCw, Fingerprint, Unlock
} from "lucide-react";
import { useChat, Message, Payment, Chat } from "@/lib/chat-service";
import { useChatStore } from "@/lib/chat-store";
import { isAdmin } from "@/lib/admin";
import { Virtuoso } from "react-virtuoso";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useWallet } from "@solana/wallet-adapter-react";
import { useStellar } from "@/lib/stellar-provider";
import { useSuiWallet } from "@/lib/sui-provider";

import { UserProfile, getAvatarClass, getProfileFromGlobalDB as getGlobalProfile } from "@/components/profile-manager";
import { SlideButton } from "./slide-button";
import { fetchArcStats, ArcAccountStats } from "@/lib/arc-api";
import { compressImageToBase64 } from "@/lib/firebase";
import { supabase } from "@/lib/supabase";
import { calculateSpendableBalance, getNetworkReserve } from "@/config/network-reserve";
import { resolveEnsAddress } from "@/lib/ens";
import { useEnvironment } from "@/contexts/EnvironmentContext";
import { useVirtualKeyboard } from "@/hooks/useVirtualKeyboard";
import { AutopayPanel } from "@/components/autopay/autopay-panel";
import { AutopaySetupModal } from "@/components/autopay/autopay-setup-modal";
import { AutopayDashboard } from "@/components/autopay/autopay-dashboard";
import { AutopayLedgerView } from "@/components/autopay/autopay-ledger-view";

// Reusable premium USDC inline logo component
export function UsdcLogo({ size = 14, style }: { size?: number; style?: React.CSSProperties }) {
  return (
    <img
      src="/usdc.png"
      alt="USDC"
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        objectFit: "contain",
        display: "inline-block",
        verticalAlign: "middle",
        ...style
      }}
    />
  );
}

// Reusable premium EURC inline logo component
export function EurcLogo({ size = 14, style }: { size?: number; style?: React.CSSProperties }) {
  return (
    <img
      src="https://s2.coinmarketcap.com/static/img/coins/128x128/20641.png"
      alt="EURC"
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        objectFit: "contain",
        display: "inline-block",
        verticalAlign: "middle",
        ...style
      }}
    />
  );
}

// Minimal vector USDC icon for buttons
export function InlineUsdcIcon({ size = 14, color = "currentColor" }: { size?: number, color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, display: "block" }}>
      <path d="M 9.5 4.5 A 8 8 0 0 0 9.5 19.5" opacity="0.8" />
      <path d="M 14.5 4.5 A 8 8 0 0 1 14.5 19.5" opacity="0.8" />
      <path d="M 14 8.5 C 14 7 13 6.5 12 6.5 C 11 6.5 10 7 10 8.5 C 10 11 14 10.5 14 13 C 14 14.5 13 15 12 15 C 11 15 10 14.5 10 13" />
      <path d="M 12 4.5 L 12 6.5 M 12 15 L 12 17" />
    </svg>
  );
}

// Pre-seeded Crypto/Meme GIFs for chat
const CRYPTO_GIFS = [
  { id: "rocket", name: "Bullish", url: "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExM2Q3Nm80am43NmtwMGh0OHlzcjRyYWlrcTFoOG03MDF2MWRyMmJwayZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/mi6F9LJFAgreOPRnd9/giphy.gif" },
  { id: "pepe", name: "Pepe GM", url: "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExMmV0bnExNWs3czM1MG83OHVzZ3VqanZkNHYxb2p3cTFhc2h6ODdmbSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/t3s3EZmJr7vwY/giphy.gif" },
  { id: "doge", name: "Doge Dance", url: "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExOWdzaDFhb2t6MHNxYTBibzRocHFhYnN5aWc3ejVxNXB6cG15MnVjayZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/5OqXb948EBkyUcnwHt/giphy.gif" },
  { id: "hodl", name: "HODL", url: "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExdmlyMDR1b3Bpc2M1a3o1MGRpZHBscWFoMm9pZHJvNzRxOGYwYzg2NCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/p4pWzctMrAAvwR21KU/giphy.gif" },
  { id: "gm", name: "Good Morning", url: "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExdzBpaDlyazhscDdsOXo5NWpxN3AwaWtwZHpyazF1a3lhN2ttZGFsdiZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/el1elNlRrkG3f94Acs/giphy.gif" },
  { id: "money", name: "Printer GM", url: "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExaGgydnJpMm92aW5rdHNmdzMzaGJqZ2M5YnU0ZDR1dW9wdDVpMGtyZSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/Y2ZUWLrTy43dhj9aiq/giphy.gif" },
];

const AVATAR_GRADIENTS = [
  "linear-gradient(135deg, #FF6B6B, #556270)",
  "linear-gradient(135deg, #36D1DC, #5B86E5)",
  "linear-gradient(135deg, #FF0099, #493240)",
  "linear-gradient(135deg, #a18cd1, #fbc2eb)",
  "linear-gradient(135deg, #ff9a9e, #fecfef)",
  "linear-gradient(135deg, #ff0844, #ffb199)",
  "linear-gradient(135deg, #84fab0, #8fd3f4)",
  "linear-gradient(135deg, #a1c4fd, #c2e9fb)",
  "linear-gradient(135deg, #cfd9df, #e2ebf0)",
  "linear-gradient(135deg, #667eea, #764ba2)",
];

export function getGradientForAddress(address: string, overrideIndex?: number | null) {
  if (overrideIndex !== undefined && overrideIndex !== null && overrideIndex >= 0 && overrideIndex < AVATAR_GRADIENTS.length) {
    return AVATAR_GRADIENTS[overrideIndex];
  }
  if (!address) return AVATAR_GRADIENTS[0];
  let hash = 0;
  for (let i = 0; i < address.length; i++) {
    hash = address.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % AVATAR_GRADIENTS.length;
  return AVATAR_GRADIENTS[index];
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE TOAST COMPONENT (Live Countdown)
// ─────────────────────────────────────────────────────────────────────────────
function DeleteToast({ name, onUndo }: { name: string; onUndo: () => void }) {
  const [timeLeft, setTimeLeft] = useState(10);

  useEffect(() => {
    if (timeLeft <= 0) return;
    const t = setInterval(() => {
      setTimeLeft(v => v - 1);
    }, 1000);
    return () => clearInterval(t);
  }, [timeLeft]);

  return (
    <motion.div
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 20, opacity: 0, scale: 0.95 }}
      style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", boxShadow: "0 10px 25px rgba(0,0,0,0.15)", pointerEvents: "auto" }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(239, 68, 68, 0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Trash style={{ width: 14, height: 14, color: "#ef4444" }} />
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 120 }}>{name} Deleted</div>
          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Will clear in {timeLeft}s</div>
        </div>
      </div>
      <button
        onClick={onUndo}
        style={{ fontSize: 11, fontWeight: 800, color: "var(--surface)", background: "var(--text-primary)", border: "none", borderRadius: 8, padding: "6px 14px", cursor: "pointer", flexShrink: 0 }}
      >
        Undo
      </button>
    </motion.div>
  );
}

function AnimatedAuthIcon({ isAuthenticating, isUnlocked }: { isAuthenticating: boolean, isUnlocked: boolean }) {
  const [isLock, setIsLock] = useState(false);

  useEffect(() => {
    if (isAuthenticating || isUnlocked) return;
    const interval = setInterval(() => {
      setIsLock(prev => !prev);
    }, 1000);
    return () => clearInterval(interval);
  }, [isAuthenticating, isUnlocked]);

  if (isUnlocked) {
    return <Unlock size={32} color="var(--text-primary)" />;
  }

  if (isAuthenticating) {
    return <Loader2 size={32} color="var(--text-muted)" className="animate-spin" />
  }

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={isLock ? "lock" : "msg"}
        initial={{ rotateY: 90, opacity: 0 }}
        animate={{ rotateY: 0, opacity: 1 }}
        exit={{ rotateY: -90, opacity: 0 }}
        transition={{ duration: 0.3 }}
        style={{ display: "flex", alignItems: "center", justifyContent: "center" }}
      >
        {isLock ? <Lock size={32} color="var(--text-primary)" /> : <MessageSquare size={32} color="var(--text-primary)" />}
      </motion.div>
    </AnimatePresence>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SKELETON LAYOUT ANIMATION LOADERS FOR CHAT SYSTEM
// ─────────────────────────────────────────────────────────────────────────────

function ChatListSkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%" }}>
      {[0, 1, 2, 3, 4, 5, 6].map((idx) => (
        <div
          key={idx}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "12px 14px",
            borderBottom: "1px solid var(--border-soft)",
            opacity: Math.max(0.35, 1 - idx * 0.1)
          }}
          className="animate-pulse"
        >
          {/* Avatar Skeleton */}
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: "50%",
              flexShrink: 0,
              background: "var(--surface-soft, #f1f5f9)",
              border: "1px solid var(--border-soft, #e2e8f0)"
            }}
          />

          {/* Text Skeletons */}
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div
                style={{
                  height: 13,
                  width: `${38 + (idx % 3) * 16}%`,
                  borderRadius: 6,
                  background: "var(--border, #e2e8f0)"
                }}
              />
              <div
                style={{
                  height: 10,
                  width: 32,
                  borderRadius: 4,
                  background: "var(--border-soft, #e2e8f0)"
                }}
              />
            </div>
            <div
              style={{
                height: 11,
                width: `${56 + (idx % 4) * 10}%`,
                borderRadius: 5,
                background: "var(--border-soft, #e2e8f0)",
                opacity: 0.8
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function ContactsSkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%" }}>
      {[0, 1, 2, 3, 4].map((idx) => (
        <div
          key={idx}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "12px 14px",
            borderBottom: "1px solid var(--border-soft)",
            opacity: Math.max(0.4, 1 - idx * 0.12)
          }}
          className="animate-pulse"
        >
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: "50%",
              flexShrink: 0,
              background: "var(--surface-soft, #f1f5f9)",
              border: "1px solid var(--border-soft, #e2e8f0)"
            }}
          />
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ height: 13, width: "45%", borderRadius: 6, background: "var(--border, #e2e8f0)" }} />
            <div style={{ height: 10, width: "65%", borderRadius: 4, background: "var(--border-soft, #e2e8f0)" }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function ChatMessageThreadSkeleton() {
  return (
    <div
      style={{
        flex: 1,
        padding: "20px 20px 24px 20px",
        display: "flex",
        flexDirection: "column",
        gap: 16,
        overflow: "hidden",
        justifyContent: "flex-end",
        width: "100%",
        height: "100%",
        boxSizing: "border-box"
      }}
      className="animate-pulse"
    >
      {/* Date badge skeleton */}
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 6 }}>
        <div
          style={{
            height: 22,
            width: 76,
            borderRadius: 9999,
            background: "var(--surface-soft, #f1f5f9)",
            border: "1px solid var(--border-soft, #e2e8f0)"
          }}
        />
      </div>

      {/* Message 1: Received */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 8, maxWidth: "78%" }}>
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: "50%",
            background: "var(--surface-soft, #f1f5f9)",
            border: "1px solid var(--border-soft, #e2e8f0)",
            flexShrink: 0
          }}
        />
        <div
          style={{
            background: "var(--surface-soft, #f1f5f9)",
            border: "1px solid var(--border-soft, #e2e8f0)",
            borderRadius: "18px 18px 18px 4px",
            padding: "12px 14px",
            display: "flex",
            flexDirection: "column",
            gap: 6,
            minWidth: 160
          }}
        >
          <div style={{ height: 11, width: 140, borderRadius: 4, background: "var(--border, #e2e8f0)" }} />
          <div style={{ height: 11, width: 90, borderRadius: 4, background: "var(--border, #e2e8f0)" }} />
          <div style={{ height: 8, width: 32, borderRadius: 3, background: "var(--border-soft, #e2e8f0)", alignSelf: "flex-end", marginTop: 2 }} />
        </div>
      </div>

      {/* Message 2: Sent */}
      <div style={{ display: "flex", justifyContent: "flex-end", width: "100%" }}>
        <div
          style={{
            background: "var(--surface-soft, #f1f5f9)",
            border: "1px solid var(--border-soft, #e2e8f0)",
            borderRadius: "18px 18px 4px 18px",
            padding: "12px 14px",
            display: "flex",
            flexDirection: "column",
            gap: 6,
            maxWidth: "75%",
            minWidth: 180
          }}
        >
          <div style={{ height: 11, width: 170, borderRadius: 4, background: "var(--border, #e2e8f0)" }} />
          <div style={{ height: 11, width: 130, borderRadius: 4, background: "var(--border, #e2e8f0)" }} />
          <div style={{ height: 8, width: 36, borderRadius: 3, background: "var(--border-soft, #e2e8f0)", alignSelf: "flex-end", marginTop: 2 }} />
        </div>
      </div>

      {/* Message 3: Received (Payment / Attachment card style) */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 8, maxWidth: "78%" }}>
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: "50%",
            background: "var(--surface-soft, #f1f5f9)",
            border: "1px solid var(--border-soft, #e2e8f0)",
            flexShrink: 0
          }}
        />
        <div
          style={{
            background: "var(--surface-soft, #f1f5f9)",
            border: "1px solid var(--border-soft, #e2e8f0)",
            borderRadius: "18px 18px 18px 4px",
            padding: "12px 14px",
            display: "flex",
            flexDirection: "column",
            gap: 10,
            width: 210
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", background: "var(--border, #e2e8f0)" }} />
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ height: 12, width: 70, borderRadius: 4, background: "var(--border, #e2e8f0)" }} />
              <div style={{ height: 9, width: 50, borderRadius: 3, background: "var(--border-soft, #e2e8f0)" }} />
            </div>
          </div>
          <div style={{ height: 8, width: 40, borderRadius: 3, background: "var(--border-soft, #e2e8f0)", alignSelf: "flex-end" }} />
        </div>
      </div>

      {/* Message 4: Sent short message */}
      <div style={{ display: "flex", justifyContent: "flex-end", width: "100%" }}>
        <div
          style={{
            background: "var(--surface-soft, #f1f5f9)",
            border: "1px solid var(--border-soft, #e2e8f0)",
            borderRadius: "18px 18px 4px 18px",
            padding: "12px 14px",
            display: "flex",
            flexDirection: "column",
            gap: 6,
            minWidth: 120
          }}
        >
          <div style={{ height: 11, width: 100, borderRadius: 4, background: "var(--border, #e2e8f0)" }} />
          <div style={{ height: 8, width: 32, borderRadius: 3, background: "var(--border-soft, #e2e8f0)", alignSelf: "flex-end", marginTop: 2 }} />
        </div>
      </div>

      {/* Message 5: Received final message */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 8, maxWidth: "78%" }}>
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: "50%",
            background: "var(--surface-soft, #f1f5f9)",
            border: "1px solid var(--border-soft, #e2e8f0)",
            flexShrink: 0
          }}
        />
        <div
          style={{
            background: "var(--surface-soft, #f1f5f9)",
            border: "1px solid var(--border-soft, #e2e8f0)",
            borderRadius: "18px 18px 18px 4px",
            padding: "12px 14px",
            display: "flex",
            flexDirection: "column",
            gap: 6,
            minWidth: 180
          }}
        >
          <div style={{ height: 11, width: 160, borderRadius: 4, background: "var(--border, #e2e8f0)" }} />
          <div style={{ height: 11, width: 110, borderRadius: 4, background: "var(--border, #e2e8f0)" }} />
          <div style={{ height: 8, width: 34, borderRadius: 3, background: "var(--border-soft, #e2e8f0)", alignSelf: "flex-end", marginTop: 2 }} />
        </div>
      </div>
    </div>
  );
}

function ChatSyncSkeletonLayout() {
  return (
    <div
      className="hidden md:flex"
      style={{
        flex: 1,
        flexDirection: "column",
        background: "var(--bg)",
        height: "100%",
        overflow: "hidden"
      }}
    >
      {/* Top Header Placeholder */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 20px",
          borderBottom: "1px solid var(--border-soft)",
          background: "var(--surface)"
        }}
        className="animate-pulse"
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: "50%", background: "var(--surface-soft, #f1f5f9)", border: "1px solid var(--border-soft)" }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ height: 13, width: 90, borderRadius: 4, background: "var(--border, #e2e8f0)" }} />
            <div style={{ height: 10, width: 50, borderRadius: 3, background: "var(--border-soft, #e2e8f0)" }} />
          </div>
        </div>
        <div style={{ height: 26, width: 68, borderRadius: 9999, background: "var(--surface-soft, #f1f5f9)", border: "1px solid var(--border-soft)" }} />
      </div>

      {/* Syncing Info Badge */}
      <div style={{ display: "flex", justifyContent: "center", padding: "14px 0 0 0" }}>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 14px",
            borderRadius: 9999,
            background: "var(--surface)",
            border: "1px solid var(--border)",
            fontSize: 11.5,
            fontWeight: 600,
            color: "var(--text-muted)",
            boxShadow: "0 1px 3px rgba(0,0,0,0.03)"
          }}
        >
          <span className="w-2 h-2 rounded-full bg-[var(--accent-red)] animate-ping" />
          <span>Syncing conversations from decentralized network...</span>
        </div>
      </div>

      {/* Chat Thread Skeleton */}
      <ChatMessageThreadSkeleton />

      {/* Bottom Mock Input Bar */}
      <div
        style={{
          padding: "12px 20px",
          borderTop: "1px solid var(--border-soft)",
          background: "var(--surface)",
          display: "flex",
          alignItems: "center",
          gap: 10
        }}
        className="animate-pulse"
      >
        <div style={{ height: 36, width: 60, borderRadius: 9999, background: "var(--surface-soft)" }} />
        <div style={{ height: 36, flex: 1, borderRadius: 9999, background: "var(--surface-soft)", border: "1px solid var(--border-soft)" }} />
        <div style={{ width: 36, height: 36, borderRadius: "50%", background: "var(--surface-soft)" }} />
      </div>
    </div>
  );
}

function SendIconBadge({ size = 32 }: { size?: number }) {
  const iconSize = Math.max(10, Math.round(size * 0.38));
  return (
    <div style={{
      width: size,
      height: size,
      borderRadius: "50%",
      background: "#dc2626",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0
    }}>
      <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none">
        <path d="M12 5L21 18H3L12 5Z" fill="#ffffff" />
      </svg>
    </div>
  );
}

function ReceiveIconBadge({ size = 32 }: { size?: number }) {
  const iconSize = Math.max(10, Math.round(size * 0.38));
  return (
    <div style={{
      width: size,
      height: size,
      borderRadius: "50%",
      background: "#2563eb",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0
    }}>
      <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none">
        <path d="M12 19L3 6H21L12 19Z" fill="#ffffff" />
      </svg>
    </div>
  );
}

function PaymentsHistoryFullSkeleton() {
  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 20 }} className="animate-pulse">
      {/* Top stats card skeleton */}
      <div style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 16,
        padding: "16px 20px",
        display: "flex",
        flexDirection: "column",
        gap: 14
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ height: 11, width: 140, borderRadius: 4, background: "var(--border-soft, #e2e8f0)" }} />
            <div style={{ height: 26, width: 180, borderRadius: 6, background: "var(--border, #cbd5e1)", marginTop: 8 }} />
          </div>
          <div style={{ height: 32, width: 110, borderRadius: 9999, background: "var(--surface-soft, #f1f5f9)" }} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div style={{ height: 52, borderRadius: 12, background: "var(--surface-soft, #f1f5f9)", border: "1px solid var(--border-soft)" }} />
          <div style={{ height: 52, borderRadius: 12, background: "var(--surface-soft, #f1f5f9)", border: "1px solid var(--border-soft)" }} />
        </div>
      </div>

      {/* Filter row skeleton */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ height: 16, width: 130, borderRadius: 4, background: "var(--border-soft, #e2e8f0)" }} />
        <div style={{ height: 32, width: 280, borderRadius: 9999, background: "var(--surface-soft, #f1f5f9)" }} />
      </div>

      {/* Item cards skeleton */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              padding: "12px 14px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              opacity: Math.max(0.35, 1 - i * 0.15)
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: "50%", background: "var(--border-soft, #e2e8f0)" }} />
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ height: 13, width: 80, borderRadius: 4, background: "var(--border, #cbd5e1)" }} />
                <div style={{ height: 11, width: 130, borderRadius: 4, background: "var(--border-soft, #e2e8f0)" }} />
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
              <div style={{ height: 16, width: 70, borderRadius: 4, background: "var(--border, #cbd5e1)" }} />
              <div style={{ height: 14, width: 55, borderRadius: 4, background: "var(--surface-soft, #f1f5f9)" }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PaymentsLedgerSkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%", padding: "6px 0" }} className="animate-pulse">
      {[0, 1, 2, 3, 4].map((idx) => (
        <div
          key={idx}
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 14,
            padding: "12px 16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            opacity: Math.max(0.35, 1 - idx * 0.14)
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0 }}>
            <div style={{ width: 36, height: 36, borderRadius: "50%", background: "var(--surface-soft, #f1f5f9)", border: "1px solid var(--border-soft)", flexShrink: 0 }} />
            <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ height: 13, width: 60, borderRadius: 4, background: "var(--border, #e2e8f0)" }} />
                <div style={{ height: 9, width: 45, borderRadius: 3, background: "var(--border-soft, #e2e8f0)" }} />
              </div>
              <div style={{ height: 11, width: "70%", borderRadius: 4, background: "var(--border-soft, #e2e8f0)" }} />
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
            <div style={{ height: 14, width: 65, borderRadius: 4, background: "var(--border, #e2e8f0)" }} />
            <div style={{ height: 16, width: 60, borderRadius: 6, background: "var(--surface-soft, #f1f5f9)" }} />
          </div>
        </div>
      ))}
    </div>
  );
}

const ChatHeader = ({ context }: { context: any }) => {
  if (!context.address || !context.activeChatUser) return <div style={{ height: 20 }} />;
  const convoId = [context.address.toLowerCase(), context.activeChatUser.address.toLowerCase()].sort().join("_");
  return context.isMessagesLoading[convoId] ? (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "14px 20px" }} className="animate-pulse">
      <div style={{ display: "flex", alignItems: "flex-end", gap: 8, maxWidth: "65%" }}>
        <div style={{ width: 26, height: 26, borderRadius: "50%", background: "var(--surface-soft, #f1f5f9)", border: "1px solid var(--border-soft, #e2e8f0)", flexShrink: 0 }} />
        <div style={{ height: 28, width: 140, borderRadius: "14px 14px 14px 4px", background: "var(--surface-soft, #f1f5f9)", border: "1px solid var(--border-soft, #e2e8f0)" }} />
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <div style={{ height: 28, width: 120, borderRadius: "14px 14px 4px 14px", background: "var(--surface-soft, #f1f5f9)", border: "1px solid var(--border-soft, #e2e8f0)" }} />
      </div>
    </div>
  ) : <div style={{ height: 20 }} />;
};

const ChatFooter = () => <div style={{ height: 20 }} />;

export function ChatManager() {
  const { isKeyboardOpen } = useVirtualKeyboard();
  const { mode } = useEnvironment();
  const { address } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { isConnected: stellarConnected } = useStellar();
  const { isConnected: suiConnected } = useSuiWallet();
  const solanaWallet = useWallet();
  const solanaConnected = solanaWallet.connected;
  const isOtherChainConnected = Boolean(stellarConnected || suiConnected || solanaConnected);

  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  const {
    isAuthenticated,
    isAuthenticating,
    authenticate,
    authError,
    clearAuthError,
    activeChatUser,
    setActiveChatUser,
    chats,
    messages,
    isChatsLoading,
    sendMessage,
    refreshPayments,
    isCheckingSession,
  } = useChat();

  const handleAutopayCreated = async (schedule: any) => {
    try {
      await refreshPayments();
      const targetChatAddr = activeChatUser?.address || schedule?.recipientAddress || schedule?.recipient_address;
      if (address && targetChatAddr) {
        await fetchMessages(address, targetChatAddr);
      }
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('arc_autopay_updated'));
      }
    } catch (err) {
      console.warn('handleAutopayCreated refresh error:', err);
    }
  };

  const { markMessageSeen, fetchMessages, isMessagesLoading, hasMoreMessages, decrementUnread } = useChatStore();

  const wasAuthenticating = useRef(false);
  const [actuallyAuthenticated, setActuallyAuthenticated] = useState(isAuthenticated);
  const [showUnlockAnim, setShowUnlockAnim] = useState(false);

  useEffect(() => {
    if (isAuthenticating) {
      wasAuthenticating.current = true;
    }
  }, [isAuthenticating]);

  useEffect(() => {
    if (isAuthenticated) {
      if (!wasAuthenticating.current) {
        setActuallyAuthenticated(true);
      } else {
        setShowUnlockAnim(true);
        const timer = setTimeout(() => {
          setActuallyAuthenticated(true);
          wasAuthenticating.current = false;
        }, 1000);
        return () => clearTimeout(timer);
      }
    } else {
      setActuallyAuthenticated(false);
      setShowUnlockAnim(false);
    }
  }, [isAuthenticated]);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<UserProfile | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState<"all" | "pinned" | "archived" | "contacts">("all");
  const [showProfilePanel, setShowProfilePanel] = useState(false);
  const [showPayModal, setShowPayModal] = useState(false);
  const [showAutopaySetup, setShowAutopaySetup] = useState(false);
  const [showAutopayDashboard, setShowAutopayDashboard] = useState(false);
  const [showNewContactPanel, setShowNewContactPanel] = useState(false);
  const [newContactAddress, setNewContactAddress] = useState("");
  const [newContactName, setNewContactName] = useState("");
  const [newContactColorIndex, setNewContactColorIndex] = useState<number>(0);
  const arcStatsCache = useRef<Record<string, ArcAccountStats>>({});

  const [activeSidebarSection, setActiveSidebarSection] = useState<"chats" | "payments">("chats");
  const [activeCenterTab, setActiveCenterTab] = useState<"chat" | "payments">("chat");
  const [centerPayFilter, setCenterPayFilter] = useState<"all" | "sent" | "received" | "scheduled">("all");

  const handleOpenAutopayDashboard = () => {
    setActiveCenterTab("payments");
    setCenterPayFilter("scheduled");
    setShowAutopaySetup(false);
    setShowPayModal(false);
    setShowProfilePanel(false);
    setShowAutopayDashboard(false);
  };

  const [accessCode, setAccessCode] = useState("");
  const [accessError, setAccessError] = useState("");
  const [isRedeeming, setIsRedeeming] = useState(false);

  // --- SUPABASE FALLBACK STATE ---
  const [supaAccessEnabled, setSupaAccessEnabled] = useState<boolean | null>(null);
  const [supaUserAccess, setSupaUserAccess] = useState<boolean | null>(null);

  useEffect(() => {
    supabase.from("platform_settings").select("bool_value").eq("key", "chatAccessEnabled").single().then(({ data, error }) => {
      if (error && error.code !== "PGRST116") {
        console.warn(`[Supabase Fallback] chat-manager (enabled) | Error: ${error.message}`);
        setSupaAccessEnabled(true); // default to true (protected) on error
      } else if (data) {
        setSupaAccessEnabled(!!data.bool_value);
      } else {
        setSupaAccessEnabled(true);
      }
    });
  }, []);

  useEffect(() => {
    if (!address) {
      setSupaUserAccess(false);
      return;
    }
    supabase.from("chat_access_users").select("address").eq("address", address.toLowerCase()).single().then(({ data, error }) => {
      if (error && error.code !== "PGRST116") {
        console.warn(`[Supabase Fallback] chat-manager (user) | Error: ${error.message}`);
        setSupaUserAccess(false);
      } else if (data) {
        setSupaUserAccess(true);
      } else {
        setSupaUserAccess(false);
      }
    });
  }, [address]);

  // Read receipts: Clear notification badge when viewing chat
  useEffect(() => {
    if (!address || !activeChatUser || !messages || messages.length === 0) return;
    const myAddr = address.toLowerCase();

    const unreadMsgs = messages.filter(m => m.receiver === myAddr && !m.seen);
    if (unreadMsgs.length > 0) {
      unreadMsgs.forEach(m => {
        markMessageSeen(m.id, m.sender, m.receiver);
        decrementUnread(m.sender);
      });
    }
  }, [messages, address, activeChatUser, markMessageSeen, decrementUnread]);

  // hasAccess logic:
  // 1. If admin -> true
  // 2. If Supabase enabled check is loaded:
  //      a. If not enabled -> true
  //      b. If enabled, use Supabase user access check
  // 3. Else -> null (loading)

  const hasAccess = address && isAdmin(address)
    ? true
    : supaAccessEnabled === null
      ? null
      : supaAccessEnabled === false
        ? true
        : supaUserAccess !== null
          ? supaUserAccess
          : null;

  const [showCodeInput, setShowCodeInput] = useState(false);
  const [showCodeSuccess, setShowCodeSuccess] = useState(false);
  const [showSecurityTooltip, setShowSecurityTooltip] = useState(false);

  const handleRedeemCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!address || isRedeeming) return;
    const trimmed = accessCode.trim().toUpperCase();
    if (!trimmed) {
      setAccessError("Please enter an access code");
      return;
    }
    setIsRedeeming(true);
    setAccessError("");
    try {
      const { data, error } = await supabase.rpc('redeem_chat_access_code', {
        p_address: address,
        p_code: trimmed
      });

      if (error) {
        throw error;
      }

      if (data && data.success === false) {
        setAccessError(data.error || "Failed to redeem access code");
        setIsRedeeming(false);
        return;
      }

      setShowCodeInput(false);
      setShowCodeSuccess(true);
      setSupaUserAccess(true);
    } catch (err: any) {
      console.error("Access code redemption failed", err);
      setAccessError(err.message || "An unexpected error occurred");
    } finally {
      setIsRedeeming(false);
    }
  };

  const [renameTarget, setRenameTarget] = useState<{ id: string; currentName: string; currentColor?: number } | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameColorIndex, setRenameColorIndex] = useState<number | undefined>(undefined);

  const [customContacts, setCustomContacts] = useState<Record<string, { name?: string; colorIndex?: number }>>({});
  const [contactsLoaded, setContactsLoaded] = useState(false);

  const contactSaveTimeout = useRef<Record<string, NodeJS.Timeout>>({});

  // Load contacts from secure API route (supabaseAdmin, no RLS issues)
  useEffect(() => {
    if (!address || !isAuthenticated || contactsLoaded) return;

    const fetchContacts = async () => {
      try {
        const res = await fetch('/api/contacts');
        if (!res.ok) {
          console.error('[Contacts] Fetch failed:', res.status, await res.text());
          return;
        }
        const { contacts } = await res.json();
        if (Array.isArray(contacts)) {
          const loaded: Record<string, { name?: string; colorIndex?: number }> = {};
          contacts.forEach((row: any) => {
            loaded[row.contact_address.toLowerCase()] = {
              name: row.contact_name,
              colorIndex: row.color_index
            };
          });
          setCustomContacts(loaded);
        }
      } catch (err) {
        console.error('[Contacts] Failed to load:', err);
      } finally {
        setContactsLoaded(true);
      }
    };

    fetchContacts();
  }, [address, isAuthenticated, contactsLoaded]);

  const saveCustomContact = async (id: string, name?: string, colorIndex?: number) => {
    const updated = { ...customContacts };
    const lowerId = id.toLowerCase();
    if (!updated[lowerId]) updated[lowerId] = {};
    if (name !== undefined) updated[lowerId].name = name;
    if (colorIndex !== undefined) updated[lowerId].colorIndex = colorIndex;

    // Instant optimistic UI update
    setCustomContacts(updated);

    // Debounced backend persistence via secure API route
    if (contactSaveTimeout.current[lowerId]) {
      clearTimeout(contactSaveTimeout.current[lowerId]);
    }
    contactSaveTimeout.current[lowerId] = setTimeout(async () => {
      try {
        const res = await fetch('/api/contacts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contactAddress: lowerId,
            contactName: updated[lowerId].name || null,
            colorIndex: updated[lowerId].colorIndex ?? null
          })
        });
        if (!res.ok) {
          console.error('[Contacts] Save failed:', res.status, await res.text());
        }
      } catch (err) {
        console.error('[Contacts] Save error:', err);
      }
    }, 500);
  };

  const deleteCustomContact = async (id: string) => {
    const updated = { ...customContacts };
    const lowerId = id.toLowerCase();
    delete updated[lowerId];

    // Instant optimistic UI update
    setCustomContacts(updated);

    // Debounced backend delete via secure API route
    if (contactSaveTimeout.current[lowerId]) {
      clearTimeout(contactSaveTimeout.current[lowerId]);
    }
    contactSaveTimeout.current[lowerId] = setTimeout(async () => {
      try {
        const res = await fetch('/api/contacts', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contactAddress: lowerId })
        });
        if (!res.ok) {
          console.error('[Contacts] Delete failed:', res.status, await res.text());
        }
      } catch (err) {
        console.error('[Contacts] Delete error:', err);
      }
    }, 500);
  };

  // Reset profile panel when switching chats
  useEffect(() => {
    setShowProfilePanel(false);
  }, [activeChatUser?.address]);

  // If no EVM wallet is connected, render the Connect Wallet screen
  if (!address) {
    return (
      <div style={{ flex: 1, height: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: isMobile ? "24px" : "72px 24px 24px" }}>
        <div
          className="lf-card"
          style={{
            display: "flex", width: "100%", maxWidth: 1200,
            aspectRatio: isMobile ? "auto" : "16/9", minHeight: isMobile ? 380 : "auto",
            maxHeight: "calc(100vh - 120px)", background: "var(--surface)",
            overflow: "hidden", borderRadius: "var(--radius-card)",
            boxShadow: "0 12px 36px rgba(0,0,0,0.12)"
          }}
        >
          <div
            className="animate-fade-up"
            style={{
              display: "flex", flex: 1, flexDirection: "column",
              alignItems: "center", justifyContent: "center",
              minHeight: 0, padding: "32px 24px", textAlign: "center", position: "relative"
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", maxWidth: 420, gap: 20 }}>
              {/* Clean Icon */}
              <div
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: "50%",
                  background: "var(--surface-soft, rgba(0, 0, 0, 0.04))",
                  border: "1px solid var(--border)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
                  position: "relative"
                }}
              >
                <Wallet style={{ width: 28, height: 28, color: "var(--text-primary)" }} />
              </div>

              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.02em", margin: 0 }}>
                  {isOtherChainConnected ? "EVM Wallet Required" : "Connect Wallet to Chat"}
                </h2>
                <p style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.5, margin: 0 }}>
                  {isOtherChainConnected
                    ? "ArcFun Chat uses cryptographically signed EVM sessions. Please connect MetaMask, Rabby, or any EVM wallet."
                    : "Connect your EVM wallet to unlock real-time messaging, instant in-chat payments, and auto-pay."}
                </p>
              </div>

              <button
                onClick={() => {
                  if (openConnectModal) {
                    openConnectModal();
                  } else {
                    const headerBtn = document.getElementById("wallet-dropdown-trigger");
                    if (headerBtn) headerBtn.click();
                  }
                }}
                className="hover:opacity-90 active:scale-[0.98] transition-all"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "11px 26px",
                  borderRadius: 99,
                  fontSize: 14,
                  fontWeight: 600,
                  background: "var(--text-primary)",
                  color: "var(--surface)",
                  border: "1px solid transparent",
                  cursor: "pointer",
                  boxShadow: "0 2px 8px rgba(0, 0, 0, 0.08)",
                }}
              >
                <Wallet style={{ width: 16, height: 16 }} />
                <span>{isOtherChainConnected ? "Connect EVM Wallet" : "Connect Wallet"}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // If access state is still loading, show a smooth skeleton/loader
  if (hasAccess === null) {
    return (
      <div style={{ flex: 1, height: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: isMobile ? "24px" : "72px 24px 24px" }}>
        <div className="lf-card arc-premium-coating" style={{ display: "flex", width: "100%", maxWidth: 1200, aspectRatio: isMobile ? "auto" : "16/9", minHeight: isMobile ? 300 : "auto", maxHeight: "calc(100vh - 120px)", alignItems: "center", justifyContent: "center", borderRadius: "var(--radius-card)" }}>
          <Loader2 style={{ animation: "spin 1s linear infinite", opacity: 0.5, color: "var(--text-muted)", width: 24, height: 24 }} />
        </div>
      </div>
    );
  }

  // If no access, render the premium Access Code Gate
  if (hasAccess === false) {
    return (
      <div style={{ flex: 1, height: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: isMobile ? "24px" : "72px 24px 24px" }}>
        <div
          className="lf-card arc-premium-coating"
          style={{ display: "flex", width: "100%", maxWidth: 1200, aspectRatio: isMobile ? "auto" : "16/9", minHeight: isMobile ? 400 : "auto", maxHeight: "calc(100vh - 120px)", background: "var(--surface)", overflow: "hidden", borderRadius: "var(--radius-card)", boxShadow: "0 12px 36px rgba(0,0,0,0.12)" }}
        >
          <div style={{ display: "flex", flex: 1, flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 0, padding: "20px", position: "relative" }}>
            {/* Main Gate Card */}
            <div
              className="animate-fade-up"
              style={{
                textAlign: "center",
                maxWidth: 360,
                width: "100%",
              }}
            >
              {/* Icon */}
              <div style={{
                width: 64, height: 64, borderRadius: "50%",
                background: "linear-gradient(135deg, rgba(179, 0, 0,0.12) 0%, rgba(179, 0, 0,0.04) 100%)",
                border: "1px solid rgba(179, 0, 0,0.2)",
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                marginBottom: 20,
                boxShadow: "0 0 24px rgba(179, 0, 0,0.1)"
              }}>
                <Lock style={{ width: 26, height: 26, color: "var(--accent-red)" }} />
              </div>

              <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.02em", marginBottom: 8 }}>
                Exclusive Access
              </h2>
              <p style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.6, marginBottom: 28, maxWidth: 260, margin: "0 auto 28px" }}>
                ArcFun Chat is invite-only. Enter your access code to join.
              </p>

              <button
                onClick={() => setShowCodeInput(true)}
                className="lf-card hover:brightness-110"
                style={{
                  width: "100%",
                  padding: "13px 24px",
                  borderRadius: 12,
                  border: "1px solid rgba(255, 68, 68, 0.2)",
                  background: "rgba(255, 68, 68, 0.08)",
                  color: "var(--accent-red)",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "all 0.2s",
                }}
              >
                <span style={{
                  fontSize: 14,
                  fontWeight: 700,
                  letterSpacing: "0.02em",
                }}>
                  Enter Access Code
                </span>
              </button>
            </div>

            {/* SLIDE-UP Code Input Sheet */}
            <AnimatePresence>
              {showCodeInput && (
                <>
                  {/* Backdrop */}
                  <motion.div
                    key="code-backdrop"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => { setShowCodeInput(false); setAccessError(""); setAccessCode(""); }}
                    style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.3)", backdropFilter: "blur(4px)", zIndex: 10, borderRadius: "inherit" }}
                  />

                  {/* Container for Centering */}
                  <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 11, pointerEvents: "none", padding: 20 }}>
                    {/* Floating Popup */}
                    <motion.div
                      key="code-sheet"
                      initial={{ scale: 0.95, opacity: 0, y: 10 }}
                      animate={{ scale: 1, opacity: 1, y: 0 }}
                      exit={{ scale: 0.95, opacity: 0, y: 10 }}
                      transition={{ type: "spring", stiffness: 400, damping: 30 }}
                      style={{
                        width: "100%", maxWidth: 320,
                        background: "var(--surface)",
                        border: "1px solid var(--border)",
                        borderRadius: 20,
                        padding: "24px",
                        boxShadow: "0 20px 40px rgba(0,0,0,0.2)",
                        pointerEvents: "auto",
                      }}
                    >
                      <div style={{ padding: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                          <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", margin: 0, letterSpacing: "-0.01em" }}>Enter Access Code</h3>
                          <button
                            onClick={() => { setShowCodeInput(false); setAccessError(""); setAccessCode(""); }}
                            style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "var(--text-muted)", borderRadius: "50%", display: "flex" }}
                          >
                            <X style={{ width: 18, height: 18 }} />
                          </button>
                        </div>

                        <form onSubmit={handleRedeemCode} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                          <div style={{ position: "relative" }}>
                            <input
                              type="text"
                              value={accessCode}
                              onChange={e => setAccessCode(e.target.value.toUpperCase())}
                              placeholder="ARC-XXXX-XXXX"
                              className="lf-input"
                              disabled={isRedeeming}
                              autoFocus
                              style={{
                                width: "100%",
                                padding: "14px 20px",
                                fontSize: 16,
                                textAlign: "center",
                                letterSpacing: "0.18em",
                                fontWeight: 700,
                                fontFamily: "monospace",
                                boxSizing: "border-box",
                              }}
                            />
                          </div>

                          {accessError && (
                            <div style={{
                              display: "flex", alignItems: "center", gap: 6,
                              color: "#ef4444", fontSize: 12, fontWeight: 600,
                              background: "rgba(239,68,68,0.08)", borderRadius: 8, padding: "8px 12px"
                            }}>
                              <span>⚠</span> {accessError}
                            </div>
                          )}

                          <button
                            type="submit"
                            className="lf-btn-primary"
                            disabled={isRedeeming || !accessCode.trim()}
                            style={{ width: "100%", padding: "14px 20px", fontSize: 14, fontWeight: 700, opacity: (isRedeeming || !accessCode.trim()) ? 0.6 : 1 }}
                          >
                            {isRedeeming ? (
                              <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                                <span className="animate-spin">⟳</span> Verifying…
                              </span>
                            ) : "Verify Code"}
                          </button>
                        </form>
                      </div>
                    </motion.div>
                  </div>
                </>
              )}
            </AnimatePresence>

            {/* SUCCESS POPUP — shown after code is verified */}
            <AnimatePresence>
              {showCodeSuccess && (
                <>
                  <motion.div
                    key="success-backdrop"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)", zIndex: 10, borderRadius: "inherit" }}
                  />
                  <motion.div
                    key="success-popup"
                    initial={{ scale: 0.85, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.9, opacity: 0 }}
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                    style={{
                      position: "absolute", top: "50%", left: "50%",
                      transform: "translate(-50%, -50%)",
                      zIndex: 11, width: "90%", maxWidth: 340,
                      background: "var(--surface)",
                      borderRadius: 20, padding: "32px 28px",
                      textAlign: "center",
                      border: "1px solid var(--border)",
                      boxShadow: "0 24px 60px rgba(0,0,0,0.3)",
                    }}
                  >
                    <div style={{
                      width: 56, height: 56, borderRadius: "50%",
                      background: "linear-gradient(135deg, rgba(34,197,94,0.15), rgba(34,197,94,0.05))",
                      border: "1px solid rgba(34,197,94,0.25)",
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      marginBottom: 16, fontSize: 24
                    }}>✓</div>
                    <h3 style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)", marginBottom: 8, letterSpacing: "-0.01em" }}>Code Accepted!</h3>
                    <p style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.6, marginBottom: 24 }}>
                      Your access is confirmed. Sign a message with your wallet to activate your session.
                    </p>
                    <button
                      className="lf-btn-primary"
                      onClick={async () => {
                        setShowCodeSuccess(false);
                        await authenticate();
                      }}
                      style={{ width: "100%", padding: "13px 20px", fontSize: 14, fontWeight: 700 }}
                    >
                      Sign Message & Enter Chat
                    </button>
                    <button
                      onClick={() => setShowCodeSuccess(false)}
                      style={{ marginTop: 10, background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "var(--text-muted)", padding: "6px 12px" }}
                    >
                      I'll do this later
                    </button>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    );
  }

  // While the server session is being silently verified, show a seamless
  // loading skeleton so the user never sees a flash of "Tap to Sign".
  if (isCheckingSession && !isAuthenticated) {
    return (
      <div style={{ flex: 1, height: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: isMobile ? "24px" : "72px 24px 24px" }}>
        <div className="lf-card arc-premium-coating" style={{ display: "flex", width: "100%", maxWidth: 1200, aspectRatio: isMobile ? "auto" : "16/9", minHeight: isMobile ? 300 : "auto", maxHeight: "calc(100vh - 120px)", alignItems: "center", justifyContent: "center", borderRadius: "var(--radius-card)" }}>
          <Loader2 style={{ animation: "spin 1s linear infinite", opacity: 0.5, color: "var(--text-muted)", width: 24, height: 24 }} />
        </div>
      </div>
    );
  }

  // If not authenticated, render the Premium Sign-in Welcome Screen
  if (!actuallyAuthenticated) {
    return (
      <div style={{ flex: 1, height: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: isMobile ? "24px" : "72px 24px 24px" }}>
        <div
          className="lf-card"
          style={{ display: "flex", width: "100%", maxWidth: 1200, aspectRatio: isMobile ? "auto" : "16/9", minHeight: isMobile ? 350 : "auto", maxHeight: "calc(100vh - 120px)", background: "var(--surface)", overflow: "hidden", borderRadius: "var(--radius-card)", boxShadow: "0 12px 36px rgba(0,0,0,0.12)" }}
        >
          <div
            className="animate-fade-up"
            style={{
              display: "flex", flex: 1, flexDirection: "column",
              alignItems: "center", justifyContent: "center",
              minHeight: 0, padding: 24, textAlign: "center", position: "relative"
            }}
          >
            {/* Live Interactive UI for Signature */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 24 }}>
              <button
                onClick={async () => {
                  clearAuthError();
                  await authenticate();
                }}
                disabled={isAuthenticating}
                style={{
                  width: 80,
                  height: 80,
                  borderRadius: "50%",
                  background: isAuthenticating ? "var(--surface-hover)" : "var(--surface)",
                  border: "1px solid var(--border)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: isAuthenticating ? "not-allowed" : "pointer",
                  transition: "all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)",
                  boxShadow: "0 2px 10px rgba(0, 0, 0, 0.05)",
                  position: "relative",
                  outline: "none"
                }}
                onMouseEnter={e => {
                  if (!isAuthenticating) {
                    e.currentTarget.style.transform = "scale(1.04)";
                    e.currentTarget.style.borderColor = "var(--text-primary)";
                  }
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.transform = "scale(1)";
                  e.currentTarget.style.borderColor = "var(--border)";
                }}
              >
                <AnimatedAuthIcon isAuthenticating={isAuthenticating} isUnlocked={showUnlockAnim} />
              </button>

              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
                <span style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.01em" }}>
                  {showUnlockAnim ? "Unlocked!" : isAuthenticating ? "Awaiting Signature in Wallet..." : "Tap to Sign"}
                </span>

                {/* Wallet Address Display below Tap to Sign */}
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-secondary)", fontWeight: 500, marginTop: 2 }}>
                  <span>{address.slice(0, 6)}...{address.slice(-4)}</span>
                  <span style={{ opacity: 0.35 }}>•</span>
                  <button
                    onClick={() => {
                      const headerBtn = document.getElementById("wallet-dropdown-trigger");
                      if (headerBtn) headerBtn.click();
                    }}
                    title="Change wallet"
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      padding: 0,
                      color: "var(--text-muted)",
                      fontSize: 11,
                      fontWeight: 600,
                      textDecoration: "underline",
                    }}
                    className="hover:text-[var(--text-primary)] transition-colors"
                  >
                    Change
                  </button>
                </div>

                <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 400, marginTop: 4 }}>
                  {isAuthenticating
                    ? "Please confirm the signature request in your wallet extension"
                    : "No gas fee required · Proves wallet ownership"}
                </span>
              </div>

              {/* Error Alert */}
              {authError && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "10px 16px",
                    borderRadius: 12,
                    background: "rgba(239, 68, 68, 0.08)",
                    border: "1px solid rgba(239, 68, 68, 0.25)",
                    color: "#ef4444",
                    fontSize: 12,
                    fontWeight: 600,
                    maxWidth: 380,
                  }}
                >
                  <AlertCircle style={{ width: 16, height: 16, flexShrink: 0 }} />
                  <span style={{ flex: 1, textAlign: "left" }}>{authError}</span>
                  <button
                    onClick={clearAuthError}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", padding: 2 }}
                  >
                    <X style={{ width: 14, height: 14 }} />
                  </button>
                </div>
              )}
            </div>

            {!isKeyboardOpen && (
              <div style={{ position: "absolute", bottom: 24, display: "flex", alignItems: "center", gap: 6, opacity: 0.6, color: "var(--text-muted)" }}>
                <Unlock style={{ width: 13, height: 13 }} />
                <span style={{ fontSize: 11, fontWeight: 500 }}>Messages are unencrypted</span>
                <button
                  onClick={() => setShowSecurityTooltip(true)}
                  className="hover:text-[var(--text-primary)] transition-colors"
                  style={{ background: "none", border: "none", cursor: "pointer", padding: 2, display: "flex", alignItems: "center" }}
                >
                  <Info style={{ width: 14, height: 14 }} />
                </button>
              </div>
            )}

            {/* SECURITY TOOLTIP POPUP */}
            {isMobile && typeof document !== 'undefined' ? createPortal(
              <AnimatePresence>
                {showSecurityTooltip && (
                  <>
                    <motion.div
                      key="security-backdrop-mobile"
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      onClick={() => setShowSecurityTooltip(false)}
                      style={{ position: "fixed", inset: 0, zIndex: 999998 }}
                    />
                    <motion.div
                      key="security-popup-mobile"
                      initial={{ scale: 0.95, opacity: 0, x: "-50%", y: 10 }} animate={{ scale: 1, opacity: 1, x: "-50%", y: 0 }} exit={{ scale: 0.95, opacity: 0, x: "-50%", y: 10 }}
                      transition={{ type: "spring", stiffness: 400, damping: 30 }}
                      style={{
                        position: "fixed", bottom: 125, left: "50%",
                        width: "85%", maxWidth: 260, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: "20px", zIndex: 999999, boxShadow: "0 20px 40px rgba(0,0,0,0.4)",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <Unlock style={{ width: 16, height: 16, color: "var(--text-primary)" }} />
                          <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", margin: 0, letterSpacing: "-0.01em" }}>Message Security</h3>
                        </div>
                        <button onClick={() => setShowSecurityTooltip(false)} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "var(--text-muted)", borderRadius: "50%", display: "flex", margin: "-4px -4px -4px 0" }}>
                          <X style={{ width: 16, height: 16 }} />
                        </button>
                      </div>
                      <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5, margin: 0, textAlign: "left" }}>
                        <strong style={{ color: "var(--text-primary)" }}>Note:</strong> Please do not share sensitive information, such as private keys, in this chat. Messages on ArcFun are not currently end-to-end encrypted (E2EE).
                      </p>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>,
              document.body
            ) : (
              <AnimatePresence>
                {showSecurityTooltip && (
                  <>
                    <motion.div
                      key="security-backdrop-desktop"
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      onClick={() => setShowSecurityTooltip(false)}
                      style={{ position: "absolute", inset: 0, zIndex: 10, borderRadius: "inherit" }}
                    />
                    <motion.div
                      key="security-popup-desktop"
                      initial={{ scale: 0.95, opacity: 0, y: 10, x: "-50%" }} animate={{ scale: 1, opacity: 1, y: 0, x: "-50%" }} exit={{ scale: 0.95, opacity: 0, y: 10, x: "-50%" }}
                      transition={{ type: "spring", stiffness: 400, damping: 30 }}
                      style={{
                        position: "absolute", bottom: 50, left: "50%", transformOrigin: "bottom center",
                        width: "90%", maxWidth: 320, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: "20px 24px", zIndex: 11, boxShadow: "0 20px 40px rgba(0,0,0,0.4)",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <Unlock style={{ width: 16, height: 16, color: "var(--text-primary)" }} />
                          <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", margin: 0, letterSpacing: "-0.01em" }}>Message Security</h3>
                        </div>
                        <button onClick={() => setShowSecurityTooltip(false)} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "var(--text-muted)", borderRadius: "50%", display: "flex", margin: "-4px -4px -4px 0" }}>
                          <X style={{ width: 16, height: 16 }} />
                        </button>
                      </div>
                      <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5, margin: 0, textAlign: "left" }}>
                        <strong style={{ color: "var(--text-primary)" }}>Note:</strong> Please do not share sensitive information, such as private keys, in this chat. Messages on ArcFun are not currently end-to-end encrypted (E2EE).
                      </p>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, height: "100%", display: "flex", alignItems: "stretch", justifyContent: "center", padding: isMobile ? (activeChatUser ? "0" : "0 0 calc(68px + max(10px, env(safe-area-inset-bottom))) 0") : "72px 24px 20px" }}>
      <div
        className={isMobile ? "" : "lf-card"}
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          maxWidth: ((showPayModal || showAutopaySetup || showProfilePanel) && activeChatUser) ? 1440 : 1200,
          /* aspectRatio: isMobile ? "auto" : "16/9", */
          minHeight: 0, maxHeight: "none",
          background: isMobile ? "transparent" : "var(--surface)",
          overflow: "hidden",
          borderRadius: isMobile ? 0 : "var(--radius-card)",
          boxShadow: isMobile ? "none" : "0 12px 36px rgba(0,0,0,0.12)",
          border: isMobile ? "none" : undefined
        }}
      >
        {/* 1. Conversations Sidebar */}
        <div
          style={{
            borderRight: "1px solid var(--border)",
            flexDirection: "column",
            overflow: "hidden",
            transition: "width 0.3s ease, min-width 0.3s ease, max-width 0.3s ease"
          }}
          className={`${activeChatUser ? "hidden md:flex" : "flex"} ${(showPayModal || showAutopaySetup || showProfilePanel) && activeChatUser ? "w-full md:w-[280px] md:min-w-[280px] md:max-w-[280px]" : "w-full md:w-[320px] md:min-w-[320px] md:max-w-[320px]"} md:shrink-0 h-full`}
        >
          <Sidebar
            customContacts={customContacts}
            setRenameTarget={setRenameTarget}
            setRenameValue={setRenameValue}
            activeSidebarSection={activeSidebarSection}
            setActiveSidebarSection={setActiveSidebarSection}
            activeCenterTab={activeCenterTab}
            setActiveCenterTab={setActiveCenterTab}
            activeSubTab={activeSubTab}
            setActiveSubTab={setActiveSubTab}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            searchResults={searchResults}
            setSearchResults={setSearchResults}
            isSearching={isSearching}
            setIsSearching={setIsSearching}
            setShowNewContactPanel={setShowNewContactPanel}
            deleteCustomContact={deleteCustomContact}
          />
        </div>

        {/* 2. Main Chat Area & Panels */}
        {activeChatUser ? (
          <div style={{ flex: 1, display: "flex", flexDirection: "row", minHeight: 0, minWidth: 0, overflow: "hidden", position: "relative" }}>

            {/* Chat Window — automatically takes remaining space */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, minWidth: 0, overflow: "hidden" }}>
              <ChatWindow
                onToggleProfile={() => {
                  setShowProfilePanel(v => !v);
                  setShowPayModal(false);
                  setShowAutopaySetup(false);
                }}
                onOpenPay={() => {
                  setShowPayModal(true);
                  setShowAutopaySetup(false);
                  setShowProfilePanel(false);
                }}
                onOpenAutopaySetup={() => {
                  setShowAutopaySetup(true);
                  setShowPayModal(false);
                  setShowProfilePanel(false);
                }}
                onOpenAutopayDashboard={handleOpenAutopayDashboard}
                onOpenEdit={() => {
                  setShowPayModal(false);
                  setShowAutopaySetup(false);
                  setShowProfilePanel(false);
                }}
                activeCenterTab={activeCenterTab}
                setActiveCenterTab={setActiveCenterTab}
                payFilter={centerPayFilter}
                setPayFilter={setCenterPayFilter}
                customContacts={customContacts}
                setRenameTarget={setRenameTarget}
                setRenameValue={setRenameValue}
                setRenameColorIndex={setRenameColorIndex}
              />
            </div>

            {/* 3. Sliding Profile Panel */}
            <AnimatePresence mode="wait">
              {showProfilePanel && (
                <motion.div
                  key="profile-panel"
                  initial={{ x: 60, opacity: 0, width: 0 }}
                  animate={{ x: 0, opacity: 1, width: 300 }}
                  exit={{ x: 60, opacity: 0, width: 0 }}
                  transition={{ type: "spring", stiffness: 380, damping: 32 }}
                  style={{ borderLeft: "1px solid var(--border)", background: "var(--surface)", overflowY: "auto", flexShrink: 0 }}
                  className="hidden lg:block"
                >
                  <ProfilePanel
                    onClose={() => setShowProfilePanel(false)}
                    customContacts={customContacts}
                    arcStatsCache={arcStatsCache}
                    onOpenAutopayDashboard={handleOpenAutopayDashboard}
                  />
                </motion.div>
              )}
            </AnimatePresence>

            {/* 4. Sliding Pay Panel — perfectly synced 50% split */}
            <AnimatePresence mode="wait">
              {showPayModal && (
                <motion.div
                  key="payment-panel"
                  initial={{ width: 0, minWidth: 0, opacity: 0 }}
                  animate={{ width: isMobile ? "100%" : 380, minWidth: isMobile ? "100%" : 380, opacity: 1 }}
                  exit={{ width: 0, minWidth: 0, opacity: 0 }}
                  transition={{ type: "spring", stiffness: 300, damping: 32 }}
                  style={{
                    flexGrow: 0,
                    flexShrink: 0,
                    borderLeft: isMobile ? "none" : "1px solid var(--border)",
                    boxShadow: "-2px 0 12px rgba(0,0,0,0.04)",
                    overflowY: "hidden",
                    background: "var(--surface)",
                    position: isMobile ? "fixed" : "relative",
                    inset: isMobile ? 0 : undefined,
                    zIndex: isMobile ? 100 : undefined
                  }}
                >
                  <PayPanel
                    onClose={() => setShowPayModal(false)}
                    customContacts={customContacts}
                    onOpenAutopaySetup={() => {
                      setShowPayModal(false);
                      setShowAutopaySetup(true);
                    }}
                  />
                </motion.div>
              )}
            </AnimatePresence>

            {/* 5. Sliding Autopay Panel — identical slide drawer to PayPanel */}
            <AnimatePresence mode="wait">
              {showAutopaySetup && (
                <motion.div
                  key="autopay-panel"
                  initial={{ width: 0, minWidth: 0, opacity: 0 }}
                  animate={{ width: isMobile ? "100%" : 380, minWidth: isMobile ? "100%" : 380, opacity: 1 }}
                  exit={{ width: 0, minWidth: 0, opacity: 0 }}
                  transition={{ type: "spring", stiffness: 300, damping: 32 }}
                  style={{
                    flexGrow: 0,
                    flexShrink: 0,
                    borderLeft: isMobile ? "none" : "1px solid var(--border)",
                    boxShadow: "-2px 0 12px rgba(0,0,0,0.04)",
                    overflowY: "hidden",
                    background: "var(--surface)",
                    position: isMobile ? "fixed" : "relative",
                    inset: isMobile ? 0 : undefined,
                    zIndex: isMobile ? 100 : undefined
                  }}
                >
                  <AutopayPanel
                    onClose={() => setShowAutopaySetup(false)}
                    onSwitchToPay={() => {
                      setShowAutopaySetup(false);
                      setShowPayModal(true);
                    }}
                    onOpenDashboard={handleOpenAutopayDashboard}
                    recipientAddress={activeChatUser?.address || ""}
                    recipientName={activeChatUser ? (customContacts[activeChatUser.address.toLowerCase()]?.name || activeChatUser.name) : ""}
                    recipientPhoto={activeChatUser?.photoUrl}
                    customContacts={customContacts}
                    onScheduleCreated={handleAutopayCreated}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ) : isChatsLoading ? (
          <ChatSyncSkeletonLayout />
        ) : (
          <div
            className="hidden md:flex"
            style={{
              flex: 1,
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              background: "var(--bg)",
              color: "var(--text-muted)"
            }}
          >
            <MessageSquare style={{ width: 48, height: 48, strokeWidth: 1.5, opacity: 0.5, marginBottom: 12 }} />
            <p style={{ fontSize: 13, fontWeight: 500 }}>Select a chat or search for a wallet to start messaging</p>
          </div>
        )}

        {/* 5. Sliding Edit Contact Panel */}
        <AnimatePresence mode="wait">
          {renameTarget && (
            <motion.div
              key="edit-contact-panel"
              initial={isMobile ? { y: "100%", opacity: 0 } : { x: 100, opacity: 0 }}
              animate={isMobile ? { y: 0, opacity: 1 } : { x: 0, opacity: 1 }}
              exit={isMobile ? { y: "100%", opacity: 0 } : { x: 100, opacity: 0 }}
              transition={{ type: "spring", stiffness: 380, damping: 32 }}
              style={{ background: "var(--surface)", overflowY: "auto", flexShrink: 0, width: isMobile ? "100%" : 320 }}
              className="fixed inset-x-0 bottom-0 z-50 h-[80vh] rounded-t-2xl shadow-[0_-8px_30px_rgba(0,0,0,0.12)] border-t border-l-0 border-r-0 border-[var(--border)] md:relative md:inset-auto md:h-auto md:rounded-none md:shadow-none md:border-t-0 md:border-l md:border-[var(--border)]"
            >
              <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid var(--border-soft)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <button onClick={() => setRenameTarget(null)} className="lf-btn-ghost md:hidden" style={{ padding: 6, borderRadius: "50%", margin: "-6px 0 -6px -6px" }}>
                      <X style={{ width: 20, height: 20 }} />
                    </button>
                    <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: "var(--text-primary)" }}>Edit Contact</h3>
                  </div>
                  <button onClick={() => setRenameTarget(null)} className="lf-btn-ghost hidden md:flex" style={{ padding: 6, borderRadius: "50%" }}>
                    <X style={{ width: 16, height: 16 }} />
                  </button>
                </div>

                <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 24, overflowY: "auto", flex: 1 }}>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: 8 }}>Contact Name</label>
                    <input
                      type="text"
                      value={renameValue}
                      onChange={e => setRenameValue(e.target.value)}
                      className="lf-input"
                      placeholder="Enter display name..."
                      style={{ width: "100%" }}
                      autoFocus
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: 8 }}>Profile Color</label>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10 }}>
                      {AVATAR_GRADIENTS.map((grad, idx) => (
                        <button
                          key={idx}
                          onClick={() => setRenameColorIndex(idx)}
                          style={{
                            background: grad,
                            aspectRatio: "1",
                            borderRadius: "50%",
                            border: "none",
                            cursor: "pointer",
                            boxShadow: renameColorIndex === idx ? "0 0 0 2px var(--surface), 0 0 0 4px var(--accent-red)" : "none",
                            transform: renameColorIndex === idx ? "scale(1.1)" : "scale(1)",
                            transition: "all 0.15s"
                          }}
                        />
                      ))}
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      saveCustomContact(renameTarget.id, renameValue.trim(), renameColorIndex);
                      setRenameTarget(null);
                    }}
                    className="lf-btn-primary"
                    style={{ width: "100%", padding: "12px 0", fontSize: 13, marginTop: "auto" }}
                  >
                    Save Changes
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 6. Sliding New Contact Panel */}
        <AnimatePresence mode="wait">
          {showNewContactPanel && (
            <motion.div
              key="new-contact-panel"
              initial={isMobile ? { y: "100%", opacity: 0 } : { x: 100, opacity: 0 }}
              animate={isMobile ? { y: 0, opacity: 1 } : { x: 0, opacity: 1 }}
              exit={isMobile ? { y: "100%", opacity: 0 } : { x: 100, opacity: 0 }}
              transition={{ type: "spring", stiffness: 380, damping: 32 }}
              style={{ background: "var(--surface)", overflowY: "auto", flexShrink: 0, width: isMobile ? "100%" : 320 }}
              className="fixed inset-x-0 bottom-0 z-50 h-[80vh] rounded-t-2xl shadow-[0_-8px_30px_rgba(0,0,0,0.12)] border-t border-l-0 border-r-0 border-[var(--border)] md:relative md:inset-auto md:h-auto md:rounded-none md:shadow-none md:border-t-0 md:border-l md:border-[var(--border)]"
            >
              <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid var(--border-soft)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <button onClick={() => setShowNewContactPanel(false)} className="lf-btn-ghost md:hidden" style={{ padding: 6, borderRadius: "50%", margin: "-6px 0 -6px -6px" }}>
                      <X style={{ width: 20, height: 20 }} />
                    </button>
                    <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: "var(--text-primary)" }}>New Contact</h3>
                  </div>
                  <button onClick={() => setShowNewContactPanel(false)} className="lf-btn-ghost hidden md:flex" style={{ padding: 6, borderRadius: "50%" }}>
                    <X style={{ width: 16, height: 16 }} />
                  </button>
                </div>

                <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 24, overflowY: "auto", flex: 1 }}>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: 8 }}>Wallet Address</label>
                    <input
                      type="text"
                      value={newContactAddress}
                      onChange={e => setNewContactAddress(e.target.value)}
                      className="lf-input"
                      placeholder="0x..."
                      style={{ width: "100%" }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: 8 }}>Contact Name</label>
                    <input
                      type="text"
                      value={newContactName}
                      onChange={e => setNewContactName(e.target.value)}
                      className="lf-input"
                      placeholder="Enter display name..."
                      style={{ width: "100%" }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: 8 }}>Profile Color</label>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10 }}>
                      {AVATAR_GRADIENTS.map((grad, idx) => (
                        <button
                          key={idx}
                          onClick={() => setNewContactColorIndex(idx)}
                          style={{
                            background: grad,
                            aspectRatio: "1",
                            borderRadius: "50%",
                            border: "none",
                            cursor: "pointer",
                            boxShadow: newContactColorIndex === idx ? "0 0 0 2px var(--surface), 0 0 0 4px var(--accent-red)" : "none",
                            transform: newContactColorIndex === idx ? "scale(1.1)" : "scale(1)",
                            transition: "all 0.15s"
                          }}
                        />
                      ))}
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      if (!newContactAddress.trim() || !newContactName.trim()) return;
                      saveCustomContact(newContactAddress.trim().toLowerCase(), newContactName.trim(), newContactColorIndex);
                      setShowNewContactPanel(false);
                      setNewContactAddress("");
                      setNewContactName("");
                      setNewContactColorIndex(0);
                      setActiveSubTab("contacts");
                    }}
                    className="lf-btn-primary"
                    style={{ width: "100%", padding: "12px 0", fontSize: 13, marginTop: "auto" }}
                    disabled={!newContactAddress.trim() || !newContactName.trim()}
                  >
                    Save Contact
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SIDEBAR COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
interface SidebarProps {
  activeSidebarSection: "chats" | "payments";
  setActiveSidebarSection: (s: "chats" | "payments") => void;
  activeCenterTab: "chat" | "payments";
  setActiveCenterTab: (t: "chat" | "payments") => void;
  activeSubTab: "all" | "pinned" | "archived" | "contacts";
  setActiveSubTab: (t: "all" | "pinned" | "archived" | "contacts") => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  searchResults: UserProfile | null;
  setSearchResults: (u: UserProfile | null) => void;
  isSearching: boolean;
  setIsSearching: (b: boolean) => void;
  customContacts: Record<string, { name?: string; colorIndex?: number }>;
  setRenameTarget: (t: { id: string; currentName: string; currentColor?: number } | null) => void;
  setRenameValue: (v: string) => void;
  setShowNewContactPanel: (b: boolean) => void;
  deleteCustomContact: (id: string) => void;
}

function Sidebar({
  activeSidebarSection,
  setActiveSidebarSection,
  activeCenterTab,
  setActiveCenterTab,
  activeSubTab,
  setActiveSubTab,
  searchQuery,
  setSearchQuery,
  searchResults,
  setSearchResults,
  isSearching,
  setIsSearching,
  customContacts,
  setRenameTarget,
  setRenameValue,
  setShowNewContactPanel,
  deleteCustomContact
}: SidebarProps) {
  const { isKeyboardOpen } = useVirtualKeyboard();
  const { address } = useAccount();
  const { chats, payments, searchUser, setActiveChatUser, togglePin, toggleArchive, toggleHide, deleteConversationHistory, isChatsLoading, hasLoadedChats } = useChat();
  const { signMessageAsync } = useSignMessage();
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; mode: "me" | "everyone" } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showSidebarSecurity, setShowSidebarSecurity] = useState(false);

  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const pendingTimeoutsRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [pendingDeletes, setPendingDeletes] = useState<Set<string>>(new Set());

  const triggerDelete = async (chatId: string) => {
    try {
      const message = `Confirm deleting chat with ${chatId} for all. Timestamp: ${Date.now()}`;
      await signMessageAsync({ message });

      // Mark as pending — hide from list immediately
      setPendingDeletes(prev => { const n = new Set(prev); n.add(chatId); return n; });
      setActiveChatUser(null);
      setOpenMenuId(null);

      // After 10s, execute the actual delete
      const t = setTimeout(async () => {
        try {
          await deleteConversationHistory(chatId, false);
          deleteCustomContact(chatId);
        } finally {
          setPendingDeletes(prev => { const n = new Set(prev); n.delete(chatId); return n; });
          delete pendingTimeoutsRef.current[chatId];
        }
      }, 10000);
      pendingTimeoutsRef.current[chatId] = t;

    } catch (err: any) {
      if (err.code !== 4001) alert("Unable to delete chat.");
    }
  };

  const undoDelete = (chatId: string) => {
    clearTimeout(pendingTimeoutsRef.current[chatId]);
    delete pendingTimeoutsRef.current[chatId];
    setPendingDeletes(prev => { const n = new Set(prev); n.delete(chatId); return n; });
  };

  // Close context menu on outside click — but only when no delete confirm is pending
  useEffect(() => {
    const handler = () => {
      if (!deleteTarget) setOpenMenuId(null);
    };
    if (openMenuId) document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [openMenuId, deleteTarget]);

  const handleSearchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const query = searchQuery.trim();
    if (!query) return;

    setIsSearching(true);
    let targetAddress = query;

    try {
      // 1. ENS Resolution Flow
      if (query.toLowerCase().endsWith(".eth")) {
        const resolved = await resolveEnsAddress(query);
        if (!resolved) {
          alert(`ENS name "${query}" not found or has no linked address.`);
          setIsSearching(false);
          return;
        }
        targetAddress = resolved;
      }

      // 2. Self-Messaging Block (using resolved target)
      if (address && targetAddress.toLowerCase() === address.toLowerCase()) {
        alert("You cannot message yourself.");
        setIsSearching(false);
        return;
      }

      // 3. User Lookup
      const res = await searchUser(targetAddress);
      setSearchResults(res);
    } catch (err) {
      console.error("Search failed:", err);
    } finally {
      setIsSearching(false);
    }
  };

  const paymentsUsers = useMemo(() => {
    if (!address) return [];
    const myAddr = address.toLowerCase();

    // ONLY include addresses that have at least one real payment record
    const uniqueAddrs = new Set<string>();
    payments.forEach(p => {
      if (!p) return;
      if (p.sender && typeof p.sender === 'string') {
        const s = p.sender.toLowerCase();
        if (s !== myAddr) uniqueAddrs.add(s);
      }
      if (p.receiver && typeof p.receiver === 'string') {
        const r = p.receiver.toLowerCase();
        if (r !== myAddr) uniqueAddrs.add(r);
      }
    });

    return Array.from(uniqueAddrs).map(pAddr => {
      const matchingChat = chats.find(c => c.userAddress && typeof c.userAddress === 'string' && c.userAddress.toLowerCase() === pAddr);
      if (matchingChat) return matchingChat;

      const localProfile = getGlobalProfile(pAddr);
      return {
        id: pAddr,
        userAddress: pAddr,
        lastMessageAt: 0,
        lastMessageBody: "",
        lastMessageIsMe: false,
        draftText: "",
        isPinned: false,
        isArchived: false,
        isHidden: false,
        unreadCount: 0,
        profile: localProfile || {
          address: pAddr,
          name: `ArcFun|User#${parseInt(pAddr.slice(2, 8), 16) % 9999 + 1}`,
          avatar: "slate",
          twitterId: "",
          twitterLink: "",
          telegramId: "",
          telegramLink: "",
        }
      } as Chat;
    });
  }, [chats, payments, address]);

  const filteredChats = useMemo(() => {
    if (activeSubTab === "contacts") return [];
    return chats.filter(c => {
      if (activeSubTab === "pinned") return c.isPinned && !c.isHidden;
      if (activeSubTab === "archived") return c.isArchived && !c.isHidden;
      // "all" tab: exclude archived AND hidden (soft-deleted) chats
      return !c.isArchived && !c.isHidden;
    });
  }, [chats, activeSubTab]);

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", position: "relative" }}>

      {/* Search Header */}
      <form onSubmit={handleSearchSubmit} style={{ padding: "12px 14px", borderBottom: "1px solid var(--border-soft)", display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ position: "relative", flex: 1 }}>
          <input
            type="text"
            placeholder="Search wallet or ENS..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              if (!e.target.value) setSearchResults(null);
            }}
            className="lf-input"
            style={{ width: "100%", paddingLeft: 16, paddingRight: 36, borderRadius: 20, height: 38 }}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => { setSearchQuery(""); setSearchResults(null); }}
              style={{ position: "absolute", right: 12, top: 12, background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)" }}
            >
              <X style={{ width: 14, height: 14 }} />
            </button>
          )}
        </div>

        <button
          type="submit"
          disabled={!searchQuery.trim() || isSearching}
          style={{
            width: 38,
            height: 38,
            borderRadius: "50%",
            background: searchQuery.trim() ? "linear-gradient(135deg, #a855f7 0%, #3b82f6 100%)" : "rgba(128, 128, 128, 0.15)",
            color: searchQuery.trim() ? "#ffffff" : "var(--text-muted)",
            border: "none",
            cursor: searchQuery.trim() ? "pointer" : "default",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: searchQuery.trim() ? "0 4px 12px rgba(168, 85, 247, 0.25)" : "none",
            transition: "all 0.2s ease",
            flexShrink: 0
          }}
          onMouseOver={(e) => { if (searchQuery.trim()) e.currentTarget.style.transform = "scale(1.05)"; }}
          onMouseOut={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
        >
          {isSearching ? (
            <RefreshCw size={16} style={{ animation: "spin 1s linear infinite" }} />
          ) : (
            <Search size={16} />
          )}
        </button>
      </form>

      {/* Tabs (Only in Chats section) */}
      {!searchResults && activeSidebarSection === "chats" && (
        <div style={{ display: "flex", gap: 2, padding: "2px 10px 8px 10px", overflowX: "auto" }}>
          {[
            { id: "all", label: "Chats" },
            { id: "pinned", label: "Pinned" },
            { id: "archived", label: "Archived" },
            { id: "contacts", label: "Contacts" }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id as any)}
              style={{
                padding: "6px 12px",
                borderRadius: 999,
                fontSize: 11,
                fontWeight: activeSubTab === tab.id ? 700 : 500,
                color: activeSubTab === tab.id ? "var(--text-primary)" : "var(--text-muted)",
                background: activeSubTab === tab.id ? "rgba(168, 85, 247, 0.1)" : "transparent",
                border: "none",
                cursor: "pointer",
                whiteSpace: "nowrap",
                transition: "all 0.2s ease"
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* Results / List */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {searchResults ? (
          <div style={{ padding: 12 }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8, paddingLeft: 6 }}>
              Search Result
            </p>
            <div
              onClick={() => {
                setActiveChatUser(searchResults);
                setActiveCenterTab(activeSidebarSection === "payments" ? "payments" : "chat");
                setSearchQuery("");
                setSearchResults(null);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 12px",
                borderRadius: 12,
                background: "var(--border-soft)",
                cursor: "pointer"
              }}
            >
              {searchResults.photoUrl ? (
                <img src={searchResults.photoUrl} alt="" style={{ width: 38, height: 38, borderRadius: "50%", objectFit: "cover" }} />
              ) : (
                <div style={{ background: getGradientForAddress(searchResults.address, customContacts[searchResults.address.toLowerCase()]?.colorIndex), width: 38, height: 38, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <User style={{ width: 20, height: 20, color: "#fff" }} />
                </div>
              )}
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>{searchResults.name}</div>
                <div style={{ fontSize: 10, color: "var(--text-muted)", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                  {searchResults.address}
                </div>
              </div>
              <ChevronRight style={{ width: 14, height: 14, color: "var(--text-muted)" }} />
            </div>
          </div>
        ) : isSearching ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: 30, color: "var(--text-muted)" }}>
            <span className="animate-spin" style={{ fontSize: 20, marginBottom: 8 }}>🌀</span>
            <span style={{ fontSize: 12 }}>Searching on-chain profiles...</span>
          </div>
        ) : activeSidebarSection === "payments" ? (
          // Payments Ledger Users list
          paymentsUsers.length === 0 ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "40px 20px", color: "var(--text-muted)", textAlign: "center" }}>
              <Clock style={{ width: 32, height: 32, opacity: 0.3, marginBottom: 8 }} />
              <span style={{ fontSize: 12 }}>No transacted users found.</span>
            </div>
          ) : (
            paymentsUsers.map(c => {
              const initials = c.profile?.name ? c.profile.name.substring(0, 2).toUpperCase() : "??";

              // Compute volume for this user
              const myAddr = address?.toLowerCase() || "";
              const userAddr = c.userAddress.toLowerCase();
              const userPayments = payments.filter(p =>
                p &&
                !p.isRecurring &&
                p.status === "confirmed" &&
                p.sender && p.receiver &&
                ((p.sender.toLowerCase() === myAddr && p.receiver.toLowerCase() === userAddr) ||
                  (p.sender.toLowerCase() === userAddr && p.receiver.toLowerCase() === myAddr))
              );
              const totalVol = userPayments.reduce((acc, p) => acc + Number(p.amount), 0);
              const totalVolVal = totalVol.toFixed(2);

              return (
                <div
                  key={c.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "12px 14px",
                    cursor: "pointer",
                    borderBottom: "1px solid var(--border-soft)",
                    background: "transparent",
                    transition: "background 0.2s"
                  }}
                  className="hover:bg-[var(--border-soft)]"
                  onClick={() => {
                    setActiveChatUser(c.profile || null);
                    setActiveCenterTab("payments");
                  }}
                >
                  {/* Avatar */}
                  {c.profile?.photoUrl ? (
                    <img src={c.profile.photoUrl} alt="" style={{ width: 44, height: 44, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
                  ) : (
                    <div style={{ background: getGradientForAddress(c.userAddress, customContacts[c.userAddress.toLowerCase()]?.colorIndex), width: 44, height: 44, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <User style={{ width: 22, height: 22, color: "#fff" }} />
                    </div>
                  )}

                  {/* Text */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h4 style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", margin: 0, textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                      {customContacts[c.userAddress.toLowerCase()]?.name || c.profile?.name || `Wallet ${c.userAddress.substring(0, 6)}`}
                    </h4>
                    <p style={{ fontSize: 11, color: "var(--accent-red)", fontWeight: 700, margin: "4px 0 0 0", display: "flex", alignItems: "center", gap: 4 }}>
                      Volume: {totalVolVal} <UsdcLogo size={11} />
                    </p>
                  </div>

                  <ChevronRight style={{ width: 14, height: 14, color: "var(--text-muted)" }} />
                </div>
              );
            })
          )
        ) : activeSubTab === "contacts" ? (
          (!hasLoadedChats || isChatsLoading) && Object.keys(customContacts).length === 0 ? (
            <ContactsSkeleton />
          ) : Object.keys(customContacts).length === 0 ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "40px 20px", color: "var(--text-muted)", textAlign: "center" }}>
              <User style={{ width: 32, height: 32, opacity: 0.3, marginBottom: 8 }} />
              <span style={{ fontSize: 12 }}>No saved contacts yet.</span>
            </div>
          ) : (
            Object.entries(customContacts).map(([addr, contact]) => (
              <div
                key={addr}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 14px",
                  cursor: "pointer",
                  borderBottom: "1px solid var(--border-soft)",
                  background: "transparent",
                  transition: "background 0.2s",
                  position: "relative"
                }}
                className="group hover:bg-[var(--border-soft)]"
                onClick={() => {
                  const existingProfile = getGlobalProfile(addr);
                  setActiveChatUser(existingProfile || {
                    address: addr,
                    name: contact.name || `Wallet ${addr.substring(0, 6)}`,
                    avatar: "slate",
                    twitterId: "",
                    twitterLink: "",
                    telegramId: "",
                    telegramLink: "",
                  });
                  setActiveCenterTab("chat");
                }}
              >
                <div style={{ position: "relative", flexShrink: 0 }}>
                  {getGlobalProfile(addr)?.photoUrl ? (
                    <img src={getGlobalProfile(addr)!.photoUrl} alt="" style={{ width: 44, height: 44, borderRadius: "50%", objectFit: "cover" }} />
                  ) : (
                    <div style={{ background: getGradientForAddress(addr, contact.colorIndex), width: 44, height: 44, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <User style={{ width: 22, height: 22, color: "#fff" }} />
                    </div>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h4 style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", margin: 0, textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                    {contact.name || `Wallet ${addr.substring(0, 6)}`}
                  </h4>
                  <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "2px 0 0 0", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap", fontFamily: "monospace" }}>
                    {addr.substring(0, 6)}...{addr.substring(38)}
                  </p>
                </div>

                {/* 3-dot menu */}
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                  <div style={{ position: "relative" }}>
                    <button
                      onClick={e => { e.stopPropagation(); setOpenMenuId(openMenuId === addr ? null : addr); }}
                      style={{ background: "none", border: "none", cursor: "pointer", padding: "4px 2px", borderRadius: 6, color: "var(--text-muted)", display: "flex", alignItems: "center" }}
                    >
                      <MoreVertical style={{ width: 14, height: 14 }} />
                    </button>

                    {/* Dropdown Menu */}
                    {openMenuId === addr && (
                      <div
                        style={{ position: "absolute", right: 0, top: 24, zIndex: 100, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,0.15)", minWidth: 160, overflow: "hidden" }}
                      >
                        {[
                          { label: "Delete Contact", icon: Trash, action: (e: any) => { e.stopPropagation(); deleteCustomContact(addr); setOpenMenuId(null); }, danger: true },
                        ].map(item => (
                          <button
                            key={item.label}
                            onClick={item.action}
                            style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "9px 14px", background: "none", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 500, color: item.danger ? "#ef4444" : "var(--text-primary)", textAlign: "left", transition: "background 0.15s" }}
                            className="hover:bg-[var(--bg)]"
                          >
                            <item.icon style={{ width: 13, height: 13, flexShrink: 0 }} />
                            {item.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

              </div>
            ))
          )
        ) : (!hasLoadedChats || isChatsLoading) ? (
          <ChatListSkeleton />
        ) : filteredChats.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "40px 20px", color: "var(--text-muted)", textAlign: "center" }}>
            <MessageSquare style={{ width: 32, height: 32, opacity: 0.3, marginBottom: 8 }} />
            <span style={{ fontSize: 12 }}>No chats in this section.</span>
          </div>
        ) : (
          filteredChats.map(c => {
            if (pendingDeletes.has(c.userAddress)) {
              return null; // hide from list completely
            }

            let lastMsgText: string;
            if (c.draftText) {
              lastMsgText = `[Draft] ${c.draftText}`;
            } else if (
              c.lastMessageBody !== undefined &&
              c.lastMessageBody !== null &&
              c.lastMessageBody !== "" &&
              !c.lastMessageBody.startsWith("Scheduled Autopay:") &&
              !c.lastMessageBody.startsWith("Autopay Schedule Created:")
            ) {
              const prefix = c.lastMessageIsMe ? "You: " : "";
              lastMsgText = prefix + c.lastMessageBody;
            } else if (c.lastMessageAt && (!c.lastMessageBody || (!c.lastMessageBody.startsWith("Scheduled Autopay:") && !c.lastMessageBody.startsWith("Autopay Schedule Created:")))) {
              const prefix = c.lastMessageIsMe ? "You: " : "";
              lastMsgText = prefix + "Sent an attachment";
            } else {
              lastMsgText = "No messages yet";
            }

            return (
              <div
                key={c.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 14px",
                  cursor: "pointer",
                  borderBottom: "1px solid var(--border-soft)",
                  background: c.unreadCount > 0 ? "rgba(239,68,68,0.04)" : "transparent",
                  transition: "background 0.2s",
                  position: "relative"
                }}
                className="group hover:bg-[var(--border-soft)]"
                onClick={() => {
                  setActiveChatUser(c.profile || null);
                  setActiveCenterTab("chat");
                }}
              >
                {/* Avatar */}
                <div style={{ position: "relative", flexShrink: 0 }}>
                  {c.profile?.photoUrl ? (
                    <img src={c.profile.photoUrl} alt="" style={{ width: 44, height: 44, borderRadius: "50%", objectFit: "cover" }} />
                  ) : (
                    <div style={{ background: getGradientForAddress(c.userAddress, customContacts[c.userAddress.toLowerCase()]?.colorIndex), width: 44, height: 44, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <User style={{ width: 22, height: 22, color: "#fff" }} />
                    </div>
                  )}
                  {c.isPinned && (
                    <div style={{ position: "absolute", bottom: -2, right: -2, background: "var(--accent-red)", borderRadius: "50%", padding: 3, border: "2px solid var(--surface)" }}>
                      <Pin style={{ width: 8, height: 8, color: "#fff" }} />
                    </div>
                  )}
                </div>

                {/* Text */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <h4 style={{ fontSize: 13, fontWeight: c.unreadCount > 0 ? 800 : 700, color: "var(--text-primary)", margin: 0, textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                      {customContacts[c.userAddress.toLowerCase()]?.name || c.profile?.name || `Wallet ${c.userAddress.substring(0, 6)}`}
                    </h4>
                    <span style={{ fontSize: 9, color: c.unreadCount > 0 ? "#ef4444" : "var(--text-muted)", fontWeight: c.unreadCount > 0 ? 700 : 400, flexShrink: 0, marginLeft: 4 }}>
                      {c.lastMessageAt ? new Date(c.lastMessageAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ""}
                    </span>
                  </div>
                  <p style={{ fontSize: 11.5, color: c.draftText ? "var(--accent-red)" : c.unreadCount > 0 ? "var(--text-primary)" : "var(--text-muted)", margin: "2px 0 0 0", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap", fontWeight: c.unreadCount > 0 ? 600 : 400 }}>
                    {lastMsgText}
                  </p>
                </div>

                {/* Right side: unread badge OR 3-dot menu */}
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                  {c.unreadCount > 0 && openMenuId !== c.id && (
                    <div style={{ background: "#ef4444", color: "#fff", fontSize: 10, fontWeight: 800, borderRadius: 10, minWidth: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 5px", boxShadow: "0 2px 6px rgba(239,68,68,0.4)" }}>
                      {c.unreadCount > 99 ? "99+" : c.unreadCount}
                    </div>
                  )}

                  {/* 3-dot menu button — always visible */}
                  <div style={{ position: "relative" }}>
                    <button
                      onClick={e => { e.stopPropagation(); setOpenMenuId(openMenuId === c.id ? null : c.id); }}
                      style={{ background: "none", border: "none", cursor: "pointer", padding: "4px 2px", borderRadius: 6, color: "var(--text-muted)", display: "flex", alignItems: "center" }}
                    >
                      <MoreVertical style={{ width: 14, height: 14 }} />
                    </button>

                    {/* Dropdown Menu */}
                    {openMenuId === c.id && (
                      <div
                        style={{ position: "absolute", right: 0, top: 24, zIndex: 100, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,0.15)", minWidth: 160, overflow: "hidden" }}
                      >
                        {[
                          { label: "Edit Contact", icon: Edit3, action: () => { const nm = customContacts[c.userAddress.toLowerCase()]?.name || c.profile?.name || ""; setRenameTarget({ id: c.userAddress.toLowerCase(), currentName: nm, currentColor: customContacts[c.userAddress.toLowerCase()]?.colorIndex }); setRenameValue(nm); setOpenMenuId(null); } },
                          { label: c.isPinned ? "Unpin" : "Pin", icon: Pin, action: () => { togglePin(c.userAddress); setOpenMenuId(null); } },
                          { label: c.isArchived ? "Unarchive" : "Archive", icon: Archive, action: () => { toggleArchive(c.userAddress); setOpenMenuId(null); } },
                          { label: "Delete for Me", icon: Trash, action: (e: any) => { e.stopPropagation(); triggerDelete(c.userAddress); }, danger: true },
                        ].map(item => (
                          <button
                            key={item.label}
                            onClick={item.action}
                            style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "9px 14px", background: "none", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 500, color: (item as { danger?: boolean }).danger ? "#ef4444" : "var(--text-primary)", textAlign: "left", transition: "background 0.15s" }}
                            className="hover:bg-[var(--bg)]"
                          >
                            <item.icon style={{ width: 13, height: 13, flexShrink: 0 }} />
                            {item.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>




      {/* Floating Undo Toasts */}
      <div style={{ position: "absolute", bottom: 16, left: 16, right: 16, display: "flex", flexDirection: "column", gap: 8, zIndex: 50, pointerEvents: "none" }}>
        <AnimatePresence>
          {Array.from(pendingDeletes).map(id => {
            const name = customContacts[id]?.name || (getGlobalProfile(id)?.name) || "Chat";
            return (
              <DeleteToast key={id} name={name} onUndo={() => undoDelete(id)} />
            );
          })}
        </AnimatePresence>
      </div>

      {/* Floating Action Button — New Contact */}
      {activeSidebarSection === "chats" && !searchResults && !isSearching && (
        <button
          onClick={() => setShowNewContactPanel(true)}
          style={{
            position: "absolute",
            bottom: 50,
            right: 20,
            width: 48,
            height: 48,
            borderRadius: "50%",
            background: "var(--text-primary)",
            color: "var(--surface)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 4px 18px rgba(0,0,0,0.25)",
            border: "none",
            cursor: "pointer",
            zIndex: 30,
            transition: "transform 0.15s, box-shadow 0.15s"
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.transform = "scale(1.1)"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)"; }}
          title="New Contact"
        >
          <Edit3 style={{ width: 20, height: 20 }} />
        </button>
      )}

      {/* Security Footer */}
      {!isKeyboardOpen && (
        <div style={{
          padding: "10px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          borderTop: "1px solid var(--border-soft)",
          background: "var(--surface)",
          color: "var(--text-muted)",
          opacity: 0.6,
          zIndex: 10
        }}>
          <Unlock style={{ width: 12, height: 12 }} />
          <span style={{ fontSize: 10, fontWeight: 500 }}>Messages are unencrypted</span>
          <button
            onClick={() => setShowSidebarSecurity(true)}
            className="hover:text-[var(--text-primary)] transition-colors"
            style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", padding: 2 }}
          >
            <Info style={{ width: 13, height: 13 }} />
          </button>
        </div>
      )}

      {/* SECURITY TOOLTIP POPUP (SIDEBAR) */}
      {isMobile && typeof document !== 'undefined' ? createPortal(
        <AnimatePresence>
          {showSidebarSecurity && (
            <>
              <motion.div
                key="sidebar-sec-backdrop-mobile"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onClick={() => setShowSidebarSecurity(false)}
                style={{ position: "fixed", inset: 0, zIndex: 999998 }}
              />
              <motion.div
                key="sidebar-sec-popup-mobile"
                initial={{ scale: 0.95, opacity: 0, x: "-50%", y: 10 }} animate={{ scale: 1, opacity: 1, x: "-50%", y: 0 }} exit={{ scale: 0.95, opacity: 0, x: "-50%", y: 10 }}
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
                style={{
                  position: "fixed", bottom: 125, left: "50%",
                  width: "85%", maxWidth: 260, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: "20px", zIndex: 999999, boxShadow: "0 20px 40px rgba(0,0,0,0.4)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Unlock style={{ width: 16, height: 16, color: "var(--text-primary)" }} />
                    <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", margin: 0, letterSpacing: "-0.01em" }}>Message Security</h3>
                  </div>
                  <button onClick={() => setShowSidebarSecurity(false)} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "var(--text-muted)", borderRadius: "50%", display: "flex", margin: "-4px -4px -4px 0" }}>
                    <X style={{ width: 16, height: 16 }} />
                  </button>
                </div>
                <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5, margin: 0, textAlign: "left" }}>
                  <strong style={{ color: "var(--text-primary)" }}>Note:</strong> Please do not share sensitive information, such as private keys, in this chat. Messages on ArcFun are not currently end-to-end encrypted (E2EE).
                </p>
              </motion.div>
            </>
          )}
        </AnimatePresence>,
        document.body
      ) : (
        <AnimatePresence>
          {showSidebarSecurity && (
            <>
              <motion.div
                key="sidebar-sec-backdrop-desktop"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onClick={() => setShowSidebarSecurity(false)}
                style={{ position: "absolute", inset: 0, zIndex: 60, borderRadius: "inherit" }}
              />
              <motion.div
                key="sidebar-sec-popup-desktop"
                initial={{ scale: 0.95, opacity: 0, y: 10, x: "-50%" }} animate={{ scale: 1, opacity: 1, y: 0, x: "-50%" }} exit={{ scale: 0.95, opacity: 0, y: 10, x: "-50%" }}
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
                style={{
                  position: "absolute", bottom: 44, left: "50%", transformOrigin: "bottom center",
                  width: "90%", maxWidth: 300, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: "20px 24px", zIndex: 61, boxShadow: "0 20px 40px rgba(0,0,0,0.4)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Unlock style={{ width: 16, height: 16, color: "var(--text-primary)" }} />
                    <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", margin: 0, letterSpacing: "-0.01em" }}>Message Security</h3>
                  </div>
                  <button onClick={() => setShowSidebarSecurity(false)} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "var(--text-muted)", borderRadius: "50%", display: "flex", margin: "-4px -4px -4px 0" }}>
                    <X style={{ width: 16, height: 16 }} />
                  </button>
                </div>
                <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5, margin: 0, textAlign: "left" }}>
                  <strong style={{ color: "var(--text-primary)" }}>Note:</strong> Please do not share sensitive information, such as private keys, in this chat. Messages on ArcFun are not currently end-to-end encrypted (E2EE).
                </p>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      )}

    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CHAT WINDOW COMPONENT (CENTER)
// ─────────────────────────────────────────────────────────────────────────────
interface ChatWindowProps {
  onToggleProfile: () => void;
  onOpenPay: () => void;
  onOpenAutopaySetup?: () => void;
  onOpenAutopayDashboard?: () => void;
  onOpenEdit: () => void;
  activeCenterTab: "chat" | "payments";
  setActiveCenterTab: (t: "chat" | "payments") => void;
  payFilter?: "all" | "sent" | "received" | "scheduled";
  setPayFilter?: (filter: "all" | "sent" | "received" | "scheduled") => void;
  customContacts: Record<string, { name?: string; colorIndex?: number }>;
  setRenameTarget: (t: { id: string; currentName: string; currentColor?: number } | null) => void;
  setRenameValue: (v: string) => void;
  setRenameColorIndex: (idx: number | undefined) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// HIGH-RELIABILITY SHIMMER LAYOUT SKELETON FOR TRANSACTION HISTORY
// ─────────────────────────────────────────────────────────────────────────────
export function PaymentHistorySkeleton({ count = 3 }: { count?: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%", padding: "4px 0" }}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="arc-skeleton-shimmer"
          style={{
            borderRadius: 12,
            border: "1px solid var(--border)",
            padding: "12px 14px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            minHeight: 62
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flex: 1 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: "50%",
                background: "var(--border-soft)",
                flexShrink: 0
              }}
            />
            <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0, flex: 1 }}>
              <div style={{ width: 70, height: 13, borderRadius: 4, background: "var(--border-soft)" }} />
              <div style={{ width: 140, height: 10, borderRadius: 4, background: "var(--border-soft)" }} />
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
            <div style={{ width: 56, height: 14, borderRadius: 4, background: "var(--border-soft)" }} />
            <div style={{ width: 50, height: 10, borderRadius: 4, background: "var(--border-soft)" }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AUTOPAY CHAT CARD WITH REALTIME 1S COUNTDOWN & INLINE CANCEL
// ─────────────────────────────────────────────────────────────────────────────

function parsePaymentFromBody(body?: string, paymentId?: string, msgCreatedAt?: number): Payment | null {
  if (!body) return null;

  let isCancelledAlready = false;
  if (typeof window !== 'undefined' && paymentId) {
    try {
      const cancelledList = JSON.parse(localStorage.getItem('arc_cancelled_autopay_ids') || '[]');
      if (Array.isArray(cancelledList) && cancelledList.includes(paymentId)) {
        isCancelledAlready = true;
      }
    } catch { }
  }

  // Pattern 1: e.g. "Sent 10 USDC via Autopay" or "Sent 1 USDC", "Sent 4.9995 USDC-1439"
  const sentMatch = body.match(/^Sent\s+([0-9.]+)\s+([A-Za-z0-9-_]+)/i);
  if (sentMatch) {
    const isAutopay = body.toLowerCase().includes('autopay');
    return {
      id: paymentId || '',
      sender: '',
      receiver: '',
      amount: parseFloat(sentMatch[1]),
      token: sentMatch[2],
      isRecurring: isAutopay,
      status: 'confirmed',
      active: true,
      createdAt: msgCreatedAt || Date.now()
    };
  }

  // Pattern 2: e.g. "Scheduled Autopay: 1 USDC (DAILY)" or "Scheduled Autopay: 1 USDC (WEEKLY)"
  const autopayMatch = body.match(/^Scheduled\s+Autopay:\s+([0-9.]+)\s+([A-Za-z0-9-_]+)\s*\(([A-Za-z]+)\)/i);
  if (autopayMatch) {
    return {
      id: paymentId || '',
      sender: '',
      receiver: '',
      amount: parseFloat(autopayMatch[1]),
      token: autopayMatch[2],
      isRecurring: true,
      recurringInterval: autopayMatch[3].toLowerCase() as any,
      status: isCancelledAlready ? 'cancelled' : 'pending',
      active: !isCancelledAlready,
      createdAt: msgCreatedAt || Date.now()
    };
  }

  // Pattern 3: e.g. "Autopay Schedule Created: 1 USDC / daily"
  const autopayMatch2 = body.match(/^Autopay\s+Schedule\s+Created:\s+([0-9.]+)\s+([A-Za-z0-9-_]+)\s*\/\s*([A-Za-z]+)/i);
  if (autopayMatch2) {
    return {
      id: paymentId || '',
      sender: '',
      receiver: '',
      amount: parseFloat(autopayMatch2[1]),
      token: autopayMatch2[2],
      isRecurring: true,
      recurringInterval: autopayMatch2[3].toLowerCase() as any,
      status: isCancelledAlready ? 'cancelled' : 'pending',
      active: !isCancelledAlready,
      createdAt: msgCreatedAt || Date.now()
    };
  }

  return null;
}

function formatAutopayCountdown(diffMs: number): string {
  if (diffMs <= 0) {
    return "Processing...";
  }

  const totalSecs = Math.floor(diffMs / 1000);
  const d = Math.floor(totalSecs / 86400);
  const h = Math.floor((totalSecs % 86400) / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;

  // Single line format matching user requirement: purely numbers separated by |
  if (d === 0 && h === 0 && m === 0) {
    return `${s}`;
  }

  const parts: string[] = [];
  if (d > 0) {
    parts.push(`${d}`);
  }
  if (h > 0) {
    parts.push(`${h}`);
  }
  if (m > 0 || (d === 0 && h === 0)) {
    parts.push(`${m}`);
  }
  parts.push(`${String(s).padStart(2, '0')}`);

  return parts.join(' | ');
}

function AutopayChatCountdown({
  targetTime,
  isExecuting,
  isConfirmed
}: {
  targetTime?: number | null;
  isExecuting?: boolean;
  isConfirmed?: boolean;
}) {
  const [displayText, setDisplayText] = useState<string>(() => {
    if (!targetTime) return 'Active schedule';
    return formatAutopayCountdown(targetTime - Date.now());
  });

  useEffect(() => {
    if (!targetTime) {
      setDisplayText('Active schedule');
      return;
    }

    const update = () => {
      const diff = targetTime - Date.now();
      setDisplayText(formatAutopayCountdown(diff));
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [targetTime]);

  if (!targetTime) {
    return <span style={{ color: "var(--text-muted)", fontSize: 11.5 }}>Active schedule</span>;
  }

  const isDue = targetTime - Date.now() <= 0;

  if (isDue) {
    if (isConfirmed && !isExecuting) {
      return (
        <span
          style={{
            color: "#10b981",
            fontWeight: 600,
            fontSize: 11.5
          }}
        >
          Payment confirmed
        </span>
      );
    }
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          color: "var(--text-muted)",
          fontWeight: 600,
          fontSize: 11.5
        }}
      >
        <Loader2 style={{ width: 11, height: 11, animation: "spin 1s linear infinite" }} />
        Processing...
      </span>
    );
  }

  return (
    <span
      style={{
        color: "var(--text-primary)",
        fontWeight: 600,
        fontFamily: "monospace",
        fontSize: 11.5,
        letterSpacing: "0.02em"
      }}
    >
      {displayText}
    </span>
  );
}

function AutopayChatCard({
  payment,
  isMe,
  onCancel,
  isCancelling
}: {
  payment: Payment;
  isMe: boolean;
  onCancel: (id: string) => Promise<void>;
  isCancelling: boolean;
}) {
  const [showConfirmCancel, setShowConfirmCancel] = useState(false);
  const [localCancelled, setLocalCancelled] = useState(false);

  // Dynamic backend verified state
  const [realNextPaymentAt, setRealNextPaymentAt] = useState<number | null>(() => {
    if (payment.nextPaymentAt) {
      return typeof payment.nextPaymentAt === 'number'
        ? payment.nextPaymentAt
        : new Date(payment.nextPaymentAt).getTime();
    }
    return null;
  });
  const [latestTxHash, setLatestTxHash] = useState<string | null>(payment.txHash || null);
  const [scheduleStatus, setScheduleStatus] = useState<string>(payment.status || 'pending');
  const [isExecuting, setIsExecuting] = useState(false);

  const isExhausted =
    scheduleStatus === 'exhausted' ||
    scheduleStatus === 'completed' ||
    (!payment.active && (payment.status === 'confirmed' || scheduleStatus === 'confirmed'));

  const isExplicitlyCancelled =
    localCancelled ||
    scheduleStatus === 'cancelled' ||
    payment.status === 'cancelled';

  const isScheduleEnded = isExhausted || isExplicitlyCancelled || !payment.active;
  const isCancelled = isScheduleEnded;

  const effectiveNextPaymentAt = realNextPaymentAt;
  const isReady = effectiveNextPaymentAt ? effectiveNextPaymentAt <= Date.now() : false;
  const isConfirmed = Boolean(latestTxHash || scheduleStatus === 'confirmed' || scheduleStatus === 'exhausted');

  // 1. Fetch real verified schedule data from backend and listen for realtime updates
  useEffect(() => {
    if (!payment.id) return;

    let isMounted = true;

    const fetchDetails = async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData?.session?.access_token;
        const res = await fetch(`/api/autopay/details?id=${payment.id}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
        if (res.ok) {
          const data = await res.json();
          if (!isMounted) return;

          if (data.schedule) {
            setRealNextPaymentAt(data.schedule.next_execution_at ? Number(data.schedule.next_execution_at) : null);
            if (data.schedule.status) {
              setScheduleStatus(data.schedule.status.toLowerCase());
            }
          }
          if (data.latestExecution?.blockchain_tx_hash) {
            setLatestTxHash(data.latestExecution.blockchain_tx_hash);
          }
          if (data.latestExecution?.status === 'SUBMITTING' || data.latestExecution?.status === 'PENDING') {
            setIsExecuting(true);
          } else if (data.latestExecution?.status === 'CONFIRMED') {
            setIsExecuting(false);
          }
        }
      } catch (e) {
        console.warn('[AutopayChatCard] Failed to fetch schedule details:', e);
      }
    };

    fetchDetails();

    // Setup Supabase Realtime subscriptions for immediate push updates
    const channel = supabase
      .channel(`autopay_card_${payment.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'autopay_schedules', filter: `id=eq.${payment.id}` },
        (payload: any) => {
          const row = payload.new;
          if (row && isMounted) {
            setRealNextPaymentAt(row.next_execution_at ? Number(row.next_execution_at) : null);
            if (row.status) {
              setScheduleStatus(row.status.toLowerCase());
            }
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'autopay_executions', filter: `schedule_id=eq.${payment.id}` },
        (payload: any) => {
          const row = payload.new;
          if (row && isMounted) {
            if (row.blockchain_tx_hash) {
              setLatestTxHash(row.blockchain_tx_hash);
            }
            if (row.status === 'CONFIRMED') {
              setIsExecuting(false);
            } else if (row.status === 'PENDING' || row.status === 'SUBMITTING') {
              setIsExecuting(true);
            }
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'payments', filter: `id=eq.${payment.id}` },
        (payload: any) => {
          const row = payload.new;
          if (row && isMounted) {
            if (row.tx_hash) {
              setLatestTxHash(row.tx_hash);
            }
            setRealNextPaymentAt(
              row.next_payment_at
                ? (typeof row.next_payment_at === 'number'
                  ? row.next_payment_at
                  : new Date(row.next_payment_at).getTime())
                : null
            );
            if (row.status) {
              setScheduleStatus(row.status.toLowerCase());
            }
          }
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, [payment.id]);

  // 2. Background trigger & active polling when payment schedule is ready / countdown reaches 0
  useEffect(() => {
    if (!isReady || isCancelled || !payment.id) return;

    let pollInterval: NodeJS.Timeout | null = null;
    let pollCount = 0;
    const maxPolls = 20; // Up to 60s polling

    const triggerAndPoll = async () => {
      setIsExecuting(true);
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData?.session?.access_token;
        if (token) {
          await fetch('/api/autopay/trigger-due', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`
            }
          });
        }
      } catch (err) {
        console.warn('[AutopayChatCard] Trigger due error:', err);
      }

      // Start rapid polling for live transaction hash confirmation
      pollInterval = setInterval(async () => {
        pollCount++;
        try {
          const res = await fetch(`/api/autopay/details?id=${payment.id}`);
          if (res.ok) {
            const data = await res.json();
            if (data.latestExecution?.blockchain_tx_hash) {
              setLatestTxHash(data.latestExecution.blockchain_tx_hash);
              if (data.latestExecution.status === 'CONFIRMED') {
                setIsExecuting(false);
                setRealNextPaymentAt(data.schedule?.next_execution_at ? Number(data.schedule.next_execution_at) : null);
                if (data.schedule?.status) {
                  setScheduleStatus(data.schedule.status.toLowerCase());
                }
                if (pollInterval) clearInterval(pollInterval);
                return;
              }
            }
            if (data.schedule?.next_execution_at) {
              setRealNextPaymentAt(Number(data.schedule.next_execution_at));
            } else if (data.schedule?.next_execution_at === null) {
              setRealNextPaymentAt(null);
            }
            if (data.schedule?.status) {
              setScheduleStatus(data.schedule.status.toLowerCase());
            }
          }
        } catch { }

        if (pollCount >= maxPolls && pollInterval) {
          clearInterval(pollInterval);
          setIsExecuting(false);
        }
      }, 3000);
    };

    triggerAndPoll();

    return () => {
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [isReady, isCancelled, payment.id]);

  const intervalLabel = payment.recurringInterval
    ? payment.recurringInterval.charAt(0).toUpperCase() + payment.recurringInterval.slice(1).toLowerCase()
    : 'Weekly';

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      gap: 12,
      minWidth: 260,
      padding: "8px 6px"
    }}>
      {/* Top Header & Details */}
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{
          position: "relative",
          width: 44,
          height: 44,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0
        }}>
          {payment.token?.startsWith('EURC') ? <EurcLogo size={44} /> : <UsdcLogo size={44} />}
          <img
            src="/arc-logo.png"
            alt="Arc Testnet"
            style={{
              position: "absolute",
              bottom: -4,
              right: -4,
              width: 18,
              height: 18,
              borderRadius: "50%",
              border: "2px solid var(--background)",
              objectFit: "cover"
            }}
          />
        </div>
        <div>
          <div style={{ fontSize: 24, fontWeight: 800, color: "var(--text-primary)", lineHeight: 1.2 }}>
            {payment.amount} {payment.token?.startsWith("EURC") ? "EURC" : "USDC"}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 500, marginTop: 2 }}>
            <div>Recurring Payment • {intervalLabel}</div>
            <div style={{ marginTop: 2 }}>
              Network: <span style={{ color: "var(--text-primary)" }}>Arc Testnet</span>
            </div>
            {!isCancelled && effectiveNextPaymentAt && (
              <div style={{ marginTop: 2, display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
                <span>Next payment:</span>
                <AutopayChatCountdown
                  targetTime={effectiveNextPaymentAt}
                  isExecuting={isExecuting}
                  isConfirmed={isConfirmed}
                />
              </div>
            )}
            {latestTxHash && (
              <div style={{ marginTop: 2, display: "flex", alignItems: "center", gap: 5 }}>
                <span>Last Tx:</span>
                <a
                  href={`https://testnet.arcscan.app/tx/${latestTxHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    color: "var(--accent-red)",
                    fontFamily: "monospace",
                    fontSize: 11,
                    fontWeight: 600,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 3,
                    textDecoration: "underline"
                  }}
                  title={latestTxHash}
                >
                  {latestTxHash.slice(0, 6)}...{latestTxHash.slice(-4)}
                  <ExternalLink style={{ width: 10, height: 10 }} />
                </a>
              </div>
            )}
          </div>
        </div>
      </div>

      {payment.description && (
        <div style={{
          fontSize: 12.5,
          color: "#1e3a8a",
          fontWeight: 700,
          marginTop: 4,
          letterSpacing: "0.01em"
        }}>
          "{payment.description}"
        </div>
      )}

      {/* Bottom Separator & Actions */}
      <div style={{
        borderTop: "1px solid var(--border-soft)",
        paddingTop: 12,
        marginTop: 4,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        fontSize: 12,
        flexWrap: "wrap",
        gap: 8
      }}>
        {/* Status */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--text-primary)" }}>
          {isExplicitlyCancelled ? (
            <div style={{ width: 18, height: 18, borderRadius: "50%", background: "var(--border-soft)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <X style={{ width: 11, height: 11, color: "var(--text-muted)", strokeWidth: 2.5 }} />
            </div>
          ) : isExhausted ? (
            <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#22c55e", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Check style={{ width: 12, height: 12, color: "#fff", strokeWidth: 3 }} />
            </div>
          ) : (
            <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#22c55e", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Check style={{ width: 12, height: 12, color: "#fff", strokeWidth: 3 }} />
            </div>
          )}
          <span>Status: <strong style={{ color: isExplicitlyCancelled ? "var(--text-muted)" : "#22c55e" }}>
            {isExplicitlyCancelled ? "Cancelled" : isExhausted ? "Completed" : "Active"}
          </strong></span>
        </div>

        {/* Cancel Action */}
        {!isScheduleEnded && isMe && (
          <div>
            {!showConfirmCancel ? (
              <button
                type="button"
                onClick={() => setShowConfirmCancel(true)}
                disabled={isCancelling}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--text-muted)",
                  fontSize: 11,
                  fontWeight: 500,
                  cursor: isCancelling ? "default" : "pointer",
                  textDecoration: "underline",
                  padding: "2px 4px",
                  transition: "color 0.15s ease"
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "var(--danger)")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
              >
                {isCancelling ? "Cancelling..." : "Cancel Autopay"}
              </button>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
                <span style={{ color: "var(--text-muted)" }}>Cancel schedule?</span>
                <button
                  type="button"
                  onClick={async () => {
                    setLocalCancelled(true);
                    setShowConfirmCancel(false);
                    if (typeof window !== 'undefined' && payment.id) {
                      try {
                        const cur = JSON.parse(localStorage.getItem('arc_cancelled_autopay_ids') || '[]');
                        if (!cur.includes(payment.id)) {
                          localStorage.setItem('arc_cancelled_autopay_ids', JSON.stringify([...cur, payment.id]));
                        }
                      } catch { }
                    }
                    try {
                      await onCancel(payment.id);
                    } catch (err) {
                      console.warn("Cancel on server failed:", err);
                    }
                  }}
                  disabled={isCancelling}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "var(--danger)",
                    fontWeight: 700,
                    cursor: "pointer",
                    textDecoration: "underline",
                    padding: 0
                  }}
                >
                  {isCancelling ? "Cancelling..." : "Yes"}
                </button>
                <span style={{ color: "var(--border)" }}>•</span>
                <button
                  type="button"
                  onClick={() => setShowConfirmCancel(false)}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "var(--text-muted)",
                    cursor: "pointer",
                    padding: 0
                  }}
                >
                  No
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function TopAutopayCountdown({
  targetTime,
  isExecuting,
  executionState
}: {
  targetTime?: number | string | null;
  isExecuting?: boolean;
  executionState?: 'idle' | 'processing' | 'completed' | 'failed';
}) {
  const epoch = useMemo(() => {
    if (!targetTime) return null;
    const num = typeof targetTime === 'number' ? targetTime : new Date(targetTime).getTime();
    return isNaN(num) ? null : num;
  }, [targetTime]);

  const [displayText, setDisplayText] = useState(() => {
    if (!epoch) return 'Active';
    const diff = epoch - Date.now();
    if (diff <= 0) return 'Due';
    const totalSeconds = Math.floor(diff / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const pad = (n: number) => String(n).padStart(2, '0');
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    return `${pad(minutes)}:${pad(seconds)}`;
  });

  useEffect(() => {
    if (!epoch) {
      setDisplayText('Active');
      return;
    }
    const update = () => {
      const diff = epoch - Date.now();
      if (diff <= 0) {
        setDisplayText('Due');
        return;
      }
      const totalSeconds = Math.floor(diff / 1000);
      const days = Math.floor(totalSeconds / 86400);
      const hours = Math.floor((totalSeconds % 86400) / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;
      const pad = (n: number) => String(n).padStart(2, '0');
      if (days > 0) {
        setDisplayText(`${days}d ${hours}h`);
      } else if (hours > 0) {
        setDisplayText(`${pad(hours)}:${pad(minutes)}:${pad(seconds)}`);
      } else {
        setDisplayText(`${pad(minutes)}:${pad(seconds)}`);
      }
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [epoch]);

  // Priority state handling based on real backend execution
  if (executionState === 'completed') {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4.5, color: "#15803d", fontWeight: 700 }}>
        <Check size={12} color="#15803d" strokeWidth={3} />
        <span>Completed</span>
      </span>
    );
  }

  if (executionState === 'failed') {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4.5, color: "#ef4444", fontWeight: 700 }}>
        <AlertCircle size={12} color="#ef4444" strokeWidth={2.5} />
        <span>Failed</span>
      </span>
    );
  }

  if (isExecuting || executionState === 'processing') {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "var(--text-primary)" }}>
        <Loader2 style={{ width: 11, height: 11, animation: "spin 1s linear infinite" }} />
        <span>Processing...</span>
      </span>
    );
  }

  return <span>{displayText}</span>;
}

function AutopaySlideDrawer({
  schedule,
  details,
  chatUser,
  onCancel,
  onClose,
  isCancelling,
  isExecuting,
  executionState,
  isDue,
  onTriggerNow
}: {
  schedule: Payment;
  details: any;
  chatUser: any;
  onCancel: (id: string, secondaryId?: string) => Promise<void>;
  onClose: () => void;
  isCancelling: boolean;
  isExecuting?: boolean;
  executionState?: 'idle' | 'processing' | 'completed' | 'failed';
  isDue?: boolean;
  onTriggerNow?: () => void;
}) {
  const [showConfirmCancel, setShowConfirmCancel] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const amount = details?.schedule?.amount || schedule.amount;
  const token = details?.schedule?.token || schedule.token || 'USDC';
  const schedStartDate = details?.schedule?.start_date;
  const schedEndDate = details?.schedule?.end_date;
  const isOneTime = Boolean(
    (schedStartDate && schedEndDate && schedStartDate === schedEndDate) ||
    ((schedule as any)?.startDate && (schedule as any)?.endDate && (schedule as any).startDate === (schedule as any).endDate)
  );
  const frequency = isOneTime
    ? 'ONE-TIME'
    : (details?.schedule?.frequency || schedule.recurringInterval || 'Weekly').toString().toUpperCase();
  const nextExec = details?.schedule?.next_execution_at || schedule.nextPaymentAt;
  const executions = details?.executions || [];
  const scheduleId = details?.schedule?.id || schedule.id;
  const recipientAddr = chatUser?.address || schedule.receiver || details?.schedule?.recipient_address || '';
  const recipientName = chatUser?.displayName || (chatUser?.name ? chatUser.name : '');

  const copyToClipboard = async (text: string, fieldKey: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(fieldKey);
      setTimeout(() => setCopiedField(null), 2000);
    } catch {}
  };

  const handleCancelConfirm = async () => {
    setShowConfirmCancel(false);
    await onCancel(schedule.id, details?.schedule?.id);
    onClose();
  };

  return (
    <div style={{
      width: "100%",
      background: "var(--surface)",
      borderRadius: 18,
      border: "1px solid var(--border)",
      boxShadow: "0 16px 40px rgba(0, 0, 0, 0.4), 0 2px 10px rgba(0, 0, 0, 0.2)",
      padding: "13px 17px",
      display: "flex",
      flexDirection: "column",
      gap: 10,
      fontFamily: "var(--font-geist), var(--font-inter), sans-serif",
      pointerEvents: "auto"
    }}>
        {/* 1. Top Row: Logo, Title, Amount & Blue ACTIVE Text */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: 1 }}>
            <div style={{ width: 26, height: 26, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {token?.startsWith('EURC') ? <EurcLogo size={24} /> : <UsdcLogo size={24} />}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 9.5, fontWeight: 700, color: "var(--text-secondary, #8E8E93)", letterSpacing: "0.04em", textTransform: "uppercase" }}>
                {isOneTime ? "SCHEDULED PAYMENT" : "AUTOPAY SCHEDULE"}
              </div>
              <div style={{
                fontSize: 14,
                fontWeight: 700,
                color: "var(--text-primary)",
                lineHeight: 1.2,
                letterSpacing: "-0.01em",
                fontVariantNumeric: "tabular-nums",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap"
              }}>
                {amount} {token} {recipientName ? `→ ${recipientName}` : ""}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            <span style={{
              fontSize: 11,
              fontWeight: 700,
              color: "#2563eb",
              letterSpacing: "0.02em"
            }}>
              ACTIVE
            </span>
            <button
              onClick={onClose}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--text-muted)",
                padding: 4,
                borderRadius: 9999,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "color 0.15s"
              }}
              title="Close drawer"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* 2. Middle Row: Centered Prominent Countdown */}
        <div style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 3,
          padding: "4px 0"
        }}>
          <div style={{
            fontSize: 12,
            color: "var(--text-secondary, #8E8E93)",
            fontWeight: 500,
            letterSpacing: "-0.01em",
            display: "inline-flex",
            alignItems: "center",
            gap: 6
          }}>
            <span>Next payment:</span>
            <span style={{
              fontSize: 13.5,
              fontWeight: 800,
              color: isDue ? "var(--accent-red)" : "var(--text-primary)",
              fontVariantNumeric: "tabular-nums"
            }}>
              <TopAutopayCountdown targetTime={nextExec} isExecuting={isExecuting} executionState={executionState} />
            </span>
            <span style={{ color: "var(--text-muted)" }}>•</span>
            <span>Frequency: {frequency}</span>
          </div>

          {details?.schedule?.last_execution_status === 'FAILED' && (
            <div style={{ fontSize: 10.5, color: "#dc2626", fontWeight: 600, display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}>
              <AlertCircle size={11} /> {details.schedule.last_error_reason || 'Last transfer failed (e.g. check USDC balance)'}
            </div>
          )}
        </div>

        {/* 3. Dedicated Actions Bar: Left Details, Right Cancel (No background, pure clickable red font) */}
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          paddingTop: 8,
          borderTop: "1px solid var(--border-soft)",
          gap: 10
        }}>
          {/* Left: Details Toggle */}
          <button
            type="button"
            onClick={() => setIsExpanded(prev => !prev)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "3.5px 12px",
              fontSize: 11,
              lineHeight: "16px",
              fontWeight: 500,
              color: "var(--text-primary)",
              background: isExpanded ? "var(--bg-default)" : "var(--surface-soft, rgba(0,0,0,0.04))",
              border: "1px solid var(--border)",
              borderRadius: 9999,
              cursor: "pointer",
              transition: "all 0.15s ease",
              letterSpacing: "-0.01em"
            }}
          >
            <span>Details</span>
            {isExpanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
          </button>

          {/* Right: Action Buttons */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {(isDue || details?.schedule?.last_execution_status === 'FAILED') && onTriggerNow && (
              <button
                type="button"
                onClick={onTriggerNow}
                disabled={isExecuting || executionState === 'processing'}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  padding: "4px 14px",
                  fontSize: 11,
                  lineHeight: "16px",
                  fontWeight: 700,
                  color: "#fff",
                  background: isExecuting || executionState === 'processing' ? "#93c5fd" : "var(--accent-red, #2563eb)",
                  border: "none",
                  borderRadius: 9999,
                  cursor: isExecuting || executionState === 'processing' ? "wait" : "pointer",
                  transition: "all 0.15s ease",
                  boxShadow: "0 1px 3px rgba(37, 99, 235, 0.25)"
                }}
                title={details?.schedule?.last_execution_status === 'FAILED' ? "Retry failed Autopay transaction" : "Process due payment now"}
              >
                {isExecuting || executionState === 'processing' ? (
                  <>
                    <span className="w-2.5 h-2.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                    <span>Processing...</span>
                  </>
                ) : (
                  <>
                    <Play size={11} fill="currentColor" />
                    <span>{details?.schedule?.last_execution_status === 'FAILED' ? "Retry Payment" : "Process Payment"}</span>
                  </>
                )}
              </button>
            )}

            {!showConfirmCancel ? (
              <button
                type="button"
                onClick={() => setShowConfirmCancel(true)}
                disabled={isCancelling}
                style={{
                  background: "none",
                  border: "none",
                  cursor: isCancelling ? "default" : "pointer",
                  padding: "4px 4px",
                  fontSize: 12,
                  fontWeight: 700,
                  color: "#dc2626",
                  transition: "opacity 0.15s ease",
                  display: "inline-flex",
                  alignItems: "center",
                  letterSpacing: "-0.01em"
                }}
                onMouseEnter={e => e.currentTarget.style.opacity = "0.75"}
                onMouseLeave={e => e.currentTarget.style.opacity = "1"}
              >
                <span>{isCancelling ? "Cancelling..." : "Cancel Autopay"}</span>
              </button>
            ) : (
              <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 11, color: "var(--text-muted)", whiteSpace: "nowrap" }}>Confirm?</span>
                <button
                  type="button"
                  onClick={handleCancelConfirm}
                  disabled={isCancelling}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: isCancelling ? "default" : "pointer",
                    padding: "2px 4px",
                    fontSize: 11.5,
                    fontWeight: 800,
                    color: "#dc2626",
                    whiteSpace: "nowrap",
                    transition: "opacity 0.15s"
                  }}
                  onMouseEnter={e => e.currentTarget.style.opacity = "0.75"}
                  onMouseLeave={e => e.currentTarget.style.opacity = "1"}
                >
                  {isCancelling ? "Cancelling..." : "Yes, Cancel"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowConfirmCancel(false)}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: "2px 4px",
                    fontSize: 11.5,
                    fontWeight: 600,
                    color: "var(--text-secondary)",
                    whiteSpace: "nowrap",
                    transition: "opacity 0.15s"
                  }}
                  onMouseEnter={e => e.currentTarget.style.opacity = "0.75"}
                  onMouseLeave={e => e.currentTarget.style.opacity = "1"}
                >
                  Keep
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Expanded Details Section */}
        {isExpanded && (
          <div style={{
            display: "flex",
            flexDirection: "column",
            gap: 6,
            marginTop: 2,
            paddingTop: 12,
            borderTop: "1px dashed var(--border-soft)"
          }}>
            {/* Recipient Address */}
            {recipientAddr && (
              <div style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                background: "var(--bg-default)",
                padding: "8px 12px",
                borderRadius: 10,
                border: "1px solid var(--border-soft)"
              }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                  <span style={{ fontSize: 9.5, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    RECIPIENT ADDRESS
                  </span>
                  <span style={{ fontSize: 11, fontFamily: "monospace", color: "var(--text-primary)" }}>
                    {recipientAddr.slice(0, 16)}…{recipientAddr.slice(-12)}
                  </span>
                </div>
                <button
                  onClick={() => copyToClipboard(recipientAddr, 'recipient')}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "3px 10px",
                    fontSize: 10.5,
                    fontWeight: 700,
                    color: "var(--text-primary)",
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: 9999,
                    cursor: "pointer"
                  }}
                >
                  <Copy size={10} /> {copiedField === 'recipient' ? 'Copied' : 'Copy'}
                </button>
              </div>
            )}

            {/* Schedule ID */}
            {scheduleId && (
              <div style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                background: "var(--bg-default)",
                padding: "8px 12px",
                borderRadius: 10,
                border: "1px solid var(--border-soft)"
              }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                  <span style={{ fontSize: 9.5, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    SCHEDULE ID
                  </span>
                  <span style={{ fontSize: 11, fontFamily: "monospace", color: "var(--text-primary)" }}>
                    {scheduleId.slice(0, 16)}…{scheduleId.slice(-12)}
                  </span>
                </div>
                <button
                  onClick={() => copyToClipboard(scheduleId, 'scheduleId')}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "3px 10px",
                    fontSize: 10.5,
                    fontWeight: 700,
                    color: "var(--text-primary)",
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: 9999,
                    cursor: "pointer"
                  }}
                >
                  <Copy size={10} /> {copiedField === 'scheduleId' ? 'Copied' : 'Copy'}
                </button>
              </div>
            )}

            {/* Execution Schedule Info */}
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              background: "var(--bg-default)",
              padding: "8px 12px",
              borderRadius: 10,
              border: "1px solid var(--border-soft)"
            }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                <span style={{ fontSize: 9.5, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  NEXT EXECUTION TIME
                </span>
                <span style={{ fontSize: 11, color: "var(--text-primary)", fontWeight: 500 }}>
                  {nextExec ? new Date(Number(nextExec)).toLocaleString([], { dateStyle: 'full', timeStyle: 'short' }) : 'Scheduled'}
                </span>
              </div>
            </div>

            {/* Past Executions — Scrollable so 100 txs never blow up the screen */}
            <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 2 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", paddingLeft: 2 }}>
                EXECUTION HISTORY ({executions.length})
              </span>

              <div style={{
                display: "flex",
                flexDirection: "column",
                gap: 5,
                maxHeight: 160,
                overflowY: "auto",
                paddingRight: 2
              }}>
                {executions && executions.length > 0 ? (
                  executions.map((exec: any) => {
                    const txHash = exec.blockchain_tx_hash;
                    const explorerUrl = txHash ? `https://testnet.arcscan.app/tx/${txHash}` : null;
                    return (
                      <div
                        key={exec.id}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          background: "var(--bg-default)",
                          padding: "8px 12px",
                          borderRadius: 10,
                          border: "1px solid var(--border-soft)"
                        }}
                      >
                        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                          <span style={{ fontSize: 9.5, fontWeight: 700, color: "#16a34a", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                            CONFIRMED • {new Date(exec.executed_at || exec.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                          </span>
                          <span style={{ fontSize: 11, color: "var(--text-primary)", fontWeight: 600 }}>
                            {exec.amount || amount} {exec.token || token}
                            {txHash ? <span style={{ fontFamily: "monospace", fontWeight: 400, color: "var(--text-muted)", marginLeft: 6 }}>{txHash.slice(0, 8)}…{txHash.slice(-6)}</span> : null}
                          </span>
                        </div>

                        <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                          {explorerUrl && (
                            <a
                              href={explorerUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 4,
                                padding: "4px 9px",
                                fontSize: 10.5,
                                fontWeight: 700,
                                color: "var(--text-primary)",
                                background: "var(--surface)",
                                border: "1px solid var(--border)",
                                borderRadius: 6,
                                textDecoration: "none",
                                cursor: "pointer"
                              }}
                            >
                              <ExternalLink size={10} /> Explorer
                            </a>
                          )}
                          {txHash && (
                            <button
                              onClick={() => copyToClipboard(txHash, exec.id)}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 4,
                                padding: "4px 9px",
                                fontSize: 10.5,
                                fontWeight: 700,
                                color: "var(--text-primary)",
                                background: "var(--surface)",
                                border: "1px solid var(--border)",
                                borderRadius: 6,
                                cursor: "pointer"
                              }}
                            >
                              <Copy size={10} /> {copiedField === exec.id ? 'Copied' : 'Copy'}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div style={{
                    padding: "10px",
                    textAlign: "center",
                    color: "var(--text-secondary, #8E8E93)",
                    fontSize: 11,
                    background: "var(--bg-default)",
                    borderRadius: 10,
                    border: "1px solid var(--border-soft)"
                  }}>
                    No past executions yet. First automated payment will trigger at the scheduled time.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
  );
}

function ChatWindow({
  onToggleProfile,
  onOpenPay,
  onOpenAutopaySetup,
  onOpenAutopayDashboard,
  onOpenEdit,
  activeCenterTab,
  setActiveCenterTab,
  payFilter: externalPayFilter,
  setPayFilter: externalSetPayFilter,
  customContacts,
  setRenameTarget,
  setRenameValue,
  setRenameColorIndex
}: ChatWindowProps) {
  const { mode } = useEnvironment();
  const { address } = useAccount();
  const {
    activeChatUser,
    setActiveChatUser,
    messages,
    sendMessage,
    editMessage,
    deleteMessage,
    addReaction,
    typingUsers,
    setTyping,
    togglePin,
    toggleArchive,
    toggleHide,
    saveDraft,
    chats,
    payments,
    verifyPayment,
    cancelAutoPay,
    deleteConversationHistory,
    isPaymentsLoading,
    fetchPaymentById,
    refreshPayments
  } = useChat();

  const requestedPaymentIdsRef = useRef<Set<string>>(new Set());

  const [verifyingPaymentIds, setVerifyingPaymentIds] = useState<Record<string, boolean>>({});
  const [cancellingPaymentIds, setCancellingPaymentIds] = useState<Record<string, boolean>>({});

  const { fetchMessages, isMessagesLoading, hasMoreMessages, hasLoadedMessages } = useChatStore();

  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  const [inputVal, setInputVal] = useState("");

  const [replyingMsg, setReplyingMsg] = useState<Message | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [isTypingLocal, setIsTypingLocal] = useState(false);
  const [isSearchingInside, setIsSearchingInside] = useState(false);
  const [searchInsideQuery, setSearchInsideQuery] = useState("");
  const [showMsgActions, setShowMsgActions] = useState<string | null>(null);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const [internalPayFilter, setInternalPayFilter] = useState<"all" | "sent" | "received" | "scheduled">("all");
  const payFilter = externalPayFilter ?? internalPayFilter;
  const setPayFilter = externalSetPayFilter ?? setInternalPayFilter;

  // Backend-Driven 10-Item Paginated Ledger (Billion-user dApp scale)
  const [paginatedLedger, setPaginatedLedger] = useState<any[]>([]);
  const [ledgerTotalCount, setLedgerTotalCount] = useState<number>(0);
  const [hasMoreLedger, setHasMoreLedger] = useState<boolean>(false);
  const [isLedgerInitialLoading, setIsLedgerInitialLoading] = useState<boolean>(true);
  const [isLedgerLoadingMore, setIsLedgerLoadingMore] = useState<boolean>(false);
  const [ledgerStats, setLedgerStats] = useState<{
    USDC: { sent: number; received: number; total: number };
    EURC: { sent: number; received: number; total: number };
  } | null>(null);
  const ledgerSentinelRef = useRef<HTMLDivElement>(null);

  const paginatedLedgerRef = useRef<any[]>([]);
  paginatedLedgerRef.current = paginatedLedger;

  const fetchBackendLedger = useCallback(async (isLoadMore: boolean = false) => {
    if (!address || !activeChatUser?.address) return;
    if (payFilter === "scheduled") return;

    if (isLoadMore) {
      if (isLedgerLoadingMore || !hasMoreLedger) return;
      setIsLedgerLoadingMore(true);
    } else {
      setIsLedgerInitialLoading(true);
    }

    try {
      const currentOffset = isLoadMore ? paginatedLedgerRef.current.length : 0;
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      if (address) headers['x-wallet-address'] = address;

      const url = `/api/chat/payments?address=${address.toLowerCase()}&contact=${activeChatUser.address.toLowerCase()}&filter=${payFilter}&limit=10&offset=${currentOffset}`;
      const res = await fetch(url, { headers });
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.payments)) {
          if (isLoadMore) {
            setPaginatedLedger(prev => [...prev, ...data.payments]);
          } else {
            setPaginatedLedger(data.payments);
          }
          setLedgerTotalCount(data.totalCount || 0);
          setHasMoreLedger(data.hasMore || false);
          if (data.stats) {
            setLedgerStats(data.stats);
          }
        }
      }
    } catch (err) {
      console.warn('[Ledger Pagination] Fetch error:', err);
    } finally {
      if (isLoadMore) {
        setIsLedgerLoadingMore(false);
      } else {
        setIsLedgerInitialLoading(false);
      }
    }
  }, [address, activeChatUser?.address, payFilter, isLedgerLoadingMore, hasMoreLedger]);

  const [showStatement, setShowStatement] = useState(false);
  const [msgDeleteTarget, setMsgDeleteTarget] = useState<{ id: string; isMe: boolean; isPayment: boolean } | null>(null);
  const [showMenuOptions, setShowMenuOptions] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [imagePreviews, setImagePreviews] = useState<{ base64: string }[]>([]);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const [showAutopayDrawer, setShowAutopayDrawer] = useState(false);
  const [showPayMenu, setShowPayMenu] = useState(false);
  const payMenuRef = useRef<HTMLDivElement>(null);
  const [topAutopayDetails, setTopAutopayDetails] = useState<{
    schedule: any;
    latestExecution: any;
    executions: any[];
  } | null>(null);

  // Close pay menu when clicking outside
  useEffect(() => {
    if (!showPayMenu) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (payMenuRef.current && !payMenuRef.current.contains(e.target as Node)) {
        setShowPayMenu(false);
      }
    };
    window.addEventListener("mousedown", handleOutsideClick);
    return () => window.removeEventListener("mousedown", handleOutsideClick);
  }, [showPayMenu]);

  const chatPayments = useMemo(() => {
    if (!activeChatUser || !address) return [];
    const myAddr = address.toLowerCase();
    const otherAddr = activeChatUser.address.toLowerCase();
    return payments.filter(
      p =>
        p && p.sender && p.receiver &&
        ((p.sender.toLowerCase() === myAddr && p.receiver.toLowerCase() === otherAddr) ||
          (p.sender.toLowerCase() === otherAddr && p.receiver.toLowerCase() === myAddr))
    );
  }, [payments, activeChatUser, address]);

  const activeAutopaySchedule = useMemo(() => {
    if (!activeChatUser || !address) return null;
    const myAddr = address.toLowerCase();
    const otherAddr = activeChatUser.address.toLowerCase();

    let cancelledIds: string[] = [];
    if (typeof window !== 'undefined') {
      try {
        cancelledIds = JSON.parse(localStorage.getItem('arc_cancelled_autopay_ids') || '[]');
      } catch {}
    }

    return payments.find(
      p =>
        p &&
        p.isRecurring &&
        p.active &&
        p.status !== 'cancelled' &&
        (p.status as string) !== 'exhausted' &&
        !cancelledIds.includes(p.id) &&
        ((p.sender?.toLowerCase() === myAddr && p.receiver?.toLowerCase() === otherAddr) ||
          (p.sender?.toLowerCase() === otherAddr && p.receiver?.toLowerCase() === myAddr))
    ) || null;
  }, [payments, activeChatUser, address]);

  const fetchTopAutopayDetails = useCallback(async () => {
    if (!activeChatUser?.address) {
      setTopAutopayDetails(null);
      return;
    }
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      if (address) headers['x-wallet-address'] = address;

      const recipientAddr = activeChatUser.address.toLowerCase();
      let url = `/api/autopay/details?recipient=${recipientAddr}`;
      if (address) url += `&sender=${address.toLowerCase()}`;
      if (activeAutopaySchedule?.id) {
        url += `&id=${activeAutopaySchedule.id}`;
      }

      const res = await fetch(url, { headers });
      if (res.ok) {
        const data = await res.json();
        if (data?.schedule && data.schedule.status === 'ACTIVE') {
          let cancelledIds: string[] = [];
          if (typeof window !== 'undefined') {
            try {
              cancelledIds = JSON.parse(localStorage.getItem('arc_cancelled_autopay_ids') || '[]');
            } catch {}
          }
          if (!cancelledIds.includes(data.schedule.id)) {
            setTopAutopayDetails(data);
            return;
          }
        }
      }
      setTopAutopayDetails(null);
    } catch (err) {
      console.warn("Failed to fetch top autopay details:", err);
      setTopAutopayDetails(null);
    }
  }, [activeChatUser?.address, address, activeAutopaySchedule?.id]);

  useEffect(() => {
    fetchTopAutopayDetails();
    const handleAutopayUpdate = () => {
      fetchTopAutopayDetails();
    };
    window.addEventListener('arc_autopay_updated', handleAutopayUpdate);
    return () => {
      window.removeEventListener('arc_autopay_updated', handleAutopayUpdate);
    };
  }, [fetchTopAutopayDetails]);

  const activeSchedule = useMemo(() => {
    let cancelledIds: string[] = [];
    if (typeof window !== 'undefined') {
      try {
        cancelledIds = JSON.parse(localStorage.getItem('arc_cancelled_autopay_ids') || '[]');
      } catch {}
    }

    if (topAutopayDetails?.schedule && topAutopayDetails.schedule.status === 'ACTIVE') {
      const s = topAutopayDetails.schedule;
      if (!cancelledIds.includes(s.id)) {
        return {
          id: s.id,
          sender: s.sender_wallet,
          receiver: s.recipient_address,
          amount: s.amount,
          token: s.token || 'USDC',
          description: s.description || `Autopay • ${s.frequency || 'Weekly'}`,
          status: s.status,
          active: true,
          createdAt: Number(s.created_at) || Date.now(),
          isRecurring: true,
          recurringInterval: (s.frequency || 'weekly').toLowerCase(),
          nextPaymentAt: s.next_execution_at ? Number(s.next_execution_at) : undefined,
          frequency: s.frequency,
          executionTime: s.execution_time,
          timezone: s.timezone
        };
      }
    }

    if (activeAutopaySchedule && !cancelledIds.includes(activeAutopaySchedule.id)) {
      return activeAutopaySchedule;
    }

    return null;
  }, [topAutopayDetails, activeAutopaySchedule]);

  const isDue = useMemo(() => {
    const nextAt = topAutopayDetails?.schedule?.next_execution_at
      ? Number(topAutopayDetails.schedule.next_execution_at)
      : (activeSchedule?.nextPaymentAt ? new Date(activeSchedule.nextPaymentAt).getTime() : null);
    if (!nextAt) return false;
    return nextAt <= Date.now();
  }, [topAutopayDetails?.schedule?.next_execution_at, activeSchedule?.nextPaymentAt]);

  const [isExecutingDue, setIsExecutingDue] = useState(false);
  const [executionState, setExecutionState] = useState<'idle' | 'processing' | 'completed' | 'failed'>('idle');
  const lastTriggeredScheduleIdRef = useRef<string | null>(null);
  const activePollAbortRef = useRef<boolean>(false);

  const handleTriggerDue = useCallback(async () => {
    if (isExecutingDue || executionState === 'processing') return;

    const scheduleId = topAutopayDetails?.schedule?.id || activeAutopaySchedule?.id;
    if (!scheduleId) return;

    // Prevent re-triggering the same schedule cycle repeatedly
    lastTriggeredScheduleIdRef.current = scheduleId;
    setIsExecutingDue(true);
    setExecutionState('processing');
    activePollAbortRef.current = false;

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      if (address) headers['x-wallet-address'] = address;

      const res = await fetch('/api/autopay/trigger-due', {
        method: 'POST',
        headers,
        body: JSON.stringify({ scheduleId })
      });
      const data = await res.json();
      console.log('[Autopay Trigger Due] Response:', data);

      if (!res.ok) {
        console.warn('[Autopay Trigger Due] Trigger returned error:', data?.error);
        setExecutionState('failed');
        setTimeout(() => setExecutionState('idle'), 4000);
        return;
      }

      // Check if it already returned with confirmed status directly
      const executionDetail = data?.result?.details?.find((d: any) => d.scheduleId === scheduleId);
      if (executionDetail?.status === 'CONFIRMED' && executionDetail?.blockchainTxHash) {
        setExecutionState('completed');
        // Synchronize chat messages, payments and history immediately
        if (address && activeChatUser?.address) {
          fetchMessages(address, activeChatUser.address);
        }
        await refreshPayments();
        await fetchBackendLedger(false);
        await fetchTopAutopayDetails();
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('arc_autopay_updated'));
          window.dispatchEvent(new CustomEvent('arc_payments_synced'));
          window.dispatchEvent(new Event('refresh-portfolio'));
          window.dispatchEvent(new Event('refresh-wallet-history'));
        }
        setTimeout(() => setExecutionState('idle'), 3500);
        return;
      }

      if (executionDetail?.status === 'FAILED') {
        setExecutionState('failed');
        setTimeout(() => setExecutionState('idle'), 4000);
        return;
      }

      // 3. Status Polling: Keep UI in Processing until backend confirms on-chain
      let confirmed = false;
      let failed = false;
      const maxAttempts = 18; // ~36 seconds max polling window

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        if (activePollAbortRef.current) break;
        await new Promise(r => setTimeout(r, 2000));
        if (activePollAbortRef.current) break;

        try {
          const detailHeaders: Record<string, string> = {};
          if (token) detailHeaders['Authorization'] = `Bearer ${token}`;
          if (address) detailHeaders['x-wallet-address'] = address;

          let pollUrl = `/api/autopay/details?id=${encodeURIComponent(scheduleId)}`;
          if (activeChatUser?.address) pollUrl += `&recipient=${encodeURIComponent(activeChatUser.address.toLowerCase())}`;
          if (address) pollUrl += `&sender=${encodeURIComponent(address.toLowerCase())}`;

          const pollRes = await fetch(pollUrl, { headers: detailHeaders });
          if (pollRes.ok) {
            const pollData = await pollRes.json();
            const latestExec = pollData?.latestExecution;

            if (latestExec?.status === 'CONFIRMED' && latestExec?.blockchain_tx_hash) {
              confirmed = true;
              setTopAutopayDetails(pollData);
              break;
            } else if (latestExec?.status === 'FAILED') {
              failed = true;
              setTopAutopayDetails(pollData);
              break;
            } else if (pollData?.schedule?.last_execution_status === 'CONFIRMED') {
              // Schedule was updated to confirmed
              confirmed = true;
              setTopAutopayDetails(pollData);
              break;
            }
          }
        } catch (pollErr) {
          // Bounded network error tolerance: do NOT mark as failed on intermittent network glitch
          console.warn('[Autopay Status Polling] Transient poll error:', pollErr);
        }
      }

      if (confirmed) {
        setExecutionState('completed');
        // Synchronize chat messages, payments, ledger, and drawer
        if (address && activeChatUser?.address) {
          fetchMessages(address, activeChatUser.address);
        }
        await refreshPayments();
        await fetchBackendLedger(false);
        await fetchTopAutopayDetails();
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('arc_autopay_updated'));
          window.dispatchEvent(new CustomEvent('arc_payments_synced'));
          window.dispatchEvent(new Event('refresh-portfolio'));
          window.dispatchEvent(new Event('refresh-wallet-history'));
        }
        setTimeout(() => setExecutionState('idle'), 3500);
      } else if (failed) {
        lastTriggeredScheduleIdRef.current = null;
        setExecutionState('failed');
        setTimeout(() => setExecutionState('idle'), 4000);
      } else {
        // Unknown or polling timeout: gracefully return to idle; do NOT create a second transfer
        lastTriggeredScheduleIdRef.current = null;
        setExecutionState('idle');
        await fetchTopAutopayDetails();
      }
    } catch (err) {
      lastTriggeredScheduleIdRef.current = null;
      console.warn('[Autopay Trigger Due] Execution failed:', err);
      setExecutionState('failed');
      setTimeout(() => setExecutionState('idle'), 4000);
    } finally {
      setIsExecutingDue(false);
    }
  }, [
    isExecutingDue,
    executionState,
    topAutopayDetails?.schedule?.id,
    activeAutopaySchedule?.id,
    address,
    activeChatUser?.address,
    fetchMessages,
    refreshPayments,
    fetchBackendLedger,
    fetchTopAutopayDetails
  ]);

  // Clean up any ongoing polling on unmount
  useEffect(() => {
    return () => {
      activePollAbortRef.current = true;
    };
  }, []);

  // Auto-trigger when schedule is due or when countdown reaches 0 (ensures single trigger per occurrence)
  useEffect(() => {
    const sched = topAutopayDetails?.schedule;
    if (!sched || sched.status !== 'ACTIVE' || !sched.next_execution_at) return;
    const nextAt = Number(sched.next_execution_at);
    const diff = nextAt - Date.now();

    // Do not retrigger if currently executing or already triggered this schedule instance
    if (isExecutingDue || executionState === 'processing') return;
    if (lastTriggeredScheduleIdRef.current === sched.id && diff <= 0) return;

    if (diff <= 0) {
      handleTriggerDue();
    } else {
      // Schedule trigger exactly when due
      const timer = setTimeout(() => {
        handleTriggerDue();
      }, Math.min(diff, 2147483647));
      return () => clearTimeout(timer);
    }
  }, [
    topAutopayDetails?.schedule?.id,
    topAutopayDetails?.schedule?.next_execution_at,
    topAutopayDetails?.schedule?.status,
    isExecutingDue,
    executionState,
    handleTriggerDue
  ]);

  const stats = useMemo(() => {
    let sentUSDC = 0; let sentEURC = 0;
    let receivedUSDC = 0; let receivedEURC = 0;
    let pendingUSDC = 0; let pendingEURC = 0;

    const defaultStats = { sent: 0, received: 0, pending: 0, total: 0 };
    if (!address) return {
      USDC: { ...defaultStats },
      EURC: { ...defaultStats }
    };
    const myAddr = address.toLowerCase();

    chatPayments.forEach(p => {
      const amt = Number(p.amount) || 0;
      const isEURC = p.token === 'EURC';
      // Only skip unexecuted recurring schedule definitions (active schedules awaiting execution)
      const isPlaceholder = Boolean(p.isRecurring && p.nextPaymentAt && !p.txHash && p.status !== 'failed');
      if (isPlaceholder) return;

      if (p.status === "pending") {
        if (isEURC) pendingEURC += amt; else pendingUSDC += amt;
      } else if (p.status === "confirmed") {
        if (p.sender?.toLowerCase() === myAddr) {
          if (isEURC) sentEURC += amt; else sentUSDC += amt;
        } else {
          if (isEURC) receivedEURC += amt; else receivedUSDC += amt;
        }
      }
    });

    return {
      USDC: { sent: sentUSDC, received: receivedUSDC, pending: pendingUSDC, total: sentUSDC + receivedUSDC },
      EURC: { sent: sentEURC, received: receivedEURC, pending: pendingEURC, total: sentEURC + receivedEURC }
    };
  }, [chatPayments, address]);

  const filteredPayments = useMemo(() => {
    if (!address) return [];
    const myAddr = address.toLowerCase();

    return chatPayments.filter(p => {
      if (!p) return false;
      const s = p.sender?.toLowerCase();
      const r = p.receiver?.toLowerCase();
      // Schedule placeholder: recurring configuration row with nextPaymentAt awaiting run, no on-chain txHash and not failed
      const isSchedulePlaceholder = Boolean(p.isRecurring && p.nextPaymentAt && !p.txHash && p.status !== 'failed');

      if (payFilter === "sent") {
        return s === myAddr && !isSchedulePlaceholder;
      }
      if (payFilter === "received") {
        return r === myAddr && !isSchedulePlaceholder;
      }
      if (payFilter === "scheduled") {
        return p.isRecurring && p.active;
      }
      // "all" tab: include all real transactions (one-time or executed autopays), exclude schedule placeholders
      return !isSchedulePlaceholder;
    });
  }, [chatPayments, payFilter, address]);

  useEffect(() => {
    if (activeCenterTab === "payments" && payFilter !== "scheduled") {
      setIsLedgerInitialLoading(true);
      fetchBackendLedger(false);
    }
  }, [activeCenterTab, payFilter, activeChatUser?.address, address]);

  useEffect(() => {
    const handlePaymentsSync = () => {
      if (activeCenterTab === "payments" && payFilter !== "scheduled") {
        fetchBackendLedger(false);
      }
    };
    window.addEventListener('arc_payments_synced', handlePaymentsSync);
    window.addEventListener('arc_autopay_updated', handlePaymentsSync);
    return () => {
      window.removeEventListener('arc_payments_synced', handlePaymentsSync);
      window.removeEventListener('arc_autopay_updated', handlePaymentsSync);
    };
  }, [activeCenterTab, payFilter, fetchBackendLedger]);

  // Infinite scroll listener for backend-driven pagination
  useEffect(() => {
    const sentinel = ledgerSentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (first && first.isIntersecting && !isLedgerLoadingMore && hasMoreLedger) {
          fetchBackendLedger(true);
        }
      },
      { root: null, rootMargin: "120px", threshold: 0.1 }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [isLedgerLoadingMore, hasMoreLedger, fetchBackendLedger]);

  const threadEndRef = useRef<HTMLDivElement>(null);
  const threadContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [scrollProgress, setScrollProgress] = useState(0);

  const convoIdForLoad = activeChatUser && address ? [address.toLowerCase(), activeChatUser.address.toLowerCase()].sort().join("_") : "";
  const isCurrentlyLoading = convoIdForLoad ? Boolean(isMessagesLoading[convoIdForLoad]) : false;
  const hasMessagesInThread = (messages || []).length > 0;
  const isInitialLoadComplete = convoIdForLoad ? (hasLoadedMessages[convoIdForLoad] && (!isCurrentlyLoading || hasMessagesInThread)) : false;

  const handleThreadScroll = () => {
    const el = threadContainerRef.current;
    if (!el) return;
    const scrollable = el.scrollHeight - el.clientHeight;
    if (scrollable <= 0) { setScrollProgress(100); return; }
    setScrollProgress(Math.round((el.scrollTop / scrollable) * 100));
  };

  // Load message draft if any exists
  useEffect(() => {
    if (!activeChatUser) return;
    const currentChat = chats.find(c => c.userAddress.toLowerCase() === activeChatUser.address.toLowerCase());
    setInputVal(currentChat?.draftText || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChatUser?.address]);

  // Handle local draft saving
  const handleInputChange = (val: string) => {
    setInputVal(val);
    if (activeChatUser) {
      // Find current chat reference
      const currentChat = chats.find(c => c.userAddress.toLowerCase() === activeChatUser.address.toLowerCase());
      if (currentChat) {
        saveDraft(currentChat.userAddress, val);
      }
    }

    // Handle typing status updates
    if (!isTypingLocal) {
      setIsTypingLocal(true);
      setTyping(true);
    }
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      setIsTypingLocal(false);
      setTyping(false);
    }, 3000);
  };

  const handleSend = async () => {
    if (!inputVal.trim() && imagePreviews.length === 0) return;

    if (imagePreviews.length > 0) {
      for (let i = 0; i < imagePreviews.length; i++) {
        const img = imagePreviews[i];
        const isLast = i === imagePreviews.length - 1;
        const bodyText = isLast && inputVal.trim() ? inputVal.trim() : "[Photo Upload]";
        await sendMessage(bodyText, img.base64, replyingMsg?.id);
      }
      setImagePreviews([]);
    } else {
      await sendMessage(inputVal, undefined, replyingMsg?.id);
    }
    setReplyingMsg(null);
    setInputVal("");
    if (activeChatUser) {
      const currentChat = chats.find(c => c.userAddress.toLowerCase() === activeChatUser.address.toLowerCase());
      if (currentChat) saveDraft(currentChat.userAddress, "");
    }
    inputRef.current?.focus();
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    e.target.value = "";

    if (imagePreviews.length + files.length > 10) {
      alert("You can only attach up to 10 photos at a time.");
      return;
    }

    try {
      const newImages = await Promise.all(
        files.map(file => compressImageToBase64(file, 400, 0.7))
      );
      setImagePreviews(prev => [...prev, ...newImages.map((b: string) => ({ base64: b }))]);
    } catch (err) {
      console.error(err);
      alert("Image compression failed.");
    }
  };

  const currentChatObj = chats.find(c => c.userAddress.toLowerCase() === activeChatUser?.address.toLowerCase());

  const isAutopayScheduleMsg = useCallback((m: Message): boolean => {
    if (!m) return false;
    const b = (m.body || "").trim();
    if (
      b.startsWith("Scheduled Autopay:") ||
      b.startsWith("Autopay Schedule Created:") ||
      /^Scheduled\s+Autopay:/i.test(b) ||
      /^Autopay\s+Schedule\s+Created:/i.test(b)
    ) {
      return true;
    }
    // Execution messages (e.g. "Sent 1000 USDC via Autopay") are genuine financial payment receipts, NEVER schedule setup messages!
    if (b.startsWith("Sent ") || b.toLowerCase().includes("via autopay")) {
      return false;
    }
    if (m.paymentId) {
      const p = payments.find(pay => pay.id === m.paymentId);
      if (p && p.isRecurring && p.status !== "confirmed" && p.nextPaymentAt) {
        return true;
      }
    }
    return false;
  }, [payments]);

  const filteredMessages = useMemo(() => {
    const rawList = (messages || []).filter(m => !isAutopayScheduleMsg(m));
    if (!searchInsideQuery.trim()) return rawList;
    return rawList.filter(m =>
      m.body.toLowerCase().includes(searchInsideQuery.toLowerCase())
    );
  }, [messages, searchInsideQuery, isAutopayScheduleMsg]);

  const typingText = useMemo(() => {
    if (typingUsers.length === 0) return "";
    return "typing...";
  }, [typingUsers]);

  if (!activeChatUser) return null;

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", background: isMobile ? "transparent" : "var(--bg)", position: "relative" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: "var(--surface)", borderBottom: "1px solid var(--border-soft)", zIndex: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <button
            onClick={() => setActiveChatUser(null)}
            className="md:hidden"
            style={{ background: "none", border: "none", cursor: "pointer", padding: "6px 2px", color: "var(--text-primary)" }}
          >
            <ArrowLeft style={{ width: 18, height: 18 }} />
          </button>

          <div onClick={onToggleProfile} style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            {activeChatUser.photoUrl ? (
              <img src={activeChatUser.photoUrl} alt="" style={{ width: 38, height: 38, borderRadius: "50%", objectFit: "cover" }} />
            ) : (
              <div style={{ background: getGradientForAddress(activeChatUser.address, customContacts[activeChatUser.address.toLowerCase()]?.colorIndex), width: 38, height: 38, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <User style={{ width: 20, height: 20, color: "#fff" }} />
              </div>
            )}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: 6 }}>
                {customContacts[activeChatUser.address.toLowerCase()]?.name || activeChatUser.name}
              </div>
              <div style={{ fontSize: 9, color: typingText ? "var(--accent-red)" : "var(--text-muted)" }}>
                {typingText || "Online"}
              </div>
            </div>
          </div>
        </div>

        {/* Action icons */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {/* 3-Dot Options Menu */}
          <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                overflow: "hidden",
                transition: "max-width 0.3s ease, opacity 0.3s ease, padding 0.3s ease",
                maxWidth: showMenuOptions ? 250 : 0,
                opacity: showMenuOptions ? 1 : 0,
                background: "var(--border-soft)",
                borderRadius: 20,
                padding: showMenuOptions ? "2px 8px" : "2px 0",
                marginRight: showMenuOptions ? 8 : 0,
                whiteSpace: "nowrap"
              }}
            >
              <button
                onClick={() => {
                  const nm = customContacts[activeChatUser.address.toLowerCase()]?.name || activeChatUser.name || "";
                  setRenameTarget({ id: activeChatUser.address.toLowerCase(), currentName: nm, currentColor: customContacts[activeChatUser.address.toLowerCase()]?.colorIndex });
                  setRenameValue(nm);
                  setRenameColorIndex(customContacts[activeChatUser.address.toLowerCase()]?.colorIndex);
                  onOpenEdit();
                }}
                className="lf-btn-ghost"
                title="Edit Contact"
                style={{ padding: 6, borderRadius: "50%", border: "none", color: "var(--accent)" }}
              >
                <Edit3 style={{ width: 16, height: 16 }} />
              </button>
              <button
                onClick={() => setIsSearchingInside(!isSearchingInside)}
                className="lf-btn-ghost"
                title="Search in Chat"
                style={{ padding: 6, borderRadius: "50%", border: "none" }}
              >
                <Search style={{ width: 16, height: 16 }} />
              </button>

              {currentChatObj && (
                <>
                  <button
                    onClick={() => togglePin(currentChatObj.userAddress)}
                    className="lf-btn-ghost"
                    title={currentChatObj.isPinned ? "Unpin" : "Pin"}
                    style={{ padding: 6, borderRadius: "50%", border: "none", color: currentChatObj.isPinned ? "var(--accent-red)" : "inherit" }}
                  >
                    <Pin style={{ width: 16, height: 16 }} />
                  </button>
                  <button
                    onClick={() => toggleArchive(currentChatObj.userAddress)}
                    className="lf-btn-ghost"
                    title={currentChatObj.isArchived ? "Unarchive" : "Archive"}
                    style={{ padding: 6, borderRadius: "50%", border: "none" }}
                  >
                    <Archive style={{ width: 16, height: 16 }} />
                  </button>
                  <button
                    onClick={() => toggleHide(currentChatObj.userAddress)}
                    className="lf-btn-ghost"
                    title="Hide Chat"
                    style={{ padding: 6, borderRadius: "50%", border: "none" }}
                  >
                    <EyeOff style={{ width: 16, height: 16 }} />
                  </button>
                  <button
                    onClick={() => setShowClearConfirm(true)}
                    className="lf-btn-ghost"
                    title="Clear Chat Messages"
                    style={{ padding: 6, borderRadius: "50%", border: "none", color: "#ef4444" }}
                  >
                    <Trash style={{ width: 16, height: 16 }} />
                  </button>
                </>
              )}
            </div>

            <button
              onClick={() => setShowMenuOptions(!showMenuOptions)}
              className="lf-btn-ghost"
              title="More Options"
              style={{ padding: 6, borderRadius: "50%", border: "none", color: showMenuOptions ? "var(--accent)" : "inherit" }}
            >
              <MoreVertical style={{ width: 16, height: 16 }} />
            </button>
          </div>

          <button
            onClick={onToggleProfile}
            className="lf-btn-ghost lg:!hidden"
            title="Toggle Profile details"
            style={{ padding: 6, borderRadius: "50%", border: "none" }}
          >
            <Info style={{ width: 16, height: 16 }} />
          </button>

          {/* Red X — close active chat */}
          <button
            onClick={() => setActiveChatUser(null)}
            title="Close Chat"
            style={{
              padding: 6,
              borderRadius: "50%",
              border: "none",
              cursor: "pointer",
              background: "rgba(239,68,68,0.1)",
              color: "#ef4444",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "background 0.15s"
            }}
          >
            <X style={{ width: 15, height: 15 }} />
          </button>
        </div>
      </div>

      {/* Tab Selector: Curved Segmented Pill Bar (Chat | History) + Active Autopay Trigger */}
      <div
        className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-3"
        style={{
          background: "var(--surface)",
          borderBottom: "1px solid var(--border-soft)",
          padding: activeSchedule ? "6px 16px" : "5px 16px",
          zIndex: 10,
          position: "relative",
          transition: "padding 0.15s ease"
        }}
      >
        <div style={{
          display: "inline-flex",
          background: "var(--surface-soft, #f1f5f9)",
          borderRadius: 9999,
          padding: 2,
          border: "1px solid var(--border, #e2e8f0)",
          boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
          flexShrink: 0
        }}>
          <button
            onClick={() => setActiveCenterTab("chat")}
            style={{
              padding: "2.5px 12px",
              fontSize: 11,
              lineHeight: "16px",
              borderRadius: 9999,
              fontWeight: activeCenterTab === "chat" ? 700 : 500,
              background: activeCenterTab === "chat" ? "var(--surface, #ffffff)" : "transparent",
              color: activeCenterTab === "chat" ? "var(--text-primary, #0f172a)" : "var(--text-secondary, #64748b)",
              border: activeCenterTab === "chat" ? "1px solid var(--border-soft, rgba(0, 0, 0, 0.08))" : "1px solid transparent",
              boxShadow: activeCenterTab === "chat" ? "0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.04)" : "none",
              cursor: "pointer",
              transition: "all 0.15s ease",
              display: "flex",
              alignItems: "center",
              gap: 5
            }}
          >
            Chat
          </button>
          <button
            onClick={() => setActiveCenterTab("payments")}
            style={{
              padding: "2.5px 12px",
              fontSize: 11,
              lineHeight: "16px",
              borderRadius: 9999,
              fontWeight: activeCenterTab === "payments" ? 700 : 500,
              background: activeCenterTab === "payments" ? "var(--surface, #ffffff)" : "transparent",
              color: activeCenterTab === "payments" ? "var(--text-primary, #0f172a)" : "var(--text-secondary, #64748b)",
              border: activeCenterTab === "payments" ? "1px solid var(--border-soft, rgba(0, 0, 0, 0.08))" : "1px solid transparent",
              boxShadow: activeCenterTab === "payments" ? "0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.04)" : "none",
              cursor: "pointer",
              transition: "all 0.15s ease",
              display: "flex",
              alignItems: "center",
              gap: 5
            }}
          >
            History
          </button>
        </div>

        {/* Next Autopay in <Timer> Flex Centered without Overlap/Mingling */}
        {activeSchedule && (
          <div style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
            <button
              type="button"
              onClick={() => setShowAutopayDrawer(prev => !prev)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "2.5px 12px",
                borderRadius: 9999,
                background: showAutopayDrawer ? "var(--surface-hover, rgba(0,0,0,0.06))" : "var(--surface-soft, rgba(0,0,0,0.04))",
                border: "1px solid var(--border)",
                fontSize: 11,
                lineHeight: "16px",
                fontWeight: 600,
                fontFamily: "var(--font-geist), var(--font-inter), sans-serif",
                letterSpacing: "-0.01em",
                color: "var(--text-primary)",
                cursor: "pointer",
                transition: "all 0.15s ease",
                boxShadow: "none"
              }}
              title="Click to view Autopay details and execution history"
            >
              <span>Next Autopay In <TopAutopayCountdown targetTime={topAutopayDetails?.schedule?.next_execution_at || activeSchedule.nextPaymentAt} isExecuting={isExecutingDue} executionState={executionState} /></span>
              <ChevronDown style={{ width: 12, height: 12, transform: showAutopayDrawer ? "rotate(180deg)" : "none", transition: "transform 0.2s ease" }} />
            </button>
          </div>
        )}
      </div>

      {/* Floating iPhone Style Pop-down Slide Banner (Zero movement in chat thread) */}
      <AnimatePresence>
        {showAutopayDrawer && activeSchedule && (
          <>
            {/* Full invisible click-away backdrop */}
            <div
              onClick={() => setShowAutopayDrawer(false)}
              style={{
                position: "absolute",
                inset: 0,
                zIndex: 48,
                background: "transparent"
              }}
            />

            {/* Clean luxury backdrop blur matching dark/light theme */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              style={{
                position: "absolute",
                top: 90,
                left: 0,
                right: 0,
                bottom: 0,
                zIndex: 48,
                pointerEvents: "none",
                backdropFilter: "blur(8px)",
                WebkitBackdropFilter: "blur(8px)",
                background: "transparent",
              }}
            />

            {/* Centered Floating Pop-down Container (Guaranteed middle alignment) */}
            <div
              style={{
                position: "absolute",
                top: 98,
                left: 0,
                right: 0,
                display: "flex",
                justifyContent: "center",
                zIndex: 50,
                pointerEvents: "none"
              }}
            >
              <motion.div
                initial={{ opacity: 0, y: -14, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.96 }}
                transition={{ type: "spring", stiffness: 450, damping: 32 }}
                style={{
                  width: "calc(100% - 32px)",
                  maxWidth: 480,
                  pointerEvents: "auto"
                }}
              >
                <AutopaySlideDrawer
                  schedule={activeSchedule}
                  details={topAutopayDetails}
                  chatUser={activeChatUser}
                  isExecuting={isExecutingDue}
                  executionState={executionState}
                  isDue={isDue}
                  onTriggerNow={handleTriggerDue}
                  onCancel={async (pid, sid) => {
                    setCancellingPaymentIds(prev => ({ ...prev, [pid]: true }));
                    try {
                      await cancelAutoPay(pid, sid);
                      setTopAutopayDetails(null);
                      setShowAutopayDrawer(false);
                      if (typeof window !== 'undefined') {
                        window.dispatchEvent(new CustomEvent('arc_autopay_updated'));
                      }
                    } finally {
                      setCancellingPaymentIds(prev => ({ ...prev, [pid]: false }));
                    }
                  }}
                  onClose={() => setShowAutopayDrawer(false)}
                  isCancelling={!!cancellingPaymentIds[activeSchedule.id]}
                />
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>

      {activeCenterTab === "chat" ? (
        <>
          {/* Internal Search Overlay */}
          {isSearchingInside && (
            <div style={{ background: "var(--surface)", padding: "8px 16px", borderBottom: "1px solid var(--border-soft)", display: "flex", gap: 10, alignItems: "center" }}>
              <input
                type="text"
                placeholder="Search inside chat..."
                value={searchInsideQuery}
                onChange={(e) => setSearchInsideQuery(e.target.value)}
                className="lf-input"
                style={{ height: 32, padding: "4px 12px", borderRadius: 8, fontSize: 12 }}
              />
              <button
                onClick={() => { setIsSearchingInside(false); setSearchInsideQuery(""); }}
                className="lf-btn-ghost"
                style={{ padding: "4px 10px", fontSize: 11 }}
              >
                Close
              </button>
            </div>
          )}


            {/* Message Thread */}

            <div
              className="chat-thread-scroll"
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                position: "relative"
              }}
            >
              {!isInitialLoadComplete ? (
                <ChatMessageThreadSkeleton />
              ) : filteredMessages.length === 0 ? (
                <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: "32px 16px", textAlign: "center" }}>
                  <div style={{ width: 48, height: 48, borderRadius: "50%", background: "var(--surface-soft, rgba(0,0,0,0.04))", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-secondary)" }}>
                    <MessageSquare style={{ width: 22, height: 22, opacity: 0.7 }} />
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text)" }}>
                    No messages yet
                  </div>
                  <div style={{ fontSize: 13, color: "var(--text-secondary)", maxWidth: 280, lineHeight: 1.4 }}>
                    Start the conversation or send a payment using the buttons below.
                  </div>
                </div>
              ) : (
                <Virtuoso
                  scrollerRef={(ref) => { threadContainerRef.current = ref as any; }}
                  onScroll={handleThreadScroll}
                  style={{ flex: 1, scrollbarWidth: "none", msOverflowStyle: "none" }}
                  data={filteredMessages}
                  firstItemIndex={Math.max(0, 1000000 - filteredMessages.length)}
                  initialTopMostItemIndex={filteredMessages.length > 0 ? 1000000 - 1 : 0}
                  alignToBottom={true}
                  followOutput="auto"
                  startReached={() => {
                    if (activeChatUser && address) {
                      const lowerMy = address.toLowerCase();
                      const lowerTheir = activeChatUser.address.toLowerCase();
                      const convoId = lowerMy < lowerTheir ? `${lowerMy}_${lowerTheir}` : `${lowerTheir}_${lowerMy}`;
                      if (hasMoreMessages[convoId] !== false && !isMessagesLoading[convoId]) {
                        fetchMessages(address, activeChatUser.address, true);
                      }
                    }
                  }}
                  context={{ isMessagesLoading, address, activeChatUser }}
                  components={{
                    Header: ChatHeader,
                    Footer: ChatFooter
                  }}
                  itemContent={(index, msg) => {
                    if (isAutopayScheduleMsg(msg)) {
                      return null;
                    }
                    const isMe = msg.sender.toLowerCase() === address?.toLowerCase();
                    const repliedMsgObj = msg.replyTo ? messages.find(m => m.id === msg.replyTo) : null;
                    const rawMatchedPayment = msg.paymentId ? payments.find(p => p.id === msg.paymentId) : null;
                    const isUnconfirmed = rawMatchedPayment && (rawMatchedPayment.status === 'pending' || !rawMatchedPayment.txHash);
                    if (msg.paymentId && (!rawMatchedPayment || isUnconfirmed) && !requestedPaymentIdsRef.current.has(msg.paymentId)) {
                      requestedPaymentIdsRef.current.add(msg.paymentId);
                      fetchPaymentById(msg.paymentId);
                    }
                    const fallbackMatchedPayment = (!rawMatchedPayment && msg.paymentId && msg.body)
                      ? parsePaymentFromBody(msg.body, msg.paymentId, msg.createdAt)
                      : null;
                    let matchedPayment = rawMatchedPayment || fallbackMatchedPayment;
                    if (matchedPayment) {
                      const effectiveHash = matchedPayment.txHash || (msg as any).txHash;
                      if (effectiveHash && typeof effectiveHash === 'string' && effectiveHash.startsWith('0x')) {
                        matchedPayment = { ...matchedPayment, txHash: effectiveHash, status: 'confirmed' };
                      }
                    }
                    if (matchedPayment && typeof window !== 'undefined' && matchedPayment.id) {
                      try {
                        const cancelledList = JSON.parse(localStorage.getItem('arc_cancelled_autopay_ids') || '[]');
                        if (Array.isArray(cancelledList) && cancelledList.includes(matchedPayment.id)) {
                          matchedPayment = { ...matchedPayment, status: 'cancelled' as const, active: false };
                        }
                      } catch { }
                    }

                    if (matchedPayment && matchedPayment.isRecurring && matchedPayment.status !== 'confirmed' && !msg.body?.startsWith('Sent ') && !msg.body?.toLowerCase().includes('via autopay')) {
                      return null;
                    }

                    const renderMsgActions = (align: "left" | "right") => (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 2,
                          padding: "2px 4px",
                          borderRadius: 9999,
                          background: "var(--surface)",
                          border: "1px solid var(--border)",
                          boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
                          opacity: showMsgActions === msg.id ? 1 : 0,
                          pointerEvents: showMsgActions === msg.id ? "auto" : "none",
                          transform: showMsgActions === msg.id
                            ? "scale(1) translateX(0)"
                            : (align === "left" ? "scale(0.92) translateX(4px)" : "scale(0.92) translateX(-4px)"),
                          transition: "opacity 0.15s ease, transform 0.15s ease",
                          flexShrink: 0
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => setReplyingMsg(msg)}
                          title="Reply"
                          style={{
                            width: 24,
                            height: 24,
                            borderRadius: "50%",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            color: "var(--text-secondary)",
                            transition: "all 0.15s ease"
                          }}
                        >
                          <Reply style={{ width: 12, height: 12 }} />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (msg.paymentId && matchedPayment) {
                              const paymentDetails = [
                                `💸 Arc Payment Receipt`,
                                `Amount   : ${matchedPayment.amount} ${matchedPayment.token?.startsWith("EURC") ? "EURC" : "USDC"}`,
                                `Status   : ${matchedPayment.status.toUpperCase()}`,
                                `Type     : ${matchedPayment.isRecurring ? `Recurring (${matchedPayment.recurringInterval})` : "One-time"}`,
                                `Date     : ${new Date(matchedPayment.createdAt).toLocaleDateString()}`,
                                `Time     : ${new Date(matchedPayment.createdAt).toLocaleTimeString()}`,
                                `From     : ${matchedPayment.sender}`,
                                `To       : ${matchedPayment.receiver}`,
                                matchedPayment.txHash ? `Tx Hash  : ${matchedPayment.txHash}` : null,
                                matchedPayment.txHash ? `Explorer : ${matchedPayment.token === "USDC-1439" ? `https://testnet.blockscout.injective.network/tx/${matchedPayment.txHash}` : (matchedPayment.token === "USDC-8453" ? `https://basescan.org/tx/${matchedPayment.txHash}` : (matchedPayment.token?.includes("4663") ? `https://robinhoodchain.blockscout.com/tx/${matchedPayment.txHash}` : (matchedPayment.token?.includes("MAINNET") ? `https://arc-mainnet.cloud.blockscout.com/tx/${matchedPayment.txHash}` : `https://testnet.arcscan.app/tx/${matchedPayment.txHash}`)))}` : null,
                                matchedPayment.description ? `Note     : ${matchedPayment.description}` : null,
                              ].filter(Boolean).join("\n");
                              navigator.clipboard.writeText(paymentDetails);
                            } else {
                              navigator.clipboard.writeText(msg.body);
                            }
                            setCopiedMsgId(msg.id);
                            setTimeout(() => setCopiedMsgId(null), 1500);
                          }}
                          title={copiedMsgId === msg.id ? "Copied!" : "Copy"}
                          style={{
                            width: 24,
                            height: 24,
                            borderRadius: "50%",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            color: copiedMsgId === msg.id ? "#10b981" : "var(--text-secondary)",
                            transition: "all 0.15s ease"
                          }}
                        >
                          {copiedMsgId === msg.id ? <Check style={{ width: 12, height: 12, color: "#10b981" }} /> : <Copy style={{ width: 12, height: 12 }} />}
                        </button>
                        <button
                          type="button"
                          onClick={() => setMsgDeleteTarget({ id: msg.id, isMe: isMe, isPayment: !!msg.paymentId })}
                          title="Delete"
                          style={{
                            width: 24,
                            height: 24,
                            borderRadius: "50%",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            color: "var(--danger)",
                            transition: "all 0.15s ease"
                          }}
                        >
                          <Trash style={{ width: 12, height: 12 }} />
                        </button>
                      </div>
                    );

                    return (
                      <div
                        style={{
                          padding: "3px 10px",
                          paddingRight: "10px",
                          display: "flex",
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: isMe ? "flex-end" : "flex-start",
                          gap: 8,
                          position: "relative",
                          width: "100%"
                        }}
                        onMouseEnter={() => setShowMsgActions(msg.id)}
                        onMouseLeave={() => setShowMsgActions(null)}
                      >
                        {isMe && renderMsgActions("left")}
                        <motion.div
                          key={msg.id}
                          initial={{ opacity: 0, y: 15 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ type: "spring", stiffness: 350, damping: 25 }}
                          style={{
                            maxWidth: "75%",
                            display: "flex",
                            flexDirection: "column",
                            alignItems: isMe ? "flex-end" : "flex-start",
                            position: "relative",
                            transformOrigin: isMe ? "bottom right" : "bottom left"
                          }}
                        >
                          {/* Message Reply block inside message bubble */}
                          {repliedMsgObj && (
                            <div style={{
                              background: "rgba(0,0,0,0.05)",
                              padding: "4px 8px",
                              borderRadius: "8px 8px 0 0",
                              fontSize: 10,
                              color: "var(--text-muted)",
                              borderLeft: "2px solid var(--accent-red)",
                              width: "100%",
                              marginBottom: -4,
                              opacity: 0.8
                            }}>
                              <strong>Replying to:</strong> {repliedMsgObj.body}
                            </div>
                          )}

                          {/* Message Card Body */}
                          <div
                            data-msg-id={msg.id}
                            data-sender={msg.sender}
                            className={!isMe && !msg.seen ? "unseen-message" : ""}
                            style={{
                              background: msg.paymentId ? "var(--surface)" : isMe ? "var(--surface-soft)" : "var(--surface)",
                              backgroundRepeat: "no-repeat",
                              color: "var(--text-primary)",
                              padding: msg.mediaUrl ? "4px" : msg.paymentId ? "10px 12px 6px" : "10px 14px",
                              borderRadius: msg.mediaUrl ? "14px" : isMe ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
                              boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
                              border: "1px solid var(--border)",
                              position: "relative"
                            }}
                          >
                            {/* Media Image Attachment */}
                            {msg.mediaUrl && (
                              <div style={{ position: "relative" }}>
                                <img
                                  src={msg.mediaUrl}
                                  alt=""
                                  style={{
                                    maxWidth: 240,
                                    maxHeight: 200,
                                    borderRadius: 12,
                                    display: "block",
                                    objectFit: "cover"
                                  }}
                                />
                                {msg.body && msg.body !== "[Photo]" && msg.body !== "[Photo Upload]" && (
                                  <p style={{ margin: "8px 10px 4px 10px", fontSize: 13 }}>{msg.body}</p>
                                )}
                              </div>
                            )}

                            {/* Standard Message Text (rendered when no payment card) */}
                            {!msg.mediaUrl && !matchedPayment && (
                              <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.4, wordBreak: "break-word" }}>{msg.body}</p>
                            )}

                            {/* Payment Card Bubble UI (rendered only when confirmed or for one-time payments) */}
                            {!msg.mediaUrl && matchedPayment && (!matchedPayment.isRecurring || matchedPayment.status === 'confirmed' || msg.body?.startsWith('Sent ')) && (() => {
                              const isAutopayPayment = Boolean(
                                matchedPayment.isRecurring ||
                                msg.body?.toLowerCase().includes('autopay') ||
                                matchedPayment.description?.toLowerCase().includes('autopay')
                              );

                              const rawName = activeChatUser
                                ? (customContacts?.[activeChatUser.address?.toLowerCase()]?.name || activeChatUser.name || "")
                                : "";
                              const shortName = rawName ? (rawName.split(" ")[0] || rawName) : "";
                              const topLabel = isMe
                                ? (shortName ? `Payment to ${shortName}` : "Payment sent")
                                : "Payment to you";

                              const networkShort =
                                matchedPayment.token === "USDC-1439" ? "Injective" :
                                matchedPayment.token === "USDC-8453" ? "Base" :
                                matchedPayment.token?.includes("4663") ? "Robinhood" :
                                matchedPayment.token?.includes("MAINNET") ? "Arc Main" : "Arc Test";

                              const effectiveTxHash = matchedPayment.txHash || (msg as any).txHash;
                              const txUrl = effectiveTxHash && typeof effectiveTxHash === 'string' && effectiveTxHash.startsWith("0x")
                                ? (matchedPayment.token === "USDC-1439" ? `https://testnet.blockscout.injective.network/tx/${effectiveTxHash}` :
                                   matchedPayment.token === "USDC-8453" ? `https://basescan.org/tx/${effectiveTxHash}` :
                                   matchedPayment.token?.includes("4663") ? `https://robinhoodchain.blockscout.com/tx/${effectiveTxHash}` :
                                   matchedPayment.token?.includes("MAINNET") ? `https://arc-mainnet.cloud.blockscout.com/tx/${effectiveTxHash}` :
                                   `https://testnet.arcscan.app/tx/${effectiveTxHash}`)
                                : null;

                              return (
                                <div style={{
                                  display: "flex",
                                  flexDirection: "column",
                                  width: isMobile ? 195 : 210,
                                  boxSizing: "border-box",
                                  padding: "2px 2px",
                                }}>
                                  {/* Row 1: Header (Payment to you / Payment to {name}) + optional Autopay badge */}
                                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, marginBottom: 4 }}>
                                    <span
                                      style={{
                                        fontSize: 12,
                                        fontWeight: 500,
                                        color: "var(--text-muted)",
                                        whiteSpace: "nowrap",
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                        lineHeight: 1.2
                                      }}
                                      title={topLabel}
                                    >
                                      {topLabel}
                                    </span>
                                    {isAutopayPayment && (
                                      <span style={{
                                        color: "#2563eb",
                                        fontSize: 10.5,
                                        fontWeight: 700,
                                        letterSpacing: "-0.01em",
                                        whiteSpace: "nowrap",
                                        flexShrink: 0
                                      }}>
                                        Autopay
                                      </span>
                                    )}
                                  </div>

                                  {/* Row 2: Amount with sleek token icon */}
                                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                                    <div style={{
                                      position: "relative",
                                      width: 22,
                                      height: 22,
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      flexShrink: 0
                                    }}>
                                      {matchedPayment.token?.startsWith('EURC') ? <EurcLogo size={22} /> : <UsdcLogo size={22} />}
                                    </div>
                                    <span style={{
                                      fontSize: 22,
                                      fontWeight: 800,
                                      color: "var(--text-primary)",
                                      letterSpacing: "-0.02em",
                                      lineHeight: 1.15,
                                      whiteSpace: "nowrap",
                                      overflow: "hidden",
                                      textOverflow: "ellipsis"
                                    }}>
                                      {matchedPayment.amount} {matchedPayment.token?.startsWith("EURC") ? "EURC" : "USDC"}
                                    </span>
                                  </div>

                                  {/* Optional Note (only if custom user note) */}
                                  {matchedPayment.description &&
                                    !matchedPayment.description.startsWith("Autopay") &&
                                    !matchedPayment.description.startsWith("Scheduled") && (
                                    <div style={{
                                      fontSize: 11,
                                      fontWeight: 500,
                                      color: "var(--text-secondary)",
                                      fontStyle: "italic",
                                      marginBottom: 6,
                                      whiteSpace: "nowrap",
                                      overflow: "hidden",
                                      textOverflow: "ellipsis"
                                    }}>
                                      &quot;{matchedPayment.description}&quot;
                                    </div>
                                  )}

                                  {/* Row 3: Status & Network + View link (GPay style single clean row) */}
                                  <div style={{
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                    gap: 6,
                                    paddingTop: 7,
                                    borderTop: "1px solid var(--border-soft)",
                                    whiteSpace: "nowrap"
                                  }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0 }}>
                                      {matchedPayment.status === "confirmed" ? (
                                        <div style={{ width: 14, height: 14, borderRadius: "50%", background: "#22c55e", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                          <Check style={{ width: 9, height: 9, color: "#fff", strokeWidth: 3 }} />
                                        </div>
                                      ) : matchedPayment.status === "failed" ? (
                                        <div style={{ width: 14, height: 14, borderRadius: "50%", background: "#ef4444", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                          <X style={{ width: 9, height: 9, color: "#fff", strokeWidth: 3 }} />
                                        </div>
                                      ) : (
                                        <div style={{ width: 14, height: 14, borderRadius: "50%", background: "var(--surface-soft, rgba(255, 255, 255, 0.08))", border: "1px solid var(--border, rgba(255, 255, 255, 0.2))", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                          <Loader2 style={{ width: 9, height: 9, color: "var(--text-secondary, #a1a1aa)", animation: "spin 1s linear infinite" }} />
                                        </div>
                                      )}
                                      <span style={{
                                        fontSize: 11,
                                        fontWeight: 600,
                                        color: matchedPayment.status === "confirmed" ? "#22c55e" : matchedPayment.status === "failed" ? "#ef4444" : "var(--text-secondary)",
                                        whiteSpace: "nowrap"
                                      }}>
                                        {matchedPayment.status === "confirmed" ? "Paid" : matchedPayment.status === "failed" ? "Failed" : "Pending"}
                                      </span>
                                      <span style={{ fontSize: 10, color: "var(--text-muted)", opacity: 0.4 }}>•</span>
                                      <span style={{ fontSize: 10.5, color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                        {networkShort}
                                      </span>
                                    </div>

                                    {txUrl ? (
                                      <a
                                        href={txUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        style={{
                                          color: "var(--text-muted)",
                                          textDecoration: "none",
                                          display: "flex",
                                          alignItems: "center",
                                          gap: 1,
                                          fontWeight: 600,
                                          fontSize: 10.5,
                                          whiteSpace: "nowrap",
                                          flexShrink: 0
                                        }}
                                        className="hover:text-[var(--text-primary)] transition-colors"
                                        title="View Transaction"
                                      >
                                        <span>View</span>
                                        <ChevronRight style={{ width: 11, height: 11 }} />
                                      </a>
                                    ) : (
                                      <ChevronRight style={{ width: 12, height: 12, color: "var(--text-muted)", opacity: 0.5, flexShrink: 0 }} />
                                    )}
                                  </div>
                                </div>
                              );
                            })()}

                            {/* Timestamp & Read Receipt */}
                            <div style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "flex-end",
                              gap: 4,
                              marginTop: 4,
                              fontSize: 10,
                              color: "var(--text-muted)",
                            }}>
                              <span>{new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                              {isMe && (
                                <span style={{ display: "flex", alignItems: "center", marginLeft: 2 }}>
                                  {msg.seen ? (
                                    <CheckCheck style={{ width: 14, height: 14, color: "#3b82f6" }} />
                                  ) : (
                                    <Check style={{ width: 14, height: 14, opacity: 0.7 }} />
                                  )}
                                </span>
                              )}
                            </div>
                          </div>

                        </motion.div>
                        {!isMe && renderMsgActions("right")}
                      </div>
                    );
                  }}
                />
              )}

              {/* Clear chat confirm popup */}
              {typeof document !== 'undefined' && createPortal(
                <AnimatePresence>
                  {showClearConfirm && currentChatObj && (
                    <motion.div
                      key="clear-chat-modal"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      style={{
                        position: "fixed",
                        inset: 0,
                        backgroundColor: "rgba(0,0,0,0.65)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        zIndex: 999999,
                        backdropFilter: "blur(8px)",
                        WebkitBackdropFilter: "blur(8px)"
                      }}
                      onClick={() => setShowClearConfirm(false)}
                    >
                      <div
                        className="lf-card arc-premium-coating"
                        style={{ width: "90%", maxWidth: 360, padding: 24, textAlign: "center", animation: "popIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)" }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div style={{ width: 48, height: 48, borderRadius: "50%", background: "rgba(239, 68, 68, 0.1)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
                          <Trash style={{ width: 24, height: 24, color: "#ef4444" }} />
                        </div>
                        <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 8px 0" }}>Clear Chat History?</h3>
                        <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 20px 0" }}>
                          This will permanently delete all messages in this chat for all. The profile will remain in your contacts.
                        </p>
                        <div style={{ display: "flex", gap: 12 }}>
                          <button onClick={() => setShowClearConfirm(false)} className="lf-btn-ghost" style={{ flex: 1, padding: "10px 0" }}>Cancel</button>
                          <button
                            onClick={() => {
                              setShowClearConfirm(false);
                              deleteConversationHistory(activeChatUser.address, true, false);
                              setShowMenuOptions(false);
                            }}
                            className="lf-btn-primary"
                            style={{ flex: 1, padding: "10px 0", background: "#ef4444", color: "#fff", border: "none" }}
                          >
                            Clear Messages
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>,
                document.body
              )}

              {/* Modal message delete confirm popup */}
              {typeof document !== 'undefined' && createPortal(
                <AnimatePresence>
                  {msgDeleteTarget && (
                    <motion.div
                      key="msg-delete-modal"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      style={{
                        position: "fixed",
                        inset: 0,
                        zIndex: 999999,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: "rgba(0,0,0,0.65)",
                        backdropFilter: "blur(8px)",
                        WebkitBackdropFilter: "blur(8px)"
                      }}
                      onClick={() => setMsgDeleteTarget(null)}
                    >
                      <motion.div
                        initial={{ scale: 0.96 }}
                        animate={{ scale: 1 }}
                        exit={{ scale: 0.96 }}
                        transition={{ duration: 0.15, ease: "easeOut" }}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                          if (e.key === "Escape") setMsgDeleteTarget(null);
                        }}
                        role="dialog"
                        aria-modal="true"
                        style={{
                          background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: "24px", width: "90%", maxWidth: 360, boxShadow: "0 12px 40px rgba(0,0,0,0.5)", display: "flex", flexDirection: "column", gap: 16
                        }}
                      >
                        <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>
                          {msgDeleteTarget.isPayment ? "Hide Payment Message" : "Delete Message"}
                        </div>
                        <p style={{ fontSize: 14, color: "var(--text-muted)", margin: 0, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                          {msgDeleteTarget.isPayment
                            ? "This payment message will only be removed from your conversation.\n\nBlockchain records and payment history will remain unchanged."
                            : msgDeleteTarget.isMe
                              ? "This message will be permanently deleted for everyone.\n\nThis action cannot be undone."
                              : "This message will only be removed from your conversation.\n\nThe sender will still be able to see it."}
                        </p>
                        <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
                          <button
                            autoFocus
                            onClick={() => setMsgDeleteTarget(null)}
                            style={{ flex: 1, padding: "10px 0", borderRadius: 8, border: "none", background: "var(--border-soft)", color: "var(--text-primary)", fontSize: 14, fontWeight: 600, cursor: "pointer", transition: "background 0.15s" }}
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => { deleteMessage(msgDeleteTarget.id, msgDeleteTarget.isMe); setMsgDeleteTarget(null); }}
                            style={{ flex: 1, padding: "10px 0", borderRadius: 8, border: "none", background: "#ef4444", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", transition: "background 0.15s" }}
                          >
                            Delete
                          </button>
                        </div>
                      </motion.div>
                    </motion.div>
                  )}
                </AnimatePresence>,
                document.body
              )}
            </div>

          {/* Replying details overlay */}
          {replyingMsg && (
            <div style={{ background: "var(--surface)", padding: "8px 16px", borderTop: "1px solid var(--border-soft)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 11, borderLeft: "2px solid var(--accent-red)", paddingLeft: 8 }}>
                <span style={{ color: "var(--text-muted)" }}>Replying to:</span> {replyingMsg.body}
              </div>
              <button onClick={() => setReplyingMsg(null)} style={{ background: "none", border: "none", cursor: "pointer", padding: 2 }}>
                <X style={{ width: 14, height: 14 }} />
              </button>
            </div>
          )}


          {/* Emoji Preset Picker */}
          {showEmojiPicker && (
            <div style={{ position: "absolute", bottom: 60, left: 16, background: "var(--surface)", padding: 8, borderRadius: 12, border: "1px solid var(--border)", display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 6, zIndex: 30, boxShadow: "0 10px 20px rgba(0,0,0,0.1)" }}>
              {["😀", "😂", "🥰", "😎", "🤔", "🙄", "🔥", "❤️", "👍", "🚀", "🎉", "💩"].map(e => (
                <button
                  key={e}
                  onClick={() => { setInputVal(p => p + e); setShowEmojiPicker(false); }}
                  style={{ fontSize: 18, background: "none", border: "none", cursor: "pointer", padding: 4 }}
                >
                  {e}
                </button>
              ))}
            </div>
          )}

          {/* Input panel */}
          <div style={{ padding: isMobile ? "6px 12px calc(max(8px, env(safe-area-inset-bottom))) 12px" : "12px 16px 24px 16px", background: "transparent", borderTop: "none", display: "flex", gap: 10, alignItems: "center", flexShrink: 0 }}>

            {/* Unified Pay Button with Upside Slide-up Options Menu */}
            <div ref={payMenuRef} style={{ position: "relative", flexShrink: 0 }}>
              <AnimatePresence>
                {showPayMenu && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                    style={{
                      position: "absolute",
                      bottom: "calc(100% + 10px)",
                      left: 0,
                      zIndex: 60,
                      minWidth: 160,
                      background: "var(--surface, #18181b)",
                      borderRadius: 14,
                      border: "1px solid var(--border)",
                      padding: "6px",
                      boxShadow: "none",
                      backdropFilter: "blur(12px)",
                      display: "flex",
                      flexDirection: "column",
                      gap: 2
                    }}
                  >
                    {/* Option 1: One-time Pay */}
                    <button
                      type="button"
                      onClick={() => {
                        setShowPayMenu(false);
                        onOpenPay();
                      }}
                      style={{
                        width: "100%",
                        padding: "9px 14px",
                        borderRadius: 10,
                        border: "none",
                        background: "transparent",
                        cursor: "pointer",
                        textAlign: "left",
                        fontSize: 13,
                        fontWeight: 600,
                        color: "var(--text-primary)",
                        transition: "background 0.15s ease"
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = "var(--surface-hover, rgba(255,255,255,0.08))")}
                      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                    >
                      One-time Pay
                    </button>

                    {/* Option 2: Autopay */}
                    {onOpenAutopaySetup && (
                      <button
                        type="button"
                        onClick={() => {
                          setShowPayMenu(false);
                          if (activeSchedule) {
                            setShowAutopayDrawer(prev => !prev);
                          } else {
                            onOpenAutopaySetup();
                          }
                        }}
                        style={{
                          width: "100%",
                          padding: "9px 14px",
                          borderRadius: 10,
                          border: "none",
                          background: "transparent",
                          cursor: "pointer",
                          textAlign: "left",
                          fontSize: 13,
                          fontWeight: 600,
                          color: "var(--text-primary)",
                          transition: "background 0.15s ease"
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = "var(--surface-hover, rgba(255,255,255,0.08))")}
                        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                      >
                        Auto Pay
                      </button>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Single Trigger Pay Button */}
              <button
                type="button"
                onClick={() => setShowPayMenu(prev => !prev)}
                title="Pay Options"
                style={{
                  padding: "0 18px",
                  height: 42,
                  fontSize: 14,
                  fontWeight: 600,
                  borderRadius: 24,
                  background: "#0a56d0",
                  color: "#ffffff",
                  border: "none",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  flexShrink: 0,
                  boxShadow: showPayMenu ? "0 0 0 3px rgba(10, 86, 208, 0.25)" : "none",
                  transition: "all 0.15s ease"
                }}
              >
                <span>Pay</span>
                <ChevronDown
                  style={{
                    width: 14,
                    height: 14,
                    transform: showPayMenu ? "rotate(0deg)" : "rotate(180deg)",
                    transition: "transform 0.2s ease"
                  }}
                />
              </button>
            </div>

            {/* Input Pill Area */}
            <div style={{
              flex: 1,
              minWidth: 0,
              display: "flex",
              alignItems: "center",
              background: "var(--bg)",
              borderRadius: 24,
              padding: "4px 8px",
              border: "1px solid var(--border-soft)"
            }}>

              {/* Emojis Trigger */}
              <button
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                style={{ background: "none", border: "none", cursor: "pointer", padding: "6px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
              >
                <Smile style={{ width: 22, height: 22, color: "var(--text-muted)" }} />
              </button>

              {/* Text Input */}
              <input
                ref={inputRef}
                type="text"
                maxLength={2000}
                placeholder="Message..."
                value={inputVal}
                onChange={(e) => handleInputChange(e.target.value.slice(0, 2000))}
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                style={{
                  flex: 1,
                  minWidth: 0,
                  height: 34,
                  background: "transparent",
                  border: "none",
                  outline: "none",
                  fontSize: 15,
                  color: "var(--text-primary)",
                  padding: "0 8px"
                }}
              />
              {inputVal.length > 1500 && (
                <span style={{ fontSize: 10, color: inputVal.length >= 2000 ? 'var(--accent-red)' : 'var(--text-muted)', fontFamily: 'monospace', paddingRight: 8 }}>
                  {inputVal.length}/2000
                </span>
              )}

              {/* Send Trigger inside the pill */}
              <button
                onClick={handleSend}
                disabled={!inputVal.trim() && imagePreviews.length === 0}
                style={{
                  background: "none",
                  border: "none",
                  cursor: (inputVal.trim() || imagePreviews.length > 0) ? "pointer" : "default",
                  padding: "8px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: (inputVal.trim() || imagePreviews.length > 0) ? 1 : 0.4,
                  flexShrink: 0
                }}
              >
                <SendHorizontal style={{ width: 20, height: 20, color: "var(--text-primary)" }} strokeWidth={1.5} />
              </button>
            </div>
          </div>
        </>
      ) : (isLedgerInitialLoading && paginatedLedger.length === 0 && filteredPayments.length === 0) ? (
        <PaymentsHistoryFullSkeleton />
      ) : (
        // Gorgeous Centered Payments History Ledger View
        <div className="chat-history-container" style={{ flex: 1, overflowY: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Top Check Statement Button */}
          <div style={{ display: "flex", justifyContent: "center", width: "100%", padding: "4px 0" }}>
            <button
              onClick={() => setShowStatement(true)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                padding: "8px 18px",
                fontSize: 13,
                fontWeight: 600,
                background: "var(--surface, #ffffff)",
                color: "var(--text-primary, #0f172a)",
                border: "1px solid var(--border, #e2e8f0)",
                borderRadius: 9999,
                cursor: "pointer",
                boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05), 0 1px 2px rgba(0, 0, 0, 0.03)",
                transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-1px)";
                e.currentTarget.style.boxShadow = "0 4px 12px rgba(10, 86, 208, 0.12), 0 2px 4px rgba(0, 0, 0, 0.04)";
                e.currentTarget.style.borderColor = "rgba(10, 86, 208, 0.35)";
                e.currentTarget.style.color = "#0a56d0";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = "0 1px 3px rgba(0, 0, 0, 0.05), 0 1px 2px rgba(0, 0, 0, 0.03)";
                e.currentTarget.style.borderColor = "var(--border, #e2e8f0)";
                e.currentTarget.style.color = "var(--text-primary, #0f172a)";
              }}
            >
              <Calendar style={{ width: 14, height: 14, color: "#0a56d0" }} />
              <span>Check Statement</span>
            </button>
          </div>

          {/* Sub Filter Segmented Controls */}
          <div className="chat-ledger-filter-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <h4 style={{ fontSize: 13, fontWeight: 800, color: "var(--text-primary)", margin: 0 }}>Transaction Ledger</h4>

            <div className="chat-pill-tabs-bar" style={{ display: "flex", background: "var(--surface-soft, #f1f5f9)", borderRadius: 9999, padding: 3, border: "1px solid var(--border, #e2e8f0)", boxShadow: "0 1px 2px rgba(0,0,0,0.02)" }}>
              {[
                { id: "all", label: "All Records" },
                { id: "sent", label: "Sent" },
                { id: "received", label: "Received" },
                { id: "scheduled", label: "Auto-Pays" }
              ].map(f => (
                <button
                  key={f.id}
                  onClick={() => setPayFilter(f.id as any)}
                  className="chat-pill-tab-btn"
                  style={{
                    padding: "5px 12px",
                    fontSize: 11,
                    fontWeight: payFilter === f.id ? 700 : 500,
                    borderRadius: 9999,
                    border: payFilter === f.id ? "1px solid rgba(0, 0, 0, 0.08)" : "1px solid transparent",
                    cursor: "pointer",
                    background: payFilter === f.id ? "var(--surface, #ffffff)" : "transparent",
                    color: payFilter === f.id ? "var(--text-primary, #0f172a)" : "var(--text-secondary, #64748b)",
                    boxShadow: payFilter === f.id ? "0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.04)" : "none",
                    transition: "all 0.15s"
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Transaction Stream — grouped by date, newest first */}
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {payFilter === "scheduled" ? (
              <AutopayLedgerView
                recipientAddress={activeChatUser?.address}
                recipientName={activeChatUser ? (customContacts[activeChatUser.address.toLowerCase()]?.name || activeChatUser.name) : ""}
                senderAddress={address}
                activeScheduleFallback={topAutopayDetails?.schedule || activeAutopaySchedule}
                onOpenSetup={onOpenAutopaySetup}
              />
            ) : isLedgerInitialLoading && paginatedLedger.length === 0 ? (
              <PaymentsLedgerSkeleton />
            ) : (() => {
              // Authoritative source: backend /api/chat/payments pagination stream
              const activeLedgerItems = paginatedLedger;
              if (activeLedgerItems.length === 0) {
                return (
                  <div style={{ textAlign: "center", padding: "60px 20px", background: "var(--surface)", border: "1px dashed var(--border)", borderRadius: 16, color: "var(--text-muted)" }}>
                    <Clock style={{ width: 32, height: 32, opacity: 0.3, marginBottom: 12, marginLeft: "auto", marginRight: "auto" }} />
                    <div style={{ fontSize: 12, fontWeight: 600 }}>No transaction history found under this filter.</div>
                  </div>
                );
              }

              const getDayLabel = (ts: number) => {
                const d = new Date(ts);
                const today = new Date();
                const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
                if (d.toDateString() === today.toDateString()) return "Today";
                if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
                return d.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric", year: d.getFullYear() !== today.getFullYear() ? "numeric" : undefined });
              };

              // Group payments by day label in order
              const groups: { label: string; items: typeof activeLedgerItems }[] = [];
              activeLedgerItems.forEach(p => {
                const label = getDayLabel(p.createdAt);
                const last = groups[groups.length - 1];
                if (last && last.label === label) last.items.push(p);
                else groups.push({ label, items: [p] });
              });

              return (
                <>
                  {groups.map(group => (
                    <div key={group.label}>
                      {/* Date section header */}
                      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "18px 0 8px 0" }}>
                        <span style={{ fontSize: 11, fontWeight: 800, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", whiteSpace: "nowrap" }}>{group.label}</span>
                        <div style={{ flex: 1, height: 1, background: "var(--border-soft)" }} />
                      </div>

                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {group.items.map(p => {
                          const isMeSender = address && p.sender?.toLowerCase() === address.toLowerCase();

                          // Skip schedule placeholders in transaction history (they belong in Auto-Pays tab)
                          const isPlaceholder = Boolean(p.isRecurring && p.nextPaymentAt && !p.txHash && p.status !== 'failed');
                          if (isPlaceholder) return null;

                          return (
                            <div
                              key={p.id}
                              className="chat-tx-row"
                              style={{
                                background: "var(--surface)",
                                border: "1px solid var(--border)",
                                borderRadius: 12,
                                padding: "10px 14px",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                gap: 10,
                                transition: "transform 0.15s, box-shadow 0.15s"
                              }}
                            >
                              <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: 1 }}>
                                <div className="chat-tx-icon" style={{ flexShrink: 0 }}>
                                  {isMeSender ? (
                                    <SendIconBadge size={30} />
                                  ) : (
                                    <ReceiveIconBadge size={30} />
                                  )}
                                </div>
                                <div style={{ minWidth: 0, flex: 1, overflow: "hidden" }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "nowrap", overflow: "hidden" }}>
                                    <span className="chat-tx-title" style={{ fontSize: 13, fontWeight: 800, color: "var(--text-primary)", whiteSpace: "nowrap", flexShrink: 0 }}>
                                      {isMeSender ? "Sent" : "Received"}
                                    </span>
                                    {p.isRecurring && (
                                      <span style={{ fontSize: 9, fontWeight: 700, color: "#2563eb", background: "rgba(37, 99, 235, 0.08)", padding: "1px 5px", borderRadius: 4, whiteSpace: "nowrap", flexShrink: 0 }}>Autopay</span>
                                    )}
                                    <span style={{ fontSize: 10, color: "var(--text-muted)", whiteSpace: "nowrap", flexShrink: 0 }}>
                                      {new Date(p.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                                    </span>
                                    {p.description && (
                                      <span className="chat-tx-desc-inline" style={{ fontSize: 11, color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
                                        · {p.description}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                              <div style={{ display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap", flexShrink: 0 }}>
                                <span className="chat-tx-status" style={{
                                  fontSize: 11,
                                  fontWeight: 700,
                                  color: p.status === "confirmed" ? "#2563eb" : (p.status === "failed" || p.status === "cancelled" ? "#dc2626" : "var(--text-secondary, #71717a)")
                                }}>
                                  {p.status === "confirmed" ? "Confirmed" : (p.status === "failed" ? "Failed" : (p.status === "cancelled" ? "Cancelled" : "Pending"))}
                                </span>
                                <span className="chat-tx-amount" style={{ fontSize: 13.5, fontWeight: 900, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: 3 }}>
                                  {isMeSender ? "-" : "+"}{Number(p.amount).toFixed(2)} {p.token === 'EURC' ? <EurcLogo size={12} /> : <UsdcLogo size={12} />}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}

                  {/* Progressive Loading Skeleton Shimmer */}
                  {isLedgerLoadingMore && (
                    <div style={{ marginTop: 12 }}>
                      <PaymentHistorySkeleton count={2} />
                    </div>
                  )}

                  {/* Intersection Sentinel & Load More Trigger */}
                  {hasMoreLedger && (
                    <div
                      ref={ledgerSentinelRef}
                      style={{
                        padding: "16px 0 8px 0",
                        display: "flex",
                        justifyContent: "center",
                        alignItems: "center"
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => fetchBackendLedger(true)}
                        disabled={isLedgerLoadingMore}
                        style={{
                          background: "var(--surface)",
                          border: "1px solid var(--border)",
                          borderRadius: 9999,
                          padding: "7px 18px",
                          fontSize: 11,
                          fontWeight: 700,
                          color: "var(--text-secondary)",
                          cursor: isLedgerLoadingMore ? "default" : "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          boxShadow: "0 1px 2px rgba(0,0,0,0.03)"
                        }}
                      >
                        <RefreshCw size={12} className={isLedgerLoadingMore ? "animate-spin" : ""} />
                        <span>
                          {isLedgerLoadingMore
                            ? "Loading next 10 records from database..."
                            : `Load More Records (${Math.max(0, ledgerTotalCount - paginatedLedger.length)} remaining)`}
                        </span>
                      </button>
                    </div>
                  )}

                  {!hasMoreLedger && paginatedLedger.length > 10 && (
                    <div style={{ textAlign: "center", padding: "18px 0 6px 0", fontSize: 11, fontWeight: 600, color: "var(--text-muted)" }}>
                      ✓ All {paginatedLedger.length} transaction records loaded
                    </div>
                  )}
                </>
              );
            })()}
          </div>

        </div>
      )}

      {/* Get Statement Modal */}
      {showStatement && (() => {
        const myAddr = address?.toLowerCase() || "";
        const contactName = activeChatUser?.name || activeChatUser?.address?.substring(0, 8) || "Contact";
        const lines = [
          `ArcFun Payment Statement`,
          `Generated: ${new Date().toLocaleString()}`,
          `Contact: ${contactName}`,
          `Wallet:  ${activeChatUser?.address || ""}`,
          ``,
          `-`.repeat(48),
          `SUMMARY`,
          `-`.repeat(48),
          `USDC Total Vol: ${stats.USDC.total.toFixed(2)} USDC`,
          `USDC Sent     : ${stats.USDC.sent.toFixed(2)} USDC`,
          `USDC Received : ${stats.USDC.received.toFixed(2)} USDC`,
          `USDC Pending  : ${stats.USDC.pending.toFixed(2)} USDC`,
          ...(stats.EURC.total > 0 ? [
            ``,
            `EURC Total Vol: ${stats.EURC.total.toFixed(2)} EURC`,
            `EURC Sent     : ${stats.EURC.sent.toFixed(2)} EURC`,
            `EURC Received : ${stats.EURC.received.toFixed(2)} EURC`,
            `EURC Pending  : ${stats.EURC.pending.toFixed(2)} EURC`,
          ] : []),
          ``,
          `-`.repeat(48),
          `TRANSACTION LOG`,
          `-`.repeat(48),
          ...chatPayments.filter(p => !p.isRecurring).map(p => {
            const dir = p.sender?.toLowerCase() === myAddr ? "SENT    " : "RECEIVED";
            const date = new Date(p.createdAt).toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" });
            const note = p.description ? ` | ${p.description}` : "";
            return `${dir} | ${date} | ${Number(p.amount).toFixed(2)} ${p.token || 'USDC'} | ${p.status.toUpperCase()}${note}`;
          }),
          ``,
          `-`.repeat(48),
          `AUTO-PAY SCHEDULES`,
          `-`.repeat(48),
          ...chatPayments.filter(p => p.isRecurring).map(p =>
            `${p.amount} ${p.token || 'USDC'} / ${p.recurringInterval} | ${p.active ? "Active" : "Paused"}${p.description ? ` | ${p.description}` : ""}`
          ),
        ].join("\n");

        if (typeof document === 'undefined') return null;

        return createPortal(
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.65)",
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
              zIndex: 999999,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 20
            }}
            onClick={() => setShowStatement(false)}
          >
            <div
              style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: 24, maxWidth: 580, width: "100%", maxHeight: "80vh", display: "flex", flexDirection: "column", gap: 14, boxShadow: "0 24px 60px rgba(0,0,0,0.5)" }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <h3 style={{ fontSize: 15, fontWeight: 800, color: "var(--text-primary)", margin: 0 }}>Payment Statement</h3>
                  <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "4px 0 0 0" }}>{contactName}</p>
                </div>
                <button onClick={() => setShowStatement(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)" }}>
                  <X style={{ width: 18, height: 18 }} />
                </button>
              </div>

              <pre style={{ flex: 1, overflowY: "auto", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 10, padding: 16, fontSize: 10.5, lineHeight: 1.7, color: "var(--text-primary)", fontFamily: "monospace", whiteSpace: "pre-wrap", wordBreak: "break-all", margin: 0 }}>
                {lines}
              </pre>

              <div style={{ display: "flex", gap: 10 }}>
                <button
                  onClick={() => { navigator.clipboard.writeText(lines); }}
                  className="lf-btn-ghost"
                  style={{ flex: 1, fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
                >
                  <Copy style={{ width: 13, height: 13 }} />
                  Copy to Clipboard
                </button>
                <button
                  onClick={() => {
                    const blob = new Blob([lines], { type: "text/plain" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `statement-${contactName.replace(/\s+/g, "-")}-${Date.now()}.txt`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                  className="cyber-button"
                  style={{ flex: 1, height: 34, padding: "0 12px", fontSize: 12 }}
                >
                  <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                    <ExternalLink style={{ width: 13, height: 13 }} />
                    Download .txt
                  </span>
                </button>
              </div>
            </div>
          </div>,
          document.body
        );
      })()}
    </div>
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// COLLAPSIBLE PROFILE PANEL (RIGHT)
// ─────────────────────────────────────────────────────────────────────────────
function ProfilePanel({
  onClose,
  customContacts,
  arcStatsCache,
  onOpenAutopayDashboard
}: {
  onClose: () => void;
  customContacts: Record<string, { name?: string; colorIndex?: number }>;
  arcStatsCache?: React.MutableRefObject<Record<string, ArcAccountStats>>;
  onOpenAutopayDashboard?: () => void;
}) {
  const { address } = useAccount();
  const { mode } = useEnvironment();
  const { activeChatUser, payments } = useChat();
  const [arcStats, setArcStats] = useState<ArcAccountStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [profileTab, setProfileTab] = useState<"details" | "payments">("details");


  const [payFilter, setPayFilter] = useState<"all" | "today" | "week" | "month">("all");
  const [expandedPayId, setExpandedPayId] = useState<string | null>(null);
  const contactAlias = activeChatUser ? (customContacts[activeChatUser.address.toLowerCase()]?.name || activeChatUser.name) : '';
  const contactColorIndex = activeChatUser ? customContacts[activeChatUser.address.toLowerCase()]?.colorIndex : undefined;

  // Combined payment records between my wallet and activeChatUser
  const chatPayments = useMemo(() => {
    if (!activeChatUser || !address) return [];
    const myAddr = address.toLowerCase();
    const otherAddr = activeChatUser.address.toLowerCase();
    return payments.filter(
      p =>
        p && p.sender && p.receiver &&
        ((p.sender.toLowerCase() === myAddr && p.receiver.toLowerCase() === otherAddr) ||
          (p.sender.toLowerCase() === otherAddr && p.receiver.toLowerCase() === myAddr))
    );
  }, [payments, activeChatUser, address]);

  // Statistics calculation for Dashboard
  const stats = useMemo(() => {
    const emptyStats = () => ({ sent: 0, received: 0, pending: 0, total: 0 });
    const result = { USDC: emptyStats(), EURC: emptyStats() };
    if (!address) return result;
    const myAddr = address.toLowerCase();

    chatPayments.forEach(p => {
      const amt = Number(p.amount) || 0;
      if (p.isRecurring) return; // recurring are schedules, not confirmed payments

      const token = p.token === "EURC" ? "EURC" : "USDC";

      if (p.status === "pending") {
        result[token].pending += amt;
      } else if (p.status === "confirmed") {
        if (p.sender?.toLowerCase() === myAddr) {
          result[token].sent += amt;
        } else {
          result[token].received += amt;
        }
      }
    });

    result.USDC.total = result.USDC.sent + result.USDC.received;
    result.EURC.total = result.EURC.sent + result.EURC.received;

    return result;
  }, [chatPayments, address]);

  // Filtered lists for the sub-filter
  const filteredPayments = useMemo(() => {
    if (!address) return [];

    const now = Date.now();
    const todayStart = new Date().setHours(0, 0, 0, 0);
    const weekStart = todayStart - 7 * 24 * 60 * 60 * 1000;
    const monthStart = todayStart - 30 * 24 * 60 * 60 * 1000;

    return chatPayments.filter(p => {
      if (payFilter === "today") return p.createdAt >= todayStart;
      if (payFilter === "week") return p.createdAt >= weekStart;
      if (payFilter === "month") return p.createdAt >= monthStart;
      return true; // "all"
    }).sort((a, b) => b.createdAt - a.createdAt);
  }, [chatPayments, payFilter, address]);

  // Progressive 10-item pagination for profile payments (billion-user dApp scale)
  const PROFILE_PAGE_SIZE = 10;
  const [profileVisibleCount, setProfileVisibleCount] = useState(PROFILE_PAGE_SIZE);
  const [isProfileLoadingMore, setIsProfileLoadingMore] = useState(false);
  const profileSentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setProfileVisibleCount(PROFILE_PAGE_SIZE);
    setIsProfileLoadingMore(false);
  }, [payFilter, activeChatUser?.address]);

  useEffect(() => {
    const sentinel = profileSentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (first && first.isIntersecting && !isProfileLoadingMore) {
          if (filteredPayments.length > profileVisibleCount) {
            setIsProfileLoadingMore(true);
            setTimeout(() => {
              setProfileVisibleCount(prev => prev + PROFILE_PAGE_SIZE);
              setIsProfileLoadingMore(false);
            }, 300);
          }
        }
      },
      { root: null, rootMargin: "100px", threshold: 0.1 }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [profileVisibleCount, isProfileLoadingMore, filteredPayments.length]);

  if (!activeChatUser) return null;

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Profile Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", borderBottom: "1px solid var(--border-soft)" }}>
        <h3 style={{ fontSize: 14, fontWeight: 800, color: "var(--text-primary)", margin: 0 }}>Info</h3>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)" }}>
          <X style={{ width: 16, height: 16 }} />
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 2, padding: "8px 16px 0 16px" }}>
        {[
          { id: "details", label: "Profile" },
          { id: "payments", label: "Payments" }
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setProfileTab(t.id as any)}
            style={{
              flex: 1,
              padding: "6px 0",
              borderBottom: profileTab === t.id ? "2px solid var(--accent-red)" : "2px solid transparent",
              color: profileTab === t.id ? "var(--text-primary)" : "var(--text-muted)",
              fontSize: 12,
              fontWeight: 600,
              background: "none",
              border: "none",
              cursor: "pointer"
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content Stream */}
      <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
        {profileTab === "details" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {/* Identity Card */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 8 }}>
              {activeChatUser.photoUrl ? (
                <img src={activeChatUser.photoUrl} alt="" style={{ width: 72, height: 72, borderRadius: "50%", objectFit: "cover", border: "2px solid var(--border)" }} />
              ) : (
                <div style={{ background: getGradientForAddress(activeChatUser.address), width: 72, height: 72, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 24, border: "2px solid var(--border)" }}>
                  {activeChatUser.name.substring(0, 2).toUpperCase()}
                </div>
              )}
              <div>
                <h4 style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>{contactAlias}</h4>
                <p style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "monospace", margin: "4px 0 0 0", wordBreak: "break-all" }}>{activeChatUser.address}</p>
              </div>
            </div>

            {/* Social Links */}
            {(activeChatUser.twitterId || activeChatUser.telegramId) && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, background: "var(--bg)", padding: 12, borderRadius: 12, border: "1px solid var(--border-soft)" }}>
                {activeChatUser.twitterId && (
                  <a href={`https://x.com/${activeChatUser.twitterId}`} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", justifyItems: "center", gap: 6, fontSize: 11, color: "var(--text-secondary)", textDecoration: "none" }}>
                    <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
                    @{activeChatUser.twitterId}
                  </a>
                )}
                {activeChatUser.telegramId && (
                  <a href={`https://t.me/${activeChatUser.telegramId}`} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", justifyItems: "center", gap: 6, fontSize: 11, color: "var(--text-secondary)", textDecoration: "none" }}>
                    <span>tg:</span> @{activeChatUser.telegramId}
                  </a>
                )}
              </div>
            )}

            {/* Arc statistics details */}
            <div>
              <p style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8, paddingLeft: 4 }}>
                {mode === 'mainnet' ? 'Arc Mainnet Score' : 'Arc Testnet Score'}
              </p>
              {loadingStats ? (
                <div style={{ padding: 12, textAlign: "center", fontSize: 11, color: "var(--text-muted)" }}>
                  Loading stats...
                </div>
              ) : arcStats ? (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <div style={{ background: "var(--bg)", padding: 8, borderRadius: 8, border: "1px solid var(--border-soft)", gridColumn: "span 2" }}>
                    <div style={{ fontSize: 8, color: "var(--text-muted)", textTransform: "uppercase" }}>{mode === 'mainnet' ? 'Arc Mainnet Balance' : 'Arc Testnet Balance'}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, marginTop: 2, color: "var(--accent-red)", display: "flex", alignItems: "center", gap: 4 }}>
                      {arcStats?.balance ? (parseFloat(arcStats.balance) / 1e6).toLocaleString("en-US", { maximumFractionDigits: 2 }) : "0.00"} USDC
                    </div>
                  </div>
                  <div style={{ background: "var(--bg)", padding: 8, borderRadius: 8, border: "1px solid var(--border-soft)" }}>
                    <div style={{ fontSize: 8, color: "var(--text-muted)", textTransform: "uppercase" }}>Total Txs</div>
                    <div style={{ fontSize: 13, fontWeight: 700, marginTop: 2 }}>{arcStats.txCount + arcStats.receivedTxCount}</div>
                  </div>
                  <div style={{ background: "var(--bg)", padding: 8, borderRadius: 8, border: "1px solid var(--border-soft)" }}>
                    <div style={{ fontSize: 8, color: "var(--text-muted)", textTransform: "uppercase" }}>Streak</div>
                    <div style={{ fontSize: 13, fontWeight: 700, marginTop: 2 }}>{arcStats.dayStreak} Days</div>
                  </div>
                  <div style={{ background: "var(--bg)", padding: 8, borderRadius: 8, border: "1px solid var(--border-soft)" }}>
                    <div style={{ fontSize: 8, color: "var(--text-muted)", textTransform: "uppercase" }}>Active Weeks</div>
                    <div style={{ fontSize: 13, fontWeight: 700, marginTop: 2 }}>{arcStats.activeWeeks} Weeks</div>
                  </div>
                  <div style={{ background: "var(--bg)", padding: 8, borderRadius: 8, border: "1px solid var(--border-soft)" }}>
                    <div style={{ fontSize: 8, color: "var(--text-muted)", textTransform: "uppercase" }}>Created</div>
                    <div style={{ fontSize: 10, fontWeight: 700, marginTop: 4 }}>{arcStats.firstTxDate ? new Date(arcStats.firstTxDate).toLocaleDateString([], { month: "short", year: "numeric" }) : "—"}</div>
                  </div>
                </div>
              ) : (
                <div style={{ padding: 12, background: "var(--bg)", borderRadius: 8, fontSize: 10, color: "var(--text-muted)", textAlign: "center" }}>
                  No statistics available for this address.
                </div>
              )}
            </div>

            {/* General Action buttons */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8, borderTop: "1px solid var(--border-soft)", paddingTop: 16 }}>
              <a
                href={mode === 'mainnet' ? `https://arc-mainnet.cloud.blockscout.com/address/${activeChatUser.address}` : `https://testnet.arcscan.app/address/${activeChatUser.address}`}
                target="_blank"
                rel="noopener noreferrer"
                className="lf-btn-ghost"
                style={{ width: "100%", fontSize: 11, textDecoration: "none", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
              >
                <ExternalLink style={{ width: 12, height: 12 }} />
                View on ArcScan {mode === 'mainnet' ? 'Mainnet' : 'Testnet'}
              </a>
            </div>
          </div>
        ) : (
          /* Comprehensive Payments Dashboard */
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {onOpenAutopayDashboard && (
              <button
                type="button"
                onClick={onOpenAutopayDashboard}
                style={{
                  width: "100%",
                  padding: "11px 16px",
                  borderRadius: 14,
                  background: "var(--surface-soft)",
                  border: "1px solid var(--border)",
                  color: "var(--text-primary)",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  transition: "all 0.15s"
                }}
                onMouseEnter={e => e.currentTarget.style.background = "var(--surface-hover)"}
                onMouseLeave={e => e.currentTarget.style.background = "var(--surface-soft)"}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Repeat style={{ width: 15, height: 15 }} />
                  <span>Autopay Recurring Payments</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--text-muted)" }}>
                  <span>Manage</span>
                  <ChevronRight style={{ width: 13, height: 13 }} />
                </div>
              </button>
            )}

            {/* Total stats card at top */}
            <div style={{
              background: "linear-gradient(135deg, var(--border-soft) 0%, rgba(179, 0, 0, 0.04) 100%)",
              border: "1px solid var(--border)",
              borderRadius: 14,
              padding: "14px 16px",
              display: "flex",
              flexDirection: "column",
              gap: 10
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Total Volume</span>
                <span style={{ fontSize: 16, fontWeight: 900, color: "var(--accent-red)", display: "flex", alignItems: "center", gap: 4 }}>
                  {stats.USDC.total.toFixed(2)} <UsdcLogo size={13} />
                  {stats.EURC.total > 0 && <span style={{ display: "flex", alignItems: "center", gap: 4, marginLeft: 6 }}>{stats.EURC.total.toFixed(2)} <EurcLogo size={13} /></span>}
                </span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, borderTop: "1px solid var(--border-soft)", paddingTop: 10 }}>
                <div>
                  <div style={{ fontSize: 8, color: "var(--text-muted)" }}>SENT</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-primary)", marginTop: 2 }}>{stats.USDC.sent.toFixed(2)}</div>
                  {stats.EURC.sent > 0 && <div style={{ fontSize: 9, fontWeight: 700, color: "var(--text-muted)", marginTop: 2 }}>{stats.EURC.sent.toFixed(2)} EURC</div>}
                </div>
                <div>
                  <div style={{ fontSize: 8, color: "var(--text-muted)" }}>RECEIVED</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#10b981", marginTop: 2 }}>{stats.USDC.received.toFixed(2)}</div>
                  {stats.EURC.received > 0 && <div style={{ fontSize: 9, fontWeight: 700, color: "var(--text-muted)", marginTop: 2 }}>{stats.EURC.received.toFixed(2)} EURC</div>}
                </div>
                <div>
                  <div style={{ fontSize: 8, color: "var(--text-muted)" }}>PENDING</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--accent-red)", marginTop: 2 }}>{stats.USDC.pending.toFixed(2)}</div>
                  {stats.EURC.pending > 0 && <div style={{ fontSize: 9, fontWeight: 700, color: "var(--text-muted)", marginTop: 2 }}>{stats.EURC.pending.toFixed(2)} EURC</div>}
                </div>
              </div>
            </div>

            {/* Sub Filter Segmented Controls */}
            <div style={{ display: "flex", background: "var(--bg)", borderRadius: 10, padding: 3, border: "1px solid var(--border-soft)" }}>
              {[
                { id: "all", label: "All Time" },
                { id: "today", label: "Today" },
                { id: "week", label: "This Week" },
                { id: "month", label: "This Month" }
              ].map(f => (
                <button
                  key={f.id}
                  onClick={() => setPayFilter(f.id as any)}
                  style={{
                    flex: 1,
                    padding: "6px 0",
                    fontSize: 9.5,
                    fontWeight: 700,
                    borderRadius: 7,
                    border: "none",
                    cursor: "pointer",
                    background: payFilter === f.id ? "var(--surface)" : "transparent",
                    color: payFilter === f.id ? "var(--text-primary)" : "var(--text-muted)",
                    boxShadow: payFilter === f.id ? "0 2px 6px rgba(0,0,0,0.06)" : "none",
                    transition: "all 0.2s"
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* List of Payments */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {filteredPayments.length === 0 ? (
                <div style={{ textAlign: "center", padding: "40px 10px", color: "var(--text-muted)" }}>
                  <Clock style={{ width: 24, height: 24, opacity: 0.3, marginBottom: 8, marginLeft: "auto", marginRight: "auto" }} />
                  <div style={{ fontSize: 11 }}>No transactions in this filter.</div>
                </div>
              ) : (() => {
                const visibleProfilePayments = filteredPayments.slice(0, profileVisibleCount);
                const hasMoreProfile = filteredPayments.length > profileVisibleCount;

                return (
                  <>
                    {visibleProfilePayments.map(p => {
                      const isMeSender = address && p.sender?.toLowerCase() === address.toLowerCase();
                      const isExpanded = expandedPayId === p.id;

                      // Skip schedule placeholders (isRecurring with nextPaymentAt awaiting run) — shown in Auto-Pays tab
                      const isPlaceholder = Boolean(p.isRecurring && p.nextPaymentAt && !p.txHash && p.status !== 'failed');
                      if (isPlaceholder) return null;

                      return (
                        <div
                          key={p.id}
                          onClick={() => setExpandedPayId(isExpanded ? null : p.id)}
                          style={{
                            background: "var(--surface)",
                            border: "1px solid var(--border-soft)",
                            borderRadius: 12,
                            padding: 12,
                            display: "flex",
                            flexDirection: "column",
                            gap: 12,
                            cursor: "pointer",
                            transition: "all 0.2s ease"
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                            <div style={{
                              position: "relative",
                              background: isMeSender ? "rgba(239, 68, 68, 0.08)" : "rgba(16, 185, 129, 0.08)",
                              color: isMeSender ? "#ef4444" : "#10b981",
                              borderRadius: "50%",
                              width: 36,
                              height: 36,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              flexShrink: 0
                            }}>
                              {isMeSender ? <ArrowRight style={{ width: 16, height: 16 }} /> : <ArrowLeft style={{ width: 16, height: 16 }} />}
                              <img
                                src={p.token === "USDC-1439" ? "/icons/injective.png" : (p.token === "USDC-8453" ? "/icons/base.svg" : (p.token?.includes("4663") ? "/icons/robinhood.png" : "/arc-logo.png"))}
                                alt="Network"
                                style={{
                                  position: "absolute",
                                  bottom: -3,
                                  right: -3,
                                  width: 14,
                                  height: 14,
                                  borderRadius: "50%",
                                  border: "1.5px solid var(--background)",
                                  objectFit: "cover"
                                }}
                              />
                            </div>

                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>
                                  {isMeSender ? `Sent to ${activeChatUser.name}` : `Received from ${activeChatUser.name}`}
                                </span>
                                <span style={{ fontSize: 14, fontWeight: 800, color: isMeSender ? "var(--text-primary)" : "#10b981" }}>
                                  {isMeSender ? "-" : "+"}{Number(p.amount).toFixed(2)} {p.token?.startsWith("EURC") ? "EURC" : "USDC"}
                                </span>
                              </div>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                                <span style={{ fontSize: 11, color: "var(--text-muted)", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap", maxWidth: "60%" }}>
                                  {p.description || "Payment"}
                                </span>
                                <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
                                  {new Date(p.createdAt).toLocaleDateString([], { month: "short", day: "numeric" })}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Expanded Content GPay style */}
                          {isExpanded && (
                            <div style={{
                              borderTop: "1px dashed var(--border-soft)",
                              paddingTop: 12,
                              marginTop: 4,
                              display: "flex",
                              flexDirection: "column",
                              gap: 10
                            }}>
                              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                                <span style={{ color: "var(--text-muted)" }}>Time</span>
                                <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{new Date(p.createdAt).toLocaleTimeString()}</span>
                              </div>
                              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                                <span style={{ color: "var(--text-muted)" }}>Status</span>
                                <span style={{ fontWeight: 600, color: p.status === "confirmed" ? "#10b981" : "var(--accent-red)" }}>{p.status.toUpperCase()}</span>
                              </div>
                              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                                <span style={{ color: "var(--text-muted)" }}>From</span>
                                <span style={{ fontFamily: "monospace", color: "var(--text-primary)" }}>{p.sender.slice(0, 6)}...{p.sender.slice(-4)}</span>
                              </div>
                              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                                <span style={{ color: "var(--text-muted)" }}>To</span>
                                <span style={{ fontFamily: "monospace", color: "var(--text-primary)" }}>{p.receiver.slice(0, 6)}...{p.receiver.slice(-4)}</span>
                              </div>

                              {p.txHash && p.txHash.startsWith("0x") && (
                                <a
                                  href={p.token === "USDC-1439" ? `https://testnet.blockscout.injective.network/tx/${p.txHash}` : (p.token === "USDC-8453" ? `https://basescan.org/tx/${p.txHash}` : (p.token?.includes("4663") ? `https://robinhoodchain.blockscout.com/tx/${p.txHash}` : (p.token?.includes("MAINNET") || mode === "mainnet" ? `https://arc-mainnet.cloud.blockscout.com/tx/${p.txHash}` : `https://testnet.arcscan.app/tx/${p.txHash}`)))}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="lf-btn-ghost"
                                  style={{
                                    marginTop: 8,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    gap: 6,
                                    padding: "8px 0",
                                    fontSize: 11,
                                    textDecoration: "none",
                                    border: "1px solid var(--border)",
                                    borderRadius: 8
                                  }}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <ExternalLink style={{ width: 12, height: 12 }} />
                                  View on ArcScan Explorer
                                </a>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Shimmer layout skeleton during loading more */}
                    {isProfileLoadingMore && (
                      <div style={{ marginTop: 8 }}>
                        <PaymentHistorySkeleton count={2} />
                      </div>
                    )}

                    {/* Sentinel element and fallback button */}
                    {hasMoreProfile && (
                      <div
                        ref={profileSentinelRef}
                        style={{
                          padding: "12px 0 4px 0",
                          display: "flex",
                          justifyContent: "center",
                          alignItems: "center"
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setIsProfileLoadingMore(true);
                            setTimeout(() => {
                              setProfileVisibleCount(prev => prev + PROFILE_PAGE_SIZE);
                              setIsProfileLoadingMore(false);
                            }, 300);
                          }}
                          disabled={isProfileLoadingMore}
                          style={{
                            background: "var(--surface)",
                            border: "1px solid var(--border-soft)",
                            borderRadius: 9999,
                            padding: "6px 14px",
                            fontSize: 10.5,
                            fontWeight: 700,
                            color: "var(--text-secondary)",
                            cursor: isProfileLoadingMore ? "default" : "pointer",
                            display: "flex",
                            alignItems: "center",
                            gap: 5
                          }}
                        >
                          <RefreshCw size={11} className={isProfileLoadingMore ? "animate-spin" : ""} />
                          <span>
                            {isProfileLoadingMore
                              ? "Loading next 10..."
                              : `Load More (${filteredPayments.length - visibleProfilePayments.length} left)`}
                          </span>
                        </button>
                      </div>
                    )}

                    {!hasMoreProfile && filteredPayments.length > PROFILE_PAGE_SIZE && (
                      <div style={{ textAlign: "center", padding: "14px 0 4px 0", fontSize: 10.5, fontWeight: 600, color: "var(--text-muted)" }}>
                        ✓ All {filteredPayments.length} records loaded
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AUTOPAY CARD WITH REALTIME COUNTDOWN
// ─────────────────────────────────────────────────────────────────────────────
function AutoPayCard({ payment }: { payment: Payment }) {
  const { toggleAutoPay, cancelAutoPay } = useChat();
  const [timeLeft, setTimeLeft] = useState("");

  useEffect(() => {
    if (!payment.nextPaymentAt) return;

    const updateTime = () => {
      const diff = payment.nextPaymentAt! - Date.now();
      if (diff <= 0) {
        setTimeLeft("Payment Due");
        return;
      }
      const days = Math.floor(diff / (24 * 60 * 60 * 1000));
      const hours = Math.floor((diff % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
      const minutes = Math.floor((diff % (60 * 60 * 1000)) / (60 * 1000));
      const seconds = Math.floor((diff % (60 * 1000)) / 1000);

      setTimeLeft(`${days > 0 ? `${days}d ` : ''}${hours}h ${minutes}m ${seconds}s`);
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [payment]);

  return (
    <div
      className="lf-card"
      style={{
        padding: 12,
        background: "var(--bg)",
        border: "1px solid var(--border-soft)",
        display: "flex",
        flexDirection: "column",
        gap: 8
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: 4 }}>
          {payment.amount} {payment.token === 'EURC' ? <EurcLogo size={11} /> : <UsdcLogo size={11} />} / {payment.recurringInterval}
        </span>
        <span style={{
          fontSize: 8,
          fontWeight: 700,
          padding: "2px 6px",
          borderRadius: 8,
          background: payment.active
            ? "rgba(34,197,94,0.12)"
            : (payment.status === 'confirmed' ? "rgba(34,197,94,0.12)" : payment.status === 'cancelled' ? "rgba(100,116,139,0.12)" : "rgba(179, 0, 0,0.12)"),
          color: payment.active
            ? "#22c55e"
            : (payment.status === 'confirmed' ? "#22c55e" : payment.status === 'cancelled' ? "var(--text-muted)" : "#b30000")
        }}>
          {payment.active
            ? "Active"
            : (payment.status === 'confirmed' ? "Completed" : payment.status === 'cancelled' ? "Cancelled" : "Paused")}
        </span>
      </div>

      {payment.description && (
        <p style={{ fontSize: 10, color: "var(--text-muted)", margin: 0 }}>
          "{payment.description}"
        </p>
      )}

      {payment.active && payment.nextPaymentAt && (
        <div style={{ background: "rgba(0,0,0,0.03)", padding: 6, borderRadius: 6, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 9, color: "var(--text-muted)" }}>Next payment:</span>
          <span style={{ fontSize: 9, fontWeight: 700, color: "var(--accent-red)" }}>{timeLeft}</span>
        </div>
      )}

      {payment.status !== 'confirmed' && payment.status !== 'cancelled' && (
        <div style={{ display: "flex", gap: 6, borderTop: "1px solid var(--border-soft)", paddingTop: 8, marginTop: 4 }}>
          <button
            onClick={() => toggleAutoPay(payment.id, !payment.active)}
            className="lf-btn-ghost"
            style={{ flex: 1, fontSize: 10, padding: "4px 0", height: 26 }}
          >
            {payment.active ? <Pause style={{ width: 10, height: 10, marginRight: 4 }} /> : <Play style={{ width: 10, height: 10, marginRight: 4 }} />}
            {payment.active ? "Pause" : "Resume"}
          </button>
          <button
            onClick={() => cancelAutoPay(payment.id)}
            className="lf-btn-ghost"
            style={{ flex: 1, fontSize: 10, padding: "4px 0", color: "var(--danger)", border: "1px solid rgba(239, 68, 68, 0.2)", height: 26 }}
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PAY MODAL COMPONENT (FLOW)
// ─────────────────────────────────────────────────────────────────────────────

function PayPanel({
  onClose,
  customContacts,
  onOpenAutopaySetup
}: {
  onClose: () => void;
  customContacts: Record<string, { name?: string; colorIndex?: number }>;
  onOpenAutopaySetup?: () => void;
}) {
  const { activeChatUser, sendPayment, payments } = useChat();
  const { address, connector } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const { mode } = useEnvironment();
  const [localBalance, setLocalBalance] = useState<number | null>(null);
  const wagmiPublicClient = usePublicClient();

  const [baseNetwork, setBaseNetwork] = useState<"Arc Testnet" | "Injective EVM Testnet" | "">("");
  const [mainnetNetwork, setMainnetNetwork] = useState<"Arc Mainnet" | "Base Mainnet" | "Robinhood Mainnet" | "">("");
  const [baseAsset, setBaseAsset] = useState<string>("");

  const selectedNetwork = mode === "mainnet" ? mainnetNetwork : baseNetwork;
  const selectedAsset = baseAsset;

  const setSelectedNetwork = (n: string) => {
    if (mode === "mainnet") setMainnetNetwork(n as any);
    else setBaseNetwork(n as any);
  };
  const setSelectedAsset = setBaseAsset;

  const [isFetchingBalance, setIsFetchingBalance] = useState(false);
  const [showSourceSelector, setShowSourceSelector] = useState(false);
  const [isAssetDropdownOpen, setIsAssetDropdownOpen] = useState(false);
  const [isNetworkDropdownOpen, setIsNetworkDropdownOpen] = useState(false);

  // fetchDynamicBalance is defined below — we need a ref so initDcw can call it
  const fetchBalanceRef = useRef<((addr?: string) => void) | null>(null);

  // Track the last requested combination to prevent duplicate RPC calls
  const lastFetchKey = useRef<string>("");
  const lastManualRefreshTime = useRef<number>(0);

  const handleManualRefreshBalance = async () => {
    const now = Date.now();
    if (now - lastManualRefreshTime.current < 5000) return; // 5s rate limit
    lastManualRefreshTime.current = now;
    lastFetchKey.current = ""; // Reset dedup key to force fetch
    await fetchDynamicBalance();
  };

  const fetchDynamicBalance = useCallback(async (overrideAddress?: string) => {
    const targetAddress = overrideAddress ?? address;
    if (!targetAddress) {
      setLocalBalance(0);
      return;
    }

    const currentKey = `${targetAddress}-${selectedAsset}-${selectedNetwork}`;
    if (lastFetchKey.current === currentKey) {
      return; // Skip duplicate fetch
    }
    lastFetchKey.current = currentKey;

    setIsFetchingBalance(true);
    try {
      if (selectedNetwork.includes("Solana")) {
        setLocalBalance(0);
        return;
      }

      const conf = CROSS_CHAIN_REGISTRY[selectedNetwork as string];
      if (!conf) { setLocalBalance(0); return; }

      const assetAddr = conf[selectedAsset as "USDC" | "EURC"];
      if (!conf.rpc || !assetAddr || assetAddr === "0x0") { setLocalBalance(0); return; }

      // Build a minimal chain object so Viem can correctly encode/decode RPC responses
      const chainId = CHAIN_ID_MAP[selectedNetwork];
      const viemChain = chainId ? { id: chainId, name: selectedNetwork, nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [conf.rpc] } } } : undefined;

      await withEvmFailover(selectedNetwork, conf.rpc, async (rpcUrl) => {
        const pc = createPublicClient({
          chain: viemChain as any,
          transport: http(rpcUrl, {
            timeout: 5000,
            retryCount: 2,
            retryDelay: 300,
            batch: true
          })
        });
        const b = await pc.readContract({
          address: assetAddr as `0x${string}`,
          abi: ERC20_APPROVE_ABI,
          functionName: "balanceOf",
          args: [targetAddress as `0x${string}`]
        });
        const decimals = selectedAsset === "USDe" ? 18 : 6;
        setLocalBalance(Number(formatUnits(b as bigint, decimals)));
      }, "chatManagerPayPanel");
    } catch (e) {
      console.error("Failed dynamic balance fetch", e);
      lastFetchKey.current = ""; // Reset on error so it can retry
      setLocalBalance(0);
    } finally {
      setIsFetchingBalance(false);
    }
  }, [selectedAsset, selectedNetwork, address]);

  // Keep the ref in sync so initDcw can invoke it synchronously after resolving dcwAddress
  useEffect(() => {
    fetchBalanceRef.current = fetchDynamicBalance;
  }, [fetchDynamicBalance]);

  // Re-fetch whenever network, asset, or wallet source changes with a small debounce to prevent request spam
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchDynamicBalance();
    }, 100);
    return () => clearTimeout(timer);
  }, [fetchDynamicBalance]);

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringInterval, setRecurringInterval] = useState<"daily" | "weekly" | "monthly">("weekly");
  const [isConfirmingTx, setIsConfirmingTx] = useState(false);
  const [createdPaymentId, setCreatedPaymentId] = useState<string | null>(null);

  const amtNum = parseFloat(amount) || 0;
  const userBalance = localBalance || 0;

  const { data: gasPrice } = useGasPrice({
    query: { enabled: step === 2 && !!address }, // Only fetch when on confirmation step
  });
  const estimatedGasFee = gasPrice ? Number(formatEther(gasPrice * BigInt(65000))) : 0.001;

  const todayPayments = payments ? payments.filter((p: any) => p.sender === address?.toLowerCase() && p.createdAt > Date.now() - 86400000).length : 0;
  const paymentLimitReached = !isAdmin(address) && todayPayments >= 10;

  const handleCreatePendingPay = async () => {
    if (amtNum <= 0) {
      alert("Please enter a valid amount.");
      return;
    }
    if (paymentLimitReached) {
      alert("Daily payment limit reached.");
      return;
    }
    if (amtNum > userBalance) {
      alert(`Insufficient wallet balance. You have ${userBalance.toFixed(2)} ${selectedNetwork === "Injective EVM Testnet" ? "USDC" : selectedAsset}.`);
      return;
    }

    setStep(2); // Move to Review & Sign screen
  };

  const handleTriggerWalletTx = async () => {
    if (!activeChatUser) return;
    setIsConfirmingTx(true);
    try {
      let txId = "";

      // Connected EVM Wallet via Wagmi
      const conf = CROSS_CHAIN_REGISTRY[selectedNetwork as string];
      const assetAddr = conf ? conf[selectedAsset as "USDC" | "EURC"] : null;
      if (!assetAddr || assetAddr === "0x0") throw new Error(`Token contract not found for ${selectedAsset} on ${selectedNetwork}`);

      const requiredChainId = CHAIN_ID_MAP[selectedNetwork as string];
      if (chainId !== requiredChainId) {
        await switchChainAsync({ chainId: requiredChainId });
      }

      const txDecimals = selectedAsset === "USDe" ? 18 : 6;
      txId = await writeContractAsync({
        address: assetAddr as `0x${string}`,
        abi: ERC20_ABI,
        functionName: "transfer",
        args: [activeChatUser.address as `0x${string}`, parseUnits(amount, txDecimals)]
      });

      if (wagmiPublicClient) {
        const receipt = await wagmiPublicClient.waitForTransactionReceipt({ hash: txId as `0x${string}` });
        if (receipt.status === 'reverted') {
          throw new Error("Transaction reverted on the blockchain.");
        }
      }

      // Confirm with API transactionId or Wagmi hash
      await sendPayment(
        amtNum,
        txId,
        description,
        isRecurring,
        isRecurring ? recurringInterval : undefined,
        selectedNetwork === "Injective EVM Testnet" ? "USDC-1439" :
          (selectedNetwork === "Base Mainnet" ? "USDC-8453" :
            (selectedNetwork === "Robinhood Mainnet" ? `${selectedAsset}-4663` :
              (mode === "mainnet" ? `${selectedAsset}-MAINNET` : selectedAsset)))
      );
      setLocalBalance(prev => prev !== null ? prev - amtNum : null);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('refresh-portfolio'));
        window.dispatchEvent(new Event('refresh-wallet-history'));
        window.dispatchEvent(new CustomEvent('arc_payments_synced'));
        setTimeout(() => {
          window.dispatchEvent(new Event('refresh-portfolio'));
          window.dispatchEvent(new Event('refresh-wallet-history'));
        }, 2500);
      }
      setStep(3); // Completed screen
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (e: any) {
      console.error(e);
      let msg = e.shortMessage || e.message;
      const genericErrors = ["Internal Server Error", "Service Error", "Unknown Error", "Unexpected token"];
      if (genericErrors.some(g => msg.includes(g))) msg = "The network is busy. Please try again.";
      alert((connector?.name || "Browser Wallet") + " transaction failed: " + msg);
    } finally {
      setIsConfirmingTx(false);
    }
  };

  if (!activeChatUser) return null;

  const contactAlias = customContacts[activeChatUser.address.toLowerCase()]?.name || activeChatUser.name;
  const avatarGradient = getGradientForAddress(activeChatUser.address, customContacts[activeChatUser.address.toLowerCase()]?.colorIndex);

  return (
    <div style={{
      height: "100%",
      display: "flex",
      flexDirection: "column",
      background: "var(--surface)",
      position: "relative",
      overflow: "hidden",
      fontFamily: "var(--font-sans, system-ui)"
    }}>

      {/* STEP 1 */}
      {step === 1 && (
        <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>

          {/* Minimal Professional Header */}
          <div className="p-3 px-6 pb-4 md:p-[14px] md:px-4 md:pb-5 gap-2 md:gap-3 mx-auto w-full max-w-[380px] md:max-w-none" style={{
            background: "var(--border-soft)",
            borderBottom: "1px solid var(--border)",
            boxShadow: "0 4px 15px rgba(0,0,0,0.03)",
            display: "flex", flexDirection: "column",
            borderRadius: "0 0 28px 28px",
            flexShrink: 0
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ position: "relative" }}>
                  <div className="w-8 h-8 md:w-[42px] md:h-[42px]" style={{ borderRadius: "50%", border: "1px solid var(--border-soft)", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", background: avatarGradient }}>
                    {activeChatUser.photoUrl ? (
                      <img src={activeChatUser.photoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      <User style={{ width: "60%", height: "60%", color: "#fff" }} />
                    )}
                  </div>
                </div>
                <div>
                  <div className="text-[13px] md:text-[14px]" style={{ fontWeight: 800, color: "var(--text-primary)" }}>Paying {contactAlias}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 1 }}>
                    <span style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "monospace" }}>{activeChatUser.address.slice(0, 8)}...{activeChatUser.address.slice(-6)}</span>
                    <Copy onClick={() => navigator.clipboard.writeText(activeChatUser.address)} style={{ width: 11, height: 11, color: "var(--text-muted)", cursor: "pointer" }} />
                  </div>
                </div>
              </div>
              <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: "50%", background: "var(--surface-hover)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--text-secondary)" }}>
                <X style={{ width: 15, height: 15 }} />
              </button>
            </div>
          </div>

          {/* Main body fills remaining height */}
          <div className="p-3 px-6 md:p-[14px] md:px-4 md:pb-4 gap-2 md:gap-3 mx-auto w-full max-w-[380px] md:max-w-none" style={{ flex: 1, display: "flex", flexDirection: "column" }}>

            <div className="p-4 md:p-5 rounded-[18px] md:rounded-[22px]" style={{ background: "var(--surface)", border: "1px solid var(--border-soft)", display: "flex", flexDirection: "column", alignItems: "center", boxShadow: "0 2px 12px rgba(0,0,0,0.04)" }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.12em" }}>You Pay</span>

              {/* Big Amount */}
              <div className="my-2 md:my-3" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%", minHeight: 68 }}>
                <input
                  type="number"
                  min="0"
                  placeholder="0"
                  value={amount}
                  onChange={e => {
                    const val = e.target.value;
                    if (val === "" || parseFloat(val) >= 0) setAmount(val);
                  }}
                  onKeyDown={e => { if (e.key === "-" || e.key === "e") e.preventDefault(); }}
                  disabled={!selectedNetwork}
                  className="text-[52px] sm:text-[58px] md:text-[64px]"
                  style={{
                    background: "none",
                    border: "none",
                    outline: "none",
                    fontWeight: 800,
                    color: "var(--text-primary)",
                    width: amount ? `${Math.max(amount.length + 1, 2)}ch` : "2ch",
                    minWidth: "2ch",
                    maxWidth: "10ch",
                    textAlign: "center",
                    letterSpacing: "-0.04em",
                    padding: 0,
                    lineHeight: 1
                  }}
                  autoFocus
                />
              </div>

              {/* Network & Asset Selection */}
              <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 10, marginTop: 12, marginBottom: 8, width: "100%", position: "relative" }}>
                <div style={{ position: "relative" }}>
                  <div
                    onClick={() => {
                      setIsNetworkDropdownOpen(!isNetworkDropdownOpen);
                      setIsAssetDropdownOpen(false);
                    }}
                    style={{ background: "var(--surface)", border: "1.5px solid var(--border)", borderRadius: 24, padding: "7px 14px", color: "var(--text-primary)", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 8, cursor: "pointer", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}
                  >
                    {selectedNetwork ? (
                      <>
                        <img src={selectedNetwork.includes("Arc") ? "/arc-logo.png" : (selectedNetwork.includes("Base") ? "/icons/base.svg" : (selectedNetwork.includes("Robinhood") ? "/icons/robinhood.png" : "/icons/injective.png"))} alt="Network" style={{ width: 18, height: 18, borderRadius: "50%", objectFit: "cover", boxShadow: "0 0 0 1px var(--border-soft)", flexShrink: 0 }} />
                        <span style={{ whiteSpace: "nowrap" }}>{selectedNetwork === "Injective EVM Testnet" ? "Injective Testnet" : selectedNetwork}</span>
                      </>
                    ) : (
                      <span style={{ color: "var(--text-muted)", fontWeight: 500 }}>Select Network</span>
                    )}
                    <ChevronDown style={{ width: 14, height: 14, color: "var(--text-muted)", transition: "transform 0.2s", transform: isNetworkDropdownOpen ? "rotate(180deg)" : "rotate(0deg)" }} />
                  </div>

                  <AnimatePresence>
                    {isNetworkDropdownOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: -5, x: "-50%", scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, x: "-50%", scale: 1 }}
                        exit={{ opacity: 0, y: -5, x: "-50%", scale: 0.95 }}
                        transition={{ duration: 0.15 }}
                        style={{ position: "absolute", top: "calc(100% + 8px)", left: "50%", width: 190, background: "var(--surface)", border: "1px solid var(--border-soft)", borderRadius: 16, overflow: "hidden", zIndex: 60, boxShadow: "0 10px 25px rgba(0,0,0,0.12)" }}
                      >
                        {(mode === "mainnet" ? ["Arc Mainnet", "Base Mainnet", "Robinhood Mainnet"] : ["Arc Testnet", "Injective EVM Testnet"]).map(net => (
                          <div
                            key={net}
                            onClick={() => {
                              setSelectedNetwork(net);
                              setIsNetworkDropdownOpen(false);
                              if (net === "Robinhood Mainnet") {
                                setSelectedAsset("");
                              } else if (net === "Injective EVM Testnet" || net === "Base Mainnet" || net === "Arc Mainnet") {
                                setSelectedAsset("");
                              }
                            }}
                            style={{ padding: "12px 14px", fontSize: 13, fontWeight: 600, color: "var(--text-primary)", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, background: selectedNetwork === net ? "var(--surface-hover)" : "transparent", transition: "background 0.2s" }}
                            onMouseEnter={e => e.currentTarget.style.background = "var(--surface-hover)"}
                            onMouseLeave={e => e.currentTarget.style.background = selectedNetwork === net ? "var(--surface-hover)" : "transparent"}
                          >
                            <img src={net.includes("Arc") ? "/arc-logo.png" : (net.includes("Base") ? "/icons/base.svg" : (net.includes("Robinhood") ? "/icons/robinhood.png" : "/icons/injective.png"))} alt={net} style={{ width: 16, height: 16, borderRadius: "50%", objectFit: "cover" }} />
                            {net === "Injective EVM Testnet" ? "Injective Testnet" : net}
                          </div>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {selectedNetwork && (
                  <div style={{ position: "relative" }}>
                    <div
                      onClick={() => {
                        if (selectedNetwork) {
                          setIsAssetDropdownOpen(!isAssetDropdownOpen);
                          setIsNetworkDropdownOpen(false);
                        }
                      }}
                      style={{ background: "var(--surface)", border: "1.5px solid var(--border)", borderRadius: 24, padding: "7px 14px", color: "var(--text-primary)", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 8, cursor: selectedNetwork ? "pointer" : "default", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        {!selectedAsset ? (
                          <span style={{ color: "var(--text-secondary)", whiteSpace: "nowrap" }}>Select Asset</span>
                        ) : (
                          <>
                            {selectedAsset === "USDC" && <UsdcLogo size={18} />}
                            {selectedAsset === "EURC" && <img src="https://s2.coinmarketcap.com/static/img/coins/128x128/20641.png" style={{ width: 18, height: 18, borderRadius: "50%" }} alt="EURC" />}
                            {selectedAsset === "USDG" && <img src="https://static.okx.com/cdn/web3/currency/token/large/4663-0x5fc5360d0400a0fd4f2af552add042d716f1d168-999/type=default_90_0?v=1783582629079&x-oss-process=image/format,webp/resize,w_80,h_80,type_6/ignore-error,1" style={{ width: 18, height: 18, borderRadius: "50%" }} alt="USDG" />}
                            {selectedAsset === "USDe" && <img src="https://static.okx.com/cdn/web3/currency/token/large/4663-0x5d3a1ff2b6bab83b63cd9ad0787074081a52ef34-999/type=default_90_0?x-oss-process=image/format,webp/resize,w_80,h_80,type_6/ignore-error,1" style={{ width: 18, height: 18, borderRadius: "50%" }} alt="USDe" />}
                            <span>{selectedAsset}</span>
                          </>
                        )}
                      </div>
                      {selectedNetwork && <ChevronDown style={{ width: 14, height: 14, color: "var(--text-muted)", transition: "transform 0.2s", transform: isAssetDropdownOpen ? "rotate(180deg)" : "rotate(0deg)" }} />}
                    </div>

                    {selectedNetwork && (
                      <AnimatePresence>
                        {isAssetDropdownOpen && (
                          <motion.div
                            initial={{ opacity: 0, y: -5, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -5, scale: 0.95 }}
                            transition={{ duration: 0.15 }}
                            style={{ position: "absolute", top: "calc(100% + 8px)", right: 0, width: 140, background: "var(--surface)", border: "1px solid var(--border-soft)", borderRadius: 16, overflow: "hidden", zIndex: 60, boxShadow: "0 10px 25px rgba(0,0,0,0.12)" }}
                          >
                            {(selectedNetwork === "Robinhood Mainnet" ? ["USDG", "USDe"] : (selectedNetwork === "Arc Testnet" ? ["USDC", "EURC"] : ["USDC"])).map(asset => (
                              <div
                                key={asset}
                                onClick={() => { setSelectedAsset(asset); setIsAssetDropdownOpen(false); }}
                                style={{ padding: "12px 14px", fontSize: 13, fontWeight: 600, color: "var(--text-primary)", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, background: selectedAsset === asset ? "var(--surface-hover)" : "transparent", transition: "background 0.2s" }}
                                onMouseEnter={e => e.currentTarget.style.background = "var(--surface-hover)"}
                                onMouseLeave={e => e.currentTarget.style.background = selectedAsset === asset ? "var(--surface-hover)" : "transparent"}
                              >
                                {asset === "USDC" && <UsdcLogo size={18} />}
                                {asset === "EURC" && <img src="https://s2.coinmarketcap.com/static/img/coins/128x128/20641.png" style={{ width: 18, height: 18, borderRadius: "50%" }} alt="EURC" />}
                                {asset === "USDG" && <img src="https://static.okx.com/cdn/web3/currency/token/large/4663-0x5fc5360d0400a0fd4f2af552add042d716f1d168-999/type=default_90_0?v=1783582629079&x-oss-process=image/format,webp/resize,w_80,h_80,type_6/ignore-error,1" style={{ width: 18, height: 18, borderRadius: "50%" }} alt="USDG" />}
                                {asset === "USDe" && <img src="https://static.okx.com/cdn/web3/currency/token/large/4663-0x5d3a1ff2b6bab83b63cd9ad0787074081a52ef34-999/type=default_90_0?x-oss-process=image/format,webp/resize,w_80,h_80,type_6/ignore-error,1" style={{ width: 18, height: 18, borderRadius: "50%" }} alt="USDe" />}
                                <span>{asset}</span>
                              </div>
                            ))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    )}
                  </div>
                )}
              </div>

              {amount && selectedNetwork && parseFloat(amount) > userBalance && (
                <div style={{ color: "var(--accent-red)", fontSize: 11, fontWeight: 600, marginTop: 12, padding: "6px 10px", background: "rgba(239, 68, 68, 0.1)", borderRadius: 6 }}>
                  Insufficient balance.
                </div>
              )}

              <div className="mt-2 md:mt-[14px] p-2 px-3 md:p-[10px] md:px-[14px]" style={{ width: "100%", background: "var(--bg)", borderRadius: 12, display: "flex", justifyContent: "space-between", alignItems: "center", border: "1px solid var(--border)" }}>
                <div>
                  <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 2 }}>
                    Available Balance
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: 6 }}>
                    {userBalance.toFixed(2)} {selectedNetwork === "Injective EVM Testnet" ? "USDC" : selectedAsset}
                    <button
                      onClick={handleManualRefreshBalance}
                      disabled={isFetchingBalance}
                      style={{ background: "none", border: "none", padding: 2, display: "flex", cursor: isFetchingBalance ? "not-allowed" : "pointer", opacity: isFetchingBalance ? 0.5 : 1, transition: "transform 0.2s" }}
                      onMouseEnter={(e) => { if (!isFetchingBalance) e.currentTarget.style.transform = "rotate(30deg)"; }}
                      onMouseLeave={(e) => e.currentTarget.style.transform = "rotate(0deg)"}
                      title="Refresh Balance"
                    >
                      <RefreshCw style={{ width: 12, height: 12, color: "var(--text-muted)" }} className={isFetchingBalance ? "animate-spin" : ""} />
                    </button>
                  </div>
                </div>
                <button
                  onClick={() => {
                    const maxAmt = userBalance;
                    setAmount(maxAmt > 0 ? maxAmt.toString() : "0");
                  }}
                  style={{
                    background: "var(--surface)", border: "1px solid var(--border-soft)", borderRadius: 6,
                    padding: "4px 10px", fontSize: 10, fontWeight: 700, color: "var(--text-primary)", cursor: "pointer"
                  }}
                >
                  MAX
                </button>
              </div>
            </div>

            {/* Note field */}
            <div style={{ background: "var(--surface)", borderRadius: 14, padding: "11px 14px", display: "flex", alignItems: "center", gap: 8, border: "1px solid var(--border)" }}>
              <input
                type="text"
                placeholder="Add a note (optional)"
                value={description}
                onChange={e => setDescription(e.target.value.substring(0, 50))}
                style={{ flex: 1, background: "none", border: "none", outline: "none", fontSize: 13, color: "var(--text-primary)" }}
              />
              <span style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "monospace", whiteSpace: "nowrap" }}>{description.length}/50</span>
            </div>

            {/* CTA button pushes to bottom */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", paddingBottom: "30px", gap: 12 }}>
              <div
                style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: "14px 16px", position: "relative" }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    {connector?.icon ? (
                      <img src={connector.icon} alt={connector.name} style={{ width: 20, height: 20, borderRadius: 4 }} />
                    ) : (
                      <Wallet style={{ width: 20, height: 20, color: "var(--text-primary)" }} />
                    )}
                    <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{connector?.name || "Browser Wallet"}</span>
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 4px" }}>
                <span style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 600 }}>Payments Today</span>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: paymentLimitReached ? "var(--accent-red)" : "var(--text-primary)" }}>
                    {todayPayments} / 10
                  </span>
                  {paymentLimitReached && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: "#fff", background: "var(--accent-red)", padding: "2px 6px", borderRadius: 4 }}>
                      Limit Reached
                    </span>
                  )}
                </div>
              </div>
              <SlideButton
                disabled={!selectedNetwork || !selectedAsset || isFetchingBalance || amtNum <= 0 || amtNum > userBalance || paymentLimitReached || (chainId !== CHAIN_ID_MAP[selectedNetwork as string])}
                onComplete={handleCreatePendingPay}
                text={!selectedNetwork ? "Select Network" : (!selectedAsset ? "Select Asset" : ((chainId !== CHAIN_ID_MAP[selectedNetwork as string]) ? `Switch to ${selectedNetwork}` : "Slide to Review"))}
                loadingText="Loading..."
                loading={isFetchingBalance}
              />
            </div>
          </div>
        </div>
      )}
      {/* STEP 2: Review Screen */}
      {step === 2 && (
        <div style={{ height: "100%", padding: "12px 14px", display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 }}>Review Payment</div>
          <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 12 }}>Please confirm the details below</div>

          {/* Profile Card Summary */}
          <div style={{ width: "100%", background: "var(--surface)", borderRadius: 14, padding: "10px 14px", display: "flex", alignItems: "center", gap: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.02)", border: "1px solid var(--border-soft)", marginBottom: 10 }}>
            <div style={{ position: "relative" }}>
              <div style={{ width: 40, height: 40, borderRadius: "50%", background: avatarGradient, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                {activeChatUser.photoUrl ? (
                  <img src={activeChatUser.photoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <User style={{ width: 20, height: 20, color: "#fff" }} />
                )}
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>Paying</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{contactAlias}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "1px 6px", borderRadius: 8, background: "var(--bg)", border: "1px solid var(--border-soft)", width: "fit-content", marginTop: 4 }}>
                <span style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "monospace" }}>{activeChatUser.address.slice(0, 8)}...{activeChatUser.address.slice(-6)}</span>
                <Copy onClick={() => navigator.clipboard.writeText(activeChatUser.address)} style={{ width: 9, height: 9, color: "var(--text-muted)", cursor: "pointer" }} />
              </div>
            </div>
          </div>

          {/* Breakdown Card */}
          <div style={{ width: "100%", background: "var(--surface)", borderRadius: 20, padding: "16px", boxShadow: "0 4px 20px rgba(0,0,0,0.03)", display: "flex", flexDirection: "column", border: "1px solid var(--border-soft)", gap: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 6 }}>You Pay</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {selectedAsset === "USDC" && <UsdcLogo size={18} />}
                  {selectedAsset === "EURC" && <EurcLogo size={18} />}
                  {selectedAsset === "USDG" && <img src="https://static.okx.com/cdn/web3/currency/token/large/4663-0x5fc5360d0400a0fd4f2af552add042d716f1d168-999/type=default_90_0?v=1783582629079&x-oss-process=image/format,webp/resize,w_80,h_80,type_6/ignore-error,1" style={{ width: 18, height: 18, borderRadius: "50%" }} alt="USDG" />}
                  {selectedAsset === "USDe" && <img src="https://static.okx.com/cdn/web3/currency/token/large/4663-0x5d3a1ff2b6bab83b63cd9ad0787074081a52ef34-999/type=default_90_0?x-oss-process=image/format,webp/resize,w_80,h_80,type_6/ignore-error,1" style={{ width: 18, height: 18, borderRadius: "50%" }} alt="USDe" />}
                  <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>{selectedAsset}</span>
                </div>
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)" }}>${amtNum.toFixed(2)}</div>
            </div>

            <div style={{ height: 1, background: "var(--border-soft)", width: "100%" }} />

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 14, color: "var(--text-secondary)" }}>Network</span>
              <div style={{ textAlign: "right" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, fontWeight: 500, color: "var(--text-primary)" }}>
                  {selectedNetwork.includes("Arc") ? (
                    <img src="/arc-logo.png" alt="Arc" style={{ width: 16, height: 16, borderRadius: "50%", objectFit: "cover" }} />
                  ) : selectedNetwork.includes("Base") ? (
                    <img src="/icons/base.svg" alt="Base" style={{ width: 16, height: 16, borderRadius: "50%", objectFit: "cover" }} />
                  ) : selectedNetwork.includes("Robinhood") ? (
                    <img src="/icons/robinhood.png" alt="Robinhood" style={{ width: 16, height: 16, borderRadius: "50%", objectFit: "cover" }} />
                  ) : (
                    <img src="/icons/injective.png" alt="Injective" style={{ width: 16, height: 16, borderRadius: "50%", objectFit: "cover" }} />
                  )}
                  {selectedNetwork}
                </div>
              </div>
            </div>

            <div style={{ height: 1, background: "var(--border-soft)", width: "100%" }} />

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>Total</span>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>{amtNum.toFixed(2)} {selectedAsset}</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>~ ${amtNum.toFixed(2)}</div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 16, marginTop: 24 }}>
            <SlideButton
              onComplete={handleTriggerWalletTx}
              loading={isConfirmingTx}
              disabled={isConfirmingTx}
              text="Slide to Pay"
              loadingText="Confirming..."
            />
            <button
              onClick={() => setStep(1)}
              disabled={isConfirmingTx}
              style={{ background: "none", border: "none", fontSize: 14, fontWeight: 600, color: "var(--text-secondary)", cursor: "pointer", padding: "8px" }}
            >
              Cancel Payment
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: Success Screen */}
      {step === 3 && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", paddingBottom: 20 }}
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 200, damping: 15, delay: 0.1 }}
            style={{ width: 72, height: 72, borderRadius: "50%", background: "rgba(34,197,94,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            <div style={{ width: 54, height: 54, borderRadius: "50%", background: "linear-gradient(135deg, #22c55e, #16a34a)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 8px 24px rgba(34,197,94,0.3)" }}>
              <Check style={{ width: 28, height: 28, color: "#fff", strokeWidth: 3 }} />
            </div>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            style={{ textAlign: "center", marginTop: 16 }}
          >
            <div style={{ fontSize: 40, fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.03em", lineHeight: 1 }}>${amount}</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#22c55e", margin: "8px 0 0" }}>Payment Successful</div>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}
