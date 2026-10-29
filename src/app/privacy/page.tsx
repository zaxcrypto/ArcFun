import { LegalPageShell, LegalSection } from "@/components/legal-page-shell";
import { Shield } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy | ArcFun",
  description: "Privacy policy and data protection practices for the ArcFun non-custodial decentralized interface.",
};

export default function PrivacyPage() {
  return (
    <LegalPageShell
      title="Privacy Policy"
      subtitle="This Privacy Policy explains how information is handled when you visit and interact with the ArcFun non-custodial software interfaces."
      docType="privacy"
    >
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
    </LegalPageShell>
  );
}
