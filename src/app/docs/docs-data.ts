export interface DocSection {
  id: string;
  title: string;
  badge?: string;
  category: 'Overview' | 'Bridge & Swap' | 'ArcFun Wallet' | 'Web3 Chat' | 'Circle Gateway' | 'Security & Policies' | 'Support';
  breadcrumbs: string[];
  summary: string;
  content: string; // Markdown / structured content
  subsections?: { id: string; title: string }[];
}

export const DOC_CATEGORIES = [
  'Overview',
  'Bridge & Swap',
  'ArcFun Wallet',
  'Web3 Chat',
  'Circle Gateway',
  'Security & Policies',
  'Support'
] as const;

export const DOC_SECTIONS: DocSection[] = [
  {
    id: 'intro',
    title: 'Introduction to ArcFun',
    category: 'Overview',
    breadcrumbs: ['Overview', 'Get Started', 'Introduction'],
    summary: 'ArcFun is an all-in-one multi-chain Web3 DeFi platform uniting cross-chain bridging, smart wallet custody, and wallet-to-wallet messaging.',
    subsections: [
      { id: 'what-is-arcfun', title: 'What is ArcFun?' },
      { id: 'core-pillars', title: 'Core Platform Pillars' },
      { id: 'problems-solved', title: 'Problems ArcFun Solves' },
      { id: 'supported-ecosystems', title: 'Supported Ecosystems' }
    ],
    content: `
### What is ArcFun?

**ArcFun** (accessible via [thearcfun.xyz](https://thearcfun.xyz)) is an all-in-one decentralized Web3 finance platform and multi-chain execution environment. Built to solve multi-chain fragmentation, ArcFun combines high-speed cross-chain asset bridging and token swaps, a biometric-secured multi-chain native wallet, Circle Gateway unified liquidity, and real-time wallet-to-wallet messaging into a single, cohesive user experience.

With ArcFun, users no longer need to jump across dozens of disjointed decentralized apps, manage multiple browser wallet extensions, or worry about seed phrase vulnerabilities.

---

### Core Platform Pillars

| Pillar | Description |
| :--- | :--- |
| **Cross-Chain Bridge & Swap** | Fast cross-chain transfers and token swaps across EVM networks and non-EVM ecosystems (Solana, Sui) powered by Circle CCTP and decentralized liquidity routes. |
| **ArcFun Native Wallet** | Hardware-secured multi-chain smart wallet provisioning institutional Circle Developer-Controlled Wallets (DCW) across both EVM (Arc & L2s) and Solana, unified under Touch ID / Face ID biometric passkeys. |
| **Web3 Chat & Social Pay** | Real-time wallet-to-wallet messaging with instant in-chat cryptocurrency transfers, recurring autopay, and direct contact tipping. |
| **Circle Gateway Unified Liquidity** | Institutional-grade unified balance and cross-chain settlement protocol supporting gas-sponsored transfers. |
| **Granular Security Policies** | Enterprise-grade safety engine with user-customizable 24-hour daily transfer caps, max per-transaction limits, and biometric threshold prompts. |
| **Consolidated Portfolio** | Multi-chain balance aggregator providing unified USD portfolio valuation, asset distribution breakdowns, and live oracle pricing. |

---

### Problems ArcFun Solves

1. **Multi-Chain Fragmentation:** Users traditionally juggle separate wallet extensions (e.g. MetaMask for EVM, Phantom for Solana) with separate seed phrases. ArcFun unifies EVM and SVM accounts under one seamless authentication session.
2. **Gas Dependency & Onboarding Hurdles:** Transferring funds on a new network normally requires acquiring that chain's native gas asset first. ArcFun utilizes paymaster gas sponsorship and native USDC gas abstraction.
3. **Catastrophic Wallet Draining:** Standard Web3 wallets allow total account drainage if a private key or session is compromised. ArcFun enforces strict 24-hour velocity limits and per-transaction caps before any transfer is signed.
4. **Complex Address Sharing:** Sending money to friends or contacts requires copying error-prone 44-character strings. ArcFun Web3 Chat allows direct contact-based messaging and one-tap in-chat payments.
`
  },
  {
    id: 'architecture',
    title: 'ArcFun System Architecture',
    category: 'Overview',
    breadcrumbs: ['Overview', 'Architecture', 'System Overview'],
    summary: 'A deep dive into how ArcFun coordinates client presentation, security policy enforcement, Circle DCW custody, and cross-chain relaying.',
    subsections: [
      { id: 'architectural-layers', title: 'Platform Layers' },
      { id: 'transaction-flow', title: 'Transaction Flow' },
      { id: 'failover-reliability', title: 'High Availability & Failovers' }
    ],
    content: `
### Platform Layers

ArcFun is engineered across four decoupled architectural layers to guarantee security, high throughput, and zero single points of failure:

1. **Client & Presentation Layer:**
   - React 19 & Next.js App Router application with responsive state handling.
   - Dual-mode deployment: full-screen Web3 DeFi dashboard and floating embeddable wallet manager widget.
   - Integrated Wagmi connectors (MetaMask, Coinbase Wallet, Rainbow, WalletConnect) and Solana Wallet Adapter, alongside WebAuthn biometric hardware modules.

2. **Policy Engine & Guardrail Layer:**
   - Pre-execution validation pipeline enforcing user-defined safety policies before any transaction can touch blockchain nodes.
   - Evaluates USD valuation against real-time oracle feeds (CoinGecko and DEX quotes).
   - Enforces rolling 24-hour volume caps and rejects transactions that exceed user thresholds.
   - Manages atomic intent locks (\`payment_ledger\`) with expiration timers to eliminate double-spend vectors.

3. **Multi-Chain Execution & Custody Layer:**
   - **Circle DCW Multi-Chain Engine:** Both EVM accounts (Arc Network & Ethereum/L2s) and Solana accounts are provisioned via Circle's institutional Developer-Controlled Wallet (DCW) APIs, with cryptographic key material safeguarded in institutional Hardware Security Modules (HSMs).
   - **Native Gas Sponsorship & RPC Routing:** Built-in paymasters sponsor gas for eligible cross-chain actions and provide high-availability RPC routing across supported chains.

4. **Data Synchronization & Realtime Messaging:**
   - Supabase PostgreSQL with Row-Level Security (RLS) policies.
   - Supabase Realtime websocket channels for instant chat delivery, typing indicators, and presence updates.
   - Background reconciliation continuously updating transaction states and on-chain blockchain hashes.

---

### Transaction Flow

\`\`\`
[User Transfer / Swap Request]
          │
          ▼
[1. Live Oracle Valuation] ─────── (Real-time price feed calculates USD value)
          │
          ▼
[2. Policy Engine Verification] ── (Enforces per-tx max & 24h cumulative volume)
          │
          ├─► [Limit Exceeded] ───► Prompts user with direct link to increase limit
          │
          ▼
[3. Biometric Challenge] ────────► (Triggers Face ID / Touch ID if > threshold)
          │
          ▼
[4. Atomic Intent Reservation] ──► (Locks intent in ledger to prevent double-spend)
          │
          ▼
[5. Blockchain Execution] ───────► (Circle DCW API or EVM Paymaster RPC)
          │
          ▼
[6. Ledger Confirmation] ────────► (Balances refreshed + UI updated instantly)
\`\`\`
`
  },
  {
    id: 'bridge-overview',
    title: 'Cross-Chain Bridge & Swap',
    category: 'Bridge & Swap',
    breadcrumbs: ['Bridge & Swap', 'Cross-Chain', 'Overview'],
    summary: 'Frictionless multi-chain transfers and token swaps across EVM and non-EVM ecosystems powered by Circle CCTP and native liquidity.',
    subsections: [
      { id: 'how-bridging-works', title: 'How ArcFun Bridging Works' },
      { id: 'circle-cctp-routing', title: 'Circle CCTP Integration' },
      { id: 'slippage-protection', title: 'Swap Engine & Slippage' }
    ],
    content: `
### How ArcFun Bridging Works

The **ArcFun Bridge & Swap** module allows users to transfer assets seamlessly between blockchains without manual wrap/unwrap steps or risky third-party bridges.

Users can bridge and swap between:
- **Ethereum & Layer-2s:** Arbitrum, Base, Optimism, Linea, Ink, Unichain, Polygon, Avalanche
- **Non-EVM Blockchains:** Solana, Sui
- **Testnets:** Arc Testnet, Monad Testnet, Sonic Testnet

---

### Circle CCTP Integration

For native USDC transfers, ArcFun leverages **Circle's Cross-Chain Transfer Protocol (CCTP)**:
1. **Burn on Source:** Native USDC is burned directly on the source blockchain.
2. **Attestation:** Circle's attestation service cryptographically confirms the burn.
3. **Mint on Destination:** Native, un-wrapped USDC is minted directly on the recipient chain.

This eliminates the security vulnerabilities of traditional wrapped tokens and synthetic assets.

---

### Swap Engine & Slippage Protection

ArcFun's built-in token swap calculates optimal routing through decentralized liquidity pools:
- **Price Impact Warning:** Automatically alerts users if a large order exceeds safe market depth.
- **Slippage Tolerance:** Configurable slippage boundaries (default 0.5%–1.0%) to prevent MEV front-running.
- **Unified Fee Estimation:** Displays estimated network execution fees upfront in transparent dollar values.
`
  },
  {
    id: 'wallet-overview',
    title: 'ArcFun Native Smart Wallet',
    category: 'ArcFun Wallet',
    breadcrumbs: ['ArcFun Wallet', 'Smart Wallet', 'Overview'],
    summary: 'A non-custodial multi-chain wallet with biometric passkeys, dual-engine account architecture, and seed-phrase elimination.',
    subsections: [
      { id: 'dual-chain-architecture', title: 'Dual-Engine Model' },
      { id: 'webauthn-security', title: 'Biometrics & Passkeys' },
      { id: 'portfolio-aggregation', title: 'Consolidated Portfolio' }
    ],
    content: `
### Dual-Engine Model

Most Web3 wallets force users to manage separate 12-word seed phrases, install conflicting browser extensions, and disconnect when switching between EVM and Solana. ArcFun eliminates these barriers through a **Unified Dual-Engine Architecture**:

- **EVM Account (Arc Network & L2s):** Provisioned on-demand via Circle's institutional Developer-Controlled Wallet (DCW) APIs directly on Arc Network and EVM chains.
- **Solana Account (SVM):** Simultaneously provisioned on-demand within the same unified wallet set via Circle's institutional Developer-Controlled Wallet (DCW) APIs.

Both accounts are created in a single step and secured by your device's biometric passkeys (Touch ID, Face ID, or Windows Hello). When you sign in, ArcFun automatically hydrates both addresses and displays your balances in a single consolidated portfolio—eliminating seed phrases, browser extensions, and manual network switching.

*(Note: Users who prefer using traditional external browser extensions like MetaMask or Phantom can still connect them separately through the external wallet connection option).*

---

### Biometrics & Passkeys (WebAuthn)

ArcFun replaces vulnerable 12-word paper seed phrases with **hardware-backed biometric passkeys**:
- **Touch ID, Face ID & Windows Hello:** Cryptographic key pairs generated inside your device's Secure Enclave / TPM chip via WebAuthn standards.
- **Phishing Resistant:** WebAuthn credentials cannot be harvested by fraudulent copycat websites.
- **Fallback Password Protection:** Users configure a secondary security password for devices without biometric hardware or browser compatibility.

---

### Consolidated Portfolio

Every asset in your ArcFun Wallet displays:
1. **Total Holdings:** Consolidated aggregate balance across all supported networks.
2. **Chain Breakdown:** Expanding an asset displays exact balances per blockchain with dedicated Send and Receive buttons.
3. **Real-Time Fiat Valuation:** Asset values refresh every 30 seconds using live market oracle feeds.
`
  },
  {
    id: 'web3-chat',
    title: 'Web3 Chat & Social Payments',
    category: 'Web3 Chat',
    breadcrumbs: ['Web3 Chat', 'Social Pay', 'Overview'],
    summary: 'Real-time wallet-to-wallet messaging with instant in-chat cryptocurrency tipping and recurring payments.',
    subsections: [
      { id: 'wallet-messaging', title: 'Wallet-to-Wallet Messaging' },
      { id: 'social-payments', title: 'In-Chat Payments & Autopay' },
      { id: 'contacts-and-management', title: 'Contacts & Conversation Management' }
    ],
    content: `
### Wallet-to-Wallet Messaging

**ArcFun Web3 Chat** brings communication directly into your decentralized wallet:
- **Direct Address Messaging:** Initiate direct chats with any recipient simply by entering their wallet address.
- **Real-Time Delivery:** Messages and typing indicators synchronize instantly using Supabase Realtime websocket channels.
- **Wallet-Authenticated Identity:** Users authenticate using their wallet session (Sign-In with Ethereum).

---

### In-Chat Payments & Autopay

Sending crypto to peers no longer requires asking for their address, copying it to clipboard, and worrying about address poisoning:
1. Open any active chat conversation.
2. Click the **Send Payment** action button inside the chat interface.
3. Choose the token and amount (e.g. 10 USDC or 0.1 SOL).
4. The payment is executed on-chain and verified directly within the conversation thread with a live transaction explorer link.
5. **Autopay Rules:** Configure recurring daily, weekly, or monthly payments directly between trusted contacts.

---

### Contacts & Conversation Management

- **Contact Book:** Save frequently accessed wallet addresses with custom nicknames.
- **Thread Controls:** Pin your most important conversations, archive finished threads, or hide unwanted chats.
- **Rich Media & Reactions:** React to messages with emojis, reply to specific messages, and share media attachments.
`
  },
  {
    id: 'circle-gateway',
    title: 'Circle Gateway & Liquidity',
    category: 'Circle Gateway',
    breadcrumbs: ['Circle Gateway', 'Protocol', 'Overview'],
    summary: 'Cross-chain unified liquidity protocol enabling instant gasless transfers and institutional settlement.',
    subsections: [
      { id: 'gateway-mechanics', title: 'Unified Liquidity Mechanics' },
      { id: 'sponsored-attestation', title: 'Gasless Transfers & Sponsorship' },
      { id: 'supported-tokens', title: 'Supported Gateway Assets' }
    ],
    content: `
### Unified Liquidity Mechanics

**ArcFun Circle Gateway** enables instant cross-chain liquidity settlement without liquidity fragmentation:
- Coordinates balance transfers across supported networks via institutional Circle APIs.
- Eliminates traditional 7-day optimistic rollup bridge withdrawal delays.
- Provides atomic execution guarantees backed by verifiable cryptographic attestations.

---

### Gasless Transfers & Sponsorship

On eligible transactions, ArcFun's **Fee Sponsorship Engine** sponsors destination execution fees:
- Users pay fees natively in stablecoins (USDC/EURC) rather than requiring native gas tokens (ETH/SOL).
- ArcFun's fee treasury automatically attests and relays the transaction to destination validators.
`
  },
  {
    id: 'security-policies',
    title: 'Security Architecture & Guardrails',
    category: 'Security & Policies',
    breadcrumbs: ['Security & Policies', 'Protection', 'Policy Engine'],
    summary: 'Granular user-configured policies, daily limits, velocity controls, and anti-drain safeguards.',
    subsections: [
      { id: 'policy-parameters', title: 'Configurable Policy Parameters' },
      { id: 'daily-limits-logic', title: 'Rolling 24-Hour Limits' },
      { id: 'increasing-limits', title: 'How to Increase Limits' }
    ],
    content: `
### Configurable Policy Parameters

ArcFun implements an active security policy engine (\`src/lib/security/policy-engine.ts\`) safeguarding every connected wallet:

| Policy Setting | Default | Description |
| :--- | :--- | :--- |
| **Max Per Transaction** | \`$500.00 USD\` | Rejects any single transfer whose calculated USD valuation exceeds this limit. |
| **Daily Transfer Limit** | \`$1,000.00 USD\` | Rejects transfers if cumulative outgoing transfers within the last 24 hours exceed this cap. |
| **Passkey Threshold** | \`$100.00 USD\` | Transfers exceeding this value require Face ID / Touch ID biometric authentication. |
| **Velocity Cap** | Active | Prevents rapid consecutive transfers within seconds to stop automated drainer scripts. |

---

### Rolling 24-Hour Limits

Rather than resetting at midnight UTC, ArcFun calculates transfer volume across a true rolling 24-hour window:
\`\`\`typescript
// Rolling 24-hour daily limit enforcement
const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
const { data: pastTxs } = await supabaseAdmin
  .from('payment_ledger')
  .select('amount, token, status')
  .eq('user_id', user.id)
  .gte('created_at', oneDayAgo)
  .in('status', ['RESERVED', 'SUBMITTING', 'PENDING', 'CONFIRMED', 'COMPLETE']);
\`\`\`

If a proposed transfer would push the 24-hour total above your configured daily cap, the transaction is safely rejected before any signatures are created.

---

### How to Increase Limits

If you need to make a larger transfer:
1. Open **ArcFun Wallet** and tap **Settings** (or click the alert banner in the transfer screen).
2. Navigate to **Security Center**.
3. Adjust your **Per-Transaction Limit** or **Daily Transfer Cap**.
4. Confirm the modification with your biometric passkey or master password.
`
  },
  {
    id: 'support',
    title: 'Help & Official Support',
    badge: 'Helpdesk',
    category: 'Support',
    breadcrumbs: ['Support', 'Helpdesk & Community'],
    summary: 'Reach out to the ArcFun engineering and operations team for direct technical support, wallet connection assistance, or community discussions.',
    subsections: [
      { id: 'wallet-troubleshooting', title: 'Wallet Connection Troubleshooting' },
      { id: 'security-advisory', title: 'Official Security Advisory' },
      { id: 'response-times', title: 'Response Times & SLAs' }
    ],
    content: `
### Wallet Connection Troubleshooting

If you are having trouble connecting or verifying your wallet in the ArcFun Native Wallet modal, follow these diagnostic steps:

1. **Verify Browser Extension State:**
   - Make sure your wallet extension (MetaMask, Phantom, Rabby, Coinbase Wallet) is unlocked and on the latest version.
   - If multiple wallet extensions conflict (e.g. Phantom and MetaMask intercepting \`window.ethereum\`), try temporarily disabling unused extensions or opening the app in an Incognito window.
2. **Network & Chain Selection:**
   - ArcFun connects to supported EVM chains (Arbitrum, Base, Optimism, Ethereum, Polygon) and Solana.
   - If prompted by your wallet to switch chains, accept the network switch request.
3. **Biometric & Passkey Prompt:**
   - ArcFun Native Smart Wallets utilize hardware-backed WebAuthn (Touch ID / Face ID / Windows Hello) for transaction authorization.
   - Ensure your browser permits WebAuthn credentials and biometric prompts.
4. **RPC & Firewall Diagnostics:**
   - If connection timeouts occur, check whether aggressive ad-blockers, VPN firewalls, or privacy extensions are blocking WebSocket or RPC calls to \`thearcfun.xyz\` and Circle APIs.

---

### Official Security Advisory

> [!NOTE]
> ArcFun team members will **NEVER** direct message you first asking for seed phrases, private keys, passwords, or recovery codes. Always verify official domains: thearcfun.xyz and www.thearcfun.xyz.

- **Never share private keys:** Legitimate support never requires your secret recovery phrase.
- **Check URLs carefully:** Always verify you are on https://thearcfun.xyz or https://www.thearcfun.xyz before approving signatures.
- **Report imposters:** If you encounter phishing attempts or fake accounts on Telegram or X, immediately report them to [supportarcfun@gmail.com](mailto:supportarcfun@gmail.com).

---

### Response Times & SLAs

- **Telegram Community:** Typical response within **5 to 30 minutes** during active hours.
- **Email Support:** Inquiries answered within **12 to 24 hours** by our technical team.
- **Critical Security Inquiries:** Handled with expedited priority via [supportarcfun@gmail.com](mailto:supportarcfun@gmail.com).
`
  }
];
