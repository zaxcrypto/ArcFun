import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { ProfileAnalyticsResponse, UserAnalyticsAggregates } from '@/types/analytics';
import { apiGet } from '@/lib/arc-api';
import { createPublicClient, http } from 'viem';
import { CROSS_CHAIN_REGISTRY } from '@/config/swap-contract';

export const dynamic = 'force-dynamic';

// ── Balance Cache (TTL 120s) ─────────────────────────────────────────────────
// Prevents the analytics endpoint from being an open Explorer proxy.
// Each address gets at most 1 Explorer call every 2 minutes, regardless of
// how many times this endpoint is hit.
const balanceCache = new Map<string, { value: string; expiresAt: number }>();
const BALANCE_CACHE_TTL_MS = 120_000; // 2 minutes
const MAX_BALANCE_CACHE_SIZE = 5000;

async function getCachedBalance(address: string, network: string): Promise<string> {
  const now = Date.now();
  const cacheKey = `${address}_${network}`;
  const cached = balanceCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  let balance = "0";
  try {
    const rpcUrl = network === 'mainnet'
      ? CROSS_CHAIN_REGISTRY["Arc Mainnet"].rpc
      : network === 'giwa'
        ? "https://sepolia-rpc.giwa.io"
        : CROSS_CHAIN_REGISTRY["Arc Testnet"].rpc;

    const publicClient = createPublicClient({ transport: http(rpcUrl) });

    if (network === 'giwa') {
      const balanceBigInt = await publicClient.getBalance({ address: address as `0x${string}` });
      balance = balanceBigInt.toString();
    } else {
      const chainConfig = network === 'mainnet' ? CROSS_CHAIN_REGISTRY["Arc Mainnet"] : CROSS_CHAIN_REGISTRY["Arc Testnet"];
      if (chainConfig && chainConfig.USDC && chainConfig.USDC !== "0x0") {
        const balanceBigInt = await publicClient.readContract({
          address: chainConfig.USDC as `0x${string}`,
          abi: [{ name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] }],
          functionName: 'balanceOf',
          args: [address as `0x${string}`]
        });
        balance = balanceBigInt.toString();
      }
    }
  } catch (e) {
    console.warn("[ANALYTICS] Balance fetch failed, using cached/default:", (e as Error).message);
    if (cached) return cached.value;
  }

  if (balanceCache.size >= MAX_BALANCE_CACHE_SIZE) {
    const firstKey = balanceCache.keys().next().value;
    if (firstKey) balanceCache.delete(firstKey);
  }

  balanceCache.set(cacheKey, { value: balance, expiresAt: now + BALANCE_CACHE_TTL_MS });
  return balance;
}

// ── IP Rate Limiting for Analytics GET ───────────────────────────────────────
const analyticsIpMap = new Map<string, { count: number; resetAt: number }>();
const ANALYTICS_MAX_PER_MINUTE = 30;
const ANALYTICS_WINDOW_MS = 60_000;

function checkAnalyticsRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = analyticsIpMap.get(ip);

  if (!record || record.resetAt < now) {
    analyticsIpMap.set(ip, { count: 1, resetAt: now + ANALYTICS_WINDOW_MS });
    return true;
  }

  record.count++;
  if (record.count > ANALYTICS_MAX_PER_MINUTE) return false;
  return true;
}

