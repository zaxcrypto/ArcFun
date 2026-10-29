"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, Shield, FileText, AlertTriangle, Cookie, FileCheck, Globe, Mail, ExternalLink } from "lucide-react";
import React, { useState, useEffect, useRef } from "react";

export type LegalDocType = "terms" | "privacy" | "risk" | "cookies" | "acceptable-use";

interface LegalPageShellProps {
  title: string;
  subtitle: string;
  docType: LegalDocType;
  lastUpdated?: string;
  effectiveDate?: string;
  children?: React.ReactNode;
}

const LEGAL_NAV_ITEMS: { id: LegalDocType; name: string; href: string; icon: React.ElementType }[] = [
  { id: "terms", name: "Terms of Service", href: "/terms", icon: FileText },
  { id: "privacy", name: "Privacy Policy", href: "/privacy", icon: Shield },
  { id: "risk", name: "Risk Disclosure", href: "/risk", icon: AlertTriangle },
  { id: "cookies", name: "Cookie Policy", href: "/cookies", icon: Cookie },
  { id: "acceptable-use", name: "Acceptable Use", href: "/acceptable-use", icon: FileCheck },
];

const ICONS_BY_DOC_TYPE: Record<LegalDocType, React.ElementType> = {
  terms: FileText,
  privacy: Shield,
  risk: AlertTriangle,
  cookies: Cookie,
  "acceptable-use": FileCheck,
};

const DOC_METADATA: Record<LegalDocType, { title: string; subtitle: string }> = {
  terms: {
    title: "Terms of Service",
    subtitle: "These Terms of Service govern your access to and use of ArcFun and its associated decentralized software interfaces.",
  },
  privacy: {
    title: "Privacy Policy",
    subtitle: "This Privacy Policy explains how information is handled when you visit and interact with the ArcFun non-custodial software interfaces.",
  },
  risk: {
    title: "Risk Disclosure",
    subtitle: "Please read this Risk Disclosure carefully before interacting with ArcFun software interfaces, bridges, or token launchpads.",
  },
  cookies: {
    title: "Cookie & Storage Policy",
    subtitle: "This policy explains how ArcFun uses browser storage technologies when you visit and interact with the ArcFun decentralized application.",
  },
  "acceptable-use": {
    title: "Acceptable Use Policy",
    subtitle: "This Acceptable Use Policy sets forth prohibited activities when accessing or interacting with ArcFun software interfaces.",
  },
};

export function LegalSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ paddingBottom: 24, borderBottom: "1px solid rgba(255, 255, 255, 0.06)" }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, color: "#ffffff", margin: "0 0 12px", letterSpacing: "-0.01em" }}>
        {title}
      </h2>
      <div
        style={{
          fontSize: 14,
          color: "rgba(255, 255, 255, 0.65)",
          lineHeight: 1.8,
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {children}
      </div>
    </div>
  );
}

