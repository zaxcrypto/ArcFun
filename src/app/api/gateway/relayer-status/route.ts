import { NextResponse } from "next/server";
import { ethers } from "ethers";
import {
  GATEWAY_NETWORKS,
  isGatewayDomainSupported,
} from "@/config/gateway-config";
import { checkRateLimit } from "@/lib/rate-limit";
import { isSponsoredMintEnabled } from "@/lib/gateway/emergency-switch";
import {
  gasReservationManager,
  estimateDestinationGasCost,
} from "@/lib/gateway/economic-policy";
import {
  getRelayerPrivateKey,
  getResilientProvider,
  getRelayerAddress,
} from "@/lib/gateway/relayer-manager";

export const dynamic = "force-dynamic";

// Short-lived server-side cache (10 seconds) to prevent RPC hammering across concurrent user visits
interface CachedDomainStatus {
  timestamp: number;
  data: any;
}
const statusCache = new Map<number, CachedDomainStatus>();
const CACHE_TTL_MS = 10_000;

export async function GET(req: Request) {
  try {
    // 1. Rate Limiting Protection (Max 30 status checks per minute per IP)
    const rateLimitResponse = await checkRateLimit(req, undefined, {
      maxRequests: 30,
      windowMs: 60000,
    });
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const { searchParams } = new URL(req.url);
    const domainParam = searchParams.get("domain");

    // 2. Validate Relayer Key
    let relayerAddress: string;
    try {
      getRelayerPrivateKey();
      relayerAddress = getRelayerAddress();
    } catch {
      return NextResponse.json(
        {
          success: false,
          isSponsoredAvailable: false,
          error: "Relayer not configured on server",
        },
        { status: 500 }
      );
    }

    // 3. Domain Resolution & Allowlist
    const targetDomain = domainParam !== null ? parseInt(domainParam, 10) : undefined;
    if (targetDomain !== undefined && !isGatewayDomainSupported(targetDomain)) {
      return NextResponse.json(
        { success: false, error: `Unsupported or invalid domain: ${domainParam}` },
        { status: 400 }
      );
    }

    const networksToCheck = targetDomain !== undefined
      ? [GATEWAY_NETWORKS[targetDomain]]
      : Object.values(GATEWAY_NETWORKS);

    const now = Date.now();
    const results: Record<number, any> = {};

    for (const net of networksToCheck) {
      // Check cache first
      const cached = statusCache.get(net.domainId);
      if (cached && now - cached.timestamp < CACHE_TTL_MS) {
        results[net.domainId] = cached.data;
        continue;
      }

      // Check emergency kill switch
      const killSwitch = isSponsoredMintEnabled(net.domainId);
      if (!killSwitch.enabled) {
        const item = {
          domain: net.domainId,
          chainName: net.name,
          nativeSymbol: net.nativeCurrency.symbol,
          balance: "0",
          availableBalance: "0",
          reservedGas: "0",
          requiredReserve: "0",
          isSponsoredAvailable: false,
          reason: killSwitch.reason,
        };
        results[net.domainId] = item;
        statusCache.set(net.domainId, { timestamp: now, data: item });
        continue;
      }

      try {
        const provider = await getResilientProvider(net.domainId);
        const [totalBalance, gasEst] = await Promise.all([
          provider.getBalance(relayerAddress),
          estimateDestinationGasCost(provider, net.domainId),
        ]);

        const reservedGasWei = gasReservationManager.getReservedGasWei(net.domainId);
        const availableBalanceWei = totalBalance > reservedGasWei ? totalBalance - reservedGasWei : 0n;

        // Required reserve must cover estimated cost with 1.5x buffer
        const requiredReserveWei = (gasEst.estimatedCostWei * 150n) / 100n;
        const isAvailable = availableBalanceWei >= requiredReserveWei;

        const item = {
          domain: net.domainId,
          chainName: net.name,
          nativeSymbol: net.nativeCurrency.symbol,
          balance: ethers.formatUnits(totalBalance, net.nativeCurrency.decimals),
          availableBalance: ethers.formatUnits(availableBalanceWei, net.nativeCurrency.decimals),
          reservedGas: ethers.formatUnits(reservedGasWei, net.nativeCurrency.decimals),
          requiredReserve: ethers.formatUnits(requiredReserveWei, net.nativeCurrency.decimals),
          isSponsoredAvailable: isAvailable,
          estimatedGasCost: ethers.formatUnits(gasEst.estimatedCostWei, net.nativeCurrency.decimals),
          estimatedGasCostUsd: gasEst.estimatedCostUsd.toFixed(4),
        };

        results[net.domainId] = item;
        statusCache.set(net.domainId, { timestamp: now, data: item });
      } catch (err: any) {
        console.warn(`[Relayer Status] Check failed on ${net.name}:`, err?.message || err);
        const item = {
          domain: net.domainId,
          chainName: net.name,
          nativeSymbol: net.nativeCurrency.symbol,
          balance: "0",
          availableBalance: "0",
          reservedGas: "0",
          requiredReserve: "0",
          isSponsoredAvailable: false,
          error: "RPC node temporarily unavailable",
        };
        results[net.domainId] = item;
      }
    }

    if (targetDomain !== undefined) {
      return NextResponse.json({
        success: true,
        relayerAddress,
        ...results[targetDomain],
      });
    }

    return NextResponse.json({
      success: true,
      relayerAddress,
      networks: results,
    });
  } catch (error: any) {
    console.error("[Relayer Status] Error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to check relayer status" },
      { status: 500 }
    );
  }
}
