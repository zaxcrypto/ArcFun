/**
 * Arc Testnet Explorer API (Blockscout-compatible)
 * Base: https://testnet.arcscan.app/api
 */

const BASE = "https://testnet.arcscan.app/api";

export interface ArcTx {
  hash: string;
  from: string;
  to: string;
  value: string;
  gasUsed: string;
  gasPrice: string;
  timeStamp: string; // unix seconds (string)
  blockNumber: string;
  isError: string;
  methodId: string;
  input: string;
  contractAddress: string;
}



export interface ArcAccountStats {
  balance: string;
  txCount: number;
  receivedTxCount: number;
  internalTxCount: number;
  tokenTxCount: number;
  firstTxDate: Date | null;
  lastTxDate: Date | null;
  activeDays: number;
  activeWeeks: number;
  activeMonths: number;
  dayStreak: number;
  perDayActivity: Record<string, number>;
  unfinalizedDays: string[];
  contractsDeployed: number;
  totalGasUsed: number;
  uniqueInteractions: number;
  needsSync: boolean;
  cooldownUntil: string | null;
  loading: boolean;
  error: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const EXPLORER_TIMEOUT_MS = 60_000; // 60 seconds (increased from 15)

export async function apiGet(params: Record<string, string>, network: 'testnet' | 'mainnet' | 'giwa' = 'testnet'): Promise<unknown> {
  const endpoint = network === 'mainnet' 
    ? 'https://arc-mainnet.cloud.blockscout.com/api' 
    : network === 'giwa'
      ? 'https://sepolia-explorer.giwa.io/api'
      : BASE;
  const url = new URL(endpoint);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  if (process.env.NEXT_PUBLIC_ARC_API_KEY) {
    url.searchParams.set("apikey", process.env.NEXT_PUBLIC_ARC_API_KEY);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), EXPLORER_TIMEOUT_MS);
  const startTime = Date.now();

  try {
    const res = await fetch(url.toString(), { cache: "no-store", signal: controller.signal });
    const duration = Date.now() - startTime;

    if (!res.ok) {
      console.error(JSON.stringify({ level: 'ERROR', event: 'EXPLORER_HTTP_ERROR', status: res.status, action: params.action, duration }));
      throw new Error(`HTTP ${res.status}`);
    }

    const json = await res.json() as { status?: string; message?: string; result?: unknown };
    if (json.message === "NOTOK") {
      console.warn(JSON.stringify({ level: 'WARN', event: 'EXPLORER_NOTOK', action: params.action, result: String(json.result).substring(0, 100), duration }));
      throw new Error(String(json.result));
    }

    // Log slow Explorer calls (> 5s)
    if (duration > 5000) {
      console.warn(JSON.stringify({ level: 'WARN', event: 'EXPLORER_SLOW', action: params.action, duration }));
    }

    return json.result;
  } catch (err: any) {
    if (err.name === 'AbortError') {
      const duration = Date.now() - startTime;
      console.error(JSON.stringify({ level: 'ERROR', event: 'EXPLORER_TIMEOUT', action: params.action, timeoutMs: EXPLORER_TIMEOUT_MS, duration }));
      throw new Error(`Explorer timeout after ${EXPLORER_TIMEOUT_MS}ms (action: ${params.action})`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}



// ─── Main Export ─────────────────────────────────────────────────────────────

export async function fetchArcStats(
  address: string, 
  forceRefresh: boolean = false,
  network: 'testnet' | 'mainnet' | 'giwa' = 'testnet'
): Promise<ArcAccountStats> {
  const addr = address.toLowerCase();

  const empty: ArcAccountStats = {
    balance: "0",
    txCount: 0,
    receivedTxCount: 0,
    internalTxCount: 0,
    tokenTxCount: 0,
    firstTxDate: null,
    lastTxDate: null,
    activeDays: 0,
    activeWeeks: 0,
    activeMonths: 0,
    dayStreak: 0,
    perDayActivity: {},
    unfinalizedDays: [],
    contractsDeployed: 0,
    totalGasUsed: 0,
    uniqueInteractions: 0,
    loading: false,
    error: null,
    needsSync: false,
    cooldownUntil: null,
  };

  try {
    const t = forceRefresh ? `&_t=${Date.now()}` : '';
    const res = await fetch(`/api/profile/analytics?address=${addr}&network=${network}${t}`, { 
      cache: forceRefresh ? 'no-store' : 'default' 
    });
    if (!res.ok) throw new Error("Failed to fetch analytics");
    
    // We import the type dynamically or just assert any for the adapter since it's temporary
    const data = await res.json();
    const { balance, analytics, heatmap, needsSync } = data;

    // Trigger background sync if needed (fire and forget)
    if (needsSync && network !== 'mainnet') {
      fetch('/api/profile/sync/chunk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: addr, isManual: false, network })
      }).catch(() => {});
    }

    const firstTx = analytics.first_tx_date ? new Date(analytics.first_tx_date) : null;
    const lastTx = analytics.last_tx_date ? new Date(analytics.last_tx_date) : null;

    const activeWeeks = Math.floor((heatmap.activeDays || 0) / 7);
    const uniqueMonths = new Set(Object.keys(heatmap.dailyCounts || {}).map(date => date.substring(0, 7)));
    const activeMonths = uniqueMonths.size;

    return {
      balance: balance || "0",
      txCount: analytics.sent_count || 0,
      receivedTxCount: analytics.received_count || 0,
      internalTxCount: analytics.internal_tx_count || 0,
      tokenTxCount: analytics.token_transfer_count || 0,
      firstTxDate: firstTx,
      lastTxDate: lastTx,
      activeDays: heatmap.activeDays || 0,
      activeWeeks: activeWeeks,
      activeMonths: activeMonths,
      dayStreak: heatmap.currentStreak || 0,
      perDayActivity: heatmap.dailyCounts || {},
      unfinalizedDays: heatmap.unfinalizedDays || [],
      contractsDeployed: analytics.contracts_deployed || 0,
      totalGasUsed: analytics.total_gas_used || 0,
      uniqueInteractions: analytics.uniqueInteractions || 0,
      loading: false,
      error: null,
      needsSync: needsSync,
      cooldownUntil: analytics.cooldown_until || null,
    };
  } catch (err) {
    console.error("fetchArcStats adapter error:", err);
    return { ...empty, unfinalizedDays: [], error: "true" }; // Error state
  }
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

export function formatBalance(wei: string, decimals = 18): string {
  try {
    const val = Number(BigInt(wei)) / Math.pow(10, decimals);
    if (val === 0) return "0";
    if (val < 0.0001) return "<0.0001";
    return val.toLocaleString("en-US", { maximumFractionDigits: 4 });
  } catch {
    return "0";
  }
}

export function formatDate(date: Date | null): string {
  if (!date) return "—";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function formatRelative(date: Date | null): string {
  if (!date) return "—";
  const diff = Date.now() - date.getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}
