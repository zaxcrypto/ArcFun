import { LegalPageShell, LegalSection } from "@/components/legal-page-shell";
import { FileText } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service | ArcFun",
  description: "Terms and conditions governing access to and use of the ArcFun non-custodial software interface.",
};

export default function TermsPage() {
  return (
    <LegalPageShell
      title="Terms of Service"
      subtitle="These Terms of Service govern your access to and use of ArcFun and its associated decentralized software interfaces."
      docType="terms"
    >
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
          <li><strong style={{ color: "#fff" }}>Third-Party Exploits &amp; Technical Failures:</strong> In the event of any security breach, zero-day vulnerability, unauthorized access, server compromise, protocol exploit, network partition, technical disruption, insolvency, service cessation, or regulatory action affecting Circle, underlying blockchain networks, or third-party infrastructure partners, <strong style={{ color: "#ef4444" }}>ArcFun bears zero responsibility or liability</strong>.</li>
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
    </LegalPageShell>
  );
}
