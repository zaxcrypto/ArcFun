"use client";

import { X, Shield, Globe, Mail } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useEffect } from "react";
import { createPortal } from "react-dom";

interface PrivacyPolicyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function PrivacyPolicyModal({ isOpen, onClose }: PrivacyPolicyModalProps) {
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
          {/* Fully opaque dark backdrop — no website bleed-through */}
          <div
            style={{ position: "fixed", inset: 0, zIndex: 999998, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}
            onClick={onClose}
          />
          {/* Floating panel */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 16 }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
            style={{ position: "fixed", inset: 0, zIndex: 999999, display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}
          >
            <div style={{
              width: "100%", maxWidth: 960, maxHeight: "92vh",
              background: "#111114",
              borderRadius: 20, border: "1px solid rgba(255,255,255,0.08)",
              display: "flex", flexDirection: "column", overflow: "hidden",
            }}>
              {/* Header */}
              <div style={{ padding: "22px 28px", borderBottom: "1px solid rgba(255,255,255,0.07)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Shield size={17} color="#ffffff" />
                  </div>
                  <div>
                    <h1 style={{ fontSize: 17, fontWeight: 800, color: "#fff", margin: 0, letterSpacing: "-0.02em" }}>Privacy Policy</h1>
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
                {/* Intro */}
                <div style={{ marginBottom: 32, paddingBottom: 28, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  <p style={{ fontSize: 14, color: "rgba(255,255,255,0.6)", lineHeight: 1.8, margin: "0 0 10px" }}>
                    Welcome to ArcFun (&quot;ArcFun&quot;, &quot;we&quot;, &quot;us&quot;, or &quot;our&quot;). We respect your privacy and are committed to transparent information practices. This Privacy Policy explains how data is handled when you visit{" "}
                    <a href="https://www.thearcfun.xyz" style={{ color: "#ffffff", textDecoration: "underline", textUnderlineOffset: 3, fontWeight: 600 }}>https://www.thearcfun.xyz</a>{" "}
                    and interact with our non-custodial software interface, including the ArcFun Bridge, ArcFun Launchpad, on-chain token trading interface, and related recovery tools (collectively, the &quot;Services&quot;).
                  </p>
                  <p style={{ fontSize: 14, color: "rgba(255,255,255,0.38)", lineHeight: 1.8, margin: 0 }}>
                    By accessing or interacting with the Services, you acknowledge that you have read and understood the data practices described in this Privacy Policy.
                  </p>
                </div>

                {/* Sections */}
                <PSection title="1. Non-Custodial Architecture, ArcFun Wallet & Wallet Credentials">
                  <p>ArcFun is a non-custodial decentralized software application, and ArcFun Wallets are powered by Circle Developer-Controlled Wallets (Programmable Wallets):</p>
                  <ul>
                    <li>ArcFun does <strong>never</strong> request, collect, store, transmit, or have access to your private keys, seed phrases, or unencrypted cryptographic secrets.</li>
                    <li>ArcFun does <strong>not</strong> possess custody, access, or control over your digital asset balances or funds.</li>
                    <li>Cryptographic signing and wallet enclave management for ArcFun Wallets are powered by Circle Internet Financial infrastructure. ArcFun operates strictly as a non-custodial UI.</li>
                    <li>All transactions on the ArcFun Bridge, ArcFun Wallet, or Launchpad are executed on public decentralized blockchain networks.</li>
                  </ul>
                </PSection>

                <PSection title="2. Information We Process">
                  <p>Depending on how you use our interface, we may process limited categories of technical and on-chain information:</p>
                  <ul>
                    <li><strong>Public Wallet Addresses:</strong> When you connect a wallet or create an ArcFun Wallet, public blockchain addresses (EVM, Solana) are read by the interface to display token balances, transaction states, and available cross-chain transfers.</li>
                    <li><strong>Public Blockchain Data:</strong> Transaction hashes, token transfers, bonding curve trades, token deployments, and CCTP burn/mint events are read directly from public distributed ledgers and RPC endpoints.</li>
                    <li><strong>Technical &amp; Device Information:</strong> Standard server and HTTP header data, including IP address, browser type, operating system, referring URL, and approximate geolocation, may be temporarily logged by our hosting infrastructure and security filters to prevent DDoS attacks and spam.</li>
                    <li><strong>Security &amp; Bot Verification:</strong> Cloudflare Turnstile signals and challenge tokens are processed to differentiate legitimate human users from abusive automated scripts.</li>
                    <li><strong>Support Communications:</strong> If you voluntarily contact us via email, we receive your email address and any communications content you choose to share.</li>
                  </ul>
                </PSection>

                <PSection title="3. Blockchain Transparency & Immutability">
                  <p>Public blockchains are decentralized, transparent, and immutable by design. When you execute a bridge transfer via Circle CCTP, fund an ArcFun Wallet, or buy/sell tokens on the ArcFun bonding curve, the transaction details—including your public wallet address, transaction hash, amounts, token contract addresses, and timestamps—are permanently published to public ledgers.</p>
                  <p>ArcFun has no ability to alter, delete, conceal, or reverse data published to a blockchain network.</p>
                </PSection>

                <PSection title="4. How We Use Information">
                  <p>We process the limited data described above strictly for operational and technical purposes:</p>
                  <ul>
                    <li>To render the decentralized interface and display accurate on-chain balances, quotes, charts, and transaction statuses.</li>
                    <li>To facilitate cross-chain bridge relaying (supplying destination transaction gas where supported) or enabling self-claim recovery through the recovery utility.</li>
                    <li>To protect platform infrastructure from malicious exploitation, spam, bots, sybil attacks, and distributed denial-of-service (DDoS) threats.</li>
                    <li>To respond to user inquiries and technical support requests submitted to our support email.</li>
                  </ul>
                </PSection>

                <PSection title="5. Third-Party Infrastructure & Service Providers">
                  <p>ArcFun does not sell, rent, or monetize your personal information. To deliver our non-custodial software interface, we interact with select third-party service providers:</p>
                  <ul>
                    <li><strong>Circle Developer-Controlled Wallets &amp; CCTP (Circle Internet Financial):</strong> ArcFun Wallets interface securely with Circle APIs for address generation, cryptographic enclave signing, and CCTP cross-chain attestations. ArcFun never has custody of private keys or user funds.</li>
                    <li><strong>Supabase:</strong> Used for transient authentication challenges, interface state coordination, and operational caching.</li>
                    <li><strong>Cloudflare:</strong> Provides DNS resolution, CDN caching, DDoS mitigation, and Cloudflare Turnstile bot verification.</li>
                    <li><strong>Public Blockchain Nodes &amp; RPC Providers:</strong> Used to broadcast user transactions and query on-chain contract states across supported EVM, Solana, and Sui networks.</li>
                  </ul>
                </PSection>

                <PSection title="6. Cookies and Local Storage">
                  <p>ArcFun does not use tracking cookies for third-party advertising or behavioral marketing. We only use essential browser storage mechanisms:</p>
                  <ul>
                    <li><strong>Local Storage:</strong> Used strictly to persist client-side UI settings (such as dark theme, custom slippage tolerance preferences, connected wallet connector identifiers, and dismissed notification banners).</li>
                    <li><strong>Essential Functional Cookies &amp; Session State:</strong> Transient security tokens (such as <code>arc_session</code>) and Turnstile verification cookies are utilized solely to authenticate your self-service wallet API requests and prevent malicious automated access.</li>
                  </ul>
                </PSection>

                <PSection title="7. Data Retention">
                  <p>Off-chain operational logs and transient security data are retained only for as long as necessary to maintain system integrity, diagnose technical errors, and satisfy standard cybersecurity requirements. Public blockchain records remain permanently stored on the respective decentralized networks.</p>
                </PSection>

                <PSection title="8. International Data Transfers">
                  <p>Because blockchain networks and web infrastructure operate globally, technical data processed through our hosting providers and RPC endpoints may be transmitted to or processed in servers located outside your jurisdiction. We rely on standard security measures and reputable cloud providers to protect data in transit.</p>
                </PSection>

                <PSection title="9. Your Rights">
                  <p>Subject to applicable local laws, you may have the right to request access to or deletion of off-chain personal data held by ArcFun. Note that these rights do not and cannot extend to immutable on-chain transaction records on public blockchain networks.</p>
                  <p>To inquire about your data or submit a request, contact us at <a href="mailto:supportarcfun@gmail.com" style={{ color: "#ffffff", textDecoration: "underline", textUnderlineOffset: 3, fontWeight: 600 }}>supportarcfun@gmail.com</a>.</p>
                </PSection>

                <PSection title="10. Children&apos;s Privacy">
                  <p>ArcFun is intended strictly for users who are at least 18 years of age or the age of legal majority in their jurisdiction. We do not knowingly collect information from or offer services to individuals under the age of 18.</p>
                </PSection>

                <PSection title="11. Changes to This Privacy Policy">
                  <p>We may update this Privacy Policy from time to time to reflect changes in our interface, technical infrastructure, or applicable legal standards. Any updates will be posted with a revised &quot;Last Updated&quot; date.</p>
                </PSection>

                {/* Contact */}
                <div style={{ paddingTop: 4 }}>
                  <h2 style={{ fontSize: 15, fontWeight: 700, color: "#fff", margin: "0 0 10px" }}>Contact</h2>
                  <p style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", marginBottom: 14, lineHeight: 1.7 }}>If you have questions regarding this Privacy Policy, please contact us:</p>
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

function PSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ paddingBottom: 24, marginBottom: 24, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
      <h2 style={{ fontSize: 14, fontWeight: 700, color: "#fff", margin: "0 0 10px" }}>{title}</h2>
      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", lineHeight: 1.8 }}>
        <style>{`.psec p{margin:0 0 8px}.psec ul{padding-left:18px;margin:0;display:flex;flex-direction:column;gap:6px}.psec li{color:rgba(255,255,255,0.5);line-height:1.75}.psec strong{color:rgba(255,255,255,0.8);font-weight:600}`}</style>
        <div className="psec" style={{ display: "flex", flexDirection: "column", gap: 6 }}>{children}</div>
      </div>
    </div>
  );
}

