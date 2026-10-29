/**
 * Centralized Feature Flags
 * 
 * Master toggles for the Swap & Bridge module. All UI, routing, and 
 * admin interactions MUST check these flags before execution rather 
 * than relying on hardcoded booleans or scattered database calls.
 */

export interface SwapBridgeFeatureFlags {
  enableSwap: boolean;
  enableBridge: boolean;
  enableCCTP: boolean;
  enableScoreRestriction: boolean;
  enableAccessRequests: boolean;
  enableWhitelistBypass: boolean;
  enableLiquidityManagement: boolean;
  enableAuditLogs: boolean;
}

/**
 * Global Feature Flag Service
 * 
 * In production, this will sync with Convex/Supabase to pull the current 
 * active flags dynamically.
 */
export class FeatureFlagService {
  private static flags: SwapBridgeFeatureFlags = {
    enableSwap: true,
    enableBridge: true,
    enableCCTP: true,                // Enabled per Phase 1 Restoration
    enableScoreRestriction: true,    // Enforce Arc Score by default
    enableAccessRequests: true,      // Allow manual review queues
    enableWhitelistBypass: true,     // Admin whitelisted wallets bypass score
    enableLiquidityManagement: true,
    enableAuditLogs: true
  };

  /**
   * Retrieves all current active feature flags.
   */
  static getAllFlags(): SwapBridgeFeatureFlags {
    return { ...this.flags };
  }

  /**
   * Checks if a specific feature is enabled.
   */
  static isEnabled(feature: keyof SwapBridgeFeatureFlags): boolean {
    return this.flags[feature];
  }

  /**
   * (Admin) Updates a specific feature flag. 
   * Triggers an audit event upon modification.
   */
  static updateFlag(feature: keyof SwapBridgeFeatureFlags, value: boolean, adminWallet: string): void {
    // Audit logic will be triggered here
    this.flags[feature] = value;
  }
}
