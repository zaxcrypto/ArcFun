"use client";

import { X, FileText, Globe, Mail } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useEffect } from "react";
import { createPortal } from "react-dom";

interface TermsOfServiceModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function TermsOfServiceModal({ isOpen, onClose }: TermsOfServiceModalProps) {
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
          {/* Fully opaque dark backdrop */}
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
                    <FileText size={17} color="#ffffff" />
                  </div>
                  <div>
                    <h1 style={{ fontSize: 17, fontWeight: 800, color: "#fff", margin: 0, letterSpacing: "-0.02em" }}>Terms of Service</h1>
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
                    Welcome to ArcFun (&quot;ArcFun&quot;, &quot;we&quot;, &quot;us&quot;, or &quot;our&quot;). These Terms of Service (&quot;Terms&quot;) govern your access to and use of{" "}
                    <a href="https://www.thearcfun.xyz" style={{ color: "#ffffff", textDecoration: "underline", textUnderlineOffset: 3, fontWeight: 600 }}>https://www.thearcfun.xyz</a>{" "}
                    and associated software interfaces, including the ArcFun Wallet, ArcFun Bridge, ArcFun Launchpad, token creation tools, on-chain trading features, and the /recover bridge recovery utility (collectively, the &quot;Services&quot;).
                  </p>
                  <p style={{ fontSize: 14, color: "rgba(255,255,255,0.38)", lineHeight: 1.8, margin: 0 }}>
                    By connecting a wallet, creating or funding an ArcFun Wallet, accessing, or using the Services, you acknowledge that you have read, understood, and unconditionally agree to be bound by these Terms. If you do not agree, do not use the Services or fund an ArcFun Wallet.
                  </p>
                </div>

                {/* Sections */}
                <TSection title="1. Acceptance of Terms">
                  <p>By accessing or interacting with ArcFun, you enter into a binding agreement with ArcFun. If you are entering into these Terms on behalf of an entity, you represent that you have the legal authority to bind that entity.</p>
                </TSection>

                <TSection title="2. Description of ArcFun & Non-Custodial Role">
                  <p>ArcFun provides a decentralized, non-custodial web software interface that enables users to interact with autonomous public smart contracts on supported blockchain networks. The core functionalities include:</p>
                  <ul>
                    <li><strong>ArcFun Wallet:</strong> An embedded multi-chain digital wallet interface powered by Circle Developer-Controlled Wallets (Programmable Wallets), allowing users to generate and manage addresses across supported networks (e.g. Arc, Solana, Ethereum) through Circle&apos;s cryptographic infrastructure.</li>
                    <li><strong>ArcFun Bridge &amp; Gateway:</strong> Facilitates cross-chain native USDC transfers utilizing Circle&apos;s Cross-Chain Transfer Protocol (CCTP) and Circle Gateway.</li>
                    <li><strong>ArcFun Launchpad:</strong> Enables users to deploy new tokens governed by on-chain bonding curve smart contracts.</li>
                    <li><strong>Bonding Curve Trading:</strong> Provides an on-chain automated market maker interface to swap supported quote assets for launched tokens.</li>
                    <li><strong>Bridge Recovery Utility (/recover):</strong> Provides an interface allowing users to manually self-claim or resume pending cross-chain CCTP transfers using on-chain transaction data and Circle Iris attestations.</li>
                  </ul>
                  <p>ArcFun is not a bank, broker, dealer, exchange, custodian, investment adviser, money transmitter, or financial institution. ArcFun never holds custody of, possesses, or controls user digital assets.</p>
                </TSection>

                <TSection title="3. Eligibility">
                  <p>You represent and warrant that:</p>
                  <ul>
                    <li>You are at least 18 years of age or the legal age of majority in your jurisdiction.</li>
                    <li>You have full legal capacity to enter into these Terms.</li>
                    <li>You are not located in, resident of, or organized under the laws of any jurisdiction subject to comprehensive economic sanctions (including sanctions enforced by OFAC, the UN, EU, or UK).</li>
                    <li>You are not a person identified on any prohibited or restricted-party list.</li>
                    <li>Your use of ArcFun complies with all laws, rules, and regulations applicable to you.</li>
                  </ul>
                </TSection>