// Built-in registry of all 5 documents for instantaneous (0ms) in-app tab switching
function RenderTermsContent() {
  return (
    <>
      <div style={{ background: "rgba(255, 255, 255, 0.03)", border: "1px solid rgba(255, 255, 255, 0.08)", borderRadius: 14, padding: "16px 18px", color: "rgba(255, 255, 255, 0.78)", fontSize: 13.5, lineHeight: 1.7 }}>
        <strong style={{ color: "#ffffff" }}>Summary:</strong> ArcFun is a decentralized, non-custodial software interface. ArcFun Wallet is an embedded multi-chain wallet interface powered by Circle Developer-Controlled Wallets (Programmable Wallets). ArcFun never possesses custody of, control over, or access to your private keys or user funds. All wallet creation, signing, and key-management operations rely strictly on independent third-party infrastructure. You assume 100% of the risk when funding or using ArcFun Wallet.
      </div>

      <LegalSection title="1. Acceptance of Terms">
        <p>
          Welcome to ArcFun (&quot;ArcFun&quot;, &quot;we&quot;, &quot;us&quot;, or &quot;our&quot;). These Terms of Service (&quot;Terms&quot;) govern your access to and use of{" "}
          <a href="https://www.thearcfun.xyz" target="_blank" rel="noopener noreferrer" style={{ color: "#ffffff", textDecoration: "underline", textUnderlineOffset: 3 }}>
            https://www.thearcfun.xyz
          </a>{" "}
          and associated software interfaces, including the ArcFun Wallet, ArcFun Bridge, ArcFun Launchpad, token creation tools, on-chain trading features, and the /recover bridge recovery utility (collectively, the &quot;Services&quot;).
        </p>
        <p>
          By connecting a wallet, creating or funding an ArcFun Wallet, accessing, or using the Services, you acknowledge that you have read, understood, and unconditionally agree to be bound by these Terms. If you do not agree to these Terms in their entirety, you must not create an ArcFun Wallet, must not deposit or bridge any funds, and must immediately cease accessing the Services.
        </p>
      </LegalSection>

      <LegalSection title="2. Description of ArcFun & Non-Custodial Role">
        <p>
          ArcFun provides a decentralized, non-custodial web software interface enabling users to interact directly with autonomous public smart contracts on supported blockchain networks. The core functionalities include:
        </p>
        <ul style={{ paddingLeft: 20, display: "flex", flexDirection: "column", gap: 8 }}>
          <li><strong style={{ color: "#fff" }}>ArcFun Wallet:</strong> An embedded multi-chain digital wallet interface powered by Circle Developer-Controlled Wallets (Programmable Wallets), allowing users to generate and manage addresses across supported networks (e.g. Arc, Solana, Ethereum) through Circle&apos;s cryptographic infrastructure.</li>
          <li><strong style={{ color: "#fff" }}>ArcFun Bridge &amp; Gateway:</strong> Facilitates cross-chain native USDC transfers utilizing Circle&apos;s Cross-Chain Transfer Protocol (CCTP) and Circle Gateway.</li>
          <li><strong style={{ color: "#fff" }}>ArcFun Launchpad:</strong> Enables users to deploy new tokens governed by on-chain bonding curve smart contracts.</li>
          <li><strong style={{ color: "#fff" }}>Bonding Curve Trading:</strong> Provides an on-chain automated market maker interface to swap supported quote assets for launched tokens.</li>
          <li><strong style={{ color: "#fff" }}>Bridge Recovery Utility (/recover):</strong> Provides an interface allowing users to manually self-claim or resume pending cross-chain CCTP transfers using on-chain transaction data and Circle Iris attestations.</li>
        </ul>
        <p>
          ArcFun is not a bank, broker, dealer, exchange, custodian, investment adviser, money transmitter, or financial institution. ArcFun never takes custody of, controls, or holds beneficial title to any digital assets deployed by users.
        </p>
      </LegalSection>

      <LegalSection title="3. Eligibility">
        <p>You represent and warrant that:</p>
        <ul style={{ paddingLeft: 20, display: "flex", flexDirection: "column", gap: 8 }}>
          <li>You are at least 18 years of age or the legal age of majority in your jurisdiction.</li>
          <li>You have full legal capacity and power to enter into these Terms.</li>
          <li>You are not located in, resident of, or organized under the laws of any jurisdiction subject to comprehensive economic sanctions (including sanctions enforced by OFAC, the UN, EU, or UK).</li>
          <li>You are not a person or entity identified on any prohibited, restricted-party, or specially designated nationals list.</li>
          <li>Your use of ArcFun complies with all applicable laws, rules, and regulations in your jurisdiction.</li>
        </ul>
      </LegalSection>

      <LegalSection title="4. ArcFun Wallet Architecture & Circle Technology Disclosure">
        <p>
          ArcFun Wallet is powered by Circle Internet Financial, LLC (&quot;Circle&quot;) utilizing Circle&apos;s Programmable Wallets / Developer-Controlled Wallets (DCW) infrastructure and SDKs. You explicitly understand and agree that:
        </p>
        <ul style={{ paddingLeft: 20, display: "flex", flexDirection: "column", gap: 8 }}>
          <li><strong style={{ color: "#fff" }}>No ArcFun Custody or Fund Access:</strong> ArcFun does NOT possess, hold, or store user private keys, seed phrases, or wallet funds. ArcFun operators, developers, and servers have zero custody and no direct access to withdraw, transfer, freeze, or confiscate your cryptocurrency balances.</li>
          <li><strong style={{ color: "#fff" }}>Third-Party Cryptographic Key Infrastructure:</strong> Wallet address creation, cryptographic key management, hardware security module (HSM) signing, multi-party computation (MPC) sharding, and blockchain broadcasting are executed exclusively through Circle&apos;s independent API infrastructure and public blockchain nodes.</li>
          <li><strong style={{ color: "#fff" }}>Mandatory Agreement for Funding:</strong> You must ONLY fund, deposit into, or bridge assets to an ArcFun Wallet if you fully understand and accept that ArcFun is not a custodian, does not guarantee wallet availability, and has no capacity to recover lost credentials or reverse on-chain transactions.</li>
          <li><strong style={{ color: "#fff" }}>Self-Service Security Controls:</strong> Users configure security preferences (e.g. Passkeys, secondary authorization passwords, transaction limits) via our interface, which are transmitted to cryptographic verification endpoints. You are solely responsible for securing your personal device, browser session, and recovery credentials.</li>
        </ul>
      </LegalSection>

      <LegalSection title="5. Third-Party Infrastructure, Security Incidents & Partner Disclaimer">
        <p>
          ArcFun relies upon independent third-party technology providers, including Circle Internet Financial, LLC (for wallet infrastructure, CCTP, and Iris attestations), cloud hosting platforms, edge proxies (Cloudflare), and decentralized blockchain networks.
        </p>
        <ul style={{ paddingLeft: 20, display: "flex", flexDirection: "column", gap: 8 }}>
          <li><strong style={{ color: "#fff" }}>No Control Over Third Parties:</strong> ArcFun does not own, operate, control, or supervise the internal servers, cryptographic enclaves, or operational security protocols of Circle or any other third-party provider.</li>
          <li><strong style={{ color: "#fff" }}>Third-Party Exploits &amp; Technical Failures:</strong> In the event of any security breach, zero-day vulnerability, unauthorized access, server compromise, protocol exploit, network partition, technical disruption, insolvency, service cessation, or regulatory action affecting Circle, underlying blockchain networks, or third-party infrastructure partners, <strong style={{ color: "#ff5252" }}>ArcFun bears zero responsibility or liability</strong>.</li>
          <li><strong style={{ color: "#fff" }}>No Obligation to Reimburse:</strong> ArcFun is under no legal, financial, or equitable obligation to reimburse, refund, replace, or indemnify any user for losses, locked assets, delayed bridge completions, or diminished balances resulting from third-party infrastructure failures, network reorganizations, or external protocol exploits.</li>
          <li><strong style={{ color: "#fff" }}>Circle Disclaimer:</strong> Circle is an independent third party and does not endorse, guarantee, or insure ArcFun or user balances held in ArcFun Wallets.</li>
        </ul>
      </LegalSection>

      <LegalSection title="6. ArcFun Bridge & Circle CCTP Integration">
        <p>When you use the ArcFun Bridge or Gateway:</p>
        <ul style={{ paddingLeft: 20, display: "flex", flexDirection: "column", gap: 8 }}>
          <li>You initiate and sign a source-chain transaction that deposits or burns native USDC through Circle CCTP or Gateway smart contracts.</li>
          <li>Circle Iris attestation services generate cryptographic proofs of burn once source-chain finality is achieved.</li>
          <li>Destination-chain completion may be submitted by ArcFun&apos;s relayer (where ArcFun only supplies destination gas fees) or executed directly by you via the /recover self-claim flow.</li>
          <li>Relayer gas credentials held by ArcFun are strictly operational gas-paying keys and do NOT have access to or control over user wallets.</li>
        </ul>
      </LegalSection>

      <LegalSection title="7. Launchpad and Token Creation">
        <p>
          The ArcFun Launchpad allows users to deploy new cryptographic tokens on-chain. Anyone can create a token without vetting by ArcFun. As a token creator, you are solely responsible for:
        </p>
        <ul style={{ paddingLeft: 20, display: "flex", flexDirection: "column", gap: 8 }}>
          <li>Ensuring your token complies with all securities, commodities, consumer protection, and intellectual property laws in relevant jurisdictions.</li>
          <li>The accuracy of any name, symbol, image, description, or social link associated with the token.</li>
          <li>Any statements, representations, or marketing you make regarding the token.</li>
        </ul>
        <p>ArcFun does not endorse, verify, audit, or guarantee any user-created token.</p>
      </LegalSection>

      <LegalSection title="8. Bonding Curve Trading & Quote Assets">
        <p>Tokens launched through ArcFun trade along an algorithmic bonding curve smart contract:</p>
        <ul style={{ paddingLeft: 20, display: "flex", flexDirection: "column", gap: 8 }}>
          <li>Prices increase or decrease automatically based on buy and sell volume according to immutable mathematical formulas.</li>
          <li>Trades may incur significant slippage and price impact, especially during periods of low liquidity or high volume.</li>
          <li>When a token meets its funding threshold, liquidity may be migrated or graduated to decentralized exchange pools according to the smart contract logic. Graduation does not guarantee continued trading volume or future liquidity.</li>
        </ul>
      </LegalSection>

      <LegalSection title="9. Tokenized Stock & External Quote Asset Disclaimer">
        <p>The Launchpad may support pairing tokens with various quote assets, including tokenized stock assets where supported:</p>
        <ul style={{ paddingLeft: 20, display: "flex", flexDirection: "column", gap: 8 }}>
          <li>A quote asset does not mean ArcFun issued the underlying stock or tokenized asset.</li>
          <li>ArcFun does not represent that a meme token or launched token is backed by a stock merely because it utilizes a stock-related quote asset.</li>
          <li>Users must independently verify token and quote asset contract addresses.</li>
          <li>Availability of quote assets depends on third-party infrastructure and configuration, and tokenized assets may carry their own issuer, legal, custody, redemption, and transfer restrictions.</li>
        </ul>
      </LegalSection>

      <LegalSection title="10. Fees and Gas Costs">
        <p>
          Transactions on public blockchains require network gas fees paid directly to third-party validators. Where ArcFun charges a protocol fee on trades or deployments, such fees are clearly displayed in the interface and executed directly on-chain by the smart contracts. ArcFun does not promise or provide unverified future yield or revenue share mechanics.
        </p>
      </LegalSection>

      <LegalSection title="11. Transactions and Blockchain Finality">
        <p>
          Due to the immutable nature of blockchain networks, transactions cannot be cancelled, modified, or reversed once confirmed on-chain. ArcFun does not maintain a custodial refund pool. A reverted Launchpad trade does not create an ArcFun-held user balance. While the /recover tool allows claiming eligible pending bridge transfers when protocol state permits, recovery is not a guarantee of compensation for losses caused by external network failures.
        </p>
      </LegalSection>

      <LegalSection title="12. Prohibited Activities">
        <p>
          You agree not to use ArcFun for: illegal token issuance, fraud, rug pulls, scams, phishing, deploying malware or malicious contracts, sanctions evasion, money laundering, terrorist financing, market manipulation (such as wash trading or spoofing), abusive automated exploitation, or attempting to compromise platform infrastructure.
        </p>
      </LegalSection>

      <LegalSection title="13. No Investment Advice">
        <p>
          ArcFun does not provide financial, investment, legal, accounting, or tax advice. Market metrics, charts, prices, and token rankings shown on the interface are for informational purposes only. You are solely responsible for conducting your own research and evaluating the risks of any transaction.
        </p>
      </LegalSection>

      <LegalSection title="14. Disclaimer of Warranties">
        <p>
          ArcFun is provided on an &quot;AS IS&quot; and &quot;AS AVAILABLE&quot; basis without warranties of any kind, whether express or implied. We do not guarantee uninterrupted, secure, or error-free access to the interface. Access may be modified or suspended at any time.
        </p>
      </LegalSection>

      <LegalSection title="15. Limitation of Liability">
        <p>
          To the maximum extent permitted by applicable law, in no event shall ArcFun, its developers, operators, contributors, or affiliates be liable for any indirect, incidental, special, consequential, or punitive damages, including loss of profits, loss of digital assets, lost data, wallet balance depletion, or bridge delivery delays arising out of or in connection with:
        </p>
        <ul style={{ paddingLeft: 20, display: "flex", flexDirection: "column", gap: 8 }}>
          <li>Your access to, use of, or inability to access or use the Services, ArcFun Wallet, or ArcFun Bridge.</li>
          <li>Any failure, outage, technical error, security incident, exploit, compromise, or cessation of service by third-party wallet infrastructure providers (including Circle Internet Financial, LLC) or cloud providers.</li>
          <li>Smart contract bugs, algorithmic curve fluctuations, validator reorganizations, or unauthorized access to user devices or recovery credentials.</li>
        </ul>
      </LegalSection>

      <LegalSection title="16. User Assumption of Risk & Release">
        <p>
          You acknowledge and agree that your decision to create an ArcFun Wallet, deposit cryptocurrency, bridge native assets, or execute trades is entirely voluntary. You assume full and exclusive responsibility for all risks associated with digital asset storage and third-party programmable wallet infrastructure. You hereby irrevocably release and waive any claims against ArcFun and its contributors arising from any third-party infrastructure failures, blockchain consensus forks, or external exploits.
        </p>
      </LegalSection>
    </>
  );
}

