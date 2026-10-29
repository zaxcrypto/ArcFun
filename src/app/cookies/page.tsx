import { LegalPageShell, LegalSection } from "@/components/legal-page-shell";
import { Cookie } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Cookie & Storage Policy | ArcFun",
  description: "Cookie and local storage policy for ArcFun non-custodial decentralized application.",
};

export default function CookiesPage() {
  return (
    <LegalPageShell
      title="Cookie & Storage Policy"
      subtitle="This policy explains how ArcFun uses browser storage technologies when you visit and interact with the ArcFun decentralized application."
      docType="cookies"
    >
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
    </LegalPageShell>
  );
}
