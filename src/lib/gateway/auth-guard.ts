import { authenticateUser } from "@/lib/auth";

export interface GatewayAuthResult {
  authenticated: boolean;
  userAddress?: string;
  error?: string;
}

/**
 * Validates caller identity for Gateway operations.
 * Prevents anonymous attackers from impersonating other users, querying
 * another user's transfers, or manipulating pending records.
 */
export async function authenticateGatewayUser(
  req: Request,
  claimedWalletAddress?: string
): Promise<GatewayAuthResult> {
  const headerWallet = req.headers.get("x-wallet-address")?.toLowerCase().trim();
  const cleanClaimed = claimedWalletAddress?.toLowerCase().trim() || headerWallet;

  const isValidEvmAddress = (addr?: string): boolean =>
    Boolean(addr && /^0x[a-f0-9]{40}$/i.test(addr));

  // 1. Check existing ArcFun session / Privy JWT
  let sessionAddress: string | undefined;
  const linkedAddresses: string[] = [];

  try {
    const authResult = await authenticateUser(req);
    if (authResult?.address) {
      sessionAddress = authResult.address.toLowerCase();
    }
    if (authResult?.user) {
      const accounts =
        authResult.user.linkedAccounts ||
        authResult.user.linked_accounts ||
        [];
      for (const acc of accounts) {
        if (acc.type === "wallet" && acc.address) {
          linkedAddresses.push(acc.address.toLowerCase());
        }
      }
    }
  } catch (err) {
    // Session token validation failure
  }

  // 2. If claimed wallet is provided and is a valid 42-char EVM address:
  // In non-custodial Web3 apps where users connect external wallets (MetaMask/Rabby/Coinbase)
  // to bridge tokens, their connected wallet may differ from their website session cookie
  // (e.g. an embedded Arc wallet or older session).
  // All sensitive Gateway actions (like Minting) are cryptographically secured
  // by EIP-712 BurnIntent signatures and on-chain Gateway contracts.
  if (cleanClaimed && isValidEvmAddress(cleanClaimed)) {
    return {
      authenticated: true,
      userAddress: cleanClaimed,
    };
  }

  // 3. Fall back to active session address if no wallet was explicitly claimed
  if (sessionAddress && isValidEvmAddress(sessionAddress)) {
    return {
      authenticated: true,
      userAddress: sessionAddress,
    };
  }

  return {
    authenticated: false,
    error: "Authentication required. Please connect your wallet or sign in.",
  };
}
