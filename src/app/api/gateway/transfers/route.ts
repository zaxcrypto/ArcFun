import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { isGatewayDomainSupported } from "@/config/gateway-config";
import { authenticateGatewayUser } from "@/lib/gateway/auth-guard";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userParam = searchParams.get("user");

    if (!userParam || !userParam.startsWith("0x")) {
      return NextResponse.json(
        { success: false, error: "Valid user wallet address is required" },
        { status: 400 }
      );
    }

    const cleanUser = userParam.toLowerCase().trim();

    // 1. Rate Limiting Protection (Max 60 requests per minute per IP/wallet)
    const rateLimitResponse = await checkRateLimit(req, cleanUser, {
      maxRequests: 60,
      windowMs: 60000,
    });
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    // 2. Authentication & Authorization Check
    const authResult = await authenticateGatewayUser(req, cleanUser);
    if (!authResult.authenticated) {
      return NextResponse.json(
        { success: false, error: authResult.error || "Unauthorized to view these transfers" },
        { status: 401 }
      );
    }

    // 3. Query Database
    const { data, error } = await supabaseAdmin
      .from("gateway_pending_transfers")
      .select("*")
      .eq("user_address", cleanUser)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[Gateway Transfers API] DB Fetch error:", error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    // 1. Identify all completed/minted identifiers
    const trulyMinted = (data || []).filter((t: any) => t.status === "minted");
    const mintedHashes = trulyMinted
      .map((m: any) => m.source_tx_hash?.toLowerCase())
      .filter(Boolean);
    const mintedIds = trulyMinted
      .map((m: any) => m.id?.toLowerCase())
      .filter(Boolean);

    const mintedHashSet = new Set<string>(mintedHashes);
    const mintedIdSet = new Set<string>(mintedIds);

    const now = Date.now();
    const ATTESTATION_MAX_AGE_MS = 20 * 60 * 1000; // 20 minutes max block height validity

    // 2. Filter truly pending transfers:
    // Exclude if status is 'minted'
    // Exclude if this transfer's source_tx_hash was already minted
    // Exclude if this transfer's id was already minted
    // Exclude if attestation has expired (>20 mins)
    const pendingTransfers = (data || []).filter((t: any) => {
      if (t.status === "minted") return false;
      if (t.id && mintedIdSet.has(t.id.toLowerCase())) return false;
      if (t.source_tx_hash && mintedHashSet.has(t.source_tx_hash.toLowerCase())) return false;
      if (t.status === "ready_to_mint" || t.status === "attestation_ready") {
        if (t.created_at && (now - new Date(t.created_at).getTime()) > ATTESTATION_MAX_AGE_MS) {
          return false;
        }
      }
      return true;
    });

    return NextResponse.json({
      success: true,
      transfers: pendingTransfers,
      mintedHashes: Array.from(mintedHashSet),
      mintedIds: Array.from(mintedIdSet),
    });
  } catch (err: any) {
    console.error("[Gateway Transfers API] Exception in GET:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      id,
      userAddress,
      sourceDomain,
      destDomain,
      amount,
      receiveAmount,
      sourceTxHash,
      status,
      isManualClaim,
      burnIntentSet,
      attestationPayload,
      operatorSignature,
      destinationTxHash,
    } = body;

    if (!id || !userAddress || sourceDomain === undefined || destDomain === undefined || !amount) {
      return NextResponse.json(
        { success: false, error: "Missing mandatory transfer parameters" },
        { status: 400 }
      );
    }

    const cleanAddress = userAddress.toLowerCase().trim();

    // 1. Rate Limiting Protection (Max 30 requests per minute)
    const rateLimitResponse = await checkRateLimit(req, cleanAddress, {
      maxRequests: 30,
      windowMs: 60000,
    });
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    // 2. Authentication & Authorization Check
    const authResult = await authenticateGatewayUser(req, cleanAddress);
    if (!authResult.authenticated) {
      return NextResponse.json(
        { success: false, error: authResult.error || "Unauthorized to record transfer" },
        { status: 401 }
      );
    }

    // 3. Domain Whitelist Validation
    if (!isGatewayDomainSupported(sourceDomain) || !isGatewayDomainSupported(destDomain)) {
      return NextResponse.json(
        { success: false, error: "Unsupported source or destination domain" },
        { status: 400 }
      );
    }

    const parsedAmount = Number(amount);
    const parsedReceive = Number(receiveAmount ?? amount);

    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return NextResponse.json(
        { success: false, error: "Invalid transfer amount" },
        { status: 400 }
      );
    }

    // 4. Deduplicate by sourceTxHash
    let targetId = id;
    if (sourceTxHash) {
      const { data: existingByTx } = await supabaseAdmin
        .from("gateway_pending_transfers")
        .select("id, amount, source_tx_hash, status")
        .eq("source_tx_hash", sourceTxHash)
        .maybeSingle();
      if (existingByTx) {
        targetId = existingByTx.id;
      }
    }

    // 5. Anti-Tamper Security Guard
    const { data: existingRecord } = await supabaseAdmin
      .from("gateway_pending_transfers")
      .select("amount, source_tx_hash, status, destination_tx_hash")
      .eq("id", targetId)
      .maybeSingle();

    if (existingRecord && existingRecord.source_tx_hash) {
      const existingAmountNum = Number(existingRecord.amount);
      if (Math.abs(existingAmountNum - parsedAmount) > 0.000001) {
        console.error(
          `[Gateway Transfers API] SECURITY ALERT: Amount tamper attempt on transfer ${targetId}. Existing: ${existingAmountNum}, Incoming: ${parsedAmount}`
        );
        return NextResponse.json(
          {
            success: false,
            error: "Security violation: Deposit amount is strictly immutable once recorded.",
          },
          { status: 400 }
        );
      }
    }

    // 6. Server-Authoritative Fee Policy:
    // Manual Claim = 0.5% (0.005)
    // Sponsored Mint = 1% (0.01)
    const serverPlatformFeePercent = isManualClaim ? 0.005 : 0.01;

    // Invariant: Once minted, a transfer is terminal and immutable. Never downgrade to unminted.
    let resolvedStatus = status || "deposited_indexing";
    if (existingRecord?.status === "minted") {
      resolvedStatus = "minted";
    }

    const payload = {
      id: targetId,
      user_address: cleanAddress,
      source_domain: sourceDomain,
      dest_domain: destDomain,
      amount: parsedAmount,
      receive_amount: parsedReceive,
      source_tx_hash: sourceTxHash || existingRecord?.source_tx_hash || null,
      status: resolvedStatus,
      is_manual_claim: Boolean(isManualClaim),
      platform_fee_percent: serverPlatformFeePercent,
      burn_intent_set: burnIntentSet || null,
      attestation_payload: attestationPayload || null,
      operator_signature: operatorSignature || null,
      destination_tx_hash: destinationTxHash || existingRecord?.destination_tx_hash || null,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabaseAdmin
      .from("gateway_pending_transfers")
      .upsert(payload, { onConflict: "id" })
      .select()
      .single();

    // If marked as minted, atomically mark any other records matching sourceTxHash as minted
    if (resolvedStatus === "minted" && (sourceTxHash || existingRecord?.source_tx_hash)) {
      const matchHash = sourceTxHash || existingRecord?.source_tx_hash;
      await supabaseAdmin
        .from("gateway_pending_transfers")
        .update({
          status: "minted",
          destination_tx_hash: destinationTxHash || existingRecord?.destination_tx_hash || "onchain_completed",
          updated_at: new Date().toISOString(),
        })
        .eq("user_address", cleanAddress)
        .eq("source_tx_hash", matchHash);
    }

    if (error) {
      console.error("[Gateway Transfers API] DB Upsert error:", error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      transfer: data,
    });
  } catch (err: any) {
    console.error("[Gateway Transfers API] Exception in POST:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userParam = searchParams.get("user");
    const idParam = searchParams.get("id");

    if (!userParam || !userParam.startsWith("0x")) {
      return NextResponse.json(
        { success: false, error: "Valid user wallet address is required" },
        { status: 400 }
      );
    }

    const cleanUser = userParam.toLowerCase().trim();

    // 1. Rate Limiting Protection
    const rateLimitResponse = await checkRateLimit(req, cleanUser, {
      maxRequests: 20,
      windowMs: 60000,
    });
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    // 2. Authentication & Authorization Check
    const authResult = await authenticateGatewayUser(req, cleanUser);
    if (!authResult.authenticated) {
      return NextResponse.json(
        { success: false, error: authResult.error || "Unauthorized" },
        { status: 401 }
      );
    }

    // 3. Dismissal (Marks transfer as dismissed without deleting the record, ensuring recoverability)
    if (idParam) {
      const { error } = await supabaseAdmin
        .from("gateway_pending_transfers")
        .update({ status: "minted", destination_tx_hash: "0x_dismissed_by_user" })
        .eq("id", idParam)
        .eq("user_address", cleanUser);

      if (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      }
    } else {
      const { error } = await supabaseAdmin
        .from("gateway_pending_transfers")
        .update({ status: "minted", destination_tx_hash: "0x_dismissed_all" })
        .eq("user_address", cleanUser)
        .neq("status", "minted");

      if (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true, message: "Transfers dismissed from view." });
  } catch (err: any) {
    console.error("[Gateway Transfers API] Exception in DELETE:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
