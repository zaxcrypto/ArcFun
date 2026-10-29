import crypto from 'crypto';
import { NextResponse } from 'next/server';

export type NormalizedErrorCode = 
  | "ERR_RPC_UNAVAILABLE"
  | "ERR_GAS_TOO_LOW"
  | "ERR_INSUFFICIENT_GAS"
  | "ERR_ALREADY_CLAIMED"
  | "ERR_INVALID_BURN_HASH"
  | "ERR_ATTESTATION_NOT_READY"
  | "ERR_ATTESTATION_EXPIRED"
  | "ERR_DESTINATION_CALLER_RESTRICTED"
  | "ERR_TRANSACTION_FAILED"
  | "ERR_NETWORK_NOT_SUPPORTED"
  | "ERR_USER_REJECTED"
  | "ERR_STELLAR_MISSING_TRUSTLINE"
  | "ERR_STELLAR_ACCOUNT_NOT_FOUND"
  | "ERR_STELLAR_INSUFFICIENT_XLM"
  | "ERR_SIMULATION_FAILED"
  | "ERR_INTERNAL"
  | "ERR_UNAUTHORIZED"
  | "ERR_VALIDATION_FAILED"
  | "ERR_TRANSACTION_PENDING"
  | "ERR_VERIFICATION_PENDING"
  | "ERR_INVALID_MINT_RECIPIENT";

export interface NormalizedErrorResult {
    code: NormalizedErrorCode;
    referenceId?: string;
}

export interface ErrorTranslation {
    message: string;
    canRetry: boolean;
}

function generateRefId(): string {
    if (typeof window !== 'undefined') {
        return Math.random().toString(36).substring(2, 6).toUpperCase() + "-" + Math.random().toString(36).substring(2, 6).toUpperCase();
    }
    return crypto.randomBytes(2).toString('hex').toUpperCase() + "-" + crypto.randomBytes(2).toString('hex').toUpperCase();
}

/**
 * Normalizes raw exceptions into a safe enum.
 * If the error is internal/unknown, generates and logs a refId.
 */
