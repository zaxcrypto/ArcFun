import { ethers } from "ethers";
import { GATEWAY_NETWORKS } from "@/config/gateway-config";
import { getLiveAssetPriceUsd } from "./price-oracle";

// Conservative gas limit for gatewayMint execution
export const GATEWAY_MINT_GAS_UNITS = 350_000n;

/**
 * Minimum fee in USDC (6 decimals) required to qualify for ArcFun Relayer sponsorship.
 * Any transfer with platform fee below 0.04 USDC (~$4 transfer) must use Manual Claim
 * so ArcFun never pays gas at a predictable financial loss.
 */
export const MIN_SPONSORED_FEE_USDC_UNITS = 40_000n; // 0.04 USDC

export interface GasCostEstimation {
  gasLimit: bigint;
  gasPriceWei: bigint;
  estimatedCostWei: bigint;
  estimatedCostUsd: number;
  nativeSymbol: string;
}

/**
 * Estimates destination gas cost in wei and USD for a gatewayMint execution.
 */
export async function estimateDestinationGasCost(
  provider: ethers.Provider,
  domainId: number
): Promise<GasCostEstimation> {
  const net = GATEWAY_NETWORKS[domainId];
  if (!net) {
    throw new Error(`Unsupported domain ${domainId} for gas estimation`);
  }

  let gasPriceWei = ethers.parseUnits("20", "gwei");
  try {
    const feeData = await provider.getFeeData();
    if (feeData.gasPrice || feeData.maxFeePerGas) {
      gasPriceWei = feeData.maxFeePerGas || feeData.gasPrice || gasPriceWei;
    }
  } catch (err) {
    console.warn(`[GasPolicy] Failed to fetch feeData on domain ${domainId}, using fallback 20 gwei:`, err);
  }

  const gasLimit = GATEWAY_MINT_GAS_UNITS;
  const estimatedCostWei = gasLimit * gasPriceWei;

  const nativeSymbol = net.nativeCurrency.symbol;
  // Fetch live price: Chainlink on-chain → CoinGecko API → hardcoded fallback
  const { priceUsd, source: priceSource } = await getLiveAssetPriceUsd(nativeSymbol);
  if (priceSource !== "chainlink") {
    console.warn(`[GasPolicy] Using ${priceSource} price for ${nativeSymbol}: $${priceUsd.toFixed(2)}`);
  }
  const costNative = parseFloat(ethers.formatUnits(estimatedCostWei, net.nativeCurrency.decimals));
  const estimatedCostUsd = costNative * priceUsd;

  return {
    gasLimit,
    gasPriceWei,
    estimatedCostWei,
    estimatedCostUsd,
    nativeSymbol,
  };
}

/**
 * Checks whether sponsoring a transfer is economically safe for ArcFun.
 * Prevents negative economic spread and gas drain attacks.
 */
export function isSponsorshipEconomicallySafe(
  feeUnits: bigint,
  gasCostUsd: number,
  isTestnet: boolean = false
): { safe: boolean; reason?: string } {
  // On testnet networks (Base Sepolia, Arc Testnet, Fuji, etc.), gas is free testnet faucet currency
  // and ArcFun backend wallet sponsors all legitimate user transfers.
  if (isTestnet) {
    return { safe: true };
  }

  if (feeUnits <= 0n) {
    return {
      safe: false,
      reason: "Platform fee is 0 USDC. ArcFun Relayer cannot sponsor gas for 0-fee transfers. Please use Manual Claim.",
    };
  }

  if (feeUnits < MIN_SPONSORED_FEE_USDC_UNITS) {
    return {
      safe: false,
      reason: `Platform fee ($${(Number(feeUnits) / 1e6).toFixed(4)} USDC) is below the minimum sponsored threshold ($0.04 USDC). Please use Manual Claim to self-mint.`,
    };
  }

  const feeUsd = Number(feeUnits) / 1e6;
  // Net fee must cover destination gas cost (with 15% margin)
  if (feeUsd < gasCostUsd * 0.85) {
    return {
      safe: false,
      reason: `Current network gas cost ($${gasCostUsd.toFixed(3)}) exceeds platform fee ($${feeUsd.toFixed(3)}). To protect relayer solvency, please use Manual Claim.`,
    };
  }

  return { safe: true };
}

// ─── Concurrency-Safe Gas Reservation Manager ────────────────────────────────
interface ActiveReservation {
  id: string;
  domainId: number;
  gasAmountWei: bigint;
  expiresAt: number;
}

class GasReservationManager {
  private reservations: Map<string, ActiveReservation> = new Map();
  private static RESERVATION_TTL_MS = 3 * 60 * 1000; // 3 minutes timeout

  /**
   * Sweeps expired reservations to prevent leaks
   */
  private sweepExpired() {
    const now = Date.now();
    for (const [id, res] of this.reservations.entries()) {
      if (now > res.expiresAt) {
        this.reservations.delete(id);
      }
    }
  }

  /**
   * Gets total currently reserved gas in wei for a given domain
   */
  getReservedGasWei(domainId: number): bigint {
    this.sweepExpired();
    let total = 0n;
    for (const res of this.reservations.values()) {
      if (res.domainId === domainId) {
        total += res.gasAmountWei;
      }
    }
    return total;
  }

  /**
   * Atomically checks available balance against reserved gas and acquires a reservation.
   * Returns true if reservation was successful, false if insufficient capacity.
   */
  acquireReservation(
    id: string,
    domainId: number,
    totalBalanceWei: bigint,
    requiredGasWei: bigint
  ): { success: boolean; availableWei: bigint; reservedWei: bigint } {
    this.sweepExpired();
    const currentReserved = this.getReservedGasWei(domainId);
    const availableWei = totalBalanceWei > currentReserved ? totalBalanceWei - currentReserved : 0n;

    // Must have enough capacity for this required gas + a 1.5x buffer
    const needed = (requiredGasWei * 150n) / 100n;
    if (availableWei < needed) {
      return { success: false, availableWei, reservedWei: currentReserved };
    }

    this.reservations.set(id, {
      id,
      domainId,
      gasAmountWei: requiredGasWei,
      expiresAt: Date.now() + GasReservationManager.RESERVATION_TTL_MS,
    });

    return { success: true, availableWei, reservedWei: currentReserved + requiredGasWei };
  }

  /**
   * Releases a reservation upon transaction confirmation, failure, or cancellation.
   */
  releaseReservation(id: string): void {
    this.reservations.delete(id);
  }
}

export const gasReservationManager = new GasReservationManager();