function RenderPrivacyContent() {
  return (
    <>
      <div style={{ background: "rgba(255, 255, 255, 0.03)", border: "1px solid rgba(255, 255, 255, 0.08)", borderRadius: 14, padding: "16px 18px", color: "rgba(255, 255, 255, 0.78)", fontSize: 13.5, lineHeight: 1.7 }}>
        <strong style={{ color: "#ffffff" }}>Privacy Highlights:</strong> We do not track you across websites, build advertising profiles, or sell user personal data. ArcFun is non-custodial and operates on public decentralized blockchain ledgers.
      </div>

      <LegalSection title="1. Information We Do NOT Collect">
        <p>Because ArcFun is a non-custodial interface and ArcFun Wallet is powered by Circle Developer-Controlled Wallets, we intentionally minimize data handling:</p>
        <ul style={{ paddingLeft: 20, display: "flex", flexDirection: "column", gap: 8 }}>
          <li>We do <strong>not</strong> collect, view, or store your private keys, seed phrases, or unencrypted wallet credentials.</li>
          <li>We do <strong>not</strong> have access to your personal digital asset balances.</li>
          <li>We do <strong>not</strong> require traditional KYC identity documents (such as government IDs or passports) for standard non-custodial interactions.</li>
          <li>We do <strong>not</strong> sell, rent, or monetize your personal data to third-party advertisers.</li>
          <li>We do <strong>not</strong> embed invasive cross-site tracking pixels or commercial ad network cookies.</li>
        </ul>
      </LegalSection>

      <LegalSection title="2. Public Blockchain Data">
        <p>
          When you connect a wallet, fund an ArcFun Wallet, or submit transactions via ArcFun (including bridge burns/mints, token deployments, and bonding curve trades):
        </p>
        <ul style={{ paddingLeft: 20, display: "flex", flexDirection: "column", gap: 8 }}>
          <li>Your public wallet address, transaction hash, token amounts, timestamp, and on-chain interactions are permanently recorded on public blockchain ledgers.</li>
          <li>Public blockchain data is immutable, transparent, and accessible to anyone via block explorers and RPC indexers.</li>
          <li>ArcFun cannot erase, modify, or restrict access to public blockchain history.</li>
        </ul>
      </LegalSection>

      <LegalSection title="3. Technical and Operational Data">
        <p>
          To maintain security, diagnose errors, prevent distributed denial-of-service (DDoS) attacks, and operate relay services:
        </p>
        <ul style={{ paddingLeft: 20, display: "flex", flexDirection: "column", gap: 8 }}>
          <li><strong>IP Addresses &amp; Server Logs:</strong> Standard server and edge proxy logs (such as Cloudflare) temporarily record client IP addresses, browser user-agent strings, and request timestamps strictly for abuse mitigation and bot filtering.</li>
          <li><strong>Relayer Transaction Indexing:</strong> When using the ArcFun Bridge, our backend relayer monitors public transaction hashes and Circle CCTP attestation statuses to automate destination chain gas submission.</li>
          <li><strong>Bridge Recovery Data (/recover):</strong> Lookups performed on the /recover page query public blockchain nodes and Circle Iris attestation APIs using the transaction hash you provide.</li>
        </ul>
      </LegalSection>

      <LegalSection title="4. Browser Local Storage & Session State">
        <p>
          ArcFun utilizes client-side <code>localStorage</code> and secure functional session cookies (such as <code>arc_session</code>) purely to maintain your security state and remember your interface preferences locally on your device:
        </p>
        <ul style={{ paddingLeft: 20, display: "flex", flexDirection: "column", gap: 8 }}>
          <li>Cryptographically signed session tokens used strictly to authenticate API calls to your self-service wallet features.</li>
          <li>Interface theme selection (dark mode).</li>
          <li>Custom slippage tolerance settings for bonding curve swaps.</li>
          <li>Last-used wallet connector choice for convenient reconnection.</li>
        </ul>
        <p>This data stays within your browser and is never transmitted to marketing aggregators.</p>
      </LegalSection>

      <LegalSection title="5. Third-Party Integrations & Infrastructure Partners">
        <p>
          ArcFun interacts with third-party decentralized protocols, RPC providers, and infrastructure services:
        </p>
        <ul style={{ paddingLeft: 20, display: "flex", flexDirection: "column", gap: 8 }}>
          <li><strong>Circle Developer-Controlled Wallets &amp; CCTP:</strong> ArcFun Wallets interface securely with Circle Internet Financial APIs for address generation, cryptographic enclave signing, and CCTP cross-chain attestations. ArcFun never has custody of private keys or funds.</li>
          <li><strong>RPC Providers:</strong> Blockchain queries connect to public RPC endpoints (e.g. Infura, Alchemy, QuickNode, Helius, Horizon, Sui RPC).</li>
          <li><strong>Cloudflare:</strong> Provides DNS routing, CDN caching, and Turnstile bot protection.</li>
        </ul>
      </LegalSection>

      <LegalSection title="6. Data Security">
        <p>
          We employ industry-standard encryption protocols (HTTPS/TLS) across all web traffic. However, no internet transmission or smart contract interaction is 100% secure. You remain responsible for maintaining the physical and digital security of your own devices and self-custodial wallets.
        </p>
      </LegalSection>

      <LegalSection title="7. Policy Updates">
        <p>
          We may update this Privacy Policy from time to time to reflect modifications in platform architecture or legal requirements. Any revisions will be published on this page with an updated &quot;Last Updated&quot; date.
        </p>
      </LegalSection>
    </>
  );
}

