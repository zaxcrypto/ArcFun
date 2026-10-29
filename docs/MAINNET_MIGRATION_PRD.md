# ArcFun Mainnet Migration & Production Rollout — Product Requirements Document (PRD) & Technical Specification

- **Project:** ArcFun (`arc-token-launcher`)
- **Document Version:** 2.0.0 (Authoritative Mainnet Audit Revision)
- **Document Type:** Production Readiness PRD & Technical Runbook
- **Target Chains:** Arc Network (Mainnet, Chain ID: `5042`) & Base (Mainnet, Chain ID: `8453`)
- **Testnet Reference Chains:** Arc Testnet (`5042002`, Domain `26`) & Base Sepolia (`84532`, Domain `6`)
- **Primary Integrations:** Circle Gateway V1, Circle CCTP V2, Circle Developer-Controlled Wallets (DCW), Supabase PostgreSQL, OpenZeppelin UUPS
- **Official Contact / Support:** `supportarcfun@gmail.com`
- **Canonical Web Domain:** `https://www.thearcfun.xyz`

---

## 1. Executive Summary & Objectives

ArcFun is transitioning from staging testnets (Arc Testnet `5042002` and Base Sepolia `84532`) to live production mainnet. The platform unifies:
1. **Bonding Curve Token Launchpad:** Permissionless launches with mathematical bonding curves, dynamic pricing, and automated liquidity graduation.
2. **Circle Gateway V1 (Unified Balance):** Sub-second cross-chain USDC settlement using pre-funded unified liquidity pools and cryptographic mint attestations.
3. **Circle CCTP V2 (Native Cross-Chain Mint/Burn):** Point-to-point native USDC teleportation across EVM, Solana, Sui, and Stellar with zero slippage.
4. **Developer-Controlled Wallets (DCW) & Passkey Auth:** Biometric WebAuthn passkey authentication backed by secure server-side wallet orchestration.
5. **Resilient Transaction Recovery:** Multi-tiered indexing with permissionless self-mint fallback (zero risk of trapped user funds).

### Production Invariants & Guardrails
- **Zero Trapped Capital:** Every sponsored execution path must have a 100% operational permissionless manual fallback.
- **Strict Cryptographic Attestation Verification:** Reject mismatched recipient, depositor, fee treasury, or untrusted destination minter contracts prior to relayer broadcast.
- **Relayer Safety:** Nonce serialization, distributed database locks, dynamic EIP-1559 priority fee clamping, and server-authoritative kill-switches.
- **Storage Layout Integrity:** OpenZeppelin UUPS proxy storage layout must strictly preserve slot alignment.

---

## 2. Mainnet Network & Contract Topology

### 2.1 Authoritative Network Matrix

| Parameter | Arc Mainnet (Primary Launchpad) | Base Mainnet (Primary Liquidity Hub) | Arc Testnet (Staging Reference) |
| :--- | :--- | :--- | :--- |
| **Chain ID (Dec / Hex)** | `5042` (`0x13b2`) | `8453` (`0x2105`) | `5042002` (`0x4cef52`) |
| **Consensus / Architecture**| Malachite BFT (Circle EVM L1) | OP Stack Rollup (Ethereum L2)| Malachite BFT (Circle EVM L1) |
| **Native Gas Asset** | `USDC` (Native Gas) | `ETH` (18 decimals) | `USDC` (Native Gas) |
| **Gas Semantics** | EVM RPC reports 18 decimals; ERC-20 uses 6 decimals | Standard EVM 18-decimal wei | EVM RPC reports 18 decimals; ERC-20 uses 6 decimals |
| **Primary RPC Endpoint** | `https://rpc.mainnet.arc.io` | `https://mainnet.base.org` | `https://rpc.testnet.arc.network` |
| **Fallback RPC Endpoint** | `https://arc-rpc.publicnode.com` | `https://base-rpc.publicnode.com` | `https://5042002.rpc.thirdweb.com` |
| **Official Block Explorer** | `https://explorer.arc.io` / `https://arcscan.app` | `https://basescan.org` | `https://testnet.arcscan.app` |
| **Circle Domain ID** | Domain `26` | Domain `6` | Domain `26` |
| **Native USDC ERC-20** | `0x3600000000000000000000000000000000000000` | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` | `0x3600000000000000000000000000000000000000` |

### 2.2 Circle Integration Architecture: Gateway vs. CCTP

ArcFun incorporates two distinct Circle cross-chain protocols. They must not be conflated:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              CIRCLE PROTOCOL ARCHITECTURE                              │
├──────────────────────────────────────────┬─────────────────────────────────────────────┤
│ 1. CIRCLE GATEWAY (Unified Liquidity)    │ 2. CIRCLE CCTP V2 (Native Teleport)         │
├──────────────────────────────────────────┼─────────────────────────────────────────────┤
│ • Protocol: Unified Balance Pool         │ • Protocol: Native Burn-and-Mint            │
│ • Speed: Sub-second (<500ms)             │ • Speed: Finality-dependent (~1-15 min)     │
│ • Attestation: Gateway API               │ • Attestation: Iris Attestation API         │
│ • API: https://gateway-api.circle.com    │ • API: https://iris-api.circle.com          │
│ • Core Contract: GatewayWallet           │ • Core Contract: TokenMessenger             │
│ • Mint Contract: GatewayMinter           │ • Transmitter: MessageTransmitter           │
│ • EVM GatewayWallet:                     │ • EVM TokenMessenger V2:                    │
│   0x77777777Dcc4d5A8B6E418Fd04D8997ef11000eE│   0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d │
│ • EVM GatewayMinter:                     │ • EVM MessageTransmitter V2:                │
│   0x2222222d7164433c4C09B0b0D809a9b52C04C205│   0x81D40F21F12A8F0E3252Bccb954D722d4c464B64 │
└──────────────────────────────────────────┴─────────────────────────────────────────────┘
```

