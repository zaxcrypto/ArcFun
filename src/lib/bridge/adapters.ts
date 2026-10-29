/**
 * Contract Interface Layer
 * 
 * Defines the strict typescript adapters for interacting with the 
 * underlying ArcFun smart contracts. No execution logic, only architecture.
 */

export interface SwapParams {
  tokenIn: string;
  tokenOut: string;
  amountIn: bigint;
  minAmountOut: bigint;
  deadline: number;
}

export interface SwapContractAdapter {
  /**
   * Retrieves the current on-chain exchange rate.
   */
  getQuote(tokenIn: string, tokenOut: string, amountIn: bigint): Promise<bigint>;
  
  /**
   * Validates if the user has approved EXACTLY the amount required.
   * ArcFun strictly prohibits unlimited approvals.
   */
  checkExactApproval(token: string, owner: string, requiredAmount: bigint): Promise<boolean>;
  
  /**
   * Simulates the swap transaction locally without broadcasting.
   */
  simulateSwap(params: SwapParams, userAddress: string): Promise<boolean>;
  
  /**
   * Checks if the contract is paused by admins.
   */
  isPaused(): Promise<boolean>;
  
  /**
   * Verifies if the user is explicitly whitelisted (if whitelist mode active).
   */
  isWhitelisted(userAddress: string): Promise<boolean>;
}

export interface BridgeParams {
  destinationChainId: number;
  asset: string;
  amount: bigint;
  recipient: string;
  nonce: string;
}

export interface BridgeContractAdapter {
  /**
   * Simulates a cross-chain deposit on the source chain.
   */
  simulateDeposit(params: BridgeParams, userAddress: string): Promise<boolean>;
  
  /**
   * Verifies that the nonce has not been used before (Replay protection).
   */
  isNonceUsed(nonce: string): Promise<boolean>;
  
  /**
   * Checks the daily transfer limit for the specific user address.
   */
  getRemainingDailyLimit(userAddress: string, asset: string): Promise<bigint>;
  
  /**
   * Validates if a specific route (Source -> Destination) is currently active.
   */
  isRouteActive(destinationChainId: number, asset: string): Promise<boolean>;
}

export interface VaultParams {
  asset: string;
  chainId: number;
}

export interface LiquidityVaultAdapter {
  /**
   * Fetches the total available liquidity for a specific asset on a specific chain.
   */
  getAvailableLiquidity(params: VaultParams): Promise<bigint>;
  
  /**
   * Verifies if the requested bridge amount is serviceable by the destination vault.
   */
  canFulfill(params: VaultParams, requestedAmount: bigint): Promise<boolean>;
  
  /**
   * Checks if the specific liquidity vault is paused.
   */
  isVaultPaused(params: VaultParams): Promise<boolean>;
}
