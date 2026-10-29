import { encodeFunctionData } from "viem";
import { GATEWAY_NETWORKS, GATEWAY_MINTER_TESTNET, GATEWAY_MINTER_ABI } from "@/config/gateway-config";

export interface OnChainAttestationStatus {
  isAlreadyMinted: boolean;
  isExpired: boolean;
  canMint: boolean;
  error?: string;
}

/**
 * Checks on-chain whether an attestation payload has already been minted or expired.
 * Simulates calling `gatewayMint(attestationPayload, signature)` on the destination RPC.
 */
export async function checkAttestationOnChain(
  destDomain: number,
  attestationPayload?: string,
  signature?: string
): Promise<OnChainAttestationStatus> {
  if (!attestationPayload || !signature) {
    return { isAlreadyMinted: false, isExpired: false, canMint: false, error: "Missing attestation or signature" };
  }

  try {
    const network = GATEWAY_NETWORKS[destDomain];
    if (!network || !network.rpcUrl) {
      return { isAlreadyMinted: false, isExpired: false, canMint: true };
    }

    const formattedAttestation = (attestationPayload.startsWith("0x") ? attestationPayload : `0x${attestationPayload}`) as `0x${string}`;
    const formattedSignature = (signature.startsWith("0x") ? signature : `0x${signature}`) as `0x${string}`;

    const callData = encodeFunctionData({
      abi: GATEWAY_MINTER_ABI,
      functionName: "gatewayMint",
      args: [formattedAttestation, formattedSignature],
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const rpcRes = await fetch(network.rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_call",
        params: [
          {
            to: GATEWAY_MINTER_TESTNET,
            data: callData,
          },
          "latest",
        ],
      }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeoutId));

    const json = await rpcRes.json();

    if (json.error) {
      const errMsg = (json.error.message || "").toLowerCase();
      const errData = (json.error.data || "").toLowerCase();

      // Check for already minted/used
      if (
        errMsg.includes("already used") ||
        errMsg.includes("attestationalreadyused") ||
        errData.includes("9edf6cf9") ||
        errData.includes("83825700")
      ) {
        return { isAlreadyMinted: true, isExpired: false, canMint: false };
      }

      // Check for expired
      if (
        errMsg.includes("expired") ||
        errMsg.includes("attestationexpired") ||
        errData.includes("a31dc54b") ||
        errData.includes("b1c88311")
      ) {
        return { isAlreadyMinted: false, isExpired: true, canMint: false };
      }
    }

    // If simulation did not return an already-used or expired revert, it may still be mintable
    return { isAlreadyMinted: false, isExpired: false, canMint: true };
  } catch (err: any) {
    return { isAlreadyMinted: false, isExpired: false, canMint: true, error: err?.message };
  }
}