---

## 3. Production Environment Configuration (`.env.production`)

The table below reconciles every proposed production variable with actual codebase references:

| Environment Variable | Target / Usage in Codebase | Security Level | Requirement |
| :--- | :--- | :--- | :--- |
| `NODE_ENV` | `production` | Public | Mandatory |
| `NEXT_PUBLIC_APP_URL` | Canonical origin (`https://www.thearcfun.xyz`) | Public | Mandatory |
| `NEXT_PUBLIC_ARC_MAINNET_RPC_URL` | Arc Mainnet RPC (`https://rpc.mainnet.arc.io`) | Public | Mandatory |
| `NEXT_PUBLIC_BASE_MAINNET_RPC_URL` | Base Mainnet RPC (`https://mainnet.base.org`) | Public | Mandatory |
| `CIRCLE_API_KEY` | Circle Developer API key (Live Production) | **CRITICAL SECRET** | Mandatory |
| `CIRCLE_ENTITY_SECRET` | 32-byte hex for DCW developer ciphertext | **CRITICAL SECRET** | Mandatory |
| `CIRCLE_WALLET_SET_ID` | Production DCW Wallet Set ID | Protected | Mandatory |
| `CIRCLE_ENV` | Set to `production` (omits sandbox fallback) | Public | Mandatory |
| `CIRCLE_IRIS_MAINNET_API_URL` | Circle CCTP Iris API (`https://iris-api.circle.com`)| Public | Mandatory |
| `GATEWAY_RELAYER_PRIVATE_KEY` | Private key for Arc/Base gas-sponsoring relayer | **CRITICAL SECRET** | Mandatory |
| `GATEWAY_SPONSORED_MINT_ENABLED` | Global kill-switch (`true` / `false`) | Protected | Mandatory (Default: `true`) |
| `GATEWAY_DISABLED_DOMAINS` | Domain-specific halt list (e.g. `""` or `"6,3"`) | Protected | Optional |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Public | Mandatory |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase client anon key | Public | Mandatory |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase backend admin key | **CRITICAL SECRET** | Mandatory |
| `NEXT_PUBLIC_RP_ID` | WebAuthn Relying Party ID (`thearcfun.xyz`) | Public | Mandatory |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Cloudflare Turnstile Site Key | Public | Mandatory |
| `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile Secret Key | **CRITICAL SECRET** | Mandatory |

> [!CAUTION]
> **Obsolete Variables Removed:**
> 1. `CIRCLE_WEBHOOK_SECRET`: Removed. Circle webhooks do NOT use a symmetric shared secret. Circle signs notifications with `ECDSA_SHA_256`, verified dynamically via public keys fetched from `GET /v2/notifications/publicKey/{keyId}`.
> 2. `RELAYER_PRIVATE_KEY`: Replaced with `GATEWAY_RELAYER_PRIVATE_KEY` (with server fallbacks to `EVM_PRIVATE_KEY` and `DEPLOYER_PRIVATE_KEY`).
> 3. `NEXT_PUBLIC_GATEWAY_WALLET_ADDRESS`: Removed from `.env`. Uniform deterministic addresses (`0x77777777Dcc4d5A8B6E418Fd04D8997ef11000eE`) are hardcoded in `src/config/gateway-config.ts`.
> 4. `NEXT_PUBLIC_ARC_CHAIN_ID`: Removed. Chain IDs are strictly typed constants (`5042` for mainnet, `5042002` for testnet) to prevent environment tampering.

---

## 4. Smart Contract Topology & UUPS Storage Layout

### 4.1 Deployment Topology
1. **`ArcFunTokenFactory.sol`**:
   - Compiles with Solidity `0.8.28`.
   - Initialized with protocol admin and fee treasury (`0xC1753399Fb68Cce753d5b51Bb22e4d79de13Fd2e`).
   - Deploys individual `ArcFunCurve` trading contracts on demand.
2. **`ArcFunSwap.sol` (UUPS Proxy)**:
   - Deployed using `@openzeppelin/hardhat-upgrades`.
   - Tracks pool reserves and manages Uniswap-style swap liquidity post-graduation.

### 4.2 Storage Layout Verification (`ArcFunSwap.sol`)
The OpenZeppelin storage manifest (`.openzeppelin/unknown-5042002.json`) tracks the following exact slot layout:
- **Slot 0:** `scoreRequirementEnabled` (bool, offset 0), `usdcAddress` (address, offset 1)
- **Slot 1:** `eurcAddress` (address, offset 0)
- **Slot 2:** `dailySwapCount` (mapping(address => mapping(uint256 => uint256)))
- **Slot 3:** `isWhitelisted` (mapping(address => bool))
- **Slot 4:** `vaultAddress` (address, offset 0) — *Consumes 1 slot previously reserved by gap*
- **Slots 5 to 53:** `uint256[49] private __gap;` — *Preserves total 50 reserved slots*

> [!IMPORTANT]
> Any future variable additions to `ArcFunSwap.sol` must be appended immediately before `__gap`, and the `__gap` array size must be decremented accordingly to avoid storage collision across proxy upgrades.

### 4.3 Governance & Access Control
Prior to opening mainnet to public traffic, admin roles must be transitioned:
- `DEFAULT_ADMIN_ROLE`: Transfer from deployer EOA to multi-sig or timelock contract.
- `UPGRADER_ROLE`: Restricted to multi-sig governance.
- `PAUSER_ROLE`: Granted to automated security monitoring bot and multi-sig.
- `WHITELIST_MANAGER_ROLE`: Assigned to backend operator service.

---

## 5. Circle Ecosystem Integration Runbook

### 5.1 Circle Developer-Controlled Wallets (DCW)
In `src/lib/circle/wallet-service.ts`:
- Blockchain codes for live production:
  - Base: `BASE` (not `BASE-SEPOLIA`)
  - Ethereum: `ETH` (not `ETH-SEPOLIA`)
  - Solana: `SOL` (not `SOL-DEVNET`)
  - Arbitrum: `ARB` (not `ARB-SEPOLIA`)
- Production Gas Reserves:
  - Base: Maintain relayer balance >= `0.05 ETH`.
  - Arc: Maintain relayer native USDC balance >= `25.00 USDC`.

### 5.2 Circle Gateway & Webhook Signature Verification
- **Webhook Endpoint:** `/api/webhooks/circle-gateway`
- **Supported HTTP Methods:**
  - `HEAD`: Must immediately return HTTP 200 OK (required by Circle for endpoint validation).
  - `POST`: Processes incoming webhook notifications.
- **Cryptographic Signature Verification Protocol:**
  1. Extract `X-Circle-Signature` and `X-Circle-Key-Id` headers.
  2. Read raw unparsed body via `req.text()` (max payload size: 1MB).
  3. Fetch verification public key from authoritative Circle API:
     `GET https://api.circle.com/v2/notifications/publicKey/{keyId}`
     Header: `Authorization: Bearer <CIRCLE_API_KEY>`
  4. Verify signature using `crypto.verify("sha256", rawBodyBuffer, publicKey, signatureBuffer)` (`ECDSA_SHA_256`).
  5. Cache public keys in-memory to prevent outbound HTTP requests on every delivery.