export function normalizeError(error: any, context?: string): NormalizedErrorResult {
    if (!error) {
        const referenceId = generateRefId();
        console.error(`[${referenceId}] Unknown Internal Error in ${context || 'Unknown Context'}`);
        return { code: "ERR_INTERNAL", referenceId };
    }
    const msg = typeof error === 'string' ? error : (error?.message || String(error));
    const lowerMsg = msg.toLowerCase();

    if (lowerMsg.includes("err_verification_pending") || lowerMsg.includes("verification is pending") || lowerMsg.includes("verification pending")) return { code: "ERR_VERIFICATION_PENDING" };
    if (lowerMsg.includes("invalidmintrecipient") || lowerMsg.includes("6009") || lowerMsg.includes("0x1779") || lowerMsg.includes("invalid mint recipient")) return { code: "ERR_INVALID_MINT_RECIPIENT" };
    if (lowerMsg.includes("already_claimed") || lowerMsg.includes("nonce already used") || lowerMsg.includes("noncealreadyused") || lowerMsg.includes("0x177f") || lowerMsg.includes("6015")) return { code: "ERR_ALREADY_CLAIMED" };
    if (lowerMsg.includes("gas price below configured minimum") || lowerMsg.includes("underpriced") || lowerMsg.includes("replacement transaction underpriced")) return { code: "ERR_GAS_TOO_LOW" };
    if (lowerMsg.includes("insufficient funds") || lowerMsg.includes("intrinsic gas too low") || lowerMsg.includes("out of gas") || lowerMsg.includes("gas required exceeds allowance")) return { code: "ERR_INSUFFICIENT_GAS" };
    if (lowerMsg.includes("attestation not ready") || lowerMsg.includes("attestation is still pending") || lowerMsg.includes("still pending")) return { code: "ERR_ATTESTATION_NOT_READY" };
    if (lowerMsg.includes("invalid burn hash") || lowerMsg.includes("transfer not found in iris api") || lowerMsg.includes("transfer not found") || lowerMsg.includes("not found")) return { code: "ERR_INVALID_BURN_HASH" };
    if (lowerMsg.includes("caller restricted") || lowerMsg.includes("invalid caller for message") || lowerMsg.includes("original bridge") || lowerMsg.includes("destinationcaller")) return { code: "ERR_DESTINATION_CALLER_RESTRICTED" };
    if (lowerMsg.includes("network not supported") || lowerMsg.includes("unsupported domain") || lowerMsg.includes("unsupported source network") || lowerMsg.includes("unknown destination domain")) return { code: "ERR_NETWORK_NOT_SUPPORTED" };
    if (lowerMsg.includes("rpc error") || lowerMsg.includes("fetcherror") || lowerMsg.includes("network error") || lowerMsg.includes("timeout") || lowerMsg.includes("socket hang up") || lowerMsg.includes("connection reset") || lowerMsg.includes("econnrefused") || lowerMsg.includes("failed to fetch") || lowerMsg.includes("bad gateway") || lowerMsg.includes("502") || lowerMsg.includes("429") || lowerMsg.includes("bad response") || lowerMsg.includes("server response") || lowerMsg.includes("missing response") || lowerMsg.includes("could not resolve name") || lowerMsg.includes("fee data") || lowerMsg.includes("unpredictable gas limit") || lowerMsg.includes("method not found") || lowerMsg.includes("internal json-rpc error") || lowerMsg.includes("json-rpc error")) return { code: "ERR_RPC_UNAVAILABLE" };
    if (lowerMsg.includes("user rejected") || lowerMsg.includes("user denied")) return { code: "ERR_USER_REJECTED" };
    if (lowerMsg.includes("missing trustline") || lowerMsg.includes("trustline required") || lowerMsg.includes("op_no_trust")) return { code: "ERR_STELLAR_MISSING_TRUSTLINE" };
    if (lowerMsg.includes("account not found") || lowerMsg.includes("op_no_destination")) return { code: "ERR_STELLAR_ACCOUNT_NOT_FOUND" };
    if (lowerMsg.includes("insufficient xlm") || lowerMsg.includes("op_underfunded")) return { code: "ERR_STELLAR_INSUFFICIENT_XLM" };
    if (lowerMsg.includes("simulation failed") || lowerMsg.includes("always failing transaction")) return { code: "ERR_SIMULATION_FAILED" };
    if (lowerMsg.includes("transaction pending") || lowerMsg.includes("timeout waiting for confirmation")) return { code: "ERR_TRANSACTION_PENDING" };
    if (lowerMsg.includes("reverted") || lowerMsg.includes("transaction failed") || lowerMsg.includes("execution reverted") || lowerMsg.includes("status === 0") || lowerMsg.includes("call_exception") || lowerMsg.includes("missing revert data")) return { code: "ERR_TRANSACTION_FAILED" };

    // Fallback
    const referenceId = generateRefId();
    // Only log the raw error on the backend (or safely in console) 
    console.error(`[${referenceId}] Raw Exception caught in ${context || 'Unknown Context'}:\n`, error);
    return { code: "ERR_INTERNAL", referenceId };
}

/**
 * Standardized API Error Response wrapper.
 * Normalizes raw exceptions into a safe structured JSON payload.
 */
export function errorResponse(error: any, context?: string, status: number = 500): NextResponse {
    // If it's already a normalized code, wrap it cleanly
    if (typeof error === 'string' && error.startsWith('ERR_')) {
        return NextResponse.json({ success: false, error: { code: error as NormalizedErrorCode } }, { status });
    }

    const normalized = normalizeError(error, context);
    return NextResponse.json({ success: false, error: normalized }, { status });
}

/**
 * Translates a normalized error string (e.g. from backend JSON) into a human readable format and retry boolean.
 * Accepts a raw string like "ERR_INTERNAL::6FD9-13A2" or just "ERR_GAS_TOO_LOW".
 */
