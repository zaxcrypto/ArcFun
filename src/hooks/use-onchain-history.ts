import { useState, useEffect, useCallback, useRef } from "react";
import { usePublicClient, useAccount } from "wagmi";
import { parseAbiItem, formatUnits } from "viem";
import { TxHistoryEntry, getTxHistory, saveTxHistory } from "@/lib/tx-history-store";
import { ARCFUN_SWAP_ADDRESS, USDC_ADDRESS } from "@/config/swap-contract";
import { supabase } from "@/lib/supabase";
import { useEnvironment } from "@/contexts/EnvironmentContext";

// ── Per-page cache ────────────────────────────────────────────────────────────
// Key: "wallet:env:status:cursor" — stores only the 10 items for that page.
// Never caches 100 records; each entry holds ≤ MAX_PAGE_SIZE items.
const pageCache = new Map<string, { data: TxHistoryEntry[]; nextCursor: string | null; hasMore: boolean; timestamp: number }>();
const PAGE_CACHE_TTL_MS = 30_000; // 30 seconds

function buildCacheKey(wallet: string, env: string, status: string, cursor: string | null): string {
  return `history:${wallet.toLowerCase()}:${env}:${status}:${cursor ?? "start"}`;
}

export function invalidateHistoryPageCache(walletAddress?: string) {
  // Clear all page cache entries for this wallet without re-dispatching events
  const prefix = walletAddress ? `history:${walletAddress.toLowerCase()}` : "history:";
  for (const key of Array.from(pageCache.keys())) {
    if (key.startsWith(prefix)) {
      pageCache.delete(key);
    }
  }
}

export function clearHistoryCache(walletAddress?: string, mode?: "testnet" | "mainnet") {
  invalidateHistoryPageCache(walletAddress);

  if (typeof window !== "undefined") {
    try {
      window.dispatchEvent(new CustomEvent("arc-history-updated", { detail: { walletAddress, mode } }));
    } catch (_) {}
  }
}

// ── Hook parameters ───────────────────────────────────────────────────────────
export interface UseOnChainHistoryParams {
  hasAccess?: boolean;
  /** Current page cursor — null means first page */
  cursor: string | null;
  /** Status filter passed through to the API */
  statusFilter: "all" | "success" | "pending" | "failed";
}

export interface UseOnChainHistoryResult {
  /** Current page items (≤ 10) */
  history: TxHistoryEntry[];
  isLoading: boolean;
  hasMore: boolean;
  /** Cursor for the next page; null if no more pages */
  nextCursor: string | null;
  /** Force a fresh fetch for the current page */
  refetchHistory: (force?: boolean) => Promise<void>;
  /** Optimistically mutate a single transaction in the current page */
  mutateHistory: (txHash: string, newStatus: "success" | "failed" | "pending", newEntry?: Partial<TxHistoryEntry>) => void;
}

const MAX_PAGE_SIZE = 10;