- **Idempotency & Deduplication:**
  - Database Table: `gateway_webhook_events` (`029_gateway_webhook_events.sql`).
  - Unique Constraint: `uq_gateway_webhook_notification_id` on column `notification_id`.
  - Behavior: If `notification_id` already exists, return HTTP 200 immediately to avoid redundant processing or retry storms.

---

## 6. End-to-End Minting Lifecycle & Relayer Safety

### 6.1 Lifecycle Comparison

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              MINTING LIFECYCLE AUDIT                                   │
├──────────────────────────────────────────┬─────────────────────────────────────────────┤
│ SPONSORED MINT (Automated Relayer)       │ MANUAL CLAIM (Self-Mint Fallback)           │
├──────────────────────────────────────────┼─────────────────────────────────────────────┤
│ 1. User deposits USDC on source chain    │ 1. User deposits USDC on source chain       │
│ 2. Circle Gateway generates attestation  │ 2. Circle Gateway generates attestation     │
│ 3. Client calls /api/gateway/mint        │ 3. Client calls GatewayMinter.gatewayMint() │
│ 4. Server authenticates user session     │    directly from connected user wallet      │
│ 5. Validates attestation signatures &    │ 4. User pays their own destination gas      │
│    destination GatewayMinter address     │ 5. No relayer dependency                    │
│ 6. Verifies 1% fee intent to treasury    │ 6. 100% permissionless on-chain claim       │
│ 7. Acquires distributed DB lock & nonce  │ 7. Functions even if backend relayer is     │
│ 8. Broadcasts via GATEWAY_RELAYER_KEY    │    completely offline or out of funds       │
│ 9. Awaits on-chain receipt (status: 1)   │                                             │
└──────────────────────────────────────────┴─────────────────────────────────────────────┘
```

### 6.2 Relayer Concurrency & Gas Guardrails
1. **Nonce Serialization:** `src/lib/gateway/relayer-manager.ts` queues transactions per domain in memory and acquires a distributed lock in `gateway_relayer_locks` with a 45-second TTL.
2. **Dynamic Fee Clamping:** EIP-1559 priority fee is bounded: `maxPriorityFeePerGas <= maxFeePerGas`. Arbitrum (Domain 3) omits priority fees due to FIFO sequencer mechanics.
3. **Emergency Circuit Breaker:**
   - Setting `GATEWAY_SPONSORED_MINT_ENABLED=false` or invoking `setEmergencyKillSwitch(true)` instantly halts all sponsored minting and returns HTTP 503 with `fallbackToManualClaim: true`.
   - Domain-specific pauses can be enacted via `GATEWAY_DISABLED_DOMAINS` (e.g. `GATEWAY_DISABLED_DOMAINS="6"` to pause Base only).

---

## 7. Database Migration & Rollback Strategy

The repository contains 31 sequential SQL migrations (`001_dapps_hub.sql` to `029_gateway_webhook_events.sql`).

### 7.1 Pre-Migration Safety Checks
1. Export complete database snapshot before running any schema changes:
   ```bash
   supabase db dump --data-only > backup_pre_mainnet_data.sql
   supabase db dump --schema-only > backup_pre_mainnet_schema.sql
   ```
2. Run dry-run validation against a fresh local staging branch:
   ```bash
   supabase db reset --linked=false
   ```

### 7.2 Migration Execution & Verification Plan
- Table `gateway_webhook_events` must be created with `notification_id` as unique key.
- Table `gateway_relayer_locks` must restrict all public access via RLS (`Deny public locks access`).
- Table `gateway_pending_transfers` must have unique index on `source_tx_hash`.

### 7.3 Rollback Plan
If an unexpected schema incompatibility occurs during rollout:
```sql
-- Rollback Migration 029:
DROP TABLE IF EXISTS public.gateway_webhook_events CASCADE;

