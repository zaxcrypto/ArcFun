"use client";

import "./swap-bridge.css";
import { useState, useRef, useEffect, useCallback, UIEvent } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAccount } from "wagmi";
import { useWallet } from "@solana/wallet-adapter-react";
import { Header } from "@/components/header";
import { FaucetHub } from "@/components/faucet-hub";
import { useEnvironment } from "@/contexts/EnvironmentContext";
import dynamic from "next/dynamic";

const AdminPanel = dynamic(() => import("@/components/vault-admin").then(mod => mod.AdminPanel), { ssr: false });
import { PrivacyPolicyModal } from "@/components/privacy-policy-modal";
import { TermsOfServiceModal } from "@/components/terms-of-service-modal";
import { CookiePolicyModal } from "@/components/cookie-policy-modal";
import { RiskDisclosureModal } from "@/components/risk-disclosure-modal";
import { AcceptableUsePolicyModal } from "@/components/acceptable-use-policy-modal";
import { useTheme } from "next-themes";
import {
  Rocket,
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
  ChevronsRight,
  ChevronsLeft,
  Shield,
  ExternalLink,
  FileText,
  Cookie,
  AlertTriangle,
  FileCheck,
  Lock,
  Zap,
  MessageSquare,
  BookOpen,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { isAdmin } from "@/lib/admin";
import { SwapBridgeSkeleton } from "@/components/swap-bridge-skeleton";
const SwapBridgeManager = dynamic(() => import("@/components/swap-bridge").then(mod => mod.SwapBridgeManager), {
  ssr: false,
  loading: () => <SwapBridgeSkeleton />,
});
const TokenTradingView = dynamic(() => import("@/components/token/token-trading-view").then(mod => mod.TokenTradingView), { ssr: false });
const CircleGatewayView = dynamic(() => import("@/components/circle-gateway-view").then(mod => mod.CircleGatewayView), { ssr: false });
const ArcNativeWallet = dynamic(() => import("@/components/arc-native-wallet").then(mod => mod.ArcNativeWallet), { ssr: false });
const ChatManager = dynamic(() => import("@/components/chat-manager").then(mod => mod.ChatManager), { ssr: false });
import { ChatProvider } from "@/lib/chat-service";
import { useChatStore } from "@/lib/chat-store";

import { MobileBottomNav } from "@/components/mobile-bottom-nav";

type Tab = "bridge" | "chat" | "gateway" | "admin" | "swap" | "token" | "wallet";

interface MainAppProps {
  tokenAddress?: string;
}

export function MainApp({ tokenAddress }: MainAppProps = {}) {
  const router = useRouter();
  const { isConnected, address } = useAccount();
  const { connected: solanaConnected } = useWallet();
  const { features, mode, setMode } = useEnvironment();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme !== "light";
  const anyConnected = isConnected || solanaConnected;
  const admin = isAdmin(address);
  const pathname = usePathname();
  
  const getInitialTab = (): Tab => {
    if (tokenAddress) return "token";
    if (!pathname) return "bridge";
    if (pathname.startsWith("/token/")) return "token";
    if (pathname.startsWith("/chat")) return "chat";
    if (pathname.startsWith("/admin")) return "admin";
    if (pathname.startsWith("/gateway")) return "gateway";
    if (pathname.startsWith("/wallet")) return "wallet";
    if (pathname.startsWith("/bridge") || pathname.startsWith("/swap")) return "bridge";
    return "bridge";
  };

  const [activeTab, setActiveTab] = useState<Tab>(getInitialTab());
  const activeChatAddress = useChatStore((state) => state.activeChatAddress);
  const isChatOpen = activeTab === "chat" && activeChatAddress !== null;

  // Keep active tab in sync when pathname changes
  useEffect(() => {
    if (!pathname) return;
    if (pathname.startsWith("/token/")) {
      setActiveTab("token");
    } else if (pathname.startsWith("/chat")) {
      setActiveTab("chat");
    } else if (pathname.startsWith("/admin")) {
      setActiveTab("admin");
    } else if (pathname.startsWith("/gateway")) {
      setActiveTab("gateway");
    } else if (pathname.startsWith("/wallet")) {
      setActiveTab("wallet");
    } else if (pathname.startsWith("/bridge") || pathname.startsWith("/swap") || pathname === "/") {
      setActiveTab("bridge");
    }
  }, [pathname]);

  useEffect(() => {
    const handlePopState = () => {
      const currentPath = window.location.pathname;
      let newTab: Tab = "bridge";
      if (currentPath.startsWith("/token/")) newTab = "token";
      else if (currentPath.startsWith("/chat")) newTab = "chat";
      else if (currentPath.startsWith("/gateway")) newTab = "gateway";
      else if (currentPath.startsWith("/wallet")) newTab = "wallet";
      else if (currentPath.startsWith("/bridge") || currentPath.startsWith("/swap") || currentPath === "/") newTab = "bridge";
      
      if (newTab !== activeTab) {
         setActiveTab(newTab);
      }
    };
    window.addEventListener('popstate', handlePopState);
    
    const handleArcNavigate = (e: any) => {
       if (e.detail) {
         const targetPath = e.detail === 'bridge' ? '/' : `/${e.detail}`;
         window.history.pushState(null, '', targetPath);
         const popStateEvent = new PopStateEvent('popstate');
         window.dispatchEvent(popStateEvent);
       }
    };
    window.addEventListener('arc-navigate', handleArcNavigate);
    
    return () => {
       window.removeEventListener('popstate', handlePopState);
       window.removeEventListener('arc-navigate', handleArcNavigate);
    };
  }, [activeTab]);

  useEffect(() => {
    if (mode === "mainnet" && !admin) {
      setMode("testnet");
    }
  }, [mode, admin, setMode]);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("arc_sidebar_collapsed");
      if (saved !== null) return saved === "true";
      return window.innerWidth < 1024;
    }
    return false;
  });

  const handleToggleSidebar = useCallback((valueOrUpdater: boolean | ((prev: boolean) => boolean)) => {
    setSidebarCollapsed(prev => {
      const next = typeof valueOrUpdater === "function" ? valueOrUpdater(prev) : valueOrUpdater;
      if (typeof window !== "undefined") {
        localStorage.setItem("arc_sidebar_collapsed", String(next));
      }
      return next;
    });
  }, []);

  const [faucetHubOpen, setFaucetHubOpen] = useState(false);
  const [privacyPolicyOpen, setPrivacyPolicyOpen] = useState(false);
  const [termsOfServiceOpen, setTermsOfServiceOpen] = useState(false);
  const [cookiePolicyOpen, setCookiePolicyOpen] = useState(false);
  const [riskDisclosureOpen, setRiskDisclosureOpen] = useState(false);
  const [acceptableUsePolicyOpen, setAcceptableUsePolicyOpen] = useState(false);
  const [resourcesExpanded, setResourcesExpanded] = useState(false);
  const [showBottomNav, setShowBottomNav] = useState(true);
  const lastScrollY = useRef(0);

  // ─── Whole-app zoom-scale (mobile = desktop proportionally shrunk) ───────────
  const DESIGN_WIDTH = 800;
  const [appScale, setAppScale] = useState(1);
  const [contentH, setContentH] = useState(700);
  const contentAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const update = () => {
      const w = window.innerWidth;
      const s = w < DESIGN_WIDTH ? w / DESIGN_WIDTH : 1;
      setAppScale(parseFloat(s.toFixed(6)));
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  useEffect(() => {
    const el = contentAreaRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) setContentH(entry.contentRect.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // ─────────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    setShowBottomNav(true);
    lastScrollY.current = 0;
    if (typeof window !== "undefined" && window.scrollY !== 0) {
      window.scrollTo(0, 0);
    }
    if (typeof document !== "undefined") {
      if (document.documentElement.scrollTop !== 0) document.documentElement.scrollTop = 0;
      if (document.body.scrollTop !== 0) document.body.scrollTop = 0;
    }
  }, [activeTab]);

  useEffect(() => {
    const handleHideNav = () => {
      setShowBottomNav(false);
    };
    const handleShowNav = () => {
      setShowBottomNav(true);
    };
    window.addEventListener("arc-hide-bottom-nav", handleHideNav);
    window.addEventListener("arc-show-bottom-nav", handleShowNav);
    return () => {
      window.removeEventListener("arc-hide-bottom-nav", handleHideNav);
      window.removeEventListener("arc-show-bottom-nav", handleShowNav);
    };
  }, []);

  useEffect(() => {
    let ticking = false;

    const handleScrollUpdate = (scrollY: number) => {
      const activeEl = typeof document !== "undefined" ? document.activeElement : null;
      const isInputActive = activeEl && (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA" || (activeEl as HTMLElement).isContentEditable);
      if (isInputActive) {
        lastScrollY.current = scrollY;
        return;
      }

      const diff = scrollY - lastScrollY.current;

      // Scrolling DOWN -> hide nav bar
      if (diff > 10) {
        setShowBottomNav(false);
        lastScrollY.current = scrollY;
      }
      // Scrolling UP -> reveal nav bar
      else if (diff < -10) {
        setShowBottomNav(true);
        lastScrollY.current = scrollY;
      }
    };

    const onScrollEvent = (e: Event) => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const target = e.target as HTMLElement | Document | Window;
          let currentY = 0;
          if (target === window || target === document) {
            currentY = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
          } else if (target && (target as HTMLElement).scrollTop !== undefined) {
            currentY = (target as HTMLElement).scrollTop;
          }
          handleScrollUpdate(currentY);
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener("scroll", onScrollEvent, { passive: true });
    document.addEventListener("scroll", onScrollEvent, { passive: true, capture: true });

    return () => {
      window.removeEventListener("scroll", onScrollEvent);
      document.removeEventListener("scroll", onScrollEvent, { capture: true });
    };
  }, []);

  const handleMainScroll = (e: React.UIEvent<HTMLElement>) => {
    const activeEl = typeof document !== "undefined" ? document.activeElement : null;
    const isInputActive = activeEl && (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA" || (activeEl as HTMLElement).isContentEditable);
    if (isInputActive) return;

    const currentY = e.currentTarget.scrollTop;
    const diff = currentY - lastScrollY.current;
    if (diff > 10) {
      setShowBottomNav(false);
      lastScrollY.current = currentY;
    } else if (diff < -10) {
      setShowBottomNav(true);
      lastScrollY.current = currentY;
    }
  };

  const navigate = (tab: string) => {
    if (tab === "bridge" || tab === "swap") {
      setActiveTab("bridge");
      router.push("/bridge");
      return;
    }
    if (tab === "chat") {
      setActiveTab("chat");
      router.push("/chat");
      return;
    }
    if (tab === "gateway") {
      setActiveTab("gateway");
      router.push("/gateway");
      return;
    }
    if (tab === "wallet") {
      setActiveTab("wallet");
      router.push("/wallet");
      return;
    }
    setActiveTab(tab as Tab);
  };

  return (
    <div style={{ position: "fixed", inset: 0, overflow: "hidden", backgroundColor: "var(--bg)", display: "flex", flexDirection: "column", ['--content-scale' as any]: String(appScale) }}>

      {/* ─── MOBILE HEADER: mobile only (hidden when chat conversation thread is actively open) ─── */}
      <div className={isChatOpen ? "hidden w-full shrink-0" : "flex md:hidden w-full shrink-0"}>
        <Header
          admin={admin}
          onAdminClick={() => navigate("admin")}
          activeTab={activeTab}
          onOpenFaucetHub={() => setFaucetHubOpen(true)}
          onOpenPrivacyPolicy={() => setPrivacyPolicyOpen(true)}
          onOpenTermsOfService={() => setTermsOfServiceOpen(true)}
          onOpenCookiePolicy={() => setCookiePolicyOpen(true)}
          onOpenRiskDisclosure={() => setRiskDisclosureOpen(true)}
          onOpenAcceptableUsePolicy={() => setAcceptableUsePolicyOpen(true)}
          variant="mobile"
        />
      </div>

      {/* ─── CONTENT AREA ─── */}
      <div ref={contentAreaRef} style={{ flex: 1, overflow: "hidden", position: "relative", backgroundColor: "var(--bg)" }}>
        <div
          style={{
            width: '100%',
            height: '100%',
            position: 'relative',
            backgroundColor: "var(--bg)",
            display: "flex",
            overflow: "hidden",
            backfaceVisibility: "hidden",
            WebkitBackdropFilter: "none",
            WebkitFontSmoothing: "antialiased",
            MozOsxFontSmoothing: "grayscale",
          }}
        >
        {/* LEFT SIDEBAR */}
        {/* LEFT SIDEBAR */}
        {(isConnected || true) && (
          <aside
            style={{
              width: sidebarCollapsed ? 76 : 260,
              transition: "width 0.38s cubic-bezier(0.22, 1, 0.36, 1)",
              margin: 0,
              borderRadius: 0,
              border: "none",
              background: "transparent",
              boxShadow: "none",
              position: "relative",
              overflow: "visible",
              zIndex: 40,
            }}
            className="hidden md:flex flex-col shrink-0"
          >
            {/* Edge Toggle Arrow Button (Centered on sidebar border) */}
            <button
              onClick={() => handleToggleSidebar((prev: boolean) => !prev)}
              title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              className="sidebar-edge-toggle"
            >
              {sidebarCollapsed ? (
                <ChevronsRight size={13} strokeWidth={2.4} />
              ) : (
                <ChevronsLeft size={13} strokeWidth={2.4} />
              )}
            </button>
            {/* Top Scrollable Section */}
            <div
              className="sidebar-scroll-container"
              style={{
                flex: 1,
                overflowY: "auto",
                overflowX: "hidden",
                padding: sidebarCollapsed ? "20px 6px 0 6px" : "20px 14px 0 20px",
                display: "flex",
                flexDirection: "column",
                gap: 2,
                transition: "padding 0.38s cubic-bezier(0.22, 1, 0.36, 1)",
              }}
            >
              {/* Brand Logo & Collapse Toggle */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: sidebarCollapsed ? "center" : "space-between",
                  marginBottom: sidebarCollapsed ? 18 : 28,
                  padding: sidebarCollapsed ? 0 : "0 2px",
                  minHeight: 44,
                  transition: "margin-bottom 0.38s cubic-bezier(0.22, 1, 0.36, 1)",
                }}
              >
                {sidebarCollapsed ? (
                  <button
                    onClick={() => handleToggleSidebar(false)}
                    title="Expand sidebar"
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 12,
                      border: "none",
                      background: "transparent",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                      transition: "all 0.25s cubic-bezier(0.22, 1, 0.36, 1)",
                      overflow: "hidden",
                      padding: 0,
                      boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.boxShadow = "0 4px 14px rgba(0,0,0,0.25)";
                      e.currentTarget.style.transform = "scale(1.05)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.12)";
                      e.currentTarget.style.transform = "scale(1)";
                    }}
                  >
                    <img
                      src="/rocket-logo.png"
                      alt="ArcFun"
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                        display: "block",
                      }}
                    />
                  </button>
                ) : (
                  <div
                    onClick={() => navigate("bridge")}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      cursor: "pointer",
                      opacity: sidebarCollapsed ? 0 : 1,
                      transition: "opacity 0.25s ease",
                      userSelect: "none",
                    }}
                  >
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 10,
                        overflow: "hidden",
                        flexShrink: 0,
                        boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
                      }}
                    >
                      <img
                        src="/rocket-logo.png"
                        alt="ArcFun"
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                          display: "block",
                        }}
                      />
                    </div>
                    <span 
                      style={{ 
                        fontSize: 26, 
                        fontWeight: 300, 
                        letterSpacing: "0.14em", 
                        color: "var(--text-primary)", 
                        fontFamily: "var(--font-inter), sans-serif", 
                        textTransform: "uppercase",
                        whiteSpace: "nowrap",
                      }}
                    >
                      ARCFUN
                    </span>
                  </div>
                )}
              </div>

              {/* Top Segmented Control (Environment Switcher: Testnet / Mainnet) */}
              <div
                style={{
                  display: "flex",
                  flexDirection: sidebarCollapsed ? "column" : "row",
                  alignItems: "center",
                  background: isDark ? "#151922" : "var(--surface-soft, #f1f5f9)",
                  border: isDark ? "1px solid rgba(255, 255, 255, 0.08)" : "1px solid var(--border, #e2e8f0)",
                  borderRadius: sidebarCollapsed ? 20 : 9999,
                  padding: 3,
                  marginBottom: sidebarCollapsed ? 24 : 32,
                  width: sidebarCollapsed ? 44 : "100%",
                  height: sidebarCollapsed ? "auto" : 38,
                  margin: sidebarCollapsed ? "0 auto 24px auto" : "0 0 32px 0",
                  gap: sidebarCollapsed ? 4 : 0,
                  boxShadow: isDark ? "none" : "0 1px 2px rgba(0,0,0,0.02)",
                  transition: "all 0.38s cubic-bezier(0.22, 1, 0.36, 1)",
                }}
              >
                <button
                  onClick={() => setMode("testnet")}
                  title={sidebarCollapsed ? "Testnet Mode" : undefined}
                  style={{
                    flex: sidebarCollapsed ? undefined : 1,
                    width: sidebarCollapsed ? 36 : undefined,
                    height: sidebarCollapsed ? 28 : "100%",
                    borderRadius: sidebarCollapsed ? 14 : 9999,
                    fontSize: sidebarCollapsed ? 11 : 13,
                    fontWeight: mode === "testnet" ? (sidebarCollapsed ? 800 : 700) : (sidebarCollapsed ? 600 : 500),
                    background: mode === "testnet"
                      ? (isDark ? "#283040" : "#ffffff")
                      : "transparent",
                    color: mode === "testnet"
                      ? (isDark ? "#ffffff" : "#0f172a")
                      : (isDark ? "#94a3b8" : "#64748b"),
                    border: mode === "testnet"
                      ? (isDark ? "1px solid rgba(255, 255, 255, 0.12)" : "1px solid rgba(0, 0, 0, 0.08)")
                      : "1px solid transparent",
                    boxShadow: mode === "testnet"
                      ? (isDark ? "none" : "0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.04)")
                      : "none",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transition: "all 0.2s ease"
                  }}
                >
                  {sidebarCollapsed ? "T" : "Testnet"}
                </button>
                <button
                  onClick={() => {
                    if (!admin) return;
                    setMode("mainnet");
                    if (activeTab !== "bridge") {
                      navigate("bridge");
                    }
                  }}
                  title={!admin ? "No access" : (sidebarCollapsed ? "Mainnet Mode" : undefined)}
                  style={{
                    flex: sidebarCollapsed ? undefined : 1,
                    width: sidebarCollapsed ? 36 : undefined,
                    height: sidebarCollapsed ? 28 : "100%",
                    borderRadius: sidebarCollapsed ? 14 : 9999,
                    fontSize: sidebarCollapsed ? 11 : 13,
                    fontWeight: mode === "mainnet" ? (sidebarCollapsed ? 800 : 700) : (sidebarCollapsed ? 600 : 500),
                    background: mode === "mainnet"
                      ? (isDark ? "#283040" : "#ffffff")
                      : "transparent",
                    color: mode === "mainnet"
                      ? (isDark ? "#ffffff" : "#0f172a")
                      : (isDark ? "#94a3b8" : "#64748b"),
                    border: mode === "mainnet"
                      ? (isDark ? "1px solid rgba(255, 255, 255, 0.12)" : "1px solid rgba(0, 0, 0, 0.08)")
                      : "1px solid transparent",
                    boxShadow: mode === "mainnet"
                      ? (isDark ? "none" : "0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.04)")
                      : "none",
                    cursor: admin ? "pointer" : "not-allowed",
                    opacity: admin ? 1 : 0.7,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 4,
                    transition: "all 0.2s ease"
                  }}
                >
                  {sidebarCollapsed ? "M" : "Mainnet"}
                </button>
              </div>

              {/* Navigation Items List */}
              <div 
                style={{ 
                  display: "flex", 
                  flexDirection: "column", 
                  gap: sidebarCollapsed ? 10 : 8, 
                  marginTop: sidebarCollapsed ? 12 : 8, 
                  alignItems: sidebarCollapsed ? "center" : "stretch",
                  transition: "all 0.38s cubic-bezier(0.22, 1, 0.36, 1)",
                }}
              >
                {sidebarCollapsed ? (
                  /* ── Collapsed (Icon-only) Navigation ── */
                  <>
                    <button
                      onClick={() => navigate("bridge")}
                      title="Bridge"
                      className={`sidebar-link${(activeTab === "bridge" || activeTab === "swap") ? " active" : ""}`}
                      style={{
                        justifyContent: "center",
                        padding: 0,
                        width: 44,
                        height: 44,
                        minWidth: 44,
                        borderRadius: 14,
                        margin: "0 auto",
                        display: "flex",
                        alignItems: "center",
                      }}
                    >
                      <ArrowUpDown size={20} style={{ color: (activeTab === "bridge" || activeTab === "swap") ? "var(--text-primary)" : "var(--text-muted)" }} />
                    </button>

                    <button
                      onClick={() => navigate("chat")}
                      title="Chat | Pay"
                      className={`sidebar-link${activeTab === "chat" ? " active" : ""}`}
                      style={{
                        justifyContent: "center",
                        padding: 0,
                        width: 44,
                        height: 44,
                        minWidth: 44,
                        borderRadius: 14,
                        margin: "0 auto",
                        display: "flex",
                        alignItems: "center",
                        position: "relative",
                      }}
                    >
                      <img src="/usdc.png" alt="Chat & Pay" style={{ width: 20, height: 20, borderRadius: "50%", objectFit: "contain" }} />
                    </button>

                    <button
                      onClick={() => navigate("gateway")}
                      title="Gateway (Circle)"
                      className={`sidebar-link${activeTab === "gateway" ? " active" : ""}`}
                      style={{
                        justifyContent: "center",
                        padding: 0,
                        width: 44,
                        height: 44,
                        minWidth: 44,
                        borderRadius: 14,
                        margin: "0 auto",
                        display: "flex",
                        alignItems: "center",
                        position: "relative",
                      }}
                    >
                      <Zap size={20} style={{ color: activeTab === "gateway" ? "#8b9cf4" : "var(--text-muted)" }} />
                    </button>

                  </>
                ) : (
                  /* ── Expanded Navigation ── */
                  <>
                    {/* Bridge Button */}
                    <button
                      onClick={() => navigate("bridge")}
                      className={`sidebar-link${(activeTab === "bridge" || activeTab === "swap") ? " active" : ""}`}
                      style={{
                        padding: "10px 14px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "flex-start",
                        width: "100%",
                        margin: "0 0 4px 0",
                      }}
                    >
                      <ArrowUpDown
                        size={20}
                        style={{
                          color: (activeTab === "bridge" || activeTab === "swap") ? "var(--text-primary)" : "var(--text-muted)",
                          flexShrink: 0,
                          display: "block",
                          transition: "color 0.2s ease",
                        }}
                      />
                      <span
                        style={{
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          fontSize: "15.5px",
                          fontWeight: (activeTab === "bridge" || activeTab === "swap") ? 700 : 500,
                          color: (activeTab === "bridge" || activeTab === "swap") ? "var(--text-primary)" : "var(--text-muted)",
                          marginLeft: 12,
                          transition: "color 0.2s ease, font-weight 0.2s ease",
                        }}
                      >
                        Bridge
                      </span>
                    </button>

                    {/* Chat | Pay Button */}
                    <button
                      onClick={() => navigate("chat")}
                      className={`sidebar-link${activeTab === "chat" ? " active" : ""}`}
                      style={{
                        padding: "10px 14px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "flex-start",
                        width: "100%",
                        margin: "0 0 4px 0",
                      }}
                    >
                      <img
                        src="/usdc.png"
                        alt="Chat & Pay"
                        style={{
                          width: 20,
                          height: 20,
                          borderRadius: "50%",
                          objectFit: "contain",
                          flexShrink: 0,
                          display: "block",
                        }}
                      />
                      <span
                        style={{
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          fontSize: "15.5px",
                          fontWeight: activeTab === "chat" ? 700 : 500,
                          color: activeTab === "chat" ? "var(--text-primary)" : "var(--text-muted)",
                          marginLeft: 12,
                          transition: "color 0.2s ease, font-weight 0.2s ease",
                        }}
                      >
                        Chat | Pay
                      </span>
                    </button>

                    {/* Gateway Button */}
                    <button
                      onClick={() => navigate("gateway")}
                      className={`sidebar-link${activeTab === "gateway" ? " active" : ""}`}
                      style={{
                        padding: "10px 14px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "flex-start",
                        width: "100%",
                        margin: "0 0 4px 0",
                      }}
                    >
                      <Zap
                        size={20}
                        style={{
                          color: activeTab === "gateway" ? "var(--text-primary)" : "var(--text-muted)",
                          flexShrink: 0,
                          display: "block",
                          transition: "color 0.2s ease",
                        }}
                      />
                      <span
                        style={{
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          fontSize: "15.5px",
                          fontWeight: activeTab === "gateway" ? 700 : 500,
                          color: activeTab === "gateway" ? "var(--text-primary)" : "var(--text-muted)",
                          marginLeft: 12,
                          transition: "color 0.2s ease, font-weight 0.2s ease",
                        }}
                      >
                        Gateway
                      </span>
                    </button>

                  </>
                )}
              </div>
            </div>

            {/* External Links Section (Fixed at bottom) */}
            <div
              style={{
                padding: sidebarCollapsed ? "12px 8px 12px 8px" : "12px 16px 12px 16px",
                display: "flex",
                flexDirection: "column",
                borderTop: "1px solid var(--border-soft)",
                alignItems: sidebarCollapsed ? "center" : "stretch",
                transition: "all 0.38s cubic-bezier(0.22, 1, 0.36, 1)",
              }}
            >
              {!sidebarCollapsed && (
                <>
                  <button
                    onClick={() => setResourcesExpanded(!resourcesExpanded)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      width: "100%",
                      marginBottom: 8,
                      padding: "8px 12px",
                      color: "var(--text-muted)",
                      background: "rgba(255, 255, 255, 0.02)",
                      border: "1px solid var(--border-soft)",
                      borderRadius: "8px",
                      cursor: "pointer",
                      transition: "all 0.2s"
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "rgba(255, 255, 255, 0.04)";
                      e.currentTarget.style.color = "var(--text-primary)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "rgba(255, 255, 255, 0.02)";
                      e.currentTarget.style.color = "var(--text-muted)";
                    }}
                  >
                    <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em" }}>Resources</span>
                    {resourcesExpanded ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                  </button>

                  <AnimatePresence initial={false}>
                    {resourcesExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2, ease: "easeInOut" }}
                        style={{ overflow: "hidden", display: "flex", flexDirection: "column", gap: 2, marginBottom: 8 }}
                      >
                        <a
                          href="/docs"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="sidebar-link"
                          style={{
                            padding: "6px 12px",
                            marginBottom: 0,
                            width: "100%",
                            background: "transparent",
                            border: "none",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            textDecoration: "none"
                          }}
                        >
                          <span
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              minWidth: 0,
                            }}
                          >
                            <BookOpen
                              style={{
                                width: 16,
                                height: 16,
                                color: "var(--text-muted)",
                                flexShrink: 0,
                              }}
                            />
                            <span
                              style={{
                                fontSize: 10,
                                fontWeight: 600,
                                whiteSpace: "nowrap",
                                color: "var(--text-primary)"
                              }}
                            >
                              Documentation
                            </span>
                          </span>
                          <ExternalLink
                            style={{
                              width: 12,
                              height: 12,
                              marginLeft: "auto",
                              opacity: 0.5,
                              color: "var(--text-muted)"
                            }}
                          />
                        </a>

                        <a
                          href="/privacy"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="sidebar-link"
                          style={{
                            padding: "6px 12px",
                            marginBottom: 0,
                            width: "100%",
                            background: "transparent",
                            border: "none",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            textDecoration: "none"
                          }}
                        >
                          <span
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              minWidth: 0,
                            }}
                          >
                            <Shield
                              style={{
                                width: 16,
                                height: 16,
                                color: "var(--text-muted)",
                                flexShrink: 0,
                              }}
                            />
                            <span
                              style={{
                                fontSize: 10,
                                fontWeight: 600,
                                whiteSpace: "nowrap",
                                color: "var(--text-primary)"
                              }}
                            >
                              Privacy Policy
                            </span>
                          </span>
                          <ExternalLink
                            style={{
                              width: 12,
                              height: 12,
                              marginLeft: "auto",
                              opacity: 0.5,
                              color: "var(--text-muted)"
                            }}
                          />
                        </a>

                        <a
                          href="/terms"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="sidebar-link"
                          style={{
                            padding: "6px 12px",
                            marginBottom: 0,
                            width: "100%",
                            background: "transparent",
                            border: "none",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            textDecoration: "none"
                          }}
                        >
                          <span
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              minWidth: 0,
                            }}
                          >
                            <FileText
                              style={{
                                width: 16,
                                height: 16,
                                color: "var(--text-muted)",
                                flexShrink: 0,
                              }}
                            />
                            <span
                              style={{
                                fontSize: 10,
                                fontWeight: 600,
                                whiteSpace: "nowrap",
                                color: "var(--text-primary)"
                              }}
                            >
                              Terms of Service
                            </span>
                          </span>
                          <ExternalLink
                            style={{
                              width: 12,
                              height: 12,
                              marginLeft: "auto",
                              opacity: 0.5,
                              color: "var(--text-muted)"
                            }}
                          />
                        </a>

                        <a
                          href="/cookies"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="sidebar-link"
                          style={{
                            padding: "6px 12px",
                            marginBottom: 0,
                            width: "100%",
                            background: "transparent",
                            border: "none",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            textDecoration: "none"
                          }}
                        >
                          <span
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              minWidth: 0,
                            }}
                          >
                            <Cookie
                              style={{
                                width: 16,
                                height: 16,
                                color: "var(--text-muted)",
                                flexShrink: 0,
                              }}
                            />
                            <span
                              style={{
                                fontSize: 10,
                                fontWeight: 600,
                                whiteSpace: "nowrap",
                                color: "var(--text-primary)"
                              }}
                            >
                              Cookie Policy
                            </span>
                          </span>
                          <ExternalLink
                            style={{
                              width: 12,
                              height: 12,
                              marginLeft: "auto",
                              opacity: 0.5,
                              color: "var(--text-muted)"
                            }}
                          />
                        </a>

                        <a
                          href="/risk"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="sidebar-link"
                          style={{
                            padding: "6px 12px",
                            marginBottom: 0,
                            width: "100%",
                            background: "transparent",
                            border: "none",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            textDecoration: "none"
                          }}
                        >
                          <span
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              minWidth: 0,
                            }}
                          >
                            <AlertTriangle
                              style={{
                                width: 16,
                                height: 16,
                                color: "var(--text-muted)",
                                flexShrink: 0,
                              }}
                            />
                            <span
                              style={{
                                fontSize: 10,
                                fontWeight: 600,
                                whiteSpace: "nowrap",
                                color: "var(--text-primary)"
                              }}
                            >
                              Risk Disclosure
                            </span>
                          </span>
                          <ExternalLink
                            style={{
                              width: 12,
                              height: 12,
                              marginLeft: "auto",
                              opacity: 0.5,
                              color: "var(--text-muted)"
                            }}
                          />
                        </a>

                        <a
                          href="/acceptable-use"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="sidebar-link"
                          style={{
                            padding: "6px 12px",
                            marginBottom: 0,
                            width: "100%",
                            background: "transparent",
                            border: "none",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            textDecoration: "none"
                          }}
                        >
                          <span
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              minWidth: 0,
                            }}
                          >
                            <FileCheck
                              style={{
                                width: 16,
                                height: 16,
                                color: "var(--text-muted)",
                                flexShrink: 0,
                              }}
                            />
                            <span
                              style={{
                                fontSize: 10,
                                fontWeight: 600,
                                whiteSpace: "nowrap",
                                color: "var(--text-primary)"
                              }}
                            >
                              Acceptable Use Policy
                            </span>
                          </span>
                          <ExternalLink
                            style={{
                              width: 12,
                              height: 12,
                              marginLeft: "auto",
                              opacity: 0.5,
                              color: "var(--text-muted)"
                            }}
                          />
                        </a>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </>
              )}

              <a
                href="https://x.com/ArcFunTerminal"
                target="_blank"
                rel="noopener noreferrer"
                title="Follow ArcFun on X"
                style={{
                  marginTop: !sidebarCollapsed && resourcesExpanded ? 8 : 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: sidebarCollapsed ? "center" : "flex-start",
                  gap: 10,
                  padding: sidebarCollapsed ? "0" : "10px",
                  width: sidebarCollapsed ? 44 : "100%",
                  height: sidebarCollapsed ? 44 : "auto",
                  minHeight: sidebarCollapsed ? 44 : undefined,
                  background: "var(--bg)",
                  border: "1px solid var(--border)",
                  borderRadius: sidebarCollapsed ? 12 : 12,
                  textDecoration: "none",
                  transition: "all 0.2s ease-in-out"
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "var(--text-primary)";
                  if (sidebarCollapsed) {
                    e.currentTarget.style.transform = "scale(1.05)";
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "var(--border)";
                  if (sidebarCollapsed) {
                    e.currentTarget.style.transform = "scale(1)";
                  }
                }}
              >
                {sidebarCollapsed ? (
                  <svg
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    style={{
                      width: 17,
                      height: 17,
                      fill: "var(--text-primary)",
                    }}
                  >
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                  </svg>
                ) : (
                  <>
                    <img
                      src="/rocket-logo.png"
                      alt="ArcFun"
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: "50%",
                        objectFit: "cover",
                      }}
                    />
                    <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", flex: 1 }}>
                      ArcFun
                    </span>
                    <span
                      style={{
                        fontSize: 9,
                        fontWeight: 700,
                        background: "var(--text-primary)",
                        color: "var(--surface)",
                        padding: "3px 8px",
                        borderRadius: 99,
                        textTransform: "uppercase",
                        letterSpacing: "0.02em",
                      }}
                    >
                      Follow
                    </span>
                  </>
                )}
              </a>
            </div>
          </aside>
        )}

        {/* MAIN CONTENT AREA (AskORO Inspired Curved Floating Panel) */}
        <main
          onScroll={handleMainScroll}
          className="main-floating-panel"
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            minWidth: 0,
            minHeight: 0,
            height: "100%",
            maxHeight: "100%",
            position: "relative",
            overflow: "hidden",
          }}
        >

          {/* Desktop Top-Right Network & Profile Controls */}
          <div className="hidden md:block">
            <Header
              admin={admin}
              onAdminClick={() => navigate("admin")}
              activeTab={activeTab}
              onOpenFaucetHub={() => setFaucetHubOpen(true)}
              onOpenPrivacyPolicy={() => setPrivacyPolicyOpen(true)}
              onOpenTermsOfService={() => setTermsOfServiceOpen(true)}
              onOpenCookiePolicy={() => setCookiePolicyOpen(true)}
              onOpenRiskDisclosure={() => setRiskDisclosureOpen(true)}
              onOpenAcceptableUsePolicy={() => setAcceptableUsePolicyOpen(true)}
              variant="desktop-card"
            />
          </div>
          <div
            className={`main-scroll-container ${activeTab === "chat" ? "chat-scroll-container" : ""}`}
            onScroll={handleMainScroll}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              overflowY: activeTab === "chat" ? "hidden" : "auto",
              overflowX: "hidden",
              position: "relative",
              zIndex: 1,
              padding:
                activeTab === "bridge" || activeTab === "swap" || activeTab === "token"
                  ? "16px 24px 24px"
                  : activeTab === "chat"
                    ? "0"
                    : "32px 24px 24px",
            }}
          >
          <div
            style={{
              maxWidth: "100%",
              width: "100%",
              margin: 0,
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: activeTab === "bridge" || activeTab === "swap" || activeTab === "token" ? "flex-start" : activeTab === "chat" ? "stretch" : "center",
              minHeight: 0,
              height: activeTab === "chat" ? "100%" : "auto",
            }}
          >
            {/* Content */}
            <div
              style={{
                maxWidth: "100%",
                margin: 0,
                width: "100%",
                display: "flex",
                flexDirection: "column",
                alignItems: activeTab === "bridge" || activeTab === "swap" || activeTab === "token" ? "flex-start" : activeTab === "chat" ? "stretch" : "center",
                minHeight: 0,
                flex: 1,
                height: activeTab === "chat" ? "100%" : "auto",
              }}
            >
              {activeTab === "token" ? (
                <TokenTradingView
                  tokenAddress={(tokenAddress || (pathname?.startsWith("/token/") ? pathname.split("/token/")[1] : "") || "").toLowerCase()}
                  sidebarCollapsed={sidebarCollapsed}
                />
              ) : activeTab === "admin" ? (
                <AdminPanel />
              ) : activeTab === "gateway" ? (
                <CircleGatewayView />
              ) : activeTab === "wallet" ? (
                <div style={{ width: "100%", maxWidth: 640, margin: "0 auto", padding: "16px 0" }}>
                  <ArcNativeWallet />
                </div>
              ) : activeTab === "chat" ? (
                <div style={{ width: "100%", height: "100%", minHeight: 0, display: "flex", flexDirection: "column", flex: 1 }}>
                  <ChatProvider>
                    <ChatManager />
                  </ChatProvider>
                </div>
              ) : (
                <SwapBridgeManager
                  onOpenFaucetHub={() => setFaucetHubOpen(true)}
                  sidebarCollapsed={sidebarCollapsed}
                />
              )}
            </div>

            {/* Mobile Resources Section - Moved to Header 3-dot menu */}
          </div>
          </div>
        </main>
        </div>
      </div>

      {/* ─── BOTTOM NAV: always full native size, NOT scaled ─── */}
      <MobileBottomNav
        activeTab={activeTab as any}
        onNavigate={navigate as any}
        showBottomNav={isChatOpen ? false : showBottomNav}
      />

      {features.faucetEnabled && (
        <FaucetHub
          isOpen={faucetHubOpen}
          onClose={() => setFaucetHubOpen(false)}
          sidebarCollapsed={sidebarCollapsed}
        />
      )}
      <PrivacyPolicyModal isOpen={privacyPolicyOpen} onClose={() => setPrivacyPolicyOpen(false)} />
      <TermsOfServiceModal isOpen={termsOfServiceOpen} onClose={() => setTermsOfServiceOpen(false)} />
      <CookiePolicyModal isOpen={cookiePolicyOpen} onClose={() => setCookiePolicyOpen(false)} />
      <RiskDisclosureModal isOpen={riskDisclosureOpen} onClose={() => setRiskDisclosureOpen(false)} />
      <AcceptableUsePolicyModal isOpen={acceptableUsePolicyOpen} onClose={() => setAcceptableUsePolicyOpen(false)} />
    </div>
  );
}