// ── GET Handler ──────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const requestId = crypto.randomUUID().substring(0, 8);
  const startTime = Date.now();

  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const { searchParams } = new URL(req.url);
    const address = searchParams.get('address')?.toLowerCase();
    const network = (searchParams.get('network') || 'testnet').toLowerCase();

    if (!address) {
      return NextResponse.json({ error: 'Address is required' }, { status: 400 });
    }

    if (network === 'mainnet') {
      return NextResponse.json({ error: 'Profile analytics are not available on Mainnet' }, { status: 400 });
    }

    if (network !== 'testnet' && network !== 'giwa') {
      return NextResponse.json({ error: 'Invalid network parameter' }, { status: 400 });
    }

    // Validate address format (prevent garbage queries)
    if (!/^0x[a-f0-9]{40}$/.test(address)) {
      return NextResponse.json({ error: 'Invalid address format' }, { status: 400 });
    }

    // Rate limit check
    if (!checkAnalyticsRateLimit(ip)) {
      console.warn(JSON.stringify({ level: 'WARN', event: 'RATE_LIMITED', endpoint: 'analytics', ip, address, requestId }));
      return NextResponse.json(
        { error: 'Too many requests. Please wait.' },
        { status: 429, headers: { 'Retry-After': '60' } }
      );
    }



    // 0. Fetch Balance (Cached — at most 1 Explorer call per address per 2 minutes)
    const balance = await getCachedBalance(address, network);

    // 1. Fetch ALL data in a single RPC call (Task 1: Query Consolidation)
    const { data: payload, error: rpcErr } = await supabaseAdmin
      .rpc('get_profile_analytics_payload', { p_address: address, p_network: network });

    if (rpcErr) {
      console.error(JSON.stringify({ level: 'ERROR', event: 'ANALYTICS_RPC_FAIL', requestId, error: rpcErr.message }));
      throw rpcErr;
    }

    const aggs = payload.aggregates;
    const dailyActivity = payload.daily_activity || [];
    const activeDaysCount = payload.active_days_count || 0;
    const uniqueInteractionsCount = payload.unique_addresses_count || 0;
    const unfin = payload.unfinalized_txs || [];
    const pend = payload.pending_txs || [];

    // Default empty aggregates if user never synced
    const analytics: UserAnalyticsAggregates = aggs || {
      address,
      tx_count: 0,
      sent_count: 0,
      received_count: 0,
      token_transfer_count: 0,
      internal_tx_count: 0,
      contracts_deployed: 0,
      total_gas_used: 0,
      first_tx_date: null,
      last_tx_date: null,
      last_synced_block: null,
      sync_locked_until: null,
      cooldown_until: null,
    };

    // 2. Compute Heatmap & Streaks (In-Memory, fast)
    const dailyCounts: Record<string, number> = {};
    dailyActivity.forEach((row: any) => {
      dailyCounts[row.date_utc] = row.tx_count;
    });

    const today = new Date();
    let currentStreak = 0;
    for (let i = 0; i < 365; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
      if (dailyCounts[key] > 0) {
        currentStreak++;
      } else if (i > 0) { // allow today to be 0 and streak continues if yesterday was > 0
        break;
      }
    }

    // 3. Optimistic Updates
    const finalTxCount = analytics.tx_count + unfin.length + pend.length;
    let finalSentCount = analytics.sent_count;
    let finalReceivedCount = analytics.received_count;

    unfin.forEach((u: any) => {
      if (u.type === 'sent') finalSentCount++;
      if (u.type === 'received') finalReceivedCount++;
    });

    analytics.tx_count = finalTxCount;
    analytics.sent_count = finalSentCount;
    analytics.received_count = finalReceivedCount;

    const unfinalizedDays: string[] = [];
    if (unfin.length > 0 || pend.length > 0) {
      const d = new Date();
      const todayKey = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
      dailyCounts[todayKey] = (dailyCounts[todayKey] || 0) + unfin.length + pend.length;
      unfinalizedDays.push(todayKey);
    }

    // Determine if sync is needed
    const isLocked = analytics.sync_locked_until && new Date(analytics.sync_locked_until).getTime() > Date.now();
    const isOnCooldown = analytics.cooldown_until && new Date(analytics.cooldown_until).getTime() > Date.now();
    const needsSync = !isLocked && !isOnCooldown;

    const response: ProfileAnalyticsResponse = {
      balance,
      analytics: {
        ...analytics,
        uniqueInteractions: uniqueInteractionsCount
      },
      heatmap: {
        dailyCounts,
        activeDays: activeDaysCount,
        currentStreak,
        unfinalizedDays
      },
      needsSync
    };

    const duration = Date.now() - startTime;
    console.log(JSON.stringify({ level: 'INFO', event: 'ANALYTICS_GET', requestId, address, duration, needsSync }));

    // Task 3: Fix Cache Strategy. Use short CDN cache (30s) + stale-while-revalidate (59s)
    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=59',
        'X-Request-Id': requestId,
      }
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(JSON.stringify({ level: 'ERROR', event: 'ANALYTICS_GET_FAIL', requestId, error: (error as Error).message, duration }));
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