-- Rollback Migration 025:
DROP TABLE IF EXISTS public.gateway_relayer_locks CASCADE;
DROP INDEX IF EXISTS idx_gateway_pending_source_tx_hash;
```

---

## 8. Gated Mainnet Rollout Plan (Replacing Naive $1 Launch)

Deploying to production requires a staged, gated approach. No contracts may be deployed or funds transferred without explicit gate approvals.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              STAGED MAINNET ROLLOUT GATES                              │
├─────────┬───────────────────────────────┬──────────────────────────────────────────────┤
│ Gate 0  │ Testnet Staging Verification  │ Arc Testnet (5042002) + Base Sepolia (84532) │
│ Gate 1  │ Smart Contract & Proxy Audit  │ Bytecode compile & OZ storage layout check   │
│ Gate 2  │ Read-Only Infra & API Health  │ RPC pings, Circle API, Webhook HEAD check    │
│ Gate 3  │ Whitelisted Canary Smoke Test │ Operator-only $1 deposit & self-mint claim   │
│ Gate 4  │ Public Launch & Sponsoring On │ Unpause contracts, activate relayer with cap │
└─────────┴───────────────────────────────┴──────────────────────────────────────────────┘
```

### Gate 0: Testnet Staging Verification
- [ ] Run full test suite: `npm test` (all unit and integration tests passing).
- [ ] Validate simulated cross-chain transfer on Arc Testnet (`5042002`) and Base Sepolia (`84532`).
- [ ] Verify testnet webhook delivery and signature validation with mock Circle notifications.
- [ ] Confirm emergency kill-switch test returns HTTP 503 with manual claim fallback.