                <TSection title="4. ArcFun Wallet Architecture & Circle Technology Disclosure">
                  <p>ArcFun Wallet is powered by Circle Internet Financial, LLC (&quot;Circle&quot;) utilizing Circle&apos;s Programmable Wallets / Developer-Controlled Wallets (DCW) infrastructure and SDKs. You explicitly understand and agree that:</p>
                  <ul>
                    <li><strong>No ArcFun Custody or Fund Access:</strong> ArcFun does NOT possess, hold, or store user private keys, seed phrases, or wallet funds. ArcFun operators, developers, and servers have zero custody and no direct access to withdraw, transfer, freeze, or confiscate your cryptocurrency balances.</li>
                    <li><strong>Third-Party Cryptographic Key Infrastructure:</strong> Wallet address creation, cryptographic key management, hardware security module (HSM) signing, multi-party computation (MPC) sharding, and blockchain broadcasting are executed exclusively through Circle&apos;s independent API infrastructure and public blockchain nodes.</li>
                    <li><strong>Mandatory Agreement for Funding:</strong> You must ONLY fund, deposit into, or bridge assets to an ArcFun Wallet if you fully understand and accept that ArcFun is not a custodian, does not guarantee wallet availability, and has no capacity to recover lost credentials or reverse on-chain transactions.</li>
                    <li><strong>Self-Service Security Controls:</strong> Users configure security preferences (e.g. Passkeys, secondary authorization passwords, transaction limits) via our interface, which are transmitted to cryptographic verification endpoints. You are solely responsible for securing your personal device, browser session, and recovery credentials.</li>
                  </ul>
                </TSection>

                <TSection title="5. Third-Party Infrastructure, Security Incidents & Partner Disclaimer">
                  <p>ArcFun relies upon independent third-party technology providers, including Circle Internet Financial, LLC (for wallet infrastructure, CCTP, and Iris attestations), cloud hosting platforms, edge proxies (Cloudflare), and decentralized blockchain networks.</p>
                  <ul>
                    <li><strong>No Control Over Third Parties:</strong> ArcFun does not own, operate, control, or supervise the internal servers, cryptographic enclaves, or operational security protocols of Circle or any other third-party provider.</li>
                    <li><strong>Third-Party Exploits &amp; Technical Failures:</strong> In the event of any security breach, zero-day vulnerability, unauthorized access, server compromise, protocol exploit, network partition, technical disruption, insolvency, service cessation, or regulatory action affecting Circle, underlying blockchain networks, or third-party infrastructure partners, ArcFun bears zero responsibility or liability.</li>
                    <li><strong>No Obligation to Reimburse:</strong> ArcFun is under no legal, financial, or equitable obligation to reimburse, refund, replace, or indemnify any user for losses, locked assets, delayed bridge completions, or diminished balances resulting from third-party infrastructure failures, network reorganizations, or external protocol exploits.</li>
                    <li><strong>Circle Disclaimer:</strong> Circle is an independent third party and does not endorse, guarantee, or insure ArcFun or user balances held in ArcFun Wallets.</li>
                  </ul>
                </TSection>

                <TSection title="6. ArcFun Bridge & Circle CCTP Integration">
                  <p>When you use the ArcFun Bridge or Gateway:</p>
                  <ul>
                    <li>You initiate and sign a source-chain transaction that deposits or burns native USDC through Circle CCTP or Gateway smart contracts.</li>
                    <li>Circle Iris attestation services generate cryptographic proofs of burn once source-chain finality is achieved.</li>
                    <li>Destination-chain completion may be submitted by ArcFun&apos;s relayer (where ArcFun only supplies destination gas fees) or executed directly by you via the /recover self-claim flow.</li>
                    <li>Relayer gas credentials held by ArcFun are strictly operational gas-paying keys and do NOT have access to or control over user wallets.</li>
                  </ul>
                </TSection>

