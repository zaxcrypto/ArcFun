import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyCircleGatewayWebhookSignature } from "@/lib/gateway/circle-webhook-verifier";

export const dynamic = "force-dynamic";

// Maximum allowable request body size (1MB) to protect against DoS attacks
const MAX_PAYLOAD_BYTES = 1024 * 1024;

/**
 * 1. HEAD handler: Circle requires a 200 OK on HEAD when creating or validating a subscription endpoint.
 */
export async function HEAD() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

/**
 * 2. POST handler: Receives, cryptographically verifies, and idempotently processes Circle Gateway webhook events.
 */
export async function POST(req: Request) {
  let notificationId: string | undefined;

  try {
    // 1. Header Validation
    const signature = req.headers.get("x-circle-signature");
    const keyId = req.headers.get("x-circle-key-id");

    if (!signature || !keyId) {
      return NextResponse.json(
        { error: "Unauthorized: Missing X-Circle-Signature or X-Circle-Key-Id header" },
        { status: 401 }
      );
    }

    // 2. Read Raw Request Body with Size Guard
    const rawBody = await req.text();
    if (rawBody.length > MAX_PAYLOAD_BYTES) {
      return NextResponse.json(
        { error: "Payload Too Large: Request exceeds 1MB limit" },
        { status: 413 }
      );
    }

    // 3. Cryptographic Signature Verification
    const verification = await verifyCircleGatewayWebhookSignature(rawBody, signature, keyId);
    if (!verification.isValid) {
      return NextResponse.json(
        { error: "Unauthorized: Invalid cryptographic signature" },
        { status: 401 }
      );
    }

    // 4. Safe JSON Parsing & Envelope Validation
    let payload: any;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return NextResponse.json(
        { error: "Bad Request: Malformed JSON payload" },
        { status: 400 }
      );
    }

    notificationId = payload?.notificationId;
    const notificationType = payload?.notificationType;
    const notification = payload?.notification;

    if (!notificationId || typeof notificationId !== "string" || !notificationType || typeof notificationType !== "string") {
      return NextResponse.json(
        { error: "Bad Request: Missing notificationId or notificationType envelope fields" },
        { status: 400 }
      );
    }

    // 5. Idempotency Check & Processing Lock
    // First, check if this notificationId has already been recorded in the database
    const { data: existingEvent, error: selectErr } = await supabaseAdmin
      .from("gateway_webhook_events")
      .select("id, status")
      .eq("notification_id", notificationId)
      .maybeSingle();

    if (selectErr) {
      console.error("[CircleGatewayWebhook] Error checking idempotency table:", selectErr);
      return NextResponse.json(
        { error: "Database error during idempotency check" },
        { status: 500 }
      );
    }

    if (existingEvent) {
      if (existingEvent.status === "processed" || existingEvent.status === "ignored") {
        // Already processed successfully; return 200 OK immediately
        return NextResponse.json({ success: true, duplicate: true }, { status: 200 });
      }
      if (existingEvent.status === "processing") {
        // In-flight concurrent duplicate delivery; return 200 to avoid cascading retry storms
        return NextResponse.json({ success: true, inProgress: true }, { status: 200 });
      }
    } else {
      // Insert initial processing lock
      const { error: insertErr } = await supabaseAdmin
        .from("gateway_webhook_events")
        .insert({
          notification_id: notificationId,
          notification_type: notificationType,
          wallet_address: notification?.from?.toLowerCase() || notification?.walletAddress?.toLowerCase() || null,
          tx_hash: notification?.txHash?.toLowerCase() || null,
          transfer_id: notification?.transferId || notification?.id || null,
          status: "processing",
          payload: notification || {},
          created_at: new Date().toISOString(),
        });

      if (insertErr) {
        // Unique constraint violation indicates another instance just inserted it
        if (insertErr.code === "23505") {
          return NextResponse.json({ success: true, duplicate: true }, { status: 200 });
        }
        console.error("[CircleGatewayWebhook] Error inserting webhook event log:", insertErr);
        return NextResponse.json(
          { error: "Failed to persist webhook event log" },
          { status: 500 }
        );
      }
    }

    // 6. Supported Event Handling
    let processingOutcome: "processed" | "ignored" = "processed";

    switch (notificationType) {
      // ────────────────────────────────────────────────────────────────────────
      // EVENT 1: gateway.deposit.finalized
      // Triggered when USDC deposit to Gateway Wallet is confirmed on-chain & indexed
      // ────────────────────────────────────────────────────────────────────────
      case "gateway.deposit.finalized": {
        const fromAddress = notification?.from?.toLowerCase();
        const txHash = notification?.txHash?.toLowerCase();
        const domain = notification?.domain !== undefined ? Number(notification.domain) : null;

        if (!fromAddress || !txHash || domain === null) {
          console.warn("[CircleGatewayWebhook] deposit.finalized missing from, txHash, or domain", {
            notificationId,
          });
          processingOutcome = "ignored";
          break;
        }

        // Strict matching: Match existing record by source_tx_hash, user_address, and source_domain
        const { data: matchedTransfer, error: matchErr } = await supabaseAdmin
          .from("gateway_pending_transfers")
          .select("id, status, amount, user_address, source_domain")
          .eq("source_tx_hash", txHash)
          .eq("user_address", fromAddress)
          .eq("source_domain", domain)
          .maybeSingle();

        if (matchErr) {
          console.error("[CircleGatewayWebhook] Error querying pending transfer for deposit:", matchErr);
          throw matchErr;
        }

        if (matchedTransfer) {
          // Only advance if currently in deposited_indexing state
          if (matchedTransfer.status === "deposited_indexing") {
            const { error: updateErr } = await supabaseAdmin
              .from("gateway_pending_transfers")
              .update({
                status: "ready_to_sign",
                updated_at: new Date().toISOString(),
              })
              .eq("id", matchedTransfer.id);

            if (updateErr) {
              console.error("[CircleGatewayWebhook] Error updating transfer to ready_to_sign:", updateErr);
              throw updateErr;
            }
          }
          // Note: Under NO circumstance does the webhook auto-sign or auto-mint!
          // The user must explicitly initiate EIP-712 signing in the UI.
        } else {
          // If transfer record was not found yet (e.g. fast deposit discovery),
          // log as processed so polling or frontend discovery can reconcile
          console.info("[CircleGatewayWebhook] deposit.finalized matched no in-flight pending record", {
            txHash,
            fromAddress,
            domain,
          });
        }
        break;
      }

      // ────────────────────────────────────────────────────────────────────────
      // EVENT 2: gateway.mint.finalized
      // Triggered when destination mint transaction has finalized on destination chain
      // ────────────────────────────────────────────────────────────────────────
      case "gateway.mint.finalized": {
        const destTxHash = notification?.txHash;
        const destDomain = notification?.domain !== undefined ? Number(notification.domain) : null;
        const recipient = notification?.walletAddress?.toLowerCase();
        const transferId = notification?.transferId || notification?.id;

        if (!destTxHash) {
          console.warn("[CircleGatewayWebhook] mint.finalized missing txHash", { notificationId });
          processingOutcome = "ignored";
          break;
        }

        // Strict matching hierarchy:
        // 1. By transferId if present
        // 2. By destination_tx_hash if relayer already saved it
        // 3. By exact recipient, destination domain, and unminted status
        let targetTransferId: string | null = null;

        if (transferId) {
          const { data: byId } = await supabaseAdmin
            .from("gateway_pending_transfers")
            .select("id, status")
            .eq("id", transferId)
            .maybeSingle();
          if (byId) targetTransferId = byId.id;
        }

        if (!targetTransferId && destTxHash) {
          const { data: byDestTx } = await supabaseAdmin
            .from("gateway_pending_transfers")
            .select("id, status")
            .eq("destination_tx_hash", destTxHash)
            .maybeSingle();
          if (byDestTx) targetTransferId = byDestTx.id;
        }

        if (!targetTransferId && recipient && destDomain !== null) {
          // Single match guard: Avoid broad updates across multiple records
          const { data: candidates } = await supabaseAdmin
            .from("gateway_pending_transfers")
            .select("id, status")
            .eq("user_address", recipient)
            .eq("dest_domain", destDomain)
            .in("status", ["mint_processing", "ready_to_mint", "attestation_ready"])
            .order("created_at", { ascending: false })
            .limit(2);

          // Only proceed if exactly one unminted transfer matches unambiguously
          if (candidates && candidates.length === 1) {
            targetTransferId = candidates[0].id;
          }
        }

        if (targetTransferId) {
          const { error: updateErr } = await supabaseAdmin
            .from("gateway_pending_transfers")
            .update({
              status: "minted",
              destination_tx_hash: destTxHash,
              updated_at: new Date().toISOString(),
            })
            .eq("id", targetTransferId);

          if (updateErr) {
            console.error("[CircleGatewayWebhook] Error marking transfer as minted:", updateErr);
            throw updateErr;
          }
        }
        break;
      }

      // ────────────────────────────────────────────────────────────────────────
      // EVENT 3: gateway.mint.forwarded
      // Triggered when Circle Forwarding Service accepts/relays destination mint
      // ────────────────────────────────────────────────────────────────────────
      case "gateway.mint.forwarded": {
        const destTxHash = notification?.txHash;
        const transferId = notification?.transferId || notification?.id;
        const recipient = notification?.walletAddress?.toLowerCase();

        // Forwarding confirmation indicates in-flight relay processing.
        // It does NOT indicate finality yet, so advance to 'mint_processing'.
        let targetTransferId: string | null = null;

        if (transferId) {
          const { data: byId } = await supabaseAdmin
            .from("gateway_pending_transfers")
            .select("id, status")
            .eq("id", transferId)
            .maybeSingle();
          if (byId && byId.status !== "minted") targetTransferId = byId.id;
        }

        if (!targetTransferId && recipient) {
          const { data: candidates } = await supabaseAdmin
            .from("gateway_pending_transfers")
            .select("id, status")
            .eq("user_address", recipient)
            .in("status", ["ready_to_mint", "attestation_ready"])
            .order("created_at", { ascending: false })
            .limit(1);

          if (candidates && candidates.length === 1) {
            targetTransferId = candidates[0].id;
          }
        }

        if (targetTransferId) {
          const updatePayload: Record<string, any> = {
            status: "mint_processing",
            updated_at: new Date().toISOString(),
          };
          if (destTxHash) {
            updatePayload.destination_tx_hash = destTxHash;
          }

          const { error: updateErr } = await supabaseAdmin
            .from("gateway_pending_transfers")
            .update(updatePayload)
            .eq("id", targetTransferId);

          if (updateErr) {
            console.error("[CircleGatewayWebhook] Error updating transfer to mint_processing:", updateErr);
            throw updateErr;
          }
        }
        break;
      }

      default: {
        // Unknown or unsupported event type: mark as ignored and acknowledge
        console.info(`[CircleGatewayWebhook] Unhandled event type: ${notificationType}`);
        processingOutcome = "ignored";
        break;
      }
    }

    // 7. Update Webhook Event Log to Processed
    await supabaseAdmin
      .from("gateway_webhook_events")
      .update({
        status: processingOutcome,
        processed_at: new Date().toISOString(),
      })
      .eq("notification_id", notificationId);

    return NextResponse.json(
      { success: true, notificationId, status: processingOutcome },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("[CircleGatewayWebhook] Unhandled processing error:", err);

    // If an error occurred during transfer processing, mark event as failed so Circle can retry
    if (notificationId) {
      try {
        await supabaseAdmin
          .from("gateway_webhook_events")
          .update({
            status: "failed",
            error_message: err?.message || "Internal error",
            processed_at: new Date().toISOString(),
          })
          .eq("notification_id", notificationId);
      } catch {
        // Suppress secondary DB error in failure reporting path
      }
    }

    return NextResponse.json(
      { error: "Internal server error processing webhook event" },
      { status: 500 }
    );
  }
}