### Gate 1: Smart Contract & Proxy Audit
- [ ] Compile contracts with clean output (`npm run compile`).
- [ ] Verify OpenZeppelin storage manifest compatibility for `ArcFunSwap.sol`.
- [ ] Deploy contracts to Arc Mainnet (`5042`) in paused state.
- [ ] Transfer `DEFAULT_ADMIN_ROLE` and `UPGRADER_ROLE` to multi-sig governance.

### Gate 2: Read-Only Infrastructure & API Health Checks
- [ ] Ping Arc Mainnet RPC (`https://rpc.mainnet.arc.io`) and Base RPC (`https://mainnet.base.org`).
- [ ] Verify Circle Live Production API credentials (`GET https://api.circle.com/v1/w3s/user/status`).
- [ ] Validate Circle Gateway Webhook registration (`HEAD /api/webhooks/circle-gateway` returns HTTP 200).
- [ ] Verify backend relayer address is funded and recognized by `relayer-status` endpoint.

### Gate 3: Controlled Canary Smoke Test (Whitelisted Operator Only)
- [ ] Execute 1 controlled bridge transaction of $1.00 USDC from Base Mainnet to Arc Mainnet using an operator wallet.
- [ ] Validate that `/api/webhooks/circle-gateway` indexes the deposit within 30 seconds.
- [ ] Verify `executeGatewayMintWithRelayer` claims the minted funds on Arc Mainnet.
- [ ] Verify the 1% fee ($0.01 USDC) is routed to `ARCFUN_FEE_TREASURY_WALLET`.
- [ ] Test Manual Claim fallback path with a second small deposit to guarantee zero reliance on backend relayer.

### Gate 4: Public Launch & Monitoring Activation
- [ ] Unpause `ArcFunSwap` and `ArcFunTokenFactory`.
- [ ] Enable `GATEWAY_SPONSORED_MINT_ENABLED=true`.
- [ ] Monitor relayer balances: alert if Base Relayer < 0.05 ETH or Arc Relayer < 20 USDC.
- [ ] Support email active: `supportarcfun@gmail.com`.

---

## 9. Emergency Response & Incident Runbook

If an anomaly occurs on mainnet:
1. **Phase 1 — Immediate Circuit Breaker:**
   Set `GATEWAY_SPONSORED_MINT_ENABLED=false` in Vercel / environment. This halts automated gas expenditure within seconds.
2. **Phase 2 — Contract Pause:**
   If smart contract vulnerability is suspected, call `pause()` on `ArcFunSwap.sol` via `PAUSER_ROLE`.
3. **Phase 3 — Permissionless User Asset Recovery:**
   Direct affected users to `/recover` or provide instructions to call `GatewayMinter.gatewayMint()` directly. User capital in Circle Gateway can never be frozen by ArcFun backend outages.
4. **Phase 4 — Incident Postmortem:**
   Compile logs from `gateway_webhook_events` and Supabase audit trails. Send postmortem to `supportarcfun@gmail.com` and community channels.
