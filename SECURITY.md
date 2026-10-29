# Security Policy

The ArcFun team and maintainers take the security of our smart contracts, API endpoints, Circle Developer-Controlled Wallets, and cross-chain gateway integrations seriously.

## Reporting a Vulnerability

If you discover a security vulnerability within ArcFun, please report it via responsible disclosure. **Do not create public GitHub issues or discussions for security vulnerabilities.**

### Contact
Please send all vulnerability reports to:
- **Email:** `supportarcfun@gmail.com`
- **Security Contact TXT:** `/.well-known/security.txt`

### What to Include in Your Report
To help us triage and resolve the issue quickly, please provide:
1. A clear description of the issue, severity, and potential impact.
2. Step-by-step reproduction instructions or a minimal Proof of Concept (PoC).
3. The specific affected components (e.g., smart contract function, API endpoint, wallet signing flow).
4. Any proposed remediations if available.

### Disclosure Policy & Response Timeline
- **Initial Response:** We will acknowledge receipt of your report within 48 hours.
- **Triage & Status:** We will confirm the vulnerability and provide an estimated timeline for remediation.
- **Resolution:** A fix will be developed, tested, and deployed to production before public disclosure.
- **Credit:** We will gladly credit researchers who follow responsible disclosure practices once the vulnerability has been mitigated.

## Scope

### In Scope
- Smart contracts deployed on Arc Network, Ethereum Sepolia, Base Sepolia, Arbitrum Sepolia, and Unichain Sepolia (`ArcFunTokenFactory`, `ArcFunCurve`, `ArcFunSwap`, `ArcFunToken`).
- Circle Gateway Webhook verification and signature replay defenses (`/api/webhooks/circle-gateway`).
- Circle Developer-Controlled Wallet (DCW) integration and recovery services.
- Server-side API routes handling authentication, mint sponsorship, and session management.

### Out of Scope
- Public testnet faucets or rate-limiting abuse of third-party public RPC nodes.
- Denial-of-Service attacks targeting testnet RPC endpoints outside ArcFun's control.
- Attacks requiring physical device access or compromised client-side browser extensions.
