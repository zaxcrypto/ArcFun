/**
 * Audit Trail Standardization
 * 
 * Centralized logging service. All modules MUST write audit logs through 
 * this single service to prevent fragmented, inconsistent logging architectures.
 * 
 * This service maps to the `swap_bridge_audit_logs` table in Supabase.
 */

import { TransactionContext } from "./state-machine";
import { SecurityEventPayload } from "./security-events";

export interface BaseAuditPayload {
  walletAddress: string;
  metadata?: Record<string, any>;
}

export class AuditService {
  /**
   * Internal mechanism to push to database (Implementation abstracted for Phase 3)
   */
  private static async persistToDatabase(actionType: string, payload: any): Promise<void> {
    // Execution Phase: Supabase insert into `swap_bridge_audit_logs`
    // e.g. await supabase.from('swap_bridge_audit_logs').insert({...})
  }

  /**
   * Logs standard Swap lifecycle events (e.g. SUBMITTED, CONFIRMED)
   */
  static async logSwapEvent(context: TransactionContext, additionalMetadata?: Record<string, any>): Promise<void> {
    await this.persistToDatabase("swap_event", {
      walletAddress: context.walletAddress,
      details: {
        txId: context.id,
        state: context.state,
        provider: context.provider,
        ...additionalMetadata
      }
    });
  }

  /**
   * Logs standard Bridge lifecycle events
   */
  static async logBridgeEvent(context: TransactionContext, additionalMetadata?: Record<string, any>): Promise<void> {
    await this.persistToDatabase("bridge_event", {
      walletAddress: context.walletAddress,
      details: {
        txId: context.id,
        state: context.state,
        provider: context.provider,
        ...additionalMetadata
      }
    });
  }

  /**
   * Logs any action performed by an administrator (Settings changed, limits adjusted, pausing)
   */
  static async logAdminEvent(adminWallet: string, action: string, details: Record<string, any>): Promise<void> {
    await this.persistToDatabase("admin_event", {
      walletAddress: adminWallet,
      details: {
        action,
        ...details
      }
    });
  }

  /**
   * Logs critical security violations emitted by the SecurityEventEngine
   */
  static async logSecurityEvent(event: SecurityEventPayload): Promise<void> {
    await this.persistToDatabase("security_event", {
      walletAddress: event.walletAddress,
      details: {
        eventId: event.eventId,
        type: event.eventType,
        severity: event.severity,
        description: event.description,
        ...event.metadata
      }
    });
  }

  /**
   * Logs any modifications to the Whitelist/Access lists (Approvals, Rejections, Expiries)
   */
  static async logWhitelistEvent(adminWallet: string, targetWallet: string, action: "APPROVED" | "REJECTED" | "REVOKED", reason?: string): Promise<void> {
    await this.persistToDatabase("whitelist_event", {
      walletAddress: adminWallet,
      details: {
        targetWallet,
        action,
        reason
      }
    });
  }
}