export function useOnChainHistory(
  hasAccessOrParams: boolean | UseOnChainHistoryParams = true
): UseOnChainHistoryResult {
  // Support legacy call signature: useOnChainHistory(hasAccess: boolean)
  const params: UseOnChainHistoryParams =
    typeof hasAccessOrParams === "boolean"
      ? { hasAccess: hasAccessOrParams, cursor: null, statusFilter: "all" }
      : hasAccessOrParams;

  const { hasAccess = true, cursor, statusFilter } = params;

  const { address } = useAccount();
  const { mode } = useEnvironment();
  const currentChainId = mode === "mainnet" ? 5042 : 5042002;
  const publicClient = usePublicClient({ chainId: currentChainId });
  const publicClientRef = useRef(publicClient);

  useEffect(() => {
    publicClientRef.current = publicClient;
  }, [publicClient]);

  const [history, setHistory] = useState<TxHistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const inFlightRef = useRef(false);
  const lastForcedFetchTimeRef = useRef<number>(0);

  const fetchHistory = useCallback(
    async (force = false) => {
      if (!hasAccess) return;
      if (!address) {
        setHistory([]);
        setHasMore(false);
        setNextCursor(null);
        return;
      }

      const walletAddress = address.toLowerCase();
      const cacheKey = buildCacheKey(walletAddress, mode, statusFilter, cursor);
      const now = Date.now();
      const cached = pageCache.get(cacheKey);

      if (!force && cached && now - cached.timestamp < PAGE_CACHE_TTL_MS) {
        setHistory(cached.data);
        setHasMore(cached.hasMore);
        setNextCursor(cached.nextCursor);
        return;
      }

      if (inFlightRef.current) return;
      if (force && now - lastForcedFetchTimeRef.current < 2000) {
        return;
      }
      if (force) {
        lastForcedFetchTimeRef.current = now;
      }

      inFlightRef.current = true;
      setIsLoading(true);
      try {
        // ── 1. Fetch the current page from the API (≤ MAX_PAGE_SIZE records) ──
        const params = new URLSearchParams({
          wallet: walletAddress,
          environment: mode,
          status: statusFilter,
          limit: String(MAX_PAGE_SIZE),
        });
        if (cursor) params.set("cursor", cursor);

        const { data: sessionData } = await supabase.auth.getSession();
        const res = await fetch(`/api/bridge/history?${params.toString()}`, {
          headers: {
            Authorization: `Bearer ${sessionData.session?.access_token || ""}`,
            "Cache-Control": "no-cache",
          },
          cache: "no-store",
        });

        const json = await res.json();

        let supabaseBridges: TxHistoryEntry[] = [];
        let apiNextCursor: string | null = null;
        let apiHasMore = false;

        if (json.success && json.data) {
          apiNextCursor = json.nextCursor ?? null;
          apiHasMore = json.hasMore ?? false;

          supabaseBridges = (json.data as any[]).map((dbTx) => ({
            id: dbTx.burn_tx_hash,
            txHash: dbTx.burn_tx_hash,
            burnHash: dbTx.burn_tx_hash,
            mintHash: dbTx.mint_tx_hash,
            type: "bridge_cctp" as const,
            timestamp: new Date(dbTx.created_at).getTime(),
            status:
              dbTx.bridge_status === "COMPLETED"
                ? ("success" as const)
                : dbTx.bridge_status === "FAILED"
                ? ("failed" as const)
                : dbTx.bridge_status === "PROCESSING_CLAIM"
                ? ("claiming" as any)
                : ("pending" as const),
            amount: dbTx.amount,
            fromAsset: dbTx.token_symbol,
            toAsset: dbTx.to_asset ?? dbTx.token_symbol,
            sourceChain: dbTx.source_chain,
            destChain: dbTx.destination_chain,
            userAddress: dbTx.wallet_address,
            failureReason: dbTx.failure_reason,
          }));
        }

        // ── 2. On-chain swap logs — ONLY for the FIRST page (cursor === null) ──
        // On-chain logs are always for recent activity. On page 2+, they've
        // already been shown on page 1, so we don't re-fetch them.
        let onChainSwapEntries: TxHistoryEntry[] = [];
        if (cursor === null && publicClientRef.current && (statusFilter === "all" || statusFilter === "pending")) {
          try {
            const latest = await publicClientRef.current.getBlockNumber();
            const startBlock = latest > 5000n ? latest - 5000n : 0n;

            const swapLogs = await publicClientRef.current.getLogs({
              address: ARCFUN_SWAP_ADDRESS,
              event: parseAbiItem(
                "event SwapExecuted(address indexed user, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut)"
              ),
              args: { user: walletAddress as `0x${string}` },
              fromBlock: startBlock,
            });

            for (const log of swapLogs) {
              const { tokenIn, amountIn } = log.args as any;
              const isUsdc = tokenIn?.toLowerCase() === USDC_ADDRESS.toLowerCase();
              onChainSwapEntries.push({
                id: log.transactionHash!,
                txHash: log.transactionHash!,
                type: "swap",
                status: "success",
                amount: formatUnits(amountIn || 0n, 6),
                fromAsset: isUsdc ? "USDC" : "EURC",
                toAsset: isUsdc ? "EURC" : "USDC",
                sourceChain: "Arc Testnet",
                timestamp: 0,
                userAddress: walletAddress,
              });
            }
          } catch (rpcErr) {
            console.warn("[useOnChainHistory] RPC Logs failed, skipping on-chain events:", rpcErr);
          }
        }

        // ── 3. Local pending transactions — ONLY for the first page ──────────
        // Pending txs are always the most recent; show them only on page 1.
        let localPending: TxHistoryEntry[] = [];
        if (cursor === null) {
          const localCache = getTxHistory(mode).filter(
            (tx) => tx.userAddress?.toLowerCase() === walletAddress
          );
          const STALE_PENDING_MS = 30 * 60 * 1000;
          localPending = localCache
            .filter((tx) => {
              if (tx.status !== "pending") return false;
              if (Date.now() - tx.timestamp > STALE_PENDING_MS) return false;
              // Don't duplicate what's already in supabaseBridges
              return !supabaseBridges.some((sb) => sb.txHash === tx.txHash);
            })
            .map((tx) => ({ ...tx }));
        }

        // ── 4. Merge: local pending + on-chain swap logs + supabase page ──────
        // Priority: supabase (server-authoritative) overwrites local for same txHash.
        // On-chain swap timestamps recovered from local cache.
        const mergedMap = new Map<string, TxHistoryEntry>();

        // Insert local pending first (lowest priority)
        localPending.forEach((tx) => mergedMap.set(tx.txHash, tx));

        // Insert on-chain swap logs (recover timestamp from local if available)
        const localCache = cursor === null
          ? getTxHistory(mode).filter((tx) => tx.userAddress?.toLowerCase() === walletAddress)
          : [];

        onChainSwapEntries.forEach((tx) => {
          const localMatch = localCache.find((lc) => lc.txHash === tx.txHash);
          mergedMap.set(tx.txHash, {
            ...tx,
            timestamp: localMatch?.timestamp ?? Date.now(),
          });
        });

        // Insert supabase page (highest priority — overwrites anything with same txHash)
        supabaseBridges.forEach((tx) => {
          mergedMap.set(tx.txHash, tx);
          if (tx.status === "failed" || tx.status === "success") {
            const local = localCache.find((lc) => lc.txHash === tx.txHash);
            if (local && local.status === "pending") {
              saveTxHistory({ ...local, status: tx.status, failureReason: tx.failureReason }, mode);
            }
          }
        });

        // Sort merged list descending by timestamp
        const mergedSorted = Array.from(mergedMap.values())
          .filter((tx) => tx.userAddress?.toLowerCase() === walletAddress)
          // Auto-expire PROCESSING_CLAIM locks older than 10 minutes
          .map((tx) => {
            if ((tx.status as string) === "claiming" && Date.now() - tx.timestamp > 10 * 60 * 1000) {
              return { ...tx, status: "pending" as const };
            }
            return tx;
          })
          .sort((a, b) => b.timestamp - a.timestamp);

        // Hard cap at MAX_PAGE_SIZE — the merged list should never exceed this
        // since we fetched exactly MAX_PAGE_SIZE from API, but local pending
        // could push us slightly over. We trim to MAX_PAGE_SIZE strictly.
        const finalPage = mergedSorted.slice(0, MAX_PAGE_SIZE);

        // Cache this page
        pageCache.set(cacheKey, {
          data: finalPage,
          nextCursor: apiNextCursor,
          hasMore: apiHasMore,
          timestamp: Date.now(),
        });

        setHistory(finalPage);
        setNextCursor(apiNextCursor);
        setHasMore(apiHasMore);
      } catch (err) {
        console.error("[useOnChainHistory] Failed to fetch:", err);
        // Graceful fallback: show local pending txs only (≤ MAX_PAGE_SIZE)
        const localCache = getTxHistory(mode).filter(
          (tx) => tx.userAddress?.toLowerCase() === (address?.toLowerCase() ?? "")
        );
        setHistory(localCache.slice(0, MAX_PAGE_SIZE));
        setHasMore(false);
        setNextCursor(null);
      } finally {
        inFlightRef.current = false;
        setIsLoading(false);
      }
    },
    [address, hasAccess, mode, cursor, statusFilter]
  );

  // Fetch whenever cursor, statusFilter, address, or mode changes
  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // Reactive listener: on bridge tx save/cancel, invalidate first page cache and refetch (DEBOUNCED & NO RE-DISPATCH)
  useEffect(() => {
    let debounceTimer: any = null;
    const handleHistoryUpdated = (e: Event) => {
      const customEvt = e as CustomEvent<{ walletAddress?: string }>;
      if (!address) return;
      if (
        !customEvt.detail?.walletAddress ||
        customEvt.detail.walletAddress.toLowerCase() === address.toLowerCase()
      ) {
        // Invalidate in-memory cache directly WITHOUT calling clearHistoryCache (which dispatches arc-history-updated)
        invalidateHistoryPageCache(address);
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          fetchHistory(true);
        }, 500);
      }
    };

    if (typeof window !== "undefined") {
      window.addEventListener("arc-history-updated", handleHistoryUpdated);
    }
    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      if (typeof window !== "undefined") {
        window.removeEventListener("arc-history-updated", handleHistoryUpdated);
      }
    };
  }, [address, fetchHistory]);

  // Poll on visibility change only when there are pending items in current page
  useEffect(() => {
    const hasPending = history.some((tx) => tx.status === "pending");
    if (!hasPending) return;

    let isSubscribed = true;

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && isSubscribed) {
        fetchHistory(true);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      isSubscribed = false;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [history, fetchHistory]);

  const mutateHistory = (
    txHash: string,
    newStatus: "success" | "failed" | "pending",
    newEntry?: Partial<TxHistoryEntry>
  ) => {
    setHistory((prev) => {
      const exists = prev.some((tx) => tx.txHash === txHash);
      let updated: TxHistoryEntry[];

      if (exists) {
        updated = prev.map((tx) =>
          tx.txHash === txHash ? { ...tx, status: newStatus, ...newEntry } : tx
        );
      } else if (newEntry) {
        const entry = {
          id: txHash,
          txHash,
          type: "bridge_cctp",
          status: newStatus,
          timestamp: Date.now(),
          ...newEntry,
        } as TxHistoryEntry;
        updated = [entry, ...prev].slice(0, MAX_PAGE_SIZE);
      } else {
        updated = prev;
      }

      // Invalidate cache for current page so next refetch gets fresh data
      if (address) {
        const cacheKey = buildCacheKey(address.toLowerCase(), mode, statusFilter, cursor);
        pageCache.delete(cacheKey);
      }

      return updated;
    });
  };

  return { history, isLoading, hasMore, nextCursor, mutateHistory, refetchHistory: fetchHistory };
}
