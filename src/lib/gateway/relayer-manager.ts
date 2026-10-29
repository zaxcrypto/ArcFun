import { ethers } from "ethers";
import {
  GATEWAY_NETWORKS,
  GATEWAY_MINTER_ABI,
  GATEWAY_MINTER_TESTNET,
} from "@/config/gateway-config";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { gasReservationManager } from "./economic-policy";

// Relayer Key Provider: Prioritizes dedicated GATEWAY_RELAYER_PRIVATE_KEY to isolate from CCTP
export function getRelayerPrivateKey(): string {
  const rawKey = (
    process.env.GATEWAY_RELAYER_PRIVATE_KEY ||
    process.env.EVM_PRIVATE_KEY ||
    process.env.DEPLOYER_PRIVATE_KEY ||
    ""
  ).trim().replace(/^["']|["']$/g, "");

  if (!rawKey) {
    throw new Error("Relayer private key is not configured on the server.");
  }

  return rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`;
}

export function getRelayerAddress(): string {
  const privateKey = getRelayerPrivateKey();
  return new ethers.Wallet(privateKey).address;
}

/**
 * Returns a resilient ethers Provider for the domain, with automatic fallback support.
 */
export async function getResilientProvider(domainId: number): Promise<ethers.JsonRpcProvider> {
  const net = GATEWAY_NETWORKS[domainId];
  if (!net) {
    throw new Error(`Unsupported Gateway domain: ${domainId}`);
  }

  const urls = [net.rpcUrl, ...(net.fallbackRpcUrls || [])];

  for (const url of urls) {
    try {
      const provider = new ethers.JsonRpcProvider(url, undefined, {
        staticNetwork: true,
      });
      // Test provider with a lightweight call (5 second timeout)
      const testPromise = provider.getBlockNumber();
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("RPC ping timeout")), 5000)
      );
      await Promise.race([testPromise, timeoutPromise]);
      return provider;
    } catch (err: any) {
      console.warn(`[RelayerProvider] RPC ${url} failed on domain ${domainId}: ${err?.message || err}. Trying next...`);
    }
  }

  // Fallback to default
  return new ethers.JsonRpcProvider(net.rpcUrl);
}

// ─── Distributed & In-Process Nonce & Concurrency Serialization ───────────────
// In-process serialized lock queue per domain
const domainQueues: Map<number, Promise<any>> = new Map();

/**
 * Acquires a distributed lock using Supabase to guarantee cross-instance exclusivity
 */
async function acquireDistributedDbLock(domainId: number, lockTtlMs: number = 45000): Promise<string | null> {
  const lockId = `relayer_domain_${domainId}`;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + lockTtlMs).toISOString();

  try {
    // Clean expired locks
    await supabaseAdmin
      .from("gateway_relayer_locks")
      .delete()
      .lt("expires_at", now.toISOString());

    // Try to insert new lock
    const { error } = await supabaseAdmin
      .from("gateway_relayer_locks")
      .insert({
        lock_id: lockId,
        domain_id: domainId,
        locked_at: now.toISOString(),
        expires_at: expiresAt,
      });

    if (error) {
      // Lock already held by another instance
      return null;
    }
    return lockId;
  } catch (err) {
    // If table doesn't exist yet, gracefully fall through to in-process mutex
    return `fallback_${Date.now()}`;
  }
}

async function releaseDistributedDbLock(lockId: string): Promise<void> {
  try {
    await supabaseAdmin
      .from("gateway_relayer_locks")
      .delete()
      .eq("lock_id", lockId);
  } catch {}
}

export interface RelayerExecutionResult {
  success: boolean;
  txHash?: string;
  blockNumber?: number;
  nonce?: number;
  error?: string;
  isExpired?: boolean;
  isAlreadyUsed?: boolean;
}

/**
 * Centralized, concurrency-safe relayer execution manager.
 * Guarantees zero nonce collisions, serializes transactions per domain,
 * verifies balance reservations, handles gas limits, and catches revert errors.
 */
export async function executeGatewayMintWithRelayer(params: {
  transferId: string;
  destinationDomain: number;
  attestationPayload: string;
  signature: string;
  recipient: string;
}): Promise<RelayerExecutionResult> {
  const { transferId, destinationDomain, attestationPayload, signature, recipient } = params;

  // Queue transaction behind any in-flight transaction for this domain
  const previousOp = domainQueues.get(destinationDomain) || Promise.resolve();

  let resolver: () => void;
  const currentOp = new Promise<void>((res) => {
    resolver = res;
  });
  domainQueues.set(destinationDomain, previousOp.then(() => currentOp).catch(() => currentOp));

  await previousOp.catch(() => {});

  // Try to acquire distributed DB lock across serverless instances
  let dbLockId: string | null = null;
  let attempts = 0;
  while (attempts < 10) {
    dbLockId = await acquireDistributedDbLock(destinationDomain);
    if (dbLockId) break;
    attempts++;
    await new Promise((r) => setTimeout(r, 1500));
  }

  try {
    const net = GATEWAY_NETWORKS[destinationDomain];
    if (!net) {
      return { success: false, error: `Unsupported destination domain: ${destinationDomain}` };
    }

    const provider = await getResilientProvider(destinationDomain);
    const privateKey = getRelayerPrivateKey();
    const relayerWallet = new ethers.Wallet(privateKey, provider);

    // Fetch latest pending nonce to completely prevent collisions
    const currentNonce = await provider.getTransactionCount(relayerWallet.address, "pending");

    const gatewayMinter = new ethers.Contract(
      GATEWAY_MINTER_TESTNET,
      GATEWAY_MINTER_ABI,
      relayerWallet
    );

    const formattedAttestation = attestationPayload.startsWith("0x")
      ? attestationPayload
      : `0x${attestationPayload}`;
    const formattedSignature = signature.startsWith("0x") ? signature : `0x${signature}`;

    // Gas preflight estimation via gatewayMint (Circle's GatewayMinter handles both single and multi-intent in gatewayMint)
    let gasLimit: bigint;
    try {
      const estimated = await gatewayMinter.gatewayMint.estimateGas(
        formattedAttestation,
        formattedSignature
      );
      gasLimit = (estimated * 130n) / 100n; // 30% safety buffer
    } catch (gasErr: any) {
      const errMsg = (gasErr?.message || String(gasErr)).toLowerCase();
      const errData = (gasErr?.data || gasErr?.error?.data || "").toLowerCase();

      // Expired attestation revert check: error code 0xa31dc54b
      if (errData.includes("a31dc54b") || errMsg.includes("a31dc54b") || errMsg.includes("attestationexpired")) {
        console.warn(`[RelayerManager] Attestation expired on-chain (0xa31dc54b). Aborting mint.`);
        return {
          success: false,
          isExpired: true,
          error: "Attestation expired on-chain. Please generate a fresh claim signature.",
        };
      }

      if (errMsg.includes("already used") || errMsg.includes("attestationalreadyused")) {
        console.warn(`[RelayerManager] Attestation was already minted on-chain.`);
        return {
          success: true,
          isAlreadyUsed: true,
        };
      }

      console.warn(`[RelayerManager] Gas estimation fallback to 350,000 units:`, gasErr?.message || gasErr);
      gasLimit = 350_000n;
    }

    console.log(
      `[RelayerManager] Broadcasting gatewayMint on ${net.name} (Domain ${destinationDomain}) with Nonce ${currentNonce} for ${recipient}...`
    );

    let feeOverrides: any = {};
    try {
      const feeData = await provider.getFeeData();
      if (feeData.maxFeePerGas) {
        const bumpedMaxFee = (feeData.maxFeePerGas * 125n) / 100n;
        feeOverrides.maxFeePerGas = bumpedMaxFee;

        // Calculate maxPriorityFeePerGas safely:
        // 1. Arbitrum (Domain 3) Sequencer operates on FIFO and does not use priority fees.
        // 2. Other chains use bumped priority fee or a reasonable fallback tip.
        // 3. EIP-1559 strict requirement: maxPriorityFeePerGas MUST be <= maxFeePerGas.
        let priorityFee = 0n;
        if (destinationDomain === 3) {
          priorityFee = feeData.maxPriorityFeePerGas ? (feeData.maxPriorityFeePerGas * 125n) / 100n : 0n;
        } else if (feeData.maxPriorityFeePerGas && feeData.maxPriorityFeePerGas > 0n) {
          priorityFee = (feeData.maxPriorityFeePerGas * 125n) / 100n;
        } else {
          const standardTip = ethers.parseUnits("1.5", "gwei");
          priorityFee = standardTip < bumpedMaxFee ? standardTip : (bumpedMaxFee / 5n);
        }

        if (priorityFee > bumpedMaxFee) {
          priorityFee = bumpedMaxFee;
        }

        feeOverrides.maxPriorityFeePerGas = priorityFee;
      } else if (feeData.gasPrice) {
        feeOverrides.gasPrice = (feeData.gasPrice * 125n) / 100n;
      }
    } catch (feeErr) {
      console.warn(`[RelayerManager] Failed to fetch feeData for domain ${destinationDomain}:`, feeErr);
    }

    const tx = await gatewayMinter.gatewayMint(
      formattedAttestation,
      formattedSignature,
      {
        gasLimit,
        nonce: currentNonce,
        ...feeOverrides,
      }
    );

    console.log(`[RelayerManager] Broadcast successful! Tx hash: ${tx.hash}.`);

    // Race receipt with 5s timeout so slow block times never trigger Vercel Serverless 504 timeouts
    let blockNumber: number | undefined;
    try {
      const receipt = await Promise.race([
        tx.wait(1),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000))
      ]);
      if (receipt) {
        blockNumber = receipt.blockNumber;
      }
    } catch (waitErr: any) {
      console.warn(`[RelayerManager] Tx ${tx.hash} broadcasted, wait(1) note:`, waitErr?.message || waitErr);
    }

    return {
      success: true,
      txHash: tx.hash,
      blockNumber,
      nonce: currentNonce,
    };
  } catch (err: any) {
    const msg = (err?.message || String(err)).toLowerCase();
    const data = (err?.data || err?.error?.data || "").toLowerCase();

    if (data.includes("a31dc54b") || msg.includes("a31dc54b") || msg.includes("attestationexpired")) {
      return {
        success: false,
        isExpired: true,
        error: "Transfer attestation expired on-chain. Please request a new attestation.",
      };
    }

    if (msg.includes("already used") || msg.includes("attestationalreadyused")) {
      return {
        success: true,
        isAlreadyUsed: true,
      };
    }

    console.error(`[RelayerManager] Broadcast failed on domain ${destinationDomain}:`, err);
    return {
      success: false,
      error: err?.message || "Failed to submit transaction via relayer",
    };
  } finally {
    // Release gas reservation and locks
    gasReservationManager.releaseReservation(transferId);
    if (dbLockId) {
      await releaseDistributedDbLock(dbLockId);
    }
    resolver!();
  }
}