function RenderRiskContent() {
  return (
    <>
      <div style={{ background: "rgba(239, 68, 68, 0.08)", border: "1px solid rgba(239, 68, 68, 0.25)", borderRadius: 14, padding: "16px 18px", color: "rgba(255, 255, 255, 0.85)", fontSize: 13.5, lineHeight: 1.7 }}>
        <strong style={{ color: "#ef4444" }}>CRITICAL WARNING:</strong> Interacting with cryptocurrencies, decentralized finance (DeFi), cross-chain bridges, bonding curves, and meme tokens involves extreme financial and technical risk. You may lose 100% of the funds you deploy. Never trade capital you cannot afford to lose completely.
      </div>

      <LegalSection title="1. Non-Custodial Architecture & Custody Boundaries">
        <p>
          ArcFun is a non-custodial software interface. ArcFun does not custody users&apos; assets, hold private keys, or maintain customer balances. Transactions are authorized directly by users and executed through autonomous on-chain protocols.
        </p>
        <ul style={{ paddingLeft: 20, display: "flex", flexDirection: "column", gap: 8 }}>
          <li>You maintain sole and exclusive responsibility for your credentials, Passkeys, passwords, and device security.</li>
          <li>If you lose your credentials or device access, ArcFun has no technical capability to recover your funds or reverse on-chain transactions.</li>
          <li>You are responsible for carefully verifying all transaction amounts, recipient addresses, and token contracts prior to signing.</li>
        </ul>
      </LegalSection>

      <LegalSection title="2. ArcFun Wallet & Third-Party Programmable Wallet Infrastructure Risk">
        <p>
          ArcFun Wallet is powered by Circle Internet Financial, LLC (&quot;Circle&quot;) utilizing Circle&apos;s Programmable Wallets / Developer-Controlled Wallets (DCW) platform:
        </p>
        <ul style={{ paddingLeft: 20, display: "flex", flexDirection: "column", gap: 8 }}>
          <li><strong style={{ color: "#fff" }}>Zero ArcFun Custody:</strong> ArcFun does not hold, access, or custody your digital assets or private keys. ArcFun is strictly an application software interface.</li>
          <li><strong style={{ color: "#fff" }}>Third-Party Infrastructure Dependency:</strong> Key generation, enclave signing, multi-party computation (MPC), and blockchain node communications are performed by Circle&apos;s independent infrastructure. ArcFun does not own, operate, or control Circle&apos;s internal servers, HSMs, or security systems.</li>
          <li><strong style={{ color: "#fff" }}>Third-Party Outages, Exploits &amp; Disruptions:</strong> Any disruption, outage, technical failure, zero-day exploit, security vulnerability, cloud partition, service cessation, or regulatory action affecting Circle or underlying blockchain networks may impair your ability to access, transfer, or recover your funds. <strong style={{ color: "#ef4444" }}>ArcFun bears zero liability for any such events</strong>.</li>
          <li><strong style={{ color: "#fff" }}>No Insurance or Reimbursement:</strong> Digital assets in your ArcFun Wallet are NOT insured by the FDIC, SIPC, Circle, or ArcFun. ArcFun is under no obligation to refund, reimburse, or compensate users for any lost or depleted balances resulting from third-party infrastructure compromises or blockchain events.</li>
          <li><strong style={{ color: "#fff" }}>Voluntary Funding at User Risk:</strong> You must ONLY fund or use an ArcFun Wallet if you fully understand and accept all third-party infrastructure, protocol, and volatility risks. If you do not accept these risks, do not create or deposit into an ArcFun Wallet.</li>
        </ul>
      </LegalSection>

      <LegalSection title="3. Market Volatility & Total Loss of Capital">
        <p>
          Digital assets and meme tokens are speculative and subject to extreme price volatility. Token prices can surge or collapse rapidly within seconds. There are no guaranteed returns, price floors, or liquidity assurances.
        </p>
      </LegalSection>

      <LegalSection title="4. Bonding Curve Trading Risks">
        <p>Tokens traded on the ArcFun Launchpad execute against mathematical bonding curves on-chain:</p>
        <ul style={{ paddingLeft: 20, display: "flex", flexDirection: "column", gap: 8 }}>
          <li><strong style={{ color: "#fff" }}>Price Impact &amp; Slippage:</strong> Buying increases token price along the curve, while selling decreases it. Large orders relative to pool depth will incur substantial slippage.</li>
          <li><strong style={{ color: "#fff" }}>Liquidity Risk:</strong> Liquidity is governed purely by the curve contract. There is no guarantee of continuous buy or sell demand.</li>
          <li><strong style={{ color: "#fff" }}>Graduation Uncertainty:</strong> Reaching the funding threshold and migrating liquidity to a decentralized exchange does not guarantee future trading volume, price stability, or secondary market liquidity.</li>
        </ul>
      </LegalSection>

      <LegalSection title="5. User-Created Tokens & Scam Risks">
        <p>
          ArcFun allows permissionless token creation. ArcFun does not audit, verify, or endorse any user-launched token. Tokens may be created by anonymous third parties and could represent scams, abandoned projects, or fraudulent schemes. You are solely responsible for conducting independent due diligence on any token project before committing assets.
        </p>
      </LegalSection>

      <LegalSection title="6. ArcFun Bridge & Circle CCTP Dependencies">
        <p>
          Cross-chain transfers via the ArcFun Bridge rely on Circle&apos;s Cross-Chain Transfer Protocol (CCTP) and multi-chain network synchronization:
        </p>
        <ul style={{ paddingLeft: 20, display: "flex", flexDirection: "column", gap: 8 }}>
          <li><strong style={{ color: "#fff" }}>Block Finality &amp; Attestation Delays:</strong> Transfers require waiting for source-chain block confirmations before Circle Iris generates an attestation (typically 1–5 minutes, but longer during network congestion or reorganizations).</li>
          <li><strong style={{ color: "#fff" }}>Destination Execution:</strong> Relayer fulfillment depends on destination chain RPC availability and gas conditions. If relaying is delayed, users can complete transfers manually using the /recover self-claim flow.</li>
          <li><strong style={{ color: "#fff" }}>Third-Party Dependency:</strong> ArcFun integrates with third-party infrastructure, including Circle&apos;s CCTP where applicable. Failures, delays, outages, protocol changes, or other issues affecting third-party infrastructure may affect ArcFun functionality. Circle does not guarantee transactions or insure user funds against losses.</li>
        </ul>
      </LegalSection>

      <LegalSection title="7. Smart Contract & Blockchain Vulnerabilities">
        <p>
          Smart contracts execute autonomously on public networks. Despite rigorous development standards, smart contracts may contain unforeseen software bugs, mathematical edge cases, validator reorganizations, network forks, or malicious exploits. Once a transaction is confirmed on-chain, it cannot be reversed by ArcFun.
        </p>
      </LegalSection>

      <LegalSection title="8. Tokenized Stock & External Quote Asset Disclaimer">
        <p>The Launchpad may support pairing tokens with tokenized real-world assets or stock tokens as quote assets:</p>
        <ul style={{ paddingLeft: 20, display: "flex", flexDirection: "column", gap: 8 }}>
          <li>ArcFun is not the issuer or guarantor of any underlying stock or tokenized asset.</li>
          <li>A meme token paired with a tokenized stock quote asset is NOT backed by equity or company ownership.</li>
          <li>Tokenized assets may be subject to third-party issuer restrictions, transfer controls, redemption conditions, and regulatory actions.</li>
        </ul>
      </LegalSection>

      <LegalSection title="9. No Financial or Investment Advice">
        <p>
          Nothing on the ArcFun interface constitutes investment, financial, legal, tax, or trading advice. All charts, market caps, token metrics, and data feeds are provided strictly for informational purposes. You execute all transactions at your own risk.
        </p>
      </LegalSection>
    </>
  );
}

