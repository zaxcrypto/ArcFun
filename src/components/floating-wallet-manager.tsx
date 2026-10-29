"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Wallet, X, ChevronDown, ChevronUp, Copy, Check, Globe, Search, Plus } from "lucide-react";
import { ArcNativeWallet } from "./arc-native-wallet";
import { ArcWalletAuthProvider } from "./arc-wallet-auth-provider";
import { useEnvironment } from "@/contexts/EnvironmentContext";
import { usePortfolioStore } from "@/lib/portfolio/usePortfolioStore";
import { WALLET_NETWORKS } from "./arc-wallet-dashboard";
import { useAccount } from "wagmi";
import { useWallet } from "@solana/wallet-adapter-react";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";

export type Corner = "top-right" | "top-left" | "bottom-right" | "bottom-left";

const CORNER_KEY = "arc_wallet_corner";

function loadSavedCorner(): Corner {
  if (typeof window === "undefined") return "bottom-right";
  try {
    const raw = localStorage.getItem(CORNER_KEY);
    if (raw === "top-right" || raw === "top-left" || raw === "bottom-right" || raw === "bottom-left") {
      return raw;
    }
    return "bottom-right";
  } catch {
    return "bottom-right";
  }
}

function saveCorner(c: Corner) {
  try {
    localStorage.setItem(CORNER_KEY, c);
  } catch {}
}

interface AddressChain {
  id: string;
  name: string;
  icon: string;
  address: string | null;
}

