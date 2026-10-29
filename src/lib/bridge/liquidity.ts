/**
 * ArcFun Liquidity Architecture
 * 
 * Defines the models and managers for chain-specific liquidity vaults.
 * No real vault contracts or liquidity movement. Architecture only.
 */

export type ChainName = 
  | "Arc Testnet"
  | "Ethereum Sepolia" 
  | "Arbitrum Sepolia" 
  | "Base Sepolia" 
  | "HyperEVM Testnet" 
  | "Injective Testnet" 
  | "Ink Testnet" 
  | "Linea Sepolia" 
  | "Monad Testnet" 
  | "Sonic Testnet" 
  | "Solana Devnet" 
  | "Unichain Sepolia"
  | "Optimism Sepolia";

export type VaultStatus = "active" | "paused" | "depleted" | "maintenance";

export interface LiquidityVaultModel {
  /** Unique identifier for the vault */
  vaultId: string;
  
  /** The chain this vault resides on */
  chain: ChainName;
  
  /** The asset stored in this vault (e.g., 'USDC') */
  asset: string;
  
  /** Total balance currently held in the vault */
  balance: bigint;
  
  /** Minimum balance required before triggering low-liquidity alerts */
  alertThreshold: bigint;
  
  /** Current operational status of the vault */
  status: VaultStatus;
  
  /** Timestamp of the last balance sync */
  updatedAt: number;
}

export interface LiquidityManagerService {
  /**
   * Retrieves the comprehensive status of all vaults across all chains.
   */
  getAllVaults(): Promise<LiquidityVaultModel[]>;

  /**
   * Retrieves the specific vault model for a given chain and asset.
   */
  getVault(chain: ChainName, asset: string): Promise<LiquidityVaultModel | null>;

  /**
   * (Admin) Requests a pause on all deposits/withdrawals for a specific vault.
   */
  pauseVault(vaultId: string, adminSignature: string): Promise<boolean>;

  /**
   * (Admin) Resumes operations for a paused vault.
   */
  resumeVault(vaultId: string, adminSignature: string): Promise<boolean>;

  /**
   * Emits an alert if a vault's balance drops below its alertThreshold.
   */
  checkLiquidityHealth(vaultId: string): Promise<boolean>;
}