function RenderCookiesContent() {
  return (
    <>
      <div style={{ background: "rgba(255, 255, 255, 0.03)", border: "1px solid rgba(255, 255, 255, 0.08)", borderRadius: 14, padding: "16px 18px", color: "rgba(255, 255, 255, 0.78)", fontSize: 13.5, lineHeight: 1.7 }}>
        <strong style={{ color: "#ffffff" }}>Storage Highlights:</strong> ArcFun strictly uses client-side browser storage for local interface preferences (such as dark mode and slippage settings) and essential bot security. We do not use advertising tracking cookies or sell your browsing activity.
      </div>

      <LegalSection title="1. Overview: Cookies vs. Local Storage">
        <p>It is important to understand the technical distinction between browser mechanisms:</p>
        <ul style={{ paddingLeft: 20, display: "flex", flexDirection: "column", gap: 8 }}>
          <li><strong style={{ color: "#fff" }}>Cookies:</strong> Small text snippets sent automatically with HTTP requests. ArcFun minimizes cookie usage strictly to essential bot defense and session security.</li>
          <li><strong style={{ color: "#fff" }}>Local Storage (localStorage):</strong> Client-side key-value storage residing solely in your browser. This data is never automatically transmitted over the network and is used to remember your UI settings.</li>
          <li><strong style={{ color: "#fff" }}>Server / RPC Logs:</strong> Transient server-side operational logs used for error diagnostics and DDoS protection.</li>
        </ul>
      </LegalSection>

      <LegalSection title="2. Local Storage Usage">
        <p>ArcFun uses browser <code>localStorage</code> strictly for non-tracking application preferences and decentralized interface states:</p>
        <ul style={{ paddingLeft: 20, display: "flex", flexDirection: "column", gap: 8 }}>
          <li><strong style={{ color: "#fff" }}>Theme Preference:</strong> Storing your interface visual mode (dark mode).</li>
          <li><strong style={{ color: "#fff" }}>Trading &amp; Slippage Settings:</strong> Remembering your chosen custom slippage tolerance percentages for bonding curve swaps.</li>
          <li><strong style={{ color: "#fff" }}>ArcFun Wallet &amp; Connector State:</strong> Remembering the last active wallet provider (e.g., ArcFun Wallet, MetaMask, Phantom, Coinbase Wallet) or public wallet addresses for automatic interface reconnection.</li>
          <li><strong style={{ color: "#fff" }}>Interface State:</strong> Persisting dismissed announcement banners, cross-chain bridge transaction history, and recently viewed token filters.</li>
        </ul>
      </LegalSection>

      <LegalSection title="3. Security & Essential Cookies">
        <p>Where utilized, cookies on ArcFun are restricted to essential operational and cryptographic authentication functions:</p>
        <ul style={{ paddingLeft: 20, display: "flex", flexDirection: "column", gap: 8 }}>
          <li><strong style={{ color: "#fff" }}>Session Security (<code>arc_session</code>):</strong> A secure, signed session cookie used exclusively to verify API requests for self-service ArcFun Wallet operations (powered by Circle Developer-Controlled Wallets) without ever exposing or handling private keys.</li>
          <li><strong style={{ color: "#fff" }}>Bot Protection (Cloudflare Turnstile):</strong> Evaluates non-invasive device signals to ensure visitors are human and prevent automated abuse.</li>
        </ul>
        <p>ArcFun does <strong>not</strong> use advertising cookies, marketing tracking pixels, or cross-site analytics beacons.</p>
      </LegalSection>

      <LegalSection title="4. Managing Browser Storage">
        <p>You can inspect, block, or clear cookies and local storage at any time through your browser settings:</p>
        <ul style={{ paddingLeft: 20, display: "flex", flexDirection: "column", gap: 8 }}>
          <li>Clearing local storage will reset your slippage preferences and theme back to default values.</li>
          <li>Blocking all cookies may cause Cloudflare Turnstile verification or administrator login sessions to fail.</li>
        </ul>
      </LegalSection>

      <LegalSection title="5. Updates to This Policy">
        <p>
          We may update this policy if technical storage mechanisms change. Any modifications will be reflected with an updated &quot;Last Updated&quot; date on this page.
        </p>
      </LegalSection>
    </>
  );
}