export function translateNormalizedError(rawError: any): ErrorTranslation {
    let code = "ERR_INTERNAL";
    let referenceId = "";

    if (typeof rawError === 'object' && rawError !== null) {
        code = rawError.code || "ERR_INTERNAL";
        referenceId = rawError.referenceId || "";
    } else if (typeof rawError === 'string') {
        code = rawError;
    }

    switch (code) {
        case "ERR_GAS_TOO_LOW": return { message: "The destination network rejected the transaction because the gas configuration is too low. Please try again later.", canRetry: true };
        case "ERR_RPC_UNAVAILABLE": return { message: "The destination network is temporarily unavailable. Please try again in a few minutes.", canRetry: true };
        case "ERR_VERIFICATION_PENDING": return { message: "The transaction succeeded on-chain, but event verification is still pending. The network is taking longer than usual to sync logs. Please check the destination network explorer for your funds.", canRetry: true };
        case "ERR_INVALID_MINT_RECIPIENT": return { message: "The transfer recipient address is invalid for the destination chain. For Solana destination, the burn transaction must target the Associated Token Account (ATA) rather than the wallet address.", canRetry: false };
        case "ERR_ALREADY_CLAIMED": return { message: "This transfer has already been recovered.", canRetry: false };
        case "ERR_ATTESTATION_NOT_READY": return { message: "Circle CCTP attestation is still pending block finality. Your funds are secure on-chain. Please wait 1–5 minutes and try again.", canRetry: true };
        case "ERR_INVALID_BURN_HASH": return { message: "Transaction not found on-chain. Please verify the selected source network and burn transaction hash.", canRetry: false };
        case "ERR_DESTINATION_CALLER_RESTRICTED": return { message: "This transfer can only be completed by the original bridge.", canRetry: false };
        case "ERR_INSUFFICIENT_GAS": return { message: "The relayer does not have enough gas to execute this transaction on the destination chain.", canRetry: true };
        case "ERR_ATTESTATION_EXPIRED": return { message: "The attestation for this transfer has expired and is no longer valid.", canRetry: false };
        case "ERR_TRANSACTION_FAILED": return { message: "The transaction was rejected by the destination network smart contract.", canRetry: false };
        case "ERR_NETWORK_NOT_SUPPORTED": return { message: "The selected network is not supported for recovery.", canRetry: false };
        case "ERR_USER_REJECTED": return { message: "The signature request was rejected.", canRetry: true };
        case "ERR_STELLAR_MISSING_TRUSTLINE": return { message: "The destination Stellar account is missing a trustline for USDC.", canRetry: false };
        case "ERR_STELLAR_ACCOUNT_NOT_FOUND": return { message: "The destination Stellar account does not exist or is unfunded.", canRetry: false };
        case "ERR_STELLAR_INSUFFICIENT_XLM": return { message: "The destination Stellar account lacks sufficient XLM for transaction fees.", canRetry: false };
        case "ERR_SIMULATION_FAILED": return { message: "The transaction simulation failed. This transfer might be invalid.", canRetry: false };
        case "ERR_TRANSACTION_PENDING": return { message: "Confirmation is taking longer than expected. The recovery transaction may still be processing on the destination network. Please retry after a minute to check the latest status.", canRetry: true };
        case "ERR_UNAUTHORIZED": return { message: "You are not authorized to perform this action.", canRetry: false };
        case "ERR_VALIDATION_FAILED": return { message: "The provided information is invalid.", canRetry: false };
        case "ERR_INTERNAL":  
        default: 
            if (!code.startsWith("ERR_") && code !== "ERR_INTERNAL") {
                return { message: code, canRetry: true };
            }
            return { 
                message: referenceId ? `Something went wrong while processing your request. Reference ID: ${referenceId}` : "Something went wrong while processing your request.", 
                canRetry: false 
            };
    }
}
