/**
 * Eligibility Engine
 * 
 * The absolute source of truth for user access. 
 * Prevents fragmented logic inside UI components.
 */

import { FeatureFlagService } from "./feature-flags";

export interface UserEligibilityProfile {
  arcScore: number;
  walletAgeDays: number;
  activeDays: number;
  isWhitelisted: boolean;
}

export interface EligibilityResult {
  isEligible: boolean;
  reason?: string;
  requiresRequest: boolean;
}

export class EligibilityEngine {
  // Configurable thresholds (would be pulled from DB/Admin settings)
  private static readonly MIN_ARC_SCORE = 100;
  private static readonly MIN_WALLET_AGE_DAYS = 14;
  private static readonly MIN_ACTIVE_DAYS = 7;

  /**
   * Master check for user ability to execute a Swap or Bridge transaction.
   */
  static checkAccess(profile: UserEligibilityProfile): EligibilityResult {
    // 1. Feature Flag Overrides
    if (!FeatureFlagService.isEnabled("enableScoreRestriction")) {
      return { isEligible: true, requiresRequest: false };
    }

    // 2. Whitelist Bypass
    if (FeatureFlagService.isEnabled("enableWhitelistBypass") && profile.isWhitelisted) {
      return { isEligible: true, requiresRequest: false };
    }

    // 3. Score & Time Requirements
    if (profile.arcScore < this.MIN_ARC_SCORE) {
      return { isEligible: false, reason: "Arc Score too low", requiresRequest: true };
    }
    if (profile.walletAgeDays < this.MIN_WALLET_AGE_DAYS) {
      return { isEligible: false, reason: "Wallet age requirement not met", requiresRequest: true };
    }
    if (profile.activeDays < this.MIN_ACTIVE_DAYS) {
      return { isEligible: false, reason: "Active days requirement not met", requiresRequest: true };
    }

    return { isEligible: true, requiresRequest: false };
  }
}