function RenderAcceptableUseContent() {
  return (
    <>
      <div style={{ background: "rgba(255, 255, 255, 0.03)", border: "1px solid rgba(255, 255, 255, 0.08)", borderRadius: 14, padding: "16px 18px", color: "rgba(255, 255, 255, 0.78)", fontSize: 13.5, lineHeight: 1.7 }}>
        <strong style={{ color: "#ffffff" }}>Compliance Policy:</strong> Users must not deploy malicious contracts, execute illicit financial schemes, or attempt to compromise ArcFun platform infrastructure.
      </div>

      <LegalSection title="1. Unlawful Activities & Sanctions Violations">
        <p>You may not use ArcFun for any illegal purpose or in violation of applicable laws, including:</p>
        <ul style={{ paddingLeft: 20, display: "flex", flexDirection: "column", gap: 8 }}>
          <li>Engaging in money laundering, terrorist financing, proliferation financing, or illicit financial transactions.</li>
          <li>Attempting to evade economic or trade sanctions administered by OFAC, the United Nations, European Union, or United Kingdom.</li>
          <li>Transacting with or facilitating transactions on behalf of specially designated nationals or blocked entities.</li>
          <li>Funding or transacting in connection with illegal narcotics, stolen goods, weapons, or illicit contraband.</li>
        </ul>
      </LegalSection>

      <LegalSection title="2. Fraudulent Token Creation & Scams">
        <p>The ArcFun Launchpad allows permissionless token creation. You must NOT deploy or promote:</p>
        <ul style={{ paddingLeft: 20, display: "flex", flexDirection: "column", gap: 8 }}>
          <li><strong style={{ color: "#fff" }}>Malicious Smart Contracts:</strong> Honeypots, blacklists preventing users from selling, or contracts containing hidden backdoors or drain functions.</li>
          <li><strong style={{ color: "#fff" }}>Scams &amp; Rug Pulls:</strong> Deceptive schemes designed to mislead investors, solicit fraudulent capital, or abandon liquidity illicitly.</li>
          <li><strong style={{ color: "#fff" }}>Impersonation:</strong> Minting tokens pretending to be officially affiliated with established corporations, public figures, third-party projects, or ArcFun without authorization.</li>
          <li><strong style={{ color: "#fff" }}>Phishing &amp; Social Engineering:</strong> Providing misleading metadata, websites, or social links designed to compromise user credentials or wallets.</li>
        </ul>
      </LegalSection>

      <LegalSection title="3. Market Manipulation & Abusive Trading">
        <p>You agree not to engage in manipulative trading practices on ArcFun bonding curves, including:</p>
        <ul style={{ paddingLeft: 20, display: "flex", flexDirection: "column", gap: 8 }}>
          <li><strong style={{ color: "#fff" }}>Wash Trading:</strong> Executing simultaneous buy and sell orders from coordinated wallets to artificially inflate volume or activity.</li>
          <li><strong style={{ color: "#fff" }}>Deceptive Market Practices:</strong> Engaging in spoofing, quoting false intentions, or pump-and-dump coordination.</li>
          <li><strong style={{ color: "#fff" }}>Abusive Automated Bot Traffic:</strong> Flooding the interface or bonding curves with front-running, spamming, or denial-of-service transactions that impair network usability for legitimate participants.</li>
        </ul>
      </LegalSection>

      <LegalSection title="4. System Integrity & Security Exploits">
        <p>You must not attempt to compromise the security, availability, or stability of ArcFun infrastructure:</p>
        <ul style={{ paddingLeft: 20, display: "flex", flexDirection: "column", gap: 8 }}>
          <li>Attempting to probe, scan, exploit, or bypass bot detection, Cloudflare Turnstile, or rate-limiting filters.</li>
          <li>Attacking RPC endpoints, relayer gas infrastructure, or API routing mechanisms.</li>
          <li>Introducing malware, viruses, worms, or malicious scripts into the frontend application.</li>
          <li>Abusing or spamming the /recover bridge recovery utility with fraudulent transaction hashes.</li>
        </ul>
      </LegalSection>

      <LegalSection title="5. ArcFun Wallet & Third-Party Infrastructure Compliance">
        <p>ArcFun Wallets are powered by Circle Developer-Controlled Wallets. When creating or funding an ArcFun Wallet, you agree to:</p>
        <ul style={{ paddingLeft: 20, display: "flex", flexDirection: "column", gap: 8 }}>
          <li><strong style={{ color: "#fff" }}>Legitimate Use:</strong> Use the wallet strictly for lawful personal or organizational digital asset interactions.</li>
          <li><strong style={{ color: "#fff" }}>No Mixing or Obfuscation:</strong> You must NOT use ArcFun Wallets to funnel, layer, or obfuscate the origin of illicit funds or proceeds of cybercrime.</li>
          <li><strong style={{ color: "#fff" }}>No Infrastructure Tampering:</strong> You must NOT attempt to reverse-engineer, decompile, intercept, or tamper with the API endpoints, cryptographic signatures, or authentication handshakes between ArcFun and Circle.</li>
          <li><strong style={{ color: "#fff" }}>Sole Responsibility for Funding:</strong> You acknowledge that ArcFun has zero custody over user assets. You are solely responsible for all funds deposited into or transferred from your ArcFun Wallet.</li>
        </ul>
      </LegalSection>

      <LegalSection title="6. Platform Enforcement & Non-Custodial Boundaries">
        <p>ArcFun reserves the right to take appropriate protective actions if this policy is violated:</p>
        <ul style={{ paddingLeft: 20, display: "flex", flexDirection: "column", gap: 8 }}>
          <li>Restricting or filtering access to the web interface, API routes, or relayer gas subsidization for violating IP addresses or abusive automated scripts.</li>
          <li>Hiding or de-listing known fraudulent, scam, or trademark-infringing token metadata from the frontend display.</li>
          <li>Reporting verified illegal activities to applicable regulatory or law enforcement bodies when legally required.</li>
        </ul>
        <p>
          Because ArcFun does not custody user assets, ArcFun cannot confiscate tokens held in self-custody wallets or alter finalized public blockchain state.
        </p>
      </LegalSection>
    </>
  );
}