                <TSection title="7. Launchpad and Token Creation">
                  <p>The ArcFun Launchpad allows users to deploy new cryptographic tokens on-chain. Anyone can create a token without vetting by ArcFun. As a token creator, you are solely responsible for:</p>
                  <ul>
                    <li>Ensuring your token complies with all securities, commodities, consumer protection, and intellectual property laws in relevant jurisdictions.</li>
                    <li>The accuracy of any name, symbol, image, description, or social link associated with the token.</li>
                    <li>Any statements, representations, or marketing you make regarding the token.</li>
                  </ul>
                  <p>ArcFun does not endorse, verify, audit, or guarantee any user-created token.</p>
                </TSection>

                <TSection title="8. Bonding Curve Trading & Quote Assets">
                  <p>Tokens launched through ArcFun trade along an algorithmic bonding curve smart contract:</p>
                  <ul>
                    <li>Prices increase or decrease automatically based on buy and sell volume according to immutable mathematical formulas.</li>
                    <li>Trades may incur significant slippage and price impact, especially during periods of low liquidity or high volume.</li>
                    <li>When a token meets its funding threshold, liquidity may be migrated or graduated to decentralized exchange pools according to the smart contract logic. Graduation does not guarantee continued trading volume or future liquidity.</li>
                  </ul>
                </TSection>

                <TSection title="9. Tokenized Stock & External Quote Asset Disclaimer">
                  <p>The Launchpad may support pairing tokens with various quote assets, including tokenized stock assets where supported.</p>
                  <ul>
                    <li>A quote asset does not mean ArcFun issued the underlying stock or tokenized asset.</li>
                    <li>ArcFun does not represent that a meme token or launched token is backed by a stock merely because it utilizes a stock-related quote asset.</li>
                    <li>Users must independently verify token and quote asset contract addresses.</li>
                    <li>Availability of quote assets depends on third-party infrastructure and configuration, and tokenized assets may carry their own issuer, legal, custody, redemption, and transfer restrictions.</li>
                  </ul>
                </TSection>

                <TSection title="10. Fees">
                  <p>Transactions on public blockchains require network gas fees paid to third-party validators. Where ArcFun charges a protocol fee on trades or deployments, such fees are clearly displayed in the interface and executed directly on-chain by the smart contracts. ArcFun does not promise or provide unverified future yield or revenue share mechanics.</p>
                </TSection>

                <TSection title="11. Transactions and Blockchain Finality">
                  <p>Due to the immutable nature of blockchain networks, transactions cannot be cancelled, modified, or reversed once confirmed on-chain. ArcFun does not maintain a custodial refund pool. A reverted Launchpad trade does not create an ArcFun-held user balance. While the /recover tool allows claiming eligible pending bridge transfers when protocol state permits, recovery is not a guarantee of compensation for losses caused by external network failures.</p>
                </TSection>

                <TSection title="12. Prohibited Activities">
                  <p>You agree not to use ArcFun for: illegal token issuance, fraud, rug pulls, scams, phishing, deploying malware or malicious contracts, sanctions evasion, money laundering, terrorist financing, market manipulation (such as wash trading or spoofing), abusive automated exploitation, or attempting to compromise platform infrastructure.</p>
                </TSection>

                <TSection title="13. No Investment Advice">
                  <p>ArcFun does not provide financial, investment, legal, accounting, or tax advice. Market metrics, charts, prices, and token rankings shown on the interface are for informational purposes only. You are solely responsible for conducting your own research and evaluating the risks of any transaction.</p>
                </TSection>

