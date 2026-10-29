/**
 * Security Event Engine
 * 
 * Structured security event model ensuring that all threat vectors and 
 * limit violations are categorized uniformly across the ecosystem.
 */

export type SecurityEventType = 
  | "RateLimitExceeded"
  | "NonceReplayAttempt"
  | "InvalidSignature"
  | "BridgeLimitExceeded"
  | "SwapLimitExceeded"
  | "UnauthorizedAdminAction"
  | "WhitelistTamperingAttempt"
  | "ContractPauseTriggered"
  | "LiquidityThresholdBreached"
  | "SystemAlert";

export type SecuritySeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface SecurityEventPayload {
  eventId: string;
  eventType: SecurityEventType;
  timestamp: number;
  walletAddress: string;
  severity: SecuritySeverity;
  description: string;
  metadata?: Record<string, any>;
}

export class SecurityEventEngine {
  /**
   * Constructs and emits a formalized security event.
   * This is consumed by the AuditService to log into Supabase/Convex.
   */
  static emitEvent(
    type: SecurityEventType, 
    severity: SecuritySeverity, 
    wallet: string, 
    description: string, 
    metadata?: Record<string, any>
  ): SecurityEventPayload {
    
    const event: SecurityEventPayload = {
      eventId: crypto.randomUUID(),
      eventType: type,
      timestamp: Date.now(),
      walletAddress: wallet,
      severity: severity,
      description: description,
      metadata: metadata
    };

    // In execution phase, this will push to a message queue or directly to AuditService
    console.warn(`[SECURITY EVENT][${severity}] ${type}: ${description} (Wallet: ${wallet})`);
    
    return event;
  }
}
