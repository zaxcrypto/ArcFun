# ArcFun

> **Next-Generation Cross-Chain Token Launchpad, Universal Liquidity Hub & Circle Gateway Protocol on Arc Network**

[![CI](https://github.com/zaxcrypto/Arc.fun/actions/workflows/ci.yml/badge.svg)](https://github.com/zaxcrypto/Arc.fun/actions/workflows/ci.yml)
[![Next.js 16](https://img.shields.io/badge/Next.js-16.2.12-black)](https://nextjs.org/)
[![Hardhat](https://img.shields.io/badge/Hardhat-2.28-yellow)](https://hardhat.org/)
[![Solidity](https://img.shields.io/badge/Solidity-0.8.28-lightgrey)](https://soliditylang.org/)

ArcFun is a comprehensive Web3 platform built around the **Arc Network**, offering instantaneous cross-chain token launches backed by bonding curve liquidity, seamless Circle Gateway / CCTP USDC bridging, passkey-secured Developer-Controlled Wallets (DCW), and an immutable transaction recovery system.

---

## Table of Contents

- [Overview & Key Features](#overview--key-features)
- [Architecture & Tech Stack](#architecture--tech-stack)
- [Supported Networks & Domains](#supported-networks--domains)
- [Implementation Status](#implementation-status)
- [Prerequisites](#prerequisites)
- [Local Development Setup](#local-development-setup)
- [Environment Variables](#environment-variables)
- [Testing & Quality Assurance](#testing--quality-assurance)
- [Smart Contract Architecture & Upgrades](#smart-contract-architecture--upgrades)
- [Database Migrations (Supabase)](#database-migrations-supabase)
- [Circle Gateway & Webhook Integration](#circle-gateway--webhook-integration)
- [Security Policy & Disclosures](#security-policy--disclosures)
- [Contributing](#contributing)

---

## Overview & Key Features

1. **Bonding Curve Token Launchpad (`ArcFunCurve`)**
   - Instant token launches with linear or exponential pricing formulas.
   - Dual-asset quotation support (USDC, EURC, and custom collateral).
   - Automated graduation mechanism migrating liquidity to DEX pools once funding thresholds are met.
2. **Circle Gateway & CCTP V2 Cross-Chain Routing**
   - Near-instant USDC transfers across EVM and Solana environments.
   - Gas-sponsored minting relayer allowing recipient execution without native gas tokens.
   - Resilient multi-tier burn/mint recovery mechanism using on-chain transaction hashes.
3. **Circle Developer-Controlled Wallets (DCW) with WebAuthn**
   - Non-custodial user experience powered by biometrics and WebAuthn passkeys.
   - Deterministic wallet provisioning with automatic recovery.
4. **Institutional Tokenization Bridges**
   - Dinari dShare integration enabling token pairs backed by real-world assets (RWAs).
5. **Real-Time Market Analytics & Community Engagement**
   - High-performance financial charts built on Lightweight Charts.
   - Token chat rooms and sentiment tracking.

---

## Architecture & Tech Stack

```mermaid
graph TD
    Client[Next.js 16 Web App / React 19] --> API[Next.js Server Routes]
    Client --> Wagmi[Wagmi / RainbowKit / Solana Wallet Adapter]

    API --> Supabase[(Supabase Database & Realtime)]
    API --> CircleAPI[Circle Developer API / DCW / CCTP]
    API --> Relayer[Ethers / Viem Sponsoring Relayer]

    Wagmi --> ArcChain[Arc Testnet RPC (5042002)]
    Wagmi --> EVMChains[Sepolia / Base / Arbitrum / Unichain]

    ArcChain --> Factory[ArcFunTokenFactory (UUPS Proxy)]
    Factory --> Curves[ArcFunCurve Instances]
    Curves --> DEX[ArcFunSwap AMM]

    CircleHook[Circle Gateway Webhook] --> API
```

- **Frontend & Fullstack:** Next.js 16 (App Router, Turbopack), React 19, Tailwind CSS v4, Framer Motion, Lightweight Charts, Zustand.
- **Smart Contracts:** Solidity `0.8.28`, OpenZeppelin v5 Upgradeable contracts (UUPS), Hardhat, Ethers v6, Viem v2.
- **Off-chain Infrastructure:** Supabase PostgreSQL with Row Level Security (RLS), Cloudflare Turnstile, Circle Developer-Controlled Wallets SDK.

---

## Supported Networks & Domains

The platform supports cross-chain liquidity between Arc and major CCTP-enabled chains:

| Network | Chain ID | Circle CCTP Domain | Native Gas Asset | Contract Status |
| :--- | :---: | :---: | :---: | :---: |
| **Arc Testnet** | `5042002` | — | `USDC` | Deployed & Active |
| **Ethereum Sepolia** | `11155111` | `0` | `ETH` | Deployed & Supported |
| **Base Sepolia** | `84532` | `6` | `ETH` | Supported |
| **Arbitrum Sepolia** | `421614` | `3` | `ETH` | Supported |
| **Unichain Sepolia** | `1301` | `10` | `ETH` | Supported |
| **Solana Devnet** | — | `5` | `SOL` | Supported via DCW |

*Note: All networks operate in testnet/devnet mode during current release phase.*

---

## Implementation Status

- [x] **Smart Contracts:** Factory, Bonding Curve, AMM Swap, and ERC-20 template compiled and verified on Arc Testnet.
- [x] **Upgradeable Proxies:** UUPS pattern managed via `@openzeppelin/hardhat-upgrades` (manifest recorded in `.openzeppelin/unknown-5042002.json`).
- [x] **Gateway Sponsored Minting:** Automated gas fee estimation with dynamic EIP-1559 priority fee clamping.
- [x] **Webhook Validation:** Cryptographic verification using Circle public keys, timestamp skew validation, and replay rejection.
- [x] **Automated Testing:** 78 passing test suites covering smart contracts, webhook verification, wallet recovery, and charting algorithms.
- [ ] **Mainnet Deployment:** Pending formal third-party smart contract audits.

---

## Prerequisites

- **Node.js:** `v20.x` or `v22.x` (LTS recommended)
- **Package Manager:** `npm` (v10+)
- **Git**

---

## Local Development Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/zaxcrypto/Arc.fun.git
   cd Arc.fun
   ```

2. **Install dependencies:**
   > Note: Due to React 19 peer dependencies in some Web3 libraries, `.npmrc` is configured with `legacy-peer-deps=true`.
   ```bash
   npm install
   ```

3. **Configure environment variables:**
   ```bash
   cp .env.example .env.local
   ```
   Fill in your local RPC endpoints, Circle API keys, and Supabase credentials.

4. **Compile smart contracts:**
   ```bash
   npm run compile
   ```

5. **Start the local development server:**
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) with your browser.

---

## Environment Variables

Refer to [`.env.example`](file:///.env.example) for the exhaustive list. Essential groups include:

- `NEXT_PUBLIC_ARC_RPC`: RPC URL for Arc Network testnet.
- `NEXT_PUBLIC_ARC_CHAIN_ID`: `5042002`
- `CIRCLE_API_KEY`: Circle developer portal key for DCW and Gateway.
- `CIRCLE_ENTITY_SECRET`: 32-byte hex encryption secret for DCW requests.
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase project connection.
- `SUPABASE_SERVICE_ROLE_KEY`: Privileged backend key for processing webhooks and relayer operations.
- `RELAYER_PRIVATE_KEY`: Backend wallet sponsoring cross-chain transactions (keep strictly secure!).

---

## Testing & Quality Assurance

ArcFun uses a unified testing framework comprising Hardhat, Mocha, Jest, and Node test runner:

```bash
# Run all automated test suites (Hardhat + Backend + Unit)
npm test

# Run smart contract tests only
npm run test:contracts

# Run backend webhook and security invariance tests
npm run test:backend

# Run TypeScript type-checking
npm run typecheck

# Run ESLint across code and tests
npm run lint

# Validate full production build
npm run build
```

---

## Smart Contract Architecture & Upgrades

Contracts are located in [`contracts/`](file:///contracts/):
- **`ArcFunTokenFactory.sol`**: Deploys new bonding curves and creates initial token supplies.
- **`ArcFunCurve.sol`**: Implements the bonding curve trading mechanism and enforces graduation limits.
- **`ArcFunSwap.sol`**: Internal liquidity pool routing trades post-graduation (UUPS upgradeable).
- **`ArcFunToken.sol`**: Standard ERC-20 token implementation with launchpad protections.

### Upgrade Precautions
- **Storage Layout Manifest:** The repository preserves [`.openzeppelin/unknown-5042002.json`](file:///.openzeppelin/unknown-5042002.json). Never delete or modify this file manually; it is required by OpenZeppelin Upgrades to prevent storage collisions during proxy upgrades on Arc Testnet.
- **Deployment Scripts:** Verified deployment and upgrade scripts are located in [`scripts/`](file:///scripts/).

---

## Database Migrations (Supabase)

Database schema updates are managed via standard SQL migrations in [`src/supabase/migrations/`](file:///src/supabase/migrations/):
- Migrations `001` through `029` define schemas for user profiles, token launches, trade logs, and idempotent webhook audit logs (`029_gateway_webhook_events.sql`).
- Apply migrations using the Supabase CLI:
  ```bash
  supabase db push
  ```

---

## Circle Gateway & Webhook Integration

ArcFun uses Circle Gateway to coordinate fast cross-chain USDC settlements.
- **Webhook Endpoint:** [`/api/webhooks/circle-gateway`](file:///src/app/api/webhooks/circle-gateway/route.ts)
- **Signature Verification:** Validates `X-Circle-Signature` using RSA public keys fetched from official Circle certificate endpoints.
- **Replay Protection:** Unique event IDs are atomically recorded in `gateway_webhook_events`.
- **Registration Script:** [`scripts/setup-circle-gateway-webhook.ts`](file:///scripts/setup-circle-gateway-webhook.ts) automates subscription creation with Circle Developer API.

---

## Security Policy & Disclosures

Please review our [SECURITY.md](file:///SECURITY.md) for vulnerability reporting guidelines and response SLAs. If you discover a potential vulnerability, email **`supportarcfun@gmail.com`** immediately.

---

## Contributing

We welcome community contributions. To contribute:
1. Fork the repository and create your feature branch (`git checkout -b feature/amazing-feature`).
2. Verify code quality: `npm run lint && npm run typecheck && npm test`.
3. Commit your changes (`git commit -m 'feat: add amazing feature'`).
4. Push to your branch (`git push origin feature/amazing-feature`).
5. Open a Pull Request against the `main` branch.

---

## License

Licensing terms are subject to maintainer / owner specification. If you are preparing this repository for open-source distribution, adding an explicit license file (such as MIT or Apache 2.0) is recommended.
