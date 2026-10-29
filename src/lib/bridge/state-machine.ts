/**
 * Unified Transaction State Machine
 * 
 * Defines the strict, singular transaction lifecycle model for all
 * swap and bridge operations. This ensures uniform analytics, logs,
 * notifications, and recovery flows across any provider.
 */

export type TransactionState =
  | "PENDING"              // Initial request created, awaiting validation
  | "VALIDATING"           // System checking limits, scores, nonces
  | "AWAITING_SIGNATURE"   // Prompting user wallet for signature/approval
  | "SUBMITTED"            // Payload sent to RPC / Relayer
  | "CONFIRMED"            // Execution finalized and verified on-chain
  | "FAILED"               // Contract reverted or network error
  | "EXPIRED"              // Time limit exceeded for signature or execution
  | "REJECTED";            // User declined signature or validation failed

export interface TransactionContext {
  id: string;
  type: "SWAP" | "BRIDGE";
  state: TransactionState;
  walletAddress: string;
  provider: string;        // e.g. "ArcFunNativeProvider"
  createdAt: number;
  updatedAt: number;
  errorReason?: string;
  txHash?: string;
}

export interface StateTransition {
  from: TransactionState | "*";
  to: TransactionState;
  validate?: (context: TransactionContext) => boolean;
}

export class TransactionStateMachine {
  private static readonly ALLOWED_TRANSITIONS: StateTransition[] = [
    { from: "PENDING", to: "VALIDATING" },
    { from: "PENDING", to: "REJECTED" },
    { from: "VALIDATING", to: "AWAITING_SIGNATURE" },
    { from: "VALIDATING", to: "REJECTED" },
    { from: "VALIDATING", to: "FAILED" },
    { from: "AWAITING_SIGNATURE", to: "SUBMITTED" },
    { from: "AWAITING_SIGNATURE", to: "REJECTED" },
    { from: "AWAITING_SIGNATURE", to: "EXPIRED" },
    { from: "SUBMITTED", to: "CONFIRMED" },
    { from: "SUBMITTED", to: "FAILED" }
  ];

  /**
   * Attempts to transition a transaction context to a new state.
   * Throws an error if the transition is illegal according to the state machine.
   */
  static transition(context: TransactionContext, newState: TransactionState, metadata?: Partial<TransactionContext>): TransactionContext {
    const isValid = this.ALLOWED_TRANSITIONS.some(
      (t) => (t.from === context.state || t.from === "*") && t.to === newState
    );

    if (!isValid) {
      throw new Error(`Illegal state transition from ${context.state} to ${newState}`);
    }

    return {
      ...context,
      ...metadata,
      state: newState,
      updatedAt: Date.now()
    };
  }
}


// ══════════════════════════════════════════════════════════════════════
// BRIDGE SPECIFIC DATABASE STATES
// ══════════════════════════════════════════════════════════════════════

export const RECOVERABLE_BRIDGE_STATES = [
  'ATTESTATION_PENDING',
  'PENDING',
  'CLAIM_MANUAL_REQUIRED',
  'PROCESSING_CLAIM'
];
export const TERMINAL_BRIDGE_STATES = ['COMPLETED', 'FAILED'];
