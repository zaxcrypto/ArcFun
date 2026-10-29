"use client";

import { X, AlertTriangle, Globe, Mail } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useEffect } from "react";
import { createPortal } from "react-dom";

interface RiskDisclosureModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function RiskDisclosureModal({ isOpen, onClose }: RiskDisclosureModalProps) {
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
                    <AlertTriangle size={17} color="#ffffff" />
                  </div>
                  <div>
                    <h1 style={{ fontSize: 17, fontWeight: 800, color: "#fff", margin: 0, letterSpacing: "-0.02em" }}>Risk Disclosure</h1>
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
                    Please read this Risk Disclosure carefully before interacting with ArcFun.
                  </p>
                  <p style={{ fontSize: 14, color: "rgba(255,255,255,0.38)", lineHeight: 1.8, margin: 0 }}>
                    By accessing or using{" "}
                    <a href="https://www.thearcfun.xyz" style={{ color: "#ffffff", textDecoration: "underline", textUnderlineOffset: 3, fontWeight: 600 }}>https://www.thearcfun.xyz</a>,{" "}
                    you acknowledge that cryptocurrency, decentralized finance (DeFi), cross-chain bridges, bonding curve trading, and meme tokens involve substantial financial and technical risks. You accept full responsibility for all transactions and outcomes.
                  </p>
                </div>

                <RSection title="1. Non-Custodial Architecture & Custody Boundaries">
                  <p>ArcFun is a non-custodial software interface. ArcFun does not custody users&apos; assets, hold private keys, or maintain customer balances. Transactions are authorized directly by users and executed through autonomous on-chain protocols.</p>
                  <ul>
                    <li>You maintain sole responsibility for your credentials, Passkeys, passwords, and device security.</li>
                    <li>If you lose your credentials or device access, ArcFun cannot recover your funds or reverse on-chain transactions.</li>
                    <li>You are responsible for verifying all transaction details, destination addresses, and token contracts prior to signing.</li>
                  </ul>
                </RSection>

                <RSection title="2. ArcFun Wallet & Third-Party Programmable Wallet Infrastructure Risk">
                  <p>ArcFun Wallet is powered by Circle Internet Financial, LLC (&quot;Circle&quot;) utilizing Circle&apos;s Programmable Wallets / Developer-Controlled Wallets (DCW) platform:</p>
                  <ul>
                    <li><strong>Zero ArcFun Custody:</strong> ArcFun does not hold, access, or custody your digital assets or private keys. ArcFun is strictly an application software interface.</li>
                    <li><strong>Third-Party Infrastructure Dependency:</strong> Key generation, enclave signing, multi-party computation (MPC), and blockchain node communications are performed by Circle&apos;s independent infrastructure. ArcFun does not own, operate, or control Circle&apos;s internal servers, HSMs, or security systems.</li>
                    <li><strong>Third-Party Outages, Exploits &amp; Disruptions:</strong> Any disruption, outage, technical failure, zero-day exploit, security vulnerability, cloud partition, service cessation, or regulatory action affecting Circle or underlying blockchain networks may impair your ability to access, transfer, or recover your funds. ArcFun bears zero liability for any such events.</li>
                    <li><strong>No Insurance or Reimbursement:</strong> Digital assets in your ArcFun Wallet are NOT insured by the FDIC, SIPC, Circle, or ArcFun. ArcFun is under no obligation to refund, reimburse, or compensate users for any lost or depleted balances resulting from third-party infrastructure compromises or blockchain events.</li>
                    <li><strong>Voluntary Funding at User Risk:</strong> You must ONLY fund or use an ArcFun Wallet if you fully understand and accept all third-party infrastructure, protocol, and volatility risks. If you do not accept these risks, do not create or deposit into an ArcFun Wallet.</li>
                  </ul>
                </RSection>

                <RSection title="3. General Market Volatility & Loss of Capital">
                  <p>Cryptocurrency assets and meme tokens are speculative and subject to extreme price volatility. Token prices may crash rapidly or drop to zero. You should never trade or risk funds that you cannot afford to lose completely. There are no guaranteed returns or profits.</p>
                </RSection>

                <RSection title="4. Bonding Curve Trading Risks">
                  <p>Tokens traded on the ArcFun Launchpad execute against mathematical bonding curves on-chain:</p>
                  <ul>
                    <li><strong>Price Impact &amp; Slippage:</strong> Buying increases token price along the curve, while selling decreases it. Large orders relative to pool depth will incur substantial slippage.</li>
                    <li><strong>Liquidity Risk:</strong> Liquidity is governed by the curve contract. There is no guarantee of continuous buy or sell demand.</li>
                    <li><strong>Graduation Uncertainty:</strong> Reaching the funding threshold and migrating liquidity to a decentralized exchange does not guarantee future trading volume, price stability, or secondary market liquidity.</li>
                  </ul>
                </RSection>

