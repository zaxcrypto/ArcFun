import { NextResponse } from "next/server";
import {
  GATEWAY_NETWORKS,
  isGatewayDomainSupported,
} from "@/config/gateway-config";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { isSponsoredMintEnabled } from "@/lib/gateway/emergency-switch";
import { validateArcFunSponsoredAttestation } from "@/lib/gateway/attestation-decoder";
import {
  estimateDestinationGasCost,
  isSponsorshipEconomicallySafe,
  gasReservationManager,
} from "@/lib/gateway/economic-policy";
import {
  executeGatewayMintWithRelayer,
  getResilientProvider,
  getRelayerAddress,
} from "@/lib/gateway/relayer-manager";
import { authenticateGatewayUser } from "@/lib/gateway/auth-guard";

export const maxDuration = 120;

export async function POST(req: Request) {
  let transferId: string | undefined;

  try {
    const body = await req.json();
    transferId = body.transferId;
    const {
      attestationPayload,
      signature,
      destinationDomain,
      recipient,
      userWallet,
      sourceTxHash,
    } = body;

    // 1. Validate Input Parameters
    if (!attestationPayload || !signature || destinationDomain === undefined || !recipient) {
      return NextResponse.json(
        { error: "Missing required parameters: attestationPayload, signature, recipient, or destinationDomain" },
        { status: 400 }
      );
    }

    // 2. Server-Side Network Allowlist Check
    if (!isGatewayDomainSupported(destinationDomain)) {
      return NextResponse.json(
        { error: `Destination domain ${destinationDomain} is not in the authorized Gateway V1 network allowlist.` },
        { status: 400 }
      );
    }

    const networkConfig = GATEWAY_NETWORKS[destinationDomain];

    // 3. Server-Authoritative Emergency Kill Switch
    const killSwitchState = isSponsoredMintEnabled(destinationDomain);
    if (!killSwitchState.enabled) {
      return NextResponse.json(
        {
          error: killSwitchState.reason || "Sponsored Mint is temporarily suspended. Please use Manual Claim.",
          isSponsoredAvailable: false,
          fallbackToManualClaim: true,
        },
        { status: 503 }
      );
    }

    // 4. Rate Limiting Protection (Max 10 mint requests per minute per IP / wallet)
    const rateLimitResponse = await checkRateLimit(req, recipient, {
      maxRequests: 10,
      windowMs: 60000,
    });
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    // 5. Authentication & Caller Wallet Binding
    const authResult = await authenticateGatewayUser(req, userWallet || recipient);
    if (!authResult.authenticated || !authResult.userAddress) {
      return NextResponse.json(
        { error: authResult.error || "Unauthorized: Valid wallet authentication session required." },
        { status: 401 }
      );
    }

    const authenticatedUser = authResult.userAddress;

    // 6. Cryptographic Attestation Binary Verification
    // Proves: legitimate Gateway contracts, bound recipient, bound depositor, valid fee intent to treasury
    const attestationValidation = validateArcFunSponsoredAttestation({
      attestationPayload,
      expectedDestinationDomain: destinationDomain,
      expectedRecipient: recipient,
      expectedUserWallet: authenticatedUser,
      isManualClaim: false,
    });

    if (!attestationValidation.isValid) {
      console.warn(`[GatewayRelayer] Attestation validation rejected: ${attestationValidation.error}`);
      return NextResponse.json(
        {
          error: `Security Validation Failed: ${attestationValidation.error}`,
          isSponsoredAvailable: false,
          fallbackToManualClaim: true,
        },
        { status: 400 }
      );
    }

    // 7. Server-Authoritative Economic Safety & Gas Cost Estimation
    const provider = await getResilientProvider(destinationDomain);
    const gasEstimate = await estimateDestinationGasCost(provider, destinationDomain);
    const feeUnits = attestationValidation.feeAmountUnits || 0n;

    const isTestnet = Boolean(networkConfig.isTestnet);
    const economicCheck = isSponsorshipEconomicallySafe(feeUnits, gasEstimate.estimatedCostUsd, isTestnet);
    if (!economicCheck.safe) {
      console.warn(`[GatewayRelayer] Economic safety check failed: ${economicCheck.reason}`);
      return NextResponse.json(
        {
          error: economicCheck.reason,
          isSponsoredAvailable: false,
          fallbackToManualClaim: true,
        },
        { status: 422 }
      );
    }

    // 8. Relayer Balance & Gas Reservation (TOCTOU Defense)
    const relayerAddress = getRelayerAddress();
    const balance = await provider.getBalance(relayerAddress);

    const reservation = gasReservationManager.acquireReservation(
      transferId || attestationValidation.userIntent!.spec.salt,
      destinationDomain,
      balance,
      gasEstimate.estimatedCostWei
    );

    if (!reservation.success) {
      console.warn(
        `[GatewayRelayer] Insufficient relayer gas reserve on ${networkConfig.name}. Available: ${reservation.availableWei.toString()}, Required: ${gasEstimate.estimatedCostWei.toString()}`
      );
      return NextResponse.json(
        {
          error: `Relayer gas reservation capacity is temporarily saturated on ${networkConfig.name}. Please switch to Manual Claim to self-mint or retry shortly.`,
          isSponsoredAvailable: false,
          fallbackToManualClaim: true,
        },
        { status: 503 }
      );
    }

    // 9. Database Idempotency Check & Atomic State Transition
    if (transferId) {
      const { data: existingRecord } = await supabaseAdmin
        .from("gateway_pending_transfers")
        .select("id, status, destination_tx_hash, updated_at")
        .eq("id", transferId)
        .maybeSingle();

      if (existingRecord) {
        if (existingRecord.status === "minted" && existingRecord.destination_tx_hash) {
          gasReservationManager.releaseReservation(transferId);
          return NextResponse.json({
            success: true,
            alreadyMinted: true,
            txHash: existingRecord.destination_tx_hash,
            destinationDomain,
            destinationChainName: networkConfig.name,
            explorerUrl: `${networkConfig.explorerUrl}/tx/${existingRecord.destination_tx_hash}`,
          });
        }

        // Prevent concurrent double-submits within 30 seconds
        if (
          existingRecord.status === "mint_processing" &&
          existingRecord.updated_at &&
          Date.now() - new Date(existingRecord.updated_at).getTime() < 30000
        ) {
          gasReservationManager.releaseReservation(transferId);
          return NextResponse.json(
            {
              error: "A mint transaction for this transfer is already processing on-chain. Please wait a moment.",
              isProcessing: true,
            },
            { status: 429 }
          );
        }

        // Mark as processing
        await supabaseAdmin
          .from("gateway_pending_transfers")
          .update({ status: "mint_processing", updated_at: new Date().toISOString() })
          .eq("id", transferId);
      }
    }

    // 10. Execute Transaction via Centralized, Nonce-Safe Relayer Manager
    const executionResult = await executeGatewayMintWithRelayer({
      transferId: transferId || "ephemeral",
      destinationDomain,
      attestationPayload,
      signature,
      recipient,
    });

    if (executionResult.isExpired) {
      if (transferId) {
        await supabaseAdmin
          .from("gateway_pending_transfers")
          .update({ status: "attestation_expired", destination_tx_hash: "0x_expired" })
          .eq("id", transferId);
      }
      return NextResponse.json(
        {
          success: false,
          expired: true,
          error: "Attestation expired on-chain. Please initiate a fresh claim to generate a new signature.",
        },
        { status: 400 }
      );
    }

    const cleanUser = (userWallet || "").toLowerCase();

    // Helper to atomically update transfer records in database
    const markTransfersMinted = async (destTxHash: string) => {
      const nowIso = new Date().toISOString();
      const updates = {
        status: "minted",
        destination_tx_hash: destTxHash,
        updated_at: nowIso,
      };

      if (transferId) {
        await supabaseAdmin.from("gateway_pending_transfers").update(updates).eq("id", transferId);
      }
      if (sourceTxHash) {
        await supabaseAdmin.from("gateway_pending_transfers").update(updates).eq("source_tx_hash", sourceTxHash);
      }
      if (cleanUser) {
        await supabaseAdmin
          .from("gateway_pending_transfers")
          .update(updates)
          .eq("user_address", cleanUser)
          .eq("dest_domain", destinationDomain)
          .neq("status", "minted");
      }
    };

    if (executionResult.isAlreadyUsed) {
      await markTransfersMinted("onchain_completed");
      return NextResponse.json({
        success: true,
        alreadyMintedOrExpired: true,
        message: "Transfer attestation was already minted on-chain.",
      });
    }

    if (!executionResult.success || !executionResult.txHash) {
      if (transferId) {
        await supabaseAdmin
          .from("gateway_pending_transfers")
          .update({ status: "ready_to_mint" })
          .eq("id", transferId);
      }
      return NextResponse.json(
        { error: executionResult.error || "Failed to submit destination mint transaction via relayer." },
        { status: 500 }
      );
    }

    // 11. Transaction Broadcast & Confirmed: Update Database to Minted
    await markTransfersMinted(executionResult.txHash);

    return NextResponse.json({
      success: true,
      txHash: executionResult.txHash,
      destinationDomain,
      destinationChainName: networkConfig.name,
      blockNumber: executionResult.blockNumber,
      nonce: executionResult.nonce,
      transferId: transferId || null,
      relayerAddress,
      explorerUrl: `${networkConfig.explorerUrl}/tx/${executionResult.txHash}`,
    });
  } catch (error: any) {
    console.error("[GatewayRelayer] Unhandled error during destination mint:", error);
    if (transferId) {
      gasReservationManager.releaseReservation(transferId);
    }
    return NextResponse.json(
      { error: error?.message || "Internal server error during relayer mint." },
      { status: 500 }
    );
  }
}
