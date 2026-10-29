/**
 * Rate Limit Engine
 * 
 * Centralized logic for evaluating transaction volumes against
 * system-wide and user-specific admin constraints.
 */

export interface RateLimitContext {
  walletAddress: string;
  asset: string;
  amount: number;
}

export interface RateLimitResult {
  isAllowed: boolean;
  reason?: string;
  remainingAmount?: number;
  remainingCount?: number;
}

import { MAX_SWAP_AMOUNT as CONTRACT_MAX_SWAP_AMOUNT, MAX_SWAPS_PER_DAY as CONTRACT_MAX_SWAPS_PER_DAY } from "@/config/swap-contract";
import { formatUnits } from "viem";

export class RateLimitEngine {
  // Pull limits from the single source of truth (the contract configuration)
  private static get MAX_SWAPS_PER_DAY() { return CONTRACT_MAX_SWAPS_PER_DAY; }
  private static get MAX_BRIDGES_PER_DAY() { return CONTRACT_MAX_SWAPS_PER_DAY; }
  private static get MAX_SWAP_AMOUNT() { return Number(formatUnits(CONTRACT_MAX_SWAP_AMOUNT, 6)); }
  private static get MAX_BRIDGE_AMOUNT() { return Number(formatUnits(CONTRACT_MAX_SWAP_AMOUNT, 6)); }

  /**
   * Checks if a Swap request violates any daily volume or count limits.
   */
  static async checkSwapLimits(context: RateLimitContext): Promise<RateLimitResult> {
    if (context.amount > this.MAX_SWAP_AMOUNT) {
      return { 
        isAllowed: false, 
        reason: `Amount exceeds maximum per-swap limit of ${this.MAX_SWAP_AMOUNT} ${context.asset}`
      };
    }

    // Mock query: In reality, checks DB/Contract for today's volume
    const currentCountToday = 0; 

    if (currentCountToday >= this.MAX_SWAPS_PER_DAY) {
      return {
        isAllowed: false,
        reason: `Maximum daily swap limit reached (${this.MAX_SWAPS_PER_DAY})`,
        remainingCount: 0
      };
    }

    return { 
      isAllowed: true, 
      remainingCount: this.MAX_SWAPS_PER_DAY - currentCountToday - 1 
    };
  }

  /**
   * Checks if a Bridge request violates any daily volume or count limits.
   */
  static async checkBridgeLimits(context: RateLimitContext): Promise<RateLimitResult> {
    if (context.amount > this.MAX_BRIDGE_AMOUNT) {
      return { 
        isAllowed: false, 
        reason: `Amount exceeds maximum per-bridge limit of ${this.MAX_BRIDGE_AMOUNT} ${context.asset}`
      };
    }

    const currentCountToday = 0; 

    if (currentCountToday >= this.MAX_BRIDGES_PER_DAY) {
      return {
        isAllowed: false,
        reason: `Maximum daily bridge limit reached (${this.MAX_BRIDGES_PER_DAY})`,
        remainingCount: 0
      };
    }

    return { 
      isAllowed: true, 
      remainingCount: this.MAX_BRIDGES_PER_DAY - currentCountToday - 1 
    };
  }
}