                <RSection title="5. User-Created Tokens & Scam Risks">
                  <p>ArcFun allows permissionless token creation. ArcFun does not audit, verify, or endorse any user-launched token. Tokens may be created by anonymous third parties and could represent scams, abandoned projects, or fraudulent schemes. You are solely responsible for conducting independent due diligence on any token project.</p>
                </RSection>

                <RSection title="6. ArcFun Bridge & Circle CCTP Dependencies">
                  <p>Cross-chain transfers via the ArcFun Bridge rely on Circle&apos;s Cross-Chain Transfer Protocol (CCTP) and multi-chain network synchronization:</p>
                  <ul>
                    <li><strong>Block Finality &amp; Attestation Delays:</strong> Transfers require waiting for source-chain block confirmations before Circle Iris generates an attestation (typically 1–5 minutes, but longer during network congestion or reorganizations).</li>
                    <li><strong>Destination Execution:</strong> Relayer fulfillment depends on destination chain RPC availability and gas conditions. If relaying is delayed, users can complete transfers manually using the /recover self-claim flow.</li>
                    <li><strong>Third-Party Dependency:</strong> ArcFun integrates with third-party infrastructure, including Circle&apos;s CCTP where applicable. Failures, delays, outages, protocol changes, or other issues affecting third-party infrastructure may affect ArcFun functionality. Circle does not guarantee transactions or insure user funds against losses.</li>
                  </ul>
                </RSection>

                <RSection title="7. Smart Contract & Blockchain Vulnerabilities">
                  <p>Smart contracts execute autonomously on public networks. Despite best development practices, smart contracts may be vulnerable to unforeseen bugs, mathematical flaws, compiler issues, validator reorgs, network forks, or malicious exploits. Once a transaction is finalized on-chain, it cannot be reversed by ArcFun.</p>
                </RSection>

                <RSection title="8. Tokenized Stock & Quote Asset Risks">
                  <p>The Launchpad may support pairing tokens with tokenized real-world assets or stock tokens as quote assets:</p>
                  <ul>
                    <li>ArcFun is not the issuer or guarantor of any underlying stock or tokenized asset.</li>
                    <li>A meme token paired with a tokenized stock quote asset is NOT backed by equity or company ownership.</li>
                    <li>Tokenized assets may be subject to third-party issuer restrictions, transfer controls, redemption conditions, and regulatory actions.</li>
                  </ul>
                </RSection>

                <RSection title="9. Regulatory & Tax Uncertainties">
                  <p>Legal and regulatory frameworks governing cryptocurrencies, DeFi interfaces, and token issuance remain subject to rapid change globally. Future regulatory actions may restrict interface accessibility. You are solely responsible for calculating, reporting, and remitting any taxes applicable to your trading activity.</p>
                </RSection>

                <RSection title="10. No Investment, Legal, or Financial Advice">
                  <p>Nothing on ArcFun constitutes investment, financial, legal, or tax advice. All analytics, token metrics, price charts, and interface data are provided strictly for informational purposes. You execute all transactions at your own risk.</p>
                </RSection>

                {/* Contact */}
                <div style={{ paddingTop: 4 }}>
                  <h2 style={{ fontSize: 15, fontWeight: 700, color: "#fff", margin: "0 0 10px" }}>Contact</h2>
                  <p style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", marginBottom: 14, lineHeight: 1.7 }}>If you have any questions regarding this Risk Disclosure, please contact us:</p>
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

function RSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ paddingBottom: 24, marginBottom: 24, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
      <h2 style={{ fontSize: 14, fontWeight: 700, color: "#fff", margin: "0 0 10px" }}>{title}</h2>
      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", lineHeight: 1.8 }}>
        <style>{`.rsec p{margin:0 0 8px}.rsec ul{padding-left:18px;margin:0;display:flex;flex-direction:column;gap:6px}.rsec li{color:rgba(255,255,255,0.5);line-height:1.75}.rsec strong{color:rgba(255,255,255,0.8);font-weight:600}`}</style>
        <div className="rsec" style={{ display: "flex", flexDirection: "column", gap: 6 }}>{children}</div>
      </div>
    </div>
  );
}

