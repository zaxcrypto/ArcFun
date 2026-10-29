import { isMainnetChain } from "@/config/swap-contract";

export interface TxHistoryEntry {
  id: string;
  txHash: string;
  burnHash?: string;
  mintHash?: string;
  type: "swap" | "bridge_native" | "bridge_cctp";
  status: "success" | "failed" | "pending";
  amount: string;
  fromAsset: string;
  toAsset?: string;
  sourceChain: string;
  destChain?: string;
  timestamp: number;
  userAddress?: string;
  failureReason?: string;
  provider?: string;
  executionRoute?: string[];
  gasCostUSD?: number;
  feesUSD?: number;
}

function resolveEnv(mode?: "testnet" | "mainnet", sourceChain?: string): "testnet" | "mainnet" {
  if (mode) return mode;
  if (sourceChain && isMainnetChain(sourceChain)) return "mainnet";
  if (typeof window !== "undefined") {
    const saved = localStorage.getItem("arcfun-env");
    if (saved === "mainnet") return "mainnet";
  }
  return "testnet";
}

export function saveTxHistory(entry: TxHistoryEntry, mode?: "testnet" | "mainnet") {
  if (typeof window === "undefined") return;
  const env = resolveEnv(mode, entry.sourceChain);
  const storageKey = `arcfun_tx_history_${env}`;
  const existing = getTxHistory(env);
  const updated = [entry, ...existing.filter(e => e.txHash !== entry.txHash)];
  localStorage.setItem(storageKey, JSON.stringify(updated.slice(0, 100)));

  // Dispatch custom event so all open components (including Pending History) update instantly
  try {
    window.dispatchEvent(new CustomEvent('arc-history-updated', { detail: { walletAddress: entry.userAddress, mode: env } }));
  } catch (_) {}
}

export function getTxHistory(mode?: "testnet" | "mainnet"): TxHistoryEntry[] {
  if (typeof window === "undefined") return [];
  const env = resolveEnv(mode);
  const storageKey = `arcfun_tx_history_${env}`;
  try {
    const data = localStorage.getItem(storageKey);
    if (data) return JSON.parse(data);

    // Backward compatibility for existing testnet history
    if (env === "testnet") {
      const legacy = localStorage.getItem("arcfun_tx_history");
      if (legacy) {
        const parsed: TxHistoryEntry[] = JSON.parse(legacy);
        return parsed.filter(item => !isMainnetChain(item.sourceChain || ""));
      }
    }
    return [];
  } catch {
    return [];
  }
}
