"use client";

import { useEffect, useState } from "react";

export type Tab = "swap" | "bridge" | "chat" | "admin" | "gateway" | "token" | "wallet";

interface MobileBottomNavProps {
  activeTab: Tab;
  onNavigate: (tab: Tab) => void;
  showBottomNav: boolean;
  /** @deprecated no longer used, kept for callsite compat */
  isLaunchpadLocked?: boolean;
}

function isTextInput(el: Element | null): boolean {
  if (!el) return false;
  if (el instanceof HTMLTextAreaElement) return true;
  if (el instanceof HTMLInputElement) {
    const nonTextTypes = [
      "checkbox",
      "radio",
      "button",
      "submit",
      "reset",
      "range",
      "color",
      "file",
      "image",
    ];
    return !nonTextTypes.includes((el.type || "").toLowerCase());
  }
  return (el as HTMLElement).isContentEditable === true;
}

export function MobileBottomNav({
  activeTab,
  onNavigate,
  showBottomNav,
}: MobileBottomNavProps) {
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);

  const isBridgeActive = activeTab === "bridge" || activeTab === "swap";
  const isChatActive = activeTab === "chat";
  const isGatewayActive = activeTab === "gateway";

  // Reset keyboard/focus on tab switch
  useEffect(() => {
    setIsInputFocused(false);
    setIsKeyboardOpen(false);
  }, [activeTab]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleFocusIn = (e: FocusEvent) => {
      if (window.innerWidth >= 768) return;
      if (isTextInput(e.target as Element)) {
        setIsInputFocused(true);
      }
    };

    const handleFocusOut = () => {
      if (window.innerWidth >= 768) return;
      // Slight delay so tapping between inputs or tapping Max doesn't flash
      setTimeout(() => {
        if (!isTextInput(document.activeElement)) {
          setIsInputFocused(false);
        }
      }, 120);
    };

    document.addEventListener("focusin", handleFocusIn);
    document.addEventListener("focusout", handleFocusOut);

    // Keyboard detection via visualViewport (Android Chrome & iOS Safari)
    const vv = window.visualViewport;
    const handleViewportResize = () => {
      if (window.innerWidth >= 768) return;
      if (window.visualViewport) {
        // When mobile keyboard opens, visualViewport.height is significantly less than window.innerHeight
        const heightDiff = window.innerHeight - window.visualViewport.height;
        setIsKeyboardOpen(heightDiff > 120);
      }
    };

    if (vv) {
      vv.addEventListener("resize", handleViewportResize);
      vv.addEventListener("scroll", handleViewportResize);
    }

    return () => {
      document.removeEventListener("focusin", handleFocusIn);
      document.removeEventListener("focusout", handleFocusOut);
      if (vv) {
        vv.removeEventListener("resize", handleViewportResize);
        vv.removeEventListener("scroll", handleViewportResize);
      }
    };
  }, []);

  const isVisible = showBottomNav && !isInputFocused && !isKeyboardOpen;

  return (
    <nav
      aria-label="Mobile Navigation"
      className="md:hidden"
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        padding: "12px 16px",
        paddingBottom: "max(14px, env(safe-area-inset-bottom))",
        zIndex: 50,
        transform: isVisible ? "translateY(0)" : "translateY(calc(100% + 50px))",
        transition: "transform 0.32s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.26s ease",
        opacity: isVisible ? 1 : 0,
        pointerEvents: isVisible ? "auto" : "none",
        willChange: "transform, opacity",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 380,
          margin: "0 auto",
          height: 48,
          borderRadius: 999,
          background: "color-mix(in srgb, var(--surface) 92%, transparent)",
          backdropFilter: "blur(40px) saturate(200%)",
          WebkitBackdropFilter: "blur(40px) saturate(200%)",
          border: "1px solid color-mix(in srgb, var(--border) 80%, transparent)",
          boxShadow: "0 8px 32px -2px rgba(0, 0, 0, 0.22), 0 2px 8px rgba(0,0,0,0.12), inset 0 1px 1px rgba(255, 255, 255, 0.18)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: isVisible ? "auto" : "none",
          gap: 4,
          padding: "4px 6px",
        }}
      >
        {/* Bridge */}
        <button
          type="button"
          onClick={() => onNavigate("bridge")}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
            borderRadius: 999,
            background: isBridgeActive
              ? "rgba(255, 255, 255, 0.12)"
              : "transparent",
            border: isBridgeActive
              ? "1px solid rgba(255, 255, 255, 0.1)"
              : "1px solid transparent",
            cursor: "pointer",
            color: isBridgeActive
              ? "var(--text-primary)"
              : "var(--text-muted)",
            fontFamily: "var(--font-geist), var(--font-inter), sans-serif",
            fontSize: "13px",
            fontWeight: isBridgeActive ? 600 : 500,
            letterSpacing: "0.01em",
            transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
            flex: 1,
            boxShadow: isBridgeActive ? "0 2px 8px rgba(0, 0, 0, 0.12)" : "none",
          }}
        >
          Bridge
        </button>

        {/* Chat */}
        <button
          type="button"
          onClick={() => onNavigate("chat")}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
            borderRadius: 999,
            background: isChatActive
              ? "rgba(255, 255, 255, 0.12)"
              : "transparent",
            border: isChatActive
              ? "1px solid rgba(255, 255, 255, 0.1)"
              : "1px solid transparent",
            cursor: "pointer",
            color: isChatActive
              ? "var(--text-primary)"
              : "var(--text-muted)",
            fontFamily: "var(--font-geist), var(--font-inter), sans-serif",
            fontSize: "13px",
            fontWeight: isChatActive ? 600 : 500,
            letterSpacing: "0.01em",
            transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
            flex: 1,
            boxShadow: isChatActive ? "0 2px 8px rgba(0, 0, 0, 0.12)" : "none",
          }}
        >
          Chat
        </button>

        {/* Gateway */}
        <button
          type="button"
          onClick={() => onNavigate("gateway")}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
            borderRadius: 999,
            background: isGatewayActive
              ? "rgba(255, 255, 255, 0.12)"
              : "transparent",
            border: isGatewayActive
              ? "1px solid rgba(255, 255, 255, 0.1)"
              : "1px solid transparent",
            cursor: "pointer",
            color: isGatewayActive
              ? "var(--text-primary)"
              : "var(--text-muted)",
            fontFamily: "var(--font-geist), var(--font-inter), sans-serif",
            fontSize: "13px",
            fontWeight: isGatewayActive ? 600 : 500,
            letterSpacing: "0.01em",
            transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
            flex: 1,
            boxShadow: isGatewayActive ? "0 2px 8px rgba(0, 0, 0, 0.12)" : "none",
          }}
        >
          Gateway
        </button>
      </div>
    </nav>
  );
}
