"use client";

import { X, FileCheck, Globe, Mail } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useEffect } from "react";
import { createPortal } from "react-dom";

interface AcceptableUsePolicyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AcceptableUsePolicyModal({ isOpen, onClose }: AcceptableUsePolicyModalProps) {
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
                    <FileCheck size={17} color="#ffffff" />
                  </div>
                  <div>
                    <h1 style={{ fontSize: 17, fontWeight: 800, color: "#fff", margin: 0, letterSpacing: "-0.02em" }}>Acceptable Use Policy</h1>
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
                    This Acceptable Use Policy sets forth prohibited activities when accessing or interacting with{" "}
                    <a href="https://www.thearcfun.xyz" style={{ color: "#ffffff", textDecoration: "underline", textUnderlineOffset: 3, fontWeight: 600 }}>https://www.thearcfun.xyz</a>{" "}
                    and associated software interfaces, including the ArcFun Bridge and Launchpad.
                  </p>
                  <p style={{ fontSize: 14, color: "rgba(255,255,255,0.38)", lineHeight: 1.8, margin: 0 }}>
                    By accessing or using the interface, you agree to abide by these standards. Violating this policy may result in restriction of interface access or blocking of abusive automated traffic.
                  </p>
                </div>

                <ASection title="1. Unlawful Activities & Sanctions Violations">
                  <p>You may not use ArcFun for any illegal purpose or in violation of applicable laws, including:</p>
                  <ul>
                    <li>Engaging in money laundering, terrorist financing, proliferation financing, or illicit financial transactions.</li>
                    <li>Attempting to evade economic or trade sanctions administered by OFAC, the United Nations, European Union, or United Kingdom.</li>
                    <li>Transacting with or facilitating transactions on behalf of specially designated nationals or blocked entities.</li>
                    <li>Funding or transacting in connection with illegal narcotics, stolen goods, weapons, or illicit contraband.</li>
                  </ul>
                </ASection>

                <ASection title="2. Fraudulent Token Creation & Scams">
                  <p>The ArcFun Launchpad allows permissionless token creation. You must NOT deploy or promote:</p>
                  <ul>
                    <li><strong>Malicious Smart Contracts:</strong> Honeypots, blacklists preventing users from selling, or contracts containing hidden backdoors or drain functions.</li>
                    <li><strong>Scams &amp; Rug Pulls:</strong> Deceptive schemes designed to mislead investors, solicit fraudulent capital, or abandon liquidity illicitly.</li>
                    <li><strong>Impersonation:</strong> Minting tokens pretending to be officially affiliated with established corporations, public figures, third-party projects, or ArcFun without authorization.</li>
                    <li><strong>Phishing &amp; Social Engineering:</strong> Providing misleading metadata, websites, or social links designed to compromise user credentials or wallets.</li>
                  </ul>
                </ASection>

                <ASection title="3. Market Manipulation & Abusive Trading">
                  <p>You agree not to engage in manipulative trading practices on ArcFun bonding curves, including:</p>
                  <ul>
                    <li><strong>Wash Trading:</strong> Executing simultaneous buy and sell orders from coordinated wallets to artificially inflate volume or activity.</li>
                    <li><strong>Deceptive Market Practices:</strong> Engaging in spoofing, quoting false intentions, or pump-and-dump coordination.</li>
                    <li><strong>Abusive Automated Bot Traffic:</strong> Flooding the interface or bonding curves with front-running, spamming, or denial-of-service transactions that impair network usability for legitimate participants.</li>
                  </ul>
                </ASection>

                <ASection title="4. System Integrity & Security Exploits">
                  <p>You must not attempt to compromise the security, availability, or stability of ArcFun infrastructure:</p>
                  <ul>
                    <li>Attempting to probe, scan, exploit, or bypass bot detection, Cloudflare Turnstile, or rate-limiting filters.</li>
                    <li>Attacking RPC endpoints, relayer gas infrastructure, or API routing mechanisms.</li>
                    <li>Introducing malware, viruses, worms, or malicious scripts into the frontend application.</li>
                    <li>Abusing or spamming the /recover bridge recovery utility with fraudulent transaction hashes.</li>
                  </ul>
                </ASection>

                <ASection title="5. ArcFun Wallet & Third-Party Infrastructure Compliance">
                  <p>ArcFun Wallets are powered by Circle Developer-Controlled Wallets. When creating or funding an ArcFun Wallet, you agree to:</p>
                  <ul>
                    <li><strong>Legitimate Use:</strong> Use the wallet strictly for lawful personal or organizational digital asset interactions.</li>
                    <li><strong>No Mixing or Obfuscation:</strong> You must NOT use ArcFun Wallets to funnel, layer, or obfuscate the origin of illicit funds or proceeds of cybercrime.</li>
                    <li><strong>No Infrastructure Tampering:</strong> You must NOT attempt to reverse-engineer, decompile, intercept, or tamper with the API endpoints, cryptographic signatures, or authentication handshakes between ArcFun and Circle.</li>
                    <li><strong>Sole Responsibility for Funding:</strong> You acknowledge that ArcFun has zero custody over user assets. You are solely responsible for all funds deposited into or transferred from your ArcFun Wallet.</li>
                  </ul>
                </ASection>

                <ASection title="6. Platform Enforcement & Non-Custodial Boundaries">
                  <p>ArcFun reserves the right to take appropriate protective actions if this policy is violated:</p>
                  <ul>
                    <li>Restricting or filtering access to the web interface, API routes, or relayer gas subsidization for violating IP addresses or abusive automated scripts.</li>
                    <li>Hiding or de-listing known fraudulent, scam, or trademark-infringing token metadata from the frontend display.</li>
                    <li>Reporting verified illegal activities to applicable regulatory or law enforcement bodies when legally required.</li>
                  </ul>
                  <p>Because ArcFun does not custody user assets, ArcFun cannot confiscate tokens held in self-custody wallets or alter finalized public blockchain state.</p>
                </ASection>

                <div style={{ paddingTop: 4 }}>
                  <h2 style={{ fontSize: 15, fontWeight: 700, color: "#fff", margin: "0 0 10px" }}>Contact</h2>
                  <p style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", marginBottom: 14, lineHeight: 1.7 }}>If you have any questions regarding this Acceptable Use Policy, please contact us:</p>
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

function ASection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ paddingBottom: 24, marginBottom: 24, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
      <h2 style={{ fontSize: 14, fontWeight: 700, color: "#fff", margin: "0 0 10px" }}>{title}</h2>
      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", lineHeight: 1.8 }}>
        <style>{`.asec p{margin:0 0 8px}.asec ul{padding-left:18px;margin:0;display:flex;flex-direction:column;gap:6px}.asec li{color:rgba(255,255,255,0.5);line-height:1.75}.asec strong{color:rgba(255,255,255,0.8);font-weight:600}`}</style>
        <div className="asec" style={{ display: "flex", flexDirection: "column", gap: 6 }}>{children}</div>
      </div>
    </div>
  );
}

