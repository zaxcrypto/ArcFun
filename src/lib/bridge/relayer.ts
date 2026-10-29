/**
 * ArcFun Relayer Architecture
 * 
 * Defines the off-chain relayer service responsible for listening to 
 * bridge events, validating rules, and triggering destination releases.
 * 
 * STRICT RULE: Do not implement real execution yet. Design architecture only.
 */

export interface RelayerVerificationRequest {
  sourceChainId: number;
  destinationChainId: number;
  userAddress: string;
  asset: string;
  amount: bigint;
  nonce: string;
  sourceTxHash: string;
}

export interface VerificationResult {
  isApproved: boolean;
  reason?: string;
  signature?: string; // Payload signed by the relayer network to authorize release
}

export interface RelayerService {
  /**
   * 1. Listens for the deposit event on the source chain.
   * 2. Confirms transaction finality.
   */
  verifyBridgeEvent(txHash: string, sourceChainId: number): Promise<boolean>;

  /**
   * Prevents Replay Attacks by ensuring the exact nonce hasn't been processed.
   */
  verifyNonceUniqueness(nonce: string, destinationChainId: number): Promise<boolean>;

  /**
   * Queries the Score System and Whitelist System to ensure the user
   * is authorized to perform this cross-chain transaction.
   */
  verifyUserEligibility(userAddress: string): Promise<boolean>;

  /**
   * Enforces global and user-specific daily transaction limits.
   */
  verifyLimits(userAddress: string, asset: string, amount: bigint): Promise<boolean>;

  /**
   * Confirms the user has been explicitly whitelisted (if score system bypassed).
   */
  verifyWhitelistStatus(userAddress: string): Promise<boolean>;

  /**
   * Submits a secure audit log to the backend system for tracking.
   */
  generateAuditLog(request: RelayerVerificationRequest, result: VerificationResult): Promise<void>;

  /**
   * Master orchestration method:
   * Combines all verifications, and if successful, generates the authorization 
   * payload for the destination contract.
   */
  processBridgeRequest(request: RelayerVerificationRequest): Promise<VerificationResult>;
}
