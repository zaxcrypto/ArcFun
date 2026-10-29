/**
 * Route Suspension System
 * 
 * Manages per-route (source → destination) availability.
 * Routes can be automatically suspended by the system based on health,
 * or manually disabled by admins.
 */

import { LiquidityHealthEngine, VaultSnapshot } from "./liquidity-health-engine";
import { AuditService } from "./audit-service";

export type RouteStatus = "ACTIVE" | "DEGRADED" | "DISABLED";

export interface BridgeRoute {
  id: string;             // e.g. "arc-testnet→ethereum-sepolia"
  fromChain: string;
  toChain: string;
  asset: string;
  status: RouteStatus;
  disabledReason?: string;
  disabledAt?: number;
  lastActivity?: number;
}

export class RouteSuspensionSystem {
  private static routes: Map<string, BridgeRoute> = new Map();

  private static routeId(fromChain: string, toChain: string, asset: string): string {
    return `${fromChain}→${toChain}:${asset}`.toLowerCase().replace(/\s+/g, "-");
  }

  /** Registers a route in the system. All routes start as ACTIVE. */
  static register(fromChain: string, toChain: string, asset: string): void {
    const id = this.routeId(fromChain, toChain, asset);
    this.routes.set(id, {
      id, fromChain, toChain, asset,
      status: "ACTIVE",
    });
  }

  /** Retrieves current status for a specific route. */
  static getStatus(fromChain: string, toChain: string, asset: string): BridgeRoute | undefined {
    return this.routes.get(this.routeId(fromChain, toChain, asset));
  }

  /** Returns all currently registered routes. */
  static getAllRoutes(): BridgeRoute[] {
    return Array.from(this.routes.values());
  }

  /**
   * Called by CircuitBreaker or LiquidityHealthEngine automatically.
   * No admin action required for system-triggered suspensions.
   */
  static async autoSuspend(
    fromChain: string, toChain: string, asset: string, reason: string
  ): Promise<void> {
    const id = this.routeId(fromChain, toChain, asset);
    const route = this.routes.get(id);
    if (!route || route.status === "DISABLED") return;

    route.status = "DISABLED";
    route.disabledReason = reason;
    route.disabledAt = Date.now();

    await AuditService.logAdminEvent("system", "route_auto_suspended", {
      routeId: id, reason, fromChain, toChain, asset
    });
  }

  /**
   * Evaluates a destination vault's health and auto-suspends routes
   * connected to that destination if the vault is CRITICAL or PAUSED.
   */
  static async evaluateAndSuspend(
    destinationVault: VaultSnapshot
  ): Promise<void> {
    const evaluation = LiquidityHealthEngine.evaluate(destinationVault);

    if (evaluation.state === "CRITICAL" || evaluation.state === "PAUSED") {
      // Suspend all routes pointing to this destination
      for (const route of this.routes.values()) {
        if (
          route.toChain === destinationVault.chain &&
          route.asset === destinationVault.asset &&
          route.status === "ACTIVE"
        ) {
          await this.autoSuspend(
            route.fromChain, route.toChain, route.asset,
            `Vault ${evaluation.state}: ${evaluation.reason}`
          );
        }
      }
    } else if (evaluation.state === "WARNING") {
      // Degrade but don't disable
      for (const route of this.routes.values()) {
        if (
          route.toChain === destinationVault.chain &&
          route.asset === destinationVault.asset &&
          route.status === "ACTIVE"
        ) {
          route.status = "DEGRADED";
          route.disabledReason = evaluation.reason;
        }
      }
    }
  }

  /** (Admin only) Re-enables a previously suspended route after liquidity is restored. */
  static async adminResumeRoute(
    fromChain: string, toChain: string, asset: string, adminWallet: string
  ): Promise<void> {
    const id = this.routeId(fromChain, toChain, asset);
    const route = this.routes.get(id);
    if (!route) throw new Error(`Route ${id} not found`);

    route.status = "ACTIVE";
    route.disabledReason = undefined;
    route.disabledAt = undefined;

    await AuditService.logAdminEvent(adminWallet, "route_manually_resumed", {
      routeId: id, fromChain, toChain, asset
    });
  }
}
