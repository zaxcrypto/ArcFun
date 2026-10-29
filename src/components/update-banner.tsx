"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

const DISMISSED_KEY = "arc_update_dismissed";

export function UpdateBanner() {
  const [show, setShow] = useState(false);
  const [animOut, setAnimOut] = useState(false);

  const dismiss = useCallback(() => {
    setAnimOut(true);
    setTimeout(() => setShow(false), 320);
    try { sessionStorage.setItem(DISMISSED_KEY, "1"); } catch {}
  }, []);

  const reload = useCallback(() => {
    window.location.reload();
  }, []);

  useEffect(() => {
    try { if (sessionStorage.getItem(DISMISSED_KEY)) return; } catch {}

    const check = async () => {
      try {
        const res = await fetch("/?_=" + Date.now(), {
          headers: { Accept: "text/html" },
          cache: "no-store",
        });
        if (!res.ok) return;
        const html = await res.text();
        const match = html.match(/"buildId":"([^"]+)"/);
        if (!match) return;
        const remoteBuildId = match[1];
        const localBuildId = typeof window !== "undefined"
          // @ts-ignore
          ? (window.__NEXT_DATA__?.buildId ?? null)
          : null;

        if (localBuildId && remoteBuildId !== localBuildId) {
          setShow(true);
        }
      } catch {}
    };

    const t = setTimeout(check, 8000);
    const interval = setInterval(check, 5 * 60 * 1000);
    return () => { clearTimeout(t); clearInterval(interval); };
  }, []);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="update-banner"
          initial={{ opacity: 0, y: -20, scale: 0.96 }}
          animate={animOut
            ? { opacity: 0, y: -20, scale: 0.96 }
            : { opacity: 1, y: 0, scale: 1 }
          }
          exit={{ opacity: 0, y: -20, scale: 0.96 }}
          transition={{ type: "spring", stiffness: 420, damping: 32 }}
          style={{
            position: "fixed",
            top: "max(14px, env(safe-area-inset-top))",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 9999,
            pointerEvents: "auto",
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 14px 10px 16px",
            borderRadius: 999,
            background: "color-mix(in srgb, var(--surface, #ffffff) 82%, transparent)",
            backdropFilter: "blur(28px) saturate(180%)",
            WebkitBackdropFilter: "blur(28px) saturate(180%)",
            border: "1px solid color-mix(in srgb, var(--border, #e2e8f0) 70%, transparent)",
            boxShadow: "0 4px 24px rgba(0,0,0,0.16), 0 1px 4px rgba(0,0,0,0.08), inset 0 1px 1px rgba(255,255,255,0.2)",
            whiteSpace: "nowrap",
          }}
        >
          <span style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: "#22c55e",
            flexShrink: 0,
            boxShadow: "0 0 0 2px rgba(34,197,94,0.25)",
          }} />

          <span style={{
            fontSize: 13,
            fontWeight: 500,
            color: "var(--text-primary, #0f172a)",
            letterSpacing: "-0.01em",
          }}>
            New version available
          </span>

          <button
            onClick={reload}
            style={{
              height: 28,
              padding: "0 12px",
              borderRadius: 999,
              background: "var(--text-primary, #0f172a)",
              color: "var(--surface, #ffffff)",
              fontSize: 12,
              fontWeight: 600,
              border: "none",
              cursor: "pointer",
              letterSpacing: "-0.01em",
              flexShrink: 0,
            }}
          >
            Reload
          </button>

          <button
            onClick={dismiss}
            style={{
              width: 24,
              height: 24,
              borderRadius: "50%",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--text-muted, #94a3b8)",
              padding: 0,
              flexShrink: 0,
            }}
            aria-label="Dismiss update"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
