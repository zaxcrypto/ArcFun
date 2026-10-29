"use client";

import { X, Cookie, Globe, Mail } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useEffect } from "react";
import { createPortal } from "react-dom";

interface CookiePolicyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CookiePolicyModal({ isOpen, onClose }: CookiePolicyModalProps) {
  useEffect(() => {
    if (isOpen) { document.body.style.overflow = "hidden"; }
    else { document.body.style.overflow = ""; }
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 999998, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }} onClick={onClose} />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 16 }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
            style={{ position: "fixed", inset: 0, zIndex: 999999, display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}
          >
            <div style={{ width: "100%", maxWidth: 960, maxHeight: "92vh", background: "#111114", borderRadius: 20, border: "1px solid rgba(255,255,255,0.08)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
              {/* Header */}
              <div style={{ padding: "22px 28px", borderBottom: "1px solid rgba(255,255,255,0.07)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Cookie size={17} color="#ffffff" />
                  </div>
                  <div>
                    <h1 style={{ fontSize: 17, fontWeight: 800, color: "#fff", margin: 0, letterSpacing: "-0.02em" }}>Cookie &amp; Storage Policy</h1>
                    <p style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", margin: "2px 0 0" }}>Effective Date: October 2026 | Last Updated: October 2026</p>
                  </div>
                </div>
                <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.5)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", transition: "all 0.2s" }}
                  onMouseOver={e => { e.currentTarget.style.background = "rgba(255,255,255,0.12)"; e.currentTarget.style.color = "#fff"; }}
                  onMouseOut={e => { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; e.currentTarget.style.color = "rgba(255,255,255,0.5)"; }}>
                  <X size={14} />
                </button>
              </div>

              {/* Scrollable content */}
              <div style={{ flex: 1, overflowY: "auto", padding: "28px 28px 40px" }}>
                <div style={{ marginBottom: 32, paddingBottom: 28, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  <p style={{ fontSize: 14, color: "rgba(255,255,255,0.6)", lineHeight: 1.8, margin: "0 0 10px" }}>
                    This Cookie and Local Storage Policy explains how ArcFun uses browser storage technologies when you visit{" "}
                    <a href="https://www.thearcfun.xyz" style={{ color: "#ffffff", textDecoration: "underline", textUnderlineOffset: 3, fontWeight: 600 }}>https://www.thearcfun.xyz</a>{" "}
                    and interact with the ArcFun Bridge, Launchpad, and trading interfaces.
                  </p>
                  <p style={{ fontSize: 14, color: "rgba(255,255,255,0.38)", lineHeight: 1.8, margin: 0 }}>
                    We do not track you across third-party websites or sell user profiles. We strictly use client-side storage for interface performance, security, and user preferences.
                  </p>
                </div>

                <CSection title="1. Overview: Cookies vs. Local Storage">
                  <p>It is important to understand the technical distinction between browser mechanisms:</p>
                  <ul>
                    <li><strong>Cookies:</strong> Small text snippets sent automatically with HTTP requests. ArcFun minimizes cookie usage strictly to essential bot defense and session security.</li>
                    <li><strong>Local Storage (localStorage):</strong> Client-side key-value storage residing solely in your browser. This data is never automatically transmitted over the network and is used to remember your UI settings.</li>
                    <li><strong>Server / RPC Logs:</strong> Transient server-side operational logs used for error diagnostics and DDoS protection.</li>
                  </ul>
                </CSection>

                <CSection title="2. Local Storage Usage">
                  <p>ArcFun uses browser <code>localStorage</code> strictly for non-tracking application preferences and decentralized interface states:</p>
                  <ul>
                    <li><strong>Theme Preference:</strong> Storing your interface visual mode (dark mode).</li>
                    <li><strong>Trading &amp; Slippage Settings:</strong> Remembering your chosen custom slippage tolerance percentages for bonding curve swaps.</li>
                    <li><strong>ArcFun Wallet &amp; Connector State:</strong> Remembering the last active wallet provider (e.g., ArcFun Wallet, MetaMask, Phantom, Coinbase Wallet) or public wallet addresses for automatic interface reconnection.</li>
                    <li><strong>Interface State:</strong> Persisting dismissed announcement banners, cross-chain bridge transaction history, and recently viewed token filters.</li>
                  </ul>
                </CSection>

                <CSection title="3. Security &amp; Essential Cookies">
                  <p>Where utilized, cookies on ArcFun are restricted to essential operational and cryptographic authentication functions:</p>
                  <ul>
                    <li><strong>Session Security (<code>arc_session</code>):</strong> A secure, signed session cookie used exclusively to verify API requests for self-service ArcFun Wallet operations (powered by Circle Developer-Controlled Wallets) without ever exposing or handling private keys.</li>
                    <li><strong>Bot Protection (Cloudflare Turnstile):</strong> Evaluates non-invasive device signals to ensure visitors are human and prevent automated abuse.</li>
                  </ul>
                  <p>ArcFun does <strong>not</strong> use advertising cookies, marketing tracking pixels, or cross-site analytics beacons.</p>
                </CSection>

                <CSection title="4. Managing Browser Storage">
                  <p>You can inspect, block, or clear cookies and local storage at any time through your browser settings:</p>
                  <ul>
                    <li>Clearing local storage will reset your slippage preferences and theme back to default values.</li>
                    <li>Blocking all cookies may cause Cloudflare Turnstile verification or administrator login sessions to fail.</li>
                  </ul>
                </CSection>

                <CSection title="5. Updates to This Policy">
                  <p>We may update this policy if technical storage mechanisms change. Any modifications will be reflected with an updated &quot;Last Updated&quot; date.</p>
                </CSection>

                <div style={{ paddingTop: 4 }}>
                  <h2 style={{ fontSize: 15, fontWeight: 700, color: "#fff", margin: "0 0 10px" }}>Contact</h2>
                  <p style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", marginBottom: 14, lineHeight: 1.7 }}>If you have any questions regarding this Cookie Policy, please contact us:</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {[{ icon: Globe, label: "https://www.thearcfun.xyz", href: "https://www.thearcfun.xyz" }, { icon: Mail, label: "supportarcfun@gmail.com", href: "mailto:supportarcfun@gmail.com" }].map(({ icon: Icon, label, href }) => (
                      <a key={href} href={href} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, textDecoration: "none", color: "#fff", fontSize: 13, fontWeight: 600, transition: "all 0.2s", width: "fit-content" }}
                        onMouseOver={e => e.currentTarget.style.background = "rgba(255,255,255,0.08)"}
                        onMouseOut={e => e.currentTarget.style.background = "rgba(255,255,255,0.04)"}>
                        <Icon size={14} color="#ffffff" />{label}
                      </a>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}

function CSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ paddingBottom: 24, marginBottom: 24, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
      <h2 style={{ fontSize: 14, fontWeight: 700, color: "#fff", margin: "0 0 10px" }}>{title}</h2>
      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", lineHeight: 1.8 }}>
        <style>{`.csec p{margin:0 0 8px}.csec ul{padding-left:18px;margin:0;display:flex;flex-direction:column;gap:6px}.csec li{color:rgba(255,255,255,0.5);line-height:1.75}.csec strong{color:rgba(255,255,255,0.8);font-weight:600}`}</style>
        <div className="csec" style={{ display: "flex", flexDirection: "column", gap: 6 }}>{children}</div>
      </div>
    </div>
  );
}

