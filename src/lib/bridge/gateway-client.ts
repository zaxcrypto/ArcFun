import { CIRCLE_GATEWAY_API_TESTNET } from "@/config/gateway-config";

/**
 * Strongly Typed Circle Gateway REST API Client (Testnet)
 * 
 * Interacts with Circle Gateway endpoints according to OpenAPI Specification:
 * - POST /v1/balances
 * - POST /v1/deposits
 * - POST /v1/estimate
 * - POST /v1/transfer
 * - GET  /v1/transfer/{id}
 * - GET  /v1/info
 */

export interface GatewayBalanceSource {
  domain: number;
  depositor: string;
  balance: string; // Balance in USDC string (e.g. "10.500000")
}

export interface GatewayBalancesResponse {
  token: string;
  balances: GatewayBalanceSource[];
}

export interface GatewayPendingDeposit {
  domain: number;
  depositor: string;
  amount: string;
  status: string;
  transactionHash?: string;
  blockHeight?: string;
}

export interface GatewayDepositsResponse {
  deposits?: GatewayPendingDeposit[];
}

export interface GatewayEstimateFeeSummary {
  total: string;
  token: string;
  forwardingFee?: string;
  perIntent: Array<{
    transferSpecHash: string;
    domain: number;
    baseFee: string;
    transferFee?: string;
  }>;
}

export interface GatewayEstimateResponse {
  body: Array<{
    burnIntent?: any;
    burnIntentSet?: any;
  }>;
  fees: GatewayEstimateFeeSummary;
}

export interface GatewayTransferResponse {
  transferId: string;
  attestation?: string; // Byte-encoded attestation or attestation set
  signature?: string;   // Operator signature
  fees: GatewayEstimateFeeSummary;
  expirationBlock?: string;
}

export interface GatewayTransferDetails {
  transferId?: string;
  destinationDomain: number;
  status: "pending" | "confirmed" | "finalized" | "failed" | "expired";
  transactionHash?: string;
  burnIntents?: Array<{
    transferSpecHash: string;
    maxBlockHeight: string;
    maxFee: string;
  }>;
  attestation?: {
    payload: string;
    signature: string;
    expirationBlock: string;
  };
  forwardingDetails?: {
    forwardingEnabled: boolean;
    failureReason?: string;
  };
}

export class CircleGatewayClient {
  private static baseUrl = CIRCLE_GATEWAY_API_TESTNET;

  /**
   * Fetch live unified token balance for a depositor across all Gateway domains
   */
  static async getBalances(depositor: string, token: string = "USDC"): Promise<GatewayBalancesResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/v1/balances`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          sources: [
            { depositor: depositor.toLowerCase() }
          ],
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.warn(`[CircleGatewayClient] getBalances failed (${response.status}):`, errText);
        return { token, balances: [] };
      }

      return await response.json();
    } catch (error) {
      console.error("[CircleGatewayClient] getBalances exception:", error);
      return { token, balances: [] };
    }
  }

  /**
   * Fetch pending deposits that are awaiting finality confirmations
   */
  static async getDeposits(depositor: string, token: string = "USDC"): Promise<GatewayDepositsResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/v1/deposits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          sources: [
            { depositor: depositor.toLowerCase() }
          ],
        }),
      });

      if (!response.ok) {
        return { deposits: [] };
      }

      return await response.json();
    } catch (error) {
      console.error("[CircleGatewayClient] getDeposits exception:", error);
      return { deposits: [] };
    }
  }

  /**
   * Calculate exact fees and expiration block heights for a proposed BurnIntent
   */
  static async estimateTransfer(
    partialBurnIntents: any[],
    enableForwarder: boolean = false
  ): Promise<GatewayEstimateResponse> {
    const url = `${this.baseUrl}/v1/estimate${enableForwarder ? "?enableForwarder=true" : ""}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(partialBurnIntents, (_k, v) => (typeof v === "bigint" ? v.toString() : v)),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Fee estimation failed: ${errText || response.statusText}`);
    }

    return await response.json();
  }

  /**
   * Submit signed BurnIntent to Circle Gateway API to generate attestation and operator signature
   */
  static async createTransferAttestation(
    signedRequests: any[],
    enableForwarder: boolean = false
  ): Promise<GatewayTransferResponse> {
    const url = `${this.baseUrl}/v1/transfer${enableForwarder ? "?enableForwarder=true" : ""}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(signedRequests, (_k, v) => (typeof v === "bigint" ? v.toString() : v)),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gateway attestation request failed: ${errText || response.statusText}`);
    }

    return await response.json();
  }

  /**
   * Track status of in-flight transfer by transferId
   */
  static async getTransferById(transferId: string): Promise<GatewayTransferDetails> {
    const response = await fetch(`${this.baseUrl}/v1/transfer/${transferId}`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Failed to fetch transfer status: ${errText || response.statusText}`);
    }

    return await response.json();
  }

  /**
   * Poll transfer status until attestation is ready or transfer is finalized/failed.
   * As documented by Circle, POST /v1/transfer may omit top-level attestation fields,
   * requiring polling GET /v1/transfer/{id}.
   */
  static async pollTransferStatus(
    transferId: string,
    maxAttempts: number = 20,
    intervalMs: number = 2000
  ): Promise<GatewayTransferDetails> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const details = await this.getTransferById(transferId);
        if (details.attestation?.payload || details.status === "confirmed" || details.status === "finalized") {
          return details;
        }
        if (details.status === "failed" || details.status === "expired") {
          throw new Error(`Transfer ${transferId} reached terminal state: ${details.status}`);
        }
      } catch (err: any) {
        if (err?.message?.includes("terminal state")) throw err;
        console.warn(`[CircleGatewayClient] Polling attempt ${attempt + 1}/${maxAttempts} warning:`, err);
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
    return await this.getTransferById(transferId);
  }

  /**
   * Fetch Gateway metadata and latest confirmed block heights
   */
  static async getGatewayInfo(): Promise<any> {
    const response = await fetch(`${this.baseUrl}/v1/info`);
    if (!response.ok) {
      throw new Error("Failed to fetch Gateway Info");
    }
    return await response.json();
  }
}
