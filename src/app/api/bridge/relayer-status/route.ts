import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  checkDestinationRelayerGas,
  checkUserDestinationGas,
  MIN_OPERATIONAL_RESERVE_USD,
} from "@/lib/bridge/gas-monitor";
import { ChainRegistry } from "@/lib/bridge/chain-registry";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return handleStatusRequest(req);
}

export async function POST(req: NextRequest) {
  return handleStatusRequest(req);
}

async function handleStatusRequest(req: NextRequest) {
  try {
    // 1. Rate Limiting Protection (Max 45 status checks per minute per IP)
    const rateLimitResponse = await checkRateLimit(req, undefined, {
      maxRequests: 45,
      windowMs: 60000,
    });
    if (rateLimitResponse) return rateLimitResponse;

    const { searchParams } = new URL(req.url);
    let targetChain = searchParams.get("chain");
    const userWallet = searchParams.get("user_wallet");

    // Allow POST body as fallback
    if (!targetChain && req.method === "POST") {
      try {
        const body = await req.json();
        targetChain = body.chain || null;
      } catch (_) {}
    }

    // Single Chain Status
    if (targetChain) {
      const gasStatus = await checkDestinationRelayerGas(targetChain);

      let userGas = null;
      if (userWallet) {
        userGas = await checkUserDestinationGas({
          destinationChain: targetChain,
          userAddress: userWallet,
        });
      }

      return NextResponse.json({
        success: true,
        ...gasStatus,
        userGas,
      });
    }

    // All active chains status summary
    const activeChains = ChainRegistry.getActiveChains("testnet");
    const checks = await Promise.all(
      activeChains.map((c) => checkDestinationRelayerGas(c.name))
    );

    const summary: Record<string, any> = {};
    for (const item of checks) {
      summary[item.chain] = item;
    }

    return NextResponse.json({
      success: true,
      minOperationalReserveUsd: MIN_OPERATIONAL_RESERVE_USD,
      chains: summary,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("[Bridge Relayer Status API] Error:", error);
    return NextResponse.json(
      {
        success: false,
        isSponsoredAvailable: false,
        error: error?.message || "Failed to check relayer status",
      },
      { status: 500 }
    );
  }
}