function WalletHeader({
  isWalletReady,
  currentNetwork,
  isNetworkMenuOpen,
  setIsNetworkMenuOpen,
  setCurrentNetwork,
  onOpenAddressModal,
  onClose,
  isMobile,
}: {
  isWalletReady: boolean;
  currentNetwork: string;
  isNetworkMenuOpen: boolean;
  setIsNetworkMenuOpen: (v: boolean) => void;
  setCurrentNetwork: (id: any) => void;
  onOpenAddressModal: () => void;
  onClose: () => void;
  isMobile?: boolean;
}) {
  return (
    <div
      className="flex items-center justify-between px-3.5 py-3 border-b border-[var(--border)] bg-[var(--surface)] shrink-0 select-none gap-2"
      style={isMobile ? { paddingTop: "max(14px, env(safe-area-inset-top))" } : undefined}
    >
      <div className="flex items-center gap-2 shrink-0">
        <img
          src="/rocket-logo.png"
          alt="ArcFun Wallet"
          className="w-6 h-6 rounded-[7px] object-cover shrink-0 shadow-sm border border-[var(--border-soft)]"
        />
        <span className="font-bold text-[14px] tracking-tight text-[var(--text-primary)] whitespace-nowrap">
          ArcFun Wallet
        </span>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        {isWalletReady && (
          <>
            {/* Network Switcher */}
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => setIsNetworkMenuOpen(!isNetworkMenuOpen)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--surface-hover)] hover:opacity-90 border border-[var(--border)] text-[11px] font-semibold text-[var(--text-primary)] transition-all shadow-xs group cursor-pointer whitespace-nowrap shrink-0"
              >
                {currentNetwork === "All Networks" ? (
                  <Globe className="w-3.5 h-3.5 text-black dark:text-white shrink-0" />
                ) : (
                  <img
                    src={
                      currentNetwork === "Solana Devnet"
                        ? "https://s2.coinmarketcap.com/static/img/coins/64x64/5426.png"
                        : "/arc-logo.png"
                    }
                    alt={currentNetwork}
                    className="w-3.5 h-3.5 rounded-full object-cover shrink-0"
                  />
                )}
                <span className="whitespace-nowrap">{currentNetwork}</span>
                <ChevronDown className="w-3 h-3 text-[var(--text-muted)] group-hover:text-[var(--text-primary)] transition-transform shrink-0" />
              </button>

              {isNetworkMenuOpen && (
                <div className="absolute right-0 top-full mt-1.5 w-44 bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-2xl z-50 p-1 flex flex-col gap-0.5 backdrop-blur-md">
                  {WALLET_NETWORKS.map((net) => (
                    <button
                      key={net.id}
                      type="button"
                      onClick={() => {
                        setCurrentNetwork(net.id);
                        setIsNetworkMenuOpen(false);
                      }}
                      className={`flex items-center justify-between px-2.5 py-2 rounded-xl text-left transition-colors cursor-pointer ${
                        currentNetwork === net.id
                          ? "bg-[var(--surface-hover)] text-[var(--text-primary)] font-semibold"
                          : "hover:bg-[var(--surface-hover)] text-[var(--text-secondary)]"
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        {net.id === "All Networks" ? (
                          <Globe className="w-4 h-4 text-black dark:text-white shrink-0" />
                        ) : (
                          <img
                            src={net.icon}
                            alt={net.name}
                            className="w-4 h-4 rounded-full object-cover shrink-0"
                          />
                        )}
                        <span className="text-xs whitespace-nowrap">{net.name}</span>
                      </div>
                      {currentNetwork === net.id && (
                        <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Copy Address */}
            <button
              type="button"
              onClick={onOpenAddressModal}
              className="w-7 h-7 rounded-full bg-[var(--surface-hover)] hover:opacity-90 border border-[var(--border)] flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer shrink-0"
              title="View & Copy Wallet Addresses"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
          </>
        )}

        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="w-7 h-7 rounded-full bg-[var(--surface-hover)] border border-[var(--border)] flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:opacity-90 transition-colors cursor-pointer shrink-0"
          aria-label="Close wallet"
          title="Close wallet"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

function AddressModalContent({
  search,
  setSearch,
  filteredChains,
  copiedChainId,
  onCopyChainAddress,
  onProvisionSolana,
  isProvisioningSolana,
  onClose,
}: {
  search: string;
  setSearch: (v: string) => void;
  filteredChains: AddressChain[];
  copiedChainId: string | null;
  onCopyChainAddress: (addr: string, chainId: string) => void;
  onProvisionSolana: () => void;
  isProvisioningSolana: boolean;
  onClose: () => void;
}) {
  return (
    <div className="absolute inset-0 z-50 bg-[var(--surface)] flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)] shrink-0">
        <h3 className="font-bold text-[16px] tracking-tight text-[var(--text-primary)]">
          Wallet address
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="w-7 h-7 rounded-full bg-[var(--surface-hover)] hover:opacity-80 border border-[var(--border)] flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="p-4 pb-2">
        <div className="relative flex items-center">
          <Search className="w-4 h-4 text-[var(--text-muted)] absolute left-3.5 pointer-events-none" />
          <input
            type="text"
            placeholder="Search network"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-[var(--surface-hover)] border border-[var(--border)] rounded-xl text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--text-muted)] transition-all"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-2 space-y-2.5">
        <div className="text-[11px] font-bold text-[var(--text-muted)] px-1 uppercase tracking-wider">
          Popular networks
        </div>
        {filteredChains.map((chain) => (
          <div
            key={chain.id}
            className="p-3.5 rounded-2xl border border-[var(--border)] bg-[var(--surface-hover)]/40 hover:bg-[var(--surface-hover)] flex items-center justify-between gap-3 transition-colors group"
          >
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <img
                src={chain.icon}
                alt={chain.name}
                className="w-9 h-9 rounded-full object-cover shrink-0 shadow-sm border border-[var(--border-soft)]"
              />
              <div className="flex flex-col min-w-0 flex-1">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="font-bold text-xs text-[var(--text-primary)] whitespace-nowrap">{chain.name}</span>
                </div>
                {chain.address ? (
                  <span className="text-[11px] font-mono text-[var(--text-secondary)] break-all leading-tight select-all">
                    {`${chain.address.slice(0, 10)}...${chain.address.slice(-8)}`}
                  </span>
                ) : (
                  <span className="text-[11px] font-mono text-[var(--text-muted)] italic">Not connected</span>
                )}
              </div>
            </div>
            <div className="shrink-0 flex items-center gap-1">
              {chain.address ? (
                <button
                  type="button"
                  onClick={() => onCopyChainAddress(chain.address!, chain.id)}
                  className="w-8 h-8 rounded-xl bg-[var(--surface)] hover:bg-[var(--surface-hover)] border border-[var(--border)] flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-all cursor-pointer shadow-xs"
                  title={copiedChainId === chain.id ? "Copied!" : "Copy address"}
                >
                  {copiedChainId === chain.id ? (
                    <Check className="w-4 h-4 text-emerald-500" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              ) : chain.id === "solana" ? (
                <button
                  type="button"
                  onClick={onProvisionSolana}
                  disabled={isProvisioningSolana}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[11px] font-medium tracking-tight bg-slate-900 hover:bg-slate-800 dark:bg-white/10 dark:hover:bg-white/15 text-white dark:text-slate-100 border border-slate-200/80 dark:border-white/10 shadow-xs transition-all cursor-pointer disabled:opacity-50"
                  title="Create Solana Circle Wallet"
                >
                  {isProvisioningSolana ? (
                    <>
                      <div className="w-2.5 h-2.5 border-[1.5px] border-white/50 border-t-white rounded-full animate-spin" />
                      <span className="text-[10px]">Creating...</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-3 h-3 text-red-500" />
                      <span className="text-[10px]">Create</span>
                    </>
                  )}
                </button>
              ) : (
                <button
                  disabled
                  className="w-8 h-8 rounded-xl bg-white dark:bg-white/10 border border-slate-200/80 dark:border-white/10 flex items-center justify-center text-[var(--text-muted)] opacity-30 cursor-not-allowed shadow-xs"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        ))}
        {filteredChains.length === 0 && (
          <div className="text-center py-8 text-xs text-[var(--text-muted)]">
            No networks found matching &quot;{search}&quot;
          </div>
        )}
      </div>
    </div>
  );
}

export function FloatingWalletManager() {
  const pathname = usePathname();
  const isDocsOrLegalPage =
    pathname &&
    (pathname.startsWith("/docs") ||
      pathname.startsWith("/terms") ||
      pathname.startsWith("/privacy") ||
      pathname.startsWith("/risk") ||
      pathname.startsWith("/cookies") ||
      pathname.startsWith("/acceptable-use"));

  const { mode } = useEnvironment();
  const [isOpen, setIsOpen] = useState(false);
  const [arcWalletAddress, setArcWalletAddress] = useState<string | null>(null);
  const [isNetworkMenuOpen, setIsNetworkMenuOpen] = useState(false);
  const [showAddressModal, setShowAddressModal] = useState(false);
  const [addressSearch, setAddressSearch] = useState("");
  const [copiedChainId, setCopiedChainId] = useState<string | null>(null);
  const [isProvisioningSolana, setIsProvisioningSolana] = useState(false);
  const { currentNetwork, setCurrentNetwork } = usePortfolioStore();

  const [isIdleDimmed, setIsIdleDimmed] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const idleTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Responsive device check
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Prevent background scrolling on mobile when full-screen wallet is open
  useEffect(() => {
    if (isMobile && isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isMobile, isOpen]);

  // Corner snap state (top-right | top-left | bottom-right | bottom-left)
  const [corner, setCorner] = useState<Corner>(() => loadSavedCorner());
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const isDraggingRef = useRef(false);
  const dragEndedAtRef = useRef(0);
  const dragStartRef = useRef<{ clientX: number; clientY: number } | null>(null);

  const resetIdleTimer = useCallback(() => {
    setIsIdleDimmed(false);
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      setIsIdleDimmed(true);
    }, 10000);
  }, []);

  useEffect(() => {
    idleTimerRef.current = setTimeout(() => setIsIdleDimmed(true), 10000);
    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, []);

  const { address: evmAddress } = useAccount();
  const { publicKey } = useWallet();

  const [circleSolanaAddress, setCircleSolanaAddress] = useState<string | null>(() => {
    return typeof window !== "undefined" ? localStorage.getItem("arc_circle_solana_address") : null;
  });

  const provisionSolanaWallet = async () => {
    try {
      setIsProvisioningSolana(true);
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;
      const resLookup = await fetch("/api/wallet/lookup", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ blockchain: "SOL-DEVNET" }),
      });
      const dataLookup = await resLookup.json();
      if (dataLookup.exists && dataLookup.wallet?.wallet_address) {
        setCircleSolanaAddress(dataLookup.wallet.wallet_address);
        if (typeof window !== "undefined") {
          localStorage.setItem("arc_circle_solana_address", dataLookup.wallet.wallet_address);
          window.dispatchEvent(
            new CustomEvent("arc-solana-wallet-connected", {
              detail: { address: dataLookup.wallet.wallet_address },
            })
          );
        }
        return;
      }
      const res = await fetch("/api/wallet/provision", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ blockchain: "SOL-DEVNET" }),
      });
      const data = await res.json();
      if (data.wallet?.wallet_address) {
        setCircleSolanaAddress(data.wallet.wallet_address);
        if (typeof window !== "undefined") {
          localStorage.setItem("arc_circle_solana_address", data.wallet.wallet_address);
          window.dispatchEvent(
            new CustomEvent("arc-solana-wallet-connected", {
              detail: { address: data.wallet.wallet_address },
            })
          );
        }
      }
    } catch (e) {
      console.warn("Manual Solana provisioning error:", e);
    } finally {
      setIsProvisioningSolana(false);
    }
  };

  useEffect(() => {
    if (!circleSolanaAddress) provisionSolanaWallet();
  }, [circleSolanaAddress]);

  useEffect(() => {
    if (showAddressModal && !circleSolanaAddress) provisionSolanaWallet();
  }, [showAddressModal]);

  useEffect(() => {
    const handleSolConnected = (e: any) => {
      if (e.detail?.address) setCircleSolanaAddress(e.detail.address);
    };
    window.addEventListener("arc-solana-wallet-connected", handleSolConnected);
    const interval = setInterval(() => {
      if (typeof window !== "undefined") {
        const stored = localStorage.getItem("arc_circle_solana_address");
        if (stored && stored !== circleSolanaAddress) setCircleSolanaAddress(stored);
      }
    }, 2000);
    return () => {
      window.removeEventListener("arc-solana-wallet-connected", handleSolConnected);
      clearInterval(interval);
    };
  }, [circleSolanaAddress]);

  const effectiveArcAddress = arcWalletAddress || evmAddress || null;

  useEffect(() => {
    const handleOpen = () => setIsOpen(true);
    const handleClose = () => setIsOpen(false);
    window.addEventListener("open-arc-wallet", handleOpen);
    window.addEventListener("wallet-dropdown-opened", handleClose);
    return () => {
      window.removeEventListener("open-arc-wallet", handleOpen);
      window.removeEventListener("wallet-dropdown-opened", handleClose);
    };
  }, []);

  const handleCopyChainAddress = (addr: string, chainId: string) => {
    navigator.clipboard.writeText(addr);
    setCopiedChainId(chainId);
    setTimeout(() => setCopiedChainId(null), 1500);
  };

  const addressChains: AddressChain[] = [
    { id: "arc", name: "Arc Testnet", icon: "/arc-logo.png", address: effectiveArcAddress },
    {
      id: "solana",
      name: "Solana Devnet",
      icon: "https://s2.coinmarketcap.com/static/img/coins/64x64/5426.png",
      address: circleSolanaAddress,
    },
    { id: "ethereum", name: "Ethereum Sepolia", icon: "/icons/ethereum.svg", address: effectiveArcAddress },
  ];

  const filteredChains = addressChains.filter((c) =>
    c.name.toLowerCase().includes(addressSearch.toLowerCase())
  );

  const [walletHealth, setWalletHealth] = useState<string>("INITIALIZING");
  const isWalletReady = walletHealth === "OK" && Boolean(effectiveArcAddress);

  const isDimmed = isIdleDimmed && !isHovered && !isOpen;

  // ── Drag logic: free relative movement during drag, magnetic snap to edge on release ──
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (isOpen && !isMobile) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      isDraggingRef.current = false;
      dragStartRef.current = {
        clientX: e.clientX,
        clientY: e.clientY,
      };
    },
    [isOpen, isMobile]
  );

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragStartRef.current) return;
    const dx = e.clientX - dragStartRef.current.clientX;
    const dy = e.clientY - dragStartRef.current.clientY;
    if (!isDraggingRef.current && Math.hypot(dx, dy) < 6) return;

    if (!isDraggingRef.current) {
      isDraggingRef.current = true;
      setIsDragging(true);
    }

    setDragOffset({ x: dx, y: dy });
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (isDraggingRef.current) {
      dragEndedAtRef.current = Date.now();
      const midX = window.innerWidth / 2;
      const midY = window.innerHeight / 2;

      // Determine corner based on release location
      const isRight = e.clientX >= midX;
      const isTop = e.clientY < midY;

      let nextCorner: Corner = "bottom-right";
      if (isRight && !isTop) nextCorner = "bottom-right";
      else if (isRight && isTop) nextCorner = "top-right";
      else if (!isRight && !isTop) nextCorner = "bottom-left";
      else if (!isRight && isTop) nextCorner = "top-left";

      setCorner(nextCorner);
      saveCorner(nextCorner);
    }

    setDragOffset(null);
    setIsDragging(false);
    isDraggingRef.current = false;
    dragStartRef.current = null;
  }, []);

  if (mode === "mainnet" || isDocsOrLegalPage) return null;

  const isTop = corner.startsWith("top");
  const isLeft = corner.endsWith("left");

  const btnWidth = isMobile ? 44 : 56;
  const btnHeight = isMobile ? 44 : 52;
  const iconClass = isMobile ? "w-5 h-5 text-white" : "w-[26px] h-[26px] text-white";
  const bottomOffset = isMobile ? 96 : 16;
  const popupBottom = isMobile ? 154 : 76;

  return (
    <>
      {/* ── Mobile Full-Screen Bottom-to-Top Slide Sheet (Kept mounted for instant open, zero sync loop) ── */}
      <div
        className="fixed inset-0 z-[100] flex flex-col bg-[var(--surface)] overflow-hidden"
        style={{
          height: "100dvh",
          width: "100vw",
          transform: isMobile && isOpen ? "translateY(0)" : "translateY(100%)",
          opacity: isMobile && isOpen ? 1 : 0,
          pointerEvents: isMobile && isOpen ? "auto" : "none",
          transition: "transform 0.32s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.25s ease",
          display: isMobile ? "flex" : "none",
        }}
      >
        <WalletHeader
          isWalletReady={isWalletReady}
          currentNetwork={currentNetwork}
          isNetworkMenuOpen={isNetworkMenuOpen}
          setIsNetworkMenuOpen={setIsNetworkMenuOpen}
          setCurrentNetwork={setCurrentNetwork}
          onOpenAddressModal={() => setShowAddressModal(true)}
          onClose={() => setIsOpen(false)}
          isMobile={true}
        />

        <div
          className="flex-1 overflow-y-auto bg-[var(--bg)] relative"
          style={{ paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}
        >
          {isMobile && (
            <ArcWalletAuthProvider scoped={true}>
              <ArcNativeWallet
                isFloating={true}
                isOpen={isOpen}
                onWalletAddressChange={setArcWalletAddress}
                onHealthChange={setWalletHealth}
              />
            </ArcWalletAuthProvider>
          )}
        </div>

        <AnimatePresence>
          {showAddressModal && (
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 30 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="absolute inset-0 z-50 bg-[var(--surface)]"
            >
              <AddressModalContent
                search={addressSearch}
                setSearch={setAddressSearch}
                filteredChains={filteredChains}
                copiedChainId={copiedChainId}
                onCopyChainAddress={handleCopyChainAddress}
                onProvisionSolana={provisionSolanaWallet}
                isProvisioningSolana={isProvisioningSolana}
                onClose={() => {
                  setShowAddressModal(false);
                  setAddressSearch("");
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Desktop Floating Wallet Panel (Never goes out of screen! Kept mounted for zero delay) ── */}
      <div
        className="fixed z-49 bg-[var(--surface)] border border-[var(--border)] rounded-[24px] shadow-2xl flex flex-col overflow-hidden"
        style={{
          width: "clamp(360px, 92vw, 400px)",
          height: isTop ? "min(580px, calc(100vh - 148px))" : "min(580px, calc(100vh - 92px))",
          boxShadow: "0 20px 40px -10px rgba(0, 0, 0, 0.4)",
          top: isTop ? 128 : undefined,
          bottom: !isTop ? popupBottom : undefined,
          left: isLeft ? 12 : undefined,
          right: !isLeft ? 12 : undefined,
          opacity: !isMobile && isOpen ? 1 : 0,
          transform: !isMobile && isOpen ? "translateY(0) scale(1)" : (isTop ? "translateY(-20px) scale(0.96)" : "translateY(20px) scale(0.96)"),
          pointerEvents: !isMobile && isOpen ? "auto" : "none",
          transition: "opacity 0.25s ease, transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
          display: !isMobile ? "flex" : "none",
        }}
      >
        <WalletHeader
          isWalletReady={isWalletReady}
          currentNetwork={currentNetwork}
          isNetworkMenuOpen={isNetworkMenuOpen}
          setIsNetworkMenuOpen={setIsNetworkMenuOpen}
          setCurrentNetwork={setCurrentNetwork}
          onOpenAddressModal={() => setShowAddressModal(true)}
          onClose={() => setIsOpen(false)}
          isMobile={false}
        />

        <div className="flex-1 overflow-hidden bg-[var(--bg)] relative">
          {!isMobile && (
            <ArcWalletAuthProvider scoped={true}>
              <ArcNativeWallet
                isFloating={true}
                isOpen={isOpen}
                onWalletAddressChange={setArcWalletAddress}
                onHealthChange={setWalletHealth}
              />
            </ArcWalletAuthProvider>
          )}
        </div>

        <AnimatePresence>
          {showAddressModal && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="absolute inset-0 z-50 bg-[var(--surface)] flex flex-col overflow-hidden"
            >
              <AddressModalContent
                search={addressSearch}
                setSearch={setAddressSearch}
                filteredChains={filteredChains}
                copiedChainId={copiedChainId}
                onCopyChainAddress={handleCopyChainAddress}
                onProvisionSolana={provisionSolanaWallet}
                isProvisioningSolana={isProvisioningSolana}
                onClose={() => {
                  setShowAddressModal(false);
                  setAddressSearch("");
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Wallet Toggle Button (CSS Anchored 100% Flush to Corner Edge) ── */}
      <div
        style={{
          position: "fixed",
          top: isTop ? 76 : undefined,
          bottom: !isTop ? bottomOffset : undefined,
          left: isLeft ? 0 : undefined,
          right: !isLeft ? 0 : undefined,
          zIndex: 49,
          transform: dragOffset ? `translate3d(${dragOffset.x}px, ${dragOffset.y}px, 0)` : undefined,
          transition: isDragging
            ? "none"
            : "top 0.32s cubic-bezier(0.16, 1, 0.3, 1), bottom 0.32s cubic-bezier(0.16, 1, 0.3, 1), left 0.32s cubic-bezier(0.16, 1, 0.3, 1), right 0.32s cubic-bezier(0.16, 1, 0.3, 1)",
          pointerEvents: "auto",
        }}
      >
        <motion.button
          type="button"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onMouseEnter={() => {
            setIsHovered(true);
            setIsIdleDimmed(false);
          }}
          onMouseLeave={() => {
            setIsHovered(false);
            resetIdleTimer();
          }}
          whileTap={{ scale: isDraggingRef.current ? 1 : 0.93 }}
          onClick={(e) => {
            // If user moved/dragged the button, ignore click to prevent accidental open!
            if (Date.now() - dragEndedAtRef.current < 350) {
              e.preventDefault();
              e.stopPropagation();
              return;
            }
            const next = !isOpen;
            setIsOpen(next);
            if (next) window.dispatchEvent(new Event("wallet-opened"));
            resetIdleTimer();
          }}
          animate={{
            opacity: isDimmed ? 0.4 : 1,
            scale: isHovered ? 1.05 : isDimmed ? 0.82 : 1,
            x: isDimmed ? (isLeft ? -5 : 5) : 0,
          }}
          transition={{ type: "spring", stiffness: 380, damping: 24, mass: 0.8 }}
          style={{
            width: btnWidth,
            height: btnHeight,
            background: "linear-gradient(145deg, #000000 0%, #480006 35%, #88000c 75%, #9a000d 100%)",
            borderRadius: isLeft ? (isMobile ? "0 14px 14px 0" : "0 18px 18px 0") : (isMobile ? "14px 0 0 14px" : "18px 0 0 18px"),
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "grab",
            border: "1px solid rgba(255, 255, 255, 0.12)",
            borderLeft: isLeft ? "none" : "1px solid rgba(255, 255, 255, 0.12)",
            borderRight: isLeft ? "1px solid rgba(255, 255, 255, 0.12)" : "none",
            pointerEvents: "auto",
            touchAction: "none",
            userSelect: "none",
            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.25)",
            transformOrigin: isLeft ? "left center" : "right center",
            position: "relative",
            flexShrink: 0,
          }}
          aria-label="Toggle ArcFun Wallet"
          title="ArcFun Wallet"
        >
          <AnimatePresence mode="wait">
            {isOpen && !isMobile ? (
              <motion.div
                key="close"
                initial={{ rotate: -90, opacity: 0 }}
                animate={{ rotate: 0, opacity: 1 }}
                exit={{ rotate: 90, opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                {isTop ? (
                  <ChevronUp className={iconClass} />
                ) : (
                  <ChevronDown className={iconClass} />
                )}
              </motion.div>
            ) : (
              <motion.div
                key="open"
                initial={{ rotate: 90, opacity: 0 }}
                animate={{ rotate: 0, opacity: 1 }}
                exit={{ rotate: 90, opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                <Wallet className={iconClass} />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.button>
      </div>
    </>
  );
}
