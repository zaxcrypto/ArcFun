/**
 * Liquidity Health Engine
 * 
 * Evaluates per-chain, per-asset vault health states and enforces
 * automatic bridge blocking at CRITICAL and PAUSED thresholds.
 * This is a service-layer guard — no contract interaction required.
 */

import { AuditService } from "./audit-service";
import { SecurityEventEngine } from "./security-events";

export type LiquidityHealthState = "HEALTHY" | "WARNING" | "CRITICAL" | "PAUSED";

export interface VaultSnapshot {
  chain: string;
  asset: string;
  totalDeposited: number;
  available: number;
  reserved: number;
  released: number;
  failedPendingRecovery: number;
  alertThreshold: number;
  updatedAt: number;
}

export interface HealthEvaluation {
  chain: string;
  asset: string;
  state: LiquidityHealthState;
  availablePct: number;
  available: number;
  reserved: number;
  isBridgeBlocked: boolean;
  reason?: string;
}

export class LiquidityHealthEngine {
  /**
   * Evaluates vault health using the defined threshold rules.
   *
   * Rule table:
   *   available > 50% of totalDeposited  → HEALTHY
   *   available 20%-50%                  → WARNING
   *   available < 20%                    → CRITICAL  (bridge BLOCKED)
   *   available === 0                    → PAUSED    (bridge BLOCKED)
   */
  static evaluate(vault: VaultSnapshot): HealthEvaluation {
    const total = vault.totalDeposited;
    const pct = total > 0 ? (vault.available / total) * 100 : 0;

    let state: LiquidityHealthState;
    let isBridgeBlocked = false;
    let reason: string | undefined;

    if (vault.available === 0) {
      state = "PAUSED";
      isBridgeBlocked = true;
      reason = "Vault has zero available liquidity";
    } else if (pct < 20) {
      state = "CRITICAL";
      isBridgeBlocked = true;
      reason = `Available liquidity (${pct.toFixed(1)}%) is below CRITICAL threshold (20%)`;
    } else if (pct <= 50) {
      state = "WARNING";
      reason = `Available liquidity (${pct.toFixed(1)}%) is below WARNING threshold (50%)`;
    } else {
      state = "HEALTHY";
    }

    return {
      chain: vault.chain,
      asset: vault.asset,
      state,
      availablePct: pct,
      available: vault.available,
      reserved: vault.reserved,
      isBridgeBlocked,
      reason,
    };
  }

  /**
   * Evaluates a set of vaults and returns all evaluations.
   * Emits security events for CRITICAL/PAUSED states.
   */
  static async evaluateAll(vaults: VaultSnapshot[]): Promise<HealthEvaluation[]> {
    const results: HealthEvaluation[] = [];

    for (const vault of vaults) {
      const evaluation = this.evaluate(vault);
      results.push(evaluation);

      if (evaluation.state === "CRITICAL" || evaluation.state === "PAUSED") {
        SecurityEventEngine.emitEvent(
          "LiquidityThresholdBreached",
          evaluation.state === "PAUSED" ? "CRITICAL" : "HIGH",
          "system",
          `${vault.chain} ${vault.asset} vault entered ${evaluation.state} state. ${evaluation.reason}`,
          { chain: vault.chain, asset: vault.asset, availablePct: evaluation.availablePct }
        );
      }
    }

    return results;
  }

  /**
   * Quick guard used by Destination Pre-Check before accepting a bridge request.
   * Returns true only if the destination chain vault can safely service the request.
   */
  static canServiceRequest(vault: VaultSnapshot, requestedAmount: number): boolean {
    const evaluation = this.evaluate(vault);
    if (evaluation.isBridgeBlocked) return false;

    // Also ensure the specific requested amount is covered with headroom
    // We require available > requestedAmount (not just >=) to preserve threshold
    return vault.available > requestedAmount;
  }
}