                <TSection title="14. No Guarantee of Availability">
                  <p>ArcFun is provided on an &quot;AS IS&quot; and &quot;AS AVAILABLE&quot; basis. We do not guarantee uninterrupted, error-free, or continuous access to the interface. Access may be suspended or modified at any time due to maintenance, network congestion, or security updates.</p>
                </TSection>

                <TSection title="15. No Guarantee of Profit">
                  <p>Digital assets, meme tokens, and cryptocurrency markets are extremely volatile. There is no guarantee of profit, stability, liquidity, or value preservation. You may lose the entire amount of capital used in transactions.</p>
                </TSection>

                <TSection title="16. Smart Contract & Network Risks">
                  <p>You acknowledge the inherent risks of interacting with smart contracts, decentralized applications, and blockchain networks, including potential software bugs, unexpected contract execution, blockchain forks, validator downtime, and RPC node latency.</p>
                </TSection>

                <TSection title="17. Limitation of Liability">
                  <p>To the maximum extent permitted by applicable law, in no event shall ArcFun, its developers, operators, or affiliates be liable for any indirect, incidental, special, consequential, or punitive damages, or any loss of profits, digital assets, wallet balance depletion, revenue, data, or goodwill arising out of or in connection with:</p>
                  <ul>
                    <li>Your access to, use of, or inability to access or use the Services, ArcFun Wallet, or ArcFun Bridge.</li>
                    <li>Any failure, outage, technical error, security incident, exploit, compromise, or cessation of service by third-party wallet infrastructure providers (including Circle Internet Financial, LLC) or cloud providers.</li>
                    <li>Smart contract bugs, algorithmic curve fluctuations, validator reorganizations, or unauthorized access to user devices or recovery credentials.</li>
                  </ul>
                </TSection>

                <TSection title="18. User Assumption of Risk & Release">
                  <p>You acknowledge and agree that your decision to create an ArcFun Wallet, deposit cryptocurrency, bridge native assets, or execute trades is entirely voluntary. You assume full and exclusive responsibility for all risks associated with digital asset storage and third-party programmable wallet infrastructure. You hereby irrevocably release and waive any claims against ArcFun and its contributors arising from any third-party infrastructure failures, blockchain consensus forks, or external exploits.</p>
                </TSection>

                <TSection title="18. Indemnification">
                  <p>You agree to indemnify, defend, and hold harmless ArcFun and its contributors from and against any claims, liabilities, damages, losses, and expenses (including legal fees) arising out of your violation of these Terms, your violation of applicable law, or any token created or traded by you.</p>
                </TSection>

                <TSection title="19. Changes to Service and Terms">
                  <p>We reserve the right to modify these Terms at any time. Changes become effective upon posting to the interface. Your continued use of the Services following updates constitutes your acceptance of the revised Terms.</p>
                </TSection>

                {/* Contact */}
                <div style={{ paddingTop: 4 }}>
                  <h2 style={{ fontSize: 15, fontWeight: 700, color: "#fff", margin: "0 0 10px" }}>Contact</h2>
                  <p style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", marginBottom: 14, lineHeight: 1.7 }}>If you have any questions regarding these Terms, please contact us:</p>
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

function TSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ paddingBottom: 24, marginBottom: 24, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
      <h2 style={{ fontSize: 14, fontWeight: 700, color: "#fff", margin: "0 0 10px" }}>{title}</h2>
      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", lineHeight: 1.8 }}>
        <style>{`.tsec3 p{margin:0 0 8px}.tsec3 ul{padding-left:18px;margin:0;display:flex;flex-direction:column;gap:6px}.tsec3 li{color:rgba(255,255,255,0.5);line-height:1.75}.tsec3 strong{color:rgba(255,255,255,0.8);font-weight:600}`}</style>
        <div className="tsec3" style={{ display: "flex", flexDirection: "column", gap: 6 }}>{children}</div>
      </div>
    </div>
  );
}

