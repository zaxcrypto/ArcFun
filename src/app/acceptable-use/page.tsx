import { LegalPageShell, LegalSection } from "@/components/legal-page-shell";
import { FileCheck } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Acceptable Use Policy | ArcFun",
  description: "Standards and prohibited activities for the ArcFun non-custodial software interfaces.",
};

export default function AcceptableUsePage() {
  return (
    <LegalPageShell
      title="Acceptable Use Policy"
      subtitle="This Acceptable Use Policy sets forth prohibited activities when accessing or interacting with ArcFun software interfaces."
      docType="acceptable-use"
    >
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
    </LegalPageShell>
  );
}