const DOCUMENT_COMPONENTS: Record<LegalDocType, React.FC> = {
  terms: RenderTermsContent,
  privacy: RenderPrivacyContent,
  risk: RenderRiskContent,
  cookies: RenderCookiesContent,
  "acceptable-use": RenderAcceptableUseContent,
};

export function LegalPageShell({
  title,
  subtitle,
  docType,
  lastUpdated = "October 2026",
  effectiveDate = "October 2026",
  children,
}: LegalPageShellProps) {
  const pathname = usePathname();
  const [activeDoc, setActiveDoc] = useState<LegalDocType>(() => {
    if (pathname) {
      if (pathname.includes("/privacy")) return "privacy";
      if (pathname.includes("/risk")) return "risk";
      if (pathname.includes("/cookies")) return "cookies";
      if (pathname.includes("/acceptable-use")) return "acceptable-use";
    }
    return docType;
  });

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Sync state if user clicks browser back/forward buttons
  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname;
      if (path.includes("/privacy")) setActiveDoc("privacy");
      else if (path.includes("/risk")) setActiveDoc("risk");
      else if (path.includes("/cookies")) setActiveDoc("cookies");
      else if (path.includes("/acceptable-use")) setActiveDoc("acceptable-use");
      else setActiveDoc("terms");
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  // Sync document and body background to dark to prevent light mode bleed
  useEffect(() => {
    if (typeof document !== "undefined") {
      const prevBodyBg = document.body.style.background;
      const prevHtmlBg = document.documentElement.style.background;
      document.body.style.background = "#08080a";
      document.documentElement.style.background = "#08080a";
      return () => {
        document.body.style.background = prevBodyBg;
        document.documentElement.style.background = prevHtmlBg;
      };
    }
  }, []);

  // Update document title dynamically
  useEffect(() => {
    const currentMeta = DOC_METADATA[activeDoc];
    if (currentMeta) {
      document.title = `${currentMeta.title} | ArcFun`;
    }
  }, [activeDoc]);

  // Handle instant switching
  const handleNavClick = (id: LegalDocType, href: string, e: React.MouseEvent) => {
    e.preventDefault();
    if (activeDoc === id) return;
    setActiveDoc(id);
    if (typeof window !== "undefined") {
      window.history.pushState(null, "", href);
    }
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const currentMeta = DOC_METADATA[activeDoc] || { title, subtitle };
  const ActivePageIcon = ICONS_BY_DOC_TYPE[activeDoc] || FileText;
  const ActiveDocContent = DOCUMENT_COMPONENTS[activeDoc];

  return (
    <div
      ref={scrollContainerRef}
      id="legal-scroll-container"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: "100%",
        height: "100%",
        minHeight: "100vh",
        overflowY: "auto",
        overflowX: "hidden",
        WebkitOverflowScrolling: "touch",
        background: "#08080a",
        color: "#f3f4f6",
        fontFamily: "var(--font-geist), var(--font-inter), -apple-system, BlinkMacSystemFont, sans-serif",
        zIndex: 30,
      }}
    >
      {/* Top Sticky Header */}
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 50,
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          background: "rgba(8, 8, 10, 0.88)",
          borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
          padding: "0 24px",
          height: 64,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Link
            href="/"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 9,
              textDecoration: "none",
              color: "inherit",
            }}
          >
            <img
              src="/rocket-logo.png"
              alt="ArcFun Logo"
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                objectFit: "cover",
                border: "1px solid rgba(255, 255, 255, 0.12)",
              }}
            />
            <span style={{ color: "#ffffff", fontWeight: 700, fontSize: 16, letterSpacing: "-0.02em" }}>
              ArcFun
            </span>
          </Link>

          <span style={{ color: "rgba(255, 255, 255, 0.2)", fontSize: 15 }}>/</span>
          <span style={{ fontSize: 12.5, fontWeight: 500, color: "rgba(255, 255, 255, 0.45)", letterSpacing: "0.02em" }}>
            Legal
          </span>
        </div>

        <Link
          href="/"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 7,
            padding: "8px 14px",
            borderRadius: 99,
            background: "rgba(255, 255, 255, 0.06)",
            border: "1px solid rgba(255, 255, 255, 0.1)",
            color: "#ffffff",
            fontSize: 13,
            fontWeight: 600,
            textDecoration: "none",
            transition: "all 0.15s ease",
          }}
          className="hover:bg-white/10 hover:border-white/20"
        >
          <ArrowLeft size={14} color="#ffffff" />
          <span>Back to App</span>
        </Link>
      </header>

      {/* Main Container */}
      <div
        style={{
          maxWidth: 1140,
          margin: "0 auto",
          padding: "36px 20px 80px",
          display: "grid",
          gridTemplateColumns: "240px 1fr",
          gap: 36,
        }}
        className="legal-grid-layout"
      >
        {/* Left Sticky Policy Navigation */}
        <aside style={{ position: "relative" }}>
          <div
            style={{
              position: "sticky",
              top: 96,
              display: "flex",
              flexDirection: "column",
              gap: 4,
              padding: "12px",
              background: "#101013",
              borderRadius: 16,
              border: "1px solid rgba(255, 255, 255, 0.08)",
            }}
          >
            <div style={{ padding: "8px 10px 12px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(255, 255, 255, 0.35)" }}>
              Legal Documents
            </div>
            {LEGAL_NAV_ITEMS.map((item) => {
              const isActive = activeDoc === item.id;
              const ItemIcon = item.icon;
              return (
                <a
                  key={item.href}
                  href={item.href}
                  onClick={(e) => handleNavClick(item.id, item.href, e)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "9px 12px",
                    borderRadius: 10,
                    fontSize: 13,
                    fontWeight: isActive ? 600 : 500,
                    color: isActive ? "#ffffff" : "rgba(255, 255, 255, 0.5)",
                    background: isActive ? "rgba(255, 255, 255, 0.08)" : "transparent",
                    border: isActive ? "1px solid rgba(255, 255, 255, 0.16)" : "1px solid transparent",
                    textDecoration: "none",
                    cursor: "pointer",
                    transition: "all 0.12s ease",
                  }}
                  className={!isActive ? "hover:bg-white/5 hover:text-white" : ""}
                >
                  <ItemIcon size={15} color={isActive ? "#ffffff" : "rgba(255, 255, 255, 0.38)"} />
                  <span>{item.name}</span>
                </a>
              );
            })}

            <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid rgba(255, 255, 255, 0.06)", paddingLeft: 10, paddingRight: 10 }}>
              <span style={{ fontSize: 11, color: "rgba(255, 255, 255, 0.35)", lineHeight: 1.5, display: "block" }}>
                ArcFun is a non-custodial decentralized interface.
              </span>
            </div>
          </div>
        </aside>

        {/* Right Content Area */}
        <main
          style={{
            background: "#101013",
            borderRadius: 20,
            border: "1px solid rgba(255, 255, 255, 0.08)",
            padding: "36px 40px",
            minWidth: 0,
          }}
          className="legal-content-card"
        >
          {/* Header Banner */}
          <div style={{ paddingBottom: 28, borderBottom: "1px solid rgba(255, 255, 255, 0.08)", marginBottom: 32 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  background: "rgba(255, 255, 255, 0.05)",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <ActivePageIcon size={20} color="#ffffff" />
              </div>
              <div>
                <div style={{ display: "inline-block", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(255, 255, 255, 0.45)", marginBottom: 3 }}>
                  ArcFun Protocol Policy
                </div>
                <h1 style={{ fontSize: 26, fontWeight: 800, color: "#ffffff", margin: 0, letterSpacing: "-0.03em" }}>
                  {currentMeta.title}
                </h1>
              </div>
            </div>

            <p style={{ fontSize: 14.5, color: "rgba(255, 255, 255, 0.65)", lineHeight: 1.75, margin: "0 0 14px" }}>
              {currentMeta.subtitle}
            </p>

            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 16, fontSize: 12, color: "rgba(255, 255, 255, 0.4)" }}>
              <span>Effective Date: <strong style={{ color: "rgba(255, 255, 255, 0.7)" }}>{effectiveDate}</strong></span>
              <span>•</span>
              <span>Last Updated: <strong style={{ color: "rgba(255, 255, 255, 0.7)" }}>{lastUpdated}</strong></span>
              <span>•</span>
              <span>Platform: <strong style={{ color: "#ffffff" }}>ArcFun (thearcfun.xyz)</strong></span>
            </div>
          </div>

          {/* Policy Body */}
          <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
            {activeDoc === docType && children ? children : <ActiveDocContent />}
          </div>

          {/* Contact & Support Section */}
          <div style={{ marginTop: 44, paddingTop: 32, borderTop: "1px solid rgba(255, 255, 255, 0.08)" }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: "#ffffff", margin: "0 0 10px" }}>Questions & Contact</h2>
            <p style={{ fontSize: 13.5, color: "rgba(255, 255, 255, 0.5)", lineHeight: 1.7, margin: "0 0 16px" }}>
              If you have any questions or require clarification regarding this document or our non-custodial software interfaces, please reach out through our official channels:
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
              <a
                href="https://www.thearcfun.xyz"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 9,
                  padding: "10px 16px",
                  background: "rgba(255, 255, 255, 0.04)",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  borderRadius: 12,
                  textDecoration: "none",
                  color: "#ffffff",
                  fontSize: 13,
                  fontWeight: 600,
                  transition: "all 0.15s ease",
                }}
                className="hover:bg-white/10 hover:border-white/20"
              >
                <Globe size={15} color="#ffffff" />
                <span>https://www.thearcfun.xyz</span>
                <ExternalLink size={12} style={{ opacity: 0.5 }} />
              </a>

              <a
                href="mailto:supportarcfun@gmail.com"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 9,
                  padding: "10px 16px",
                  background: "rgba(255, 255, 255, 0.04)",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  borderRadius: 12,
                  textDecoration: "none",
                  color: "#ffffff",
                  fontSize: 13,
                  fontWeight: 600,
                  transition: "all 0.15s ease",
                }}
                className="hover:bg-white/10 hover:border-white/20"
              >
                <Mail size={15} color="#ffffff" />
                <span>supportarcfun@gmail.com</span>
              </a>
            </div>
          </div>
        </main>
      </div>

      <style jsx global>{`
        html, body {
          background: #08080a !important;
          background-color: #08080a !important;
        }
        #legal-scroll-container::-webkit-scrollbar {
          width: 8px;
        }
        #legal-scroll-container::-webkit-scrollbar-track {
          background: #08080a;
        }
        #legal-scroll-container::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.15);
          border-radius: 4px;
        }
        #legal-scroll-container::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.25);
        }
        @media (max-width: 860px) {
          .legal-grid-layout {
            grid-template-columns: 1fr !important;
            padding: 20px 16px 60px !important;
          }
          .legal-content-card {
            padding: 24px 20px !important;
          }
        }
      `}</style>
    </div>
  );
}
