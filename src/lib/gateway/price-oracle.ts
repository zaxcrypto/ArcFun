import { ethers } from "ethers";

// ─── Chainlink AggregatorV3 Interface (minimal) ───────────────────────────────
const CHAINLINK_ABI = [
  {
    inputs: [],
    name: "latestRoundData",
    outputs: [
      { name: "roundId", type: "uint80" },
      { name: "answer", type: "int256" },
      { name: "startedAt", type: "uint256" },
      { name: "updatedAt", type: "uint256" },
      { name: "answeredInRound", type: "uint80" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "decimals",
    outputs: [{ name: "", type: "uint8" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

/**
 * Chainlink Price Feed addresses (testnet).
 * ETH/USD is read from Ethereum Sepolia.
 * AVAX/USD is read from Avalanche Fuji.
 * Source: https://docs.chain.link/data-feeds/price-feeds/addresses
 */
const CHAINLINK_FEEDS: Record<string, { address: string; rpcUrl: string }> = {
  SOL: {
    address: "0x24ceA4b8ce57cdA5058b924B9B9987992450590c", // Chainlink SOL/USD (Arbitrum One)
    rpcUrl: process.env.NEXT_PUBLIC_ARB_MAINNET_RPC_URL || "https://arb1.arbitrum.io/rpc",
  },
  ETH: {
    address: "0x694AA1769357215DE4FAC081bf1f309aDC325306", // ETH/USD on Ethereum Sepolia
    rpcUrl:
      process.env.NEXT_PUBLIC_ETH_SEPOLIA_RPC_URL ||
      process.env.SEPOLIA_RPC_URL ||
      "https://ethereum-sepolia-rpc.publicnode.com",
  },
  BTC: {
    address: "0x6ce185860a4963106506C203335A2910413708e9", // BTC/USD on Arbitrum One
    rpcUrl: process.env.NEXT_PUBLIC_ARB_MAINNET_RPC_URL || "https://arb1.arbitrum.io/rpc",
  },
  AVAX: {
    address: "0x5498BB86BC934c8D34FDA08E81D444153d0D06aD", // AVAX/USD on Avalanche Fuji
    rpcUrl:
      process.env.NEXT_PUBLIC_AVALANCHE_FUJI_RPC_URL ||
      "https://api.avax-test.network/ext/bc/C/rpc",
  },
};

// ─── CoinGecko asset ID mapping ───────────────────────────────────────────────
const COINGECKO_IDS: Record<string, string> = {
  ETH: "ethereum",
  SOL: "solana",
  SOLANA: "solana",
  BTC: "bitcoin",
  WBTC: "wrapped-bitcoin",
  AVAX: "avalanche-2",
  SUI: "sui",
  XLM: "stellar",
  POL: "matic-network",
  OKB: "okb",
  INJ: "injective-protocol",
  S: "sonic",
  MON: "monad",
  HYPE: "hyperliquid",
};

// ─── Hardcoded realistic last-resort fallback ─────────────────────────────────
const FALLBACK_PRICES: Record<string, number> = {
  USDC: 1.0,
  USDT: 1.0,
  DAI: 1.0,
  EURC: 1.08,
  SOL: 105.0,
  SOLANA: 105.0,
  ETH: 2500.0,
  BTC: 65000.0,
  AVAX: 25.0,
  SUI: 2.0,
  ARC: 0.10,
  XLM: 0.10,
  POL: 0.50,
  OKB: 40.0,
  INJ: 18.0,
  S: 0.50,
  MON: 1.0,
  HYPE: 1.0,
};

// ─── In-memory price cache (60-second TTL per symbol) ─────────────────────────
interface CachedPrice {
  priceUsd: number;
  source: "chainlink" | "binance" | "coingecko" | "fallback";
  fetchedAt: number;
}
const priceCache = new Map<string, CachedPrice>();
const inflightRequests = new Map<string, Promise<{ priceUsd: number; source: "chainlink" | "binance" | "coingecko" | "fallback" }>>();
const CACHE_TTL_MS = 60_000; // 60 seconds — avoids hammering RPCs on every tx

/**
 * Fetches the live USD price of an asset symbol.
 *
 * Tier 1: Chainlink AggregatorV3 on-chain (most accurate, on-chain verifiable)
 * Tier 2: Binance real-time ticker API (subsecond live market price)
 * Tier 3: CoinGecko API fallback
 * Tier 4: Hardcoded reference price (safe conservative fallback — never throws)
 *
 * Results are cached for 60 seconds per symbol with inflight deduplication.
 */
export async function getLiveAssetPriceUsd(rawSymbol: string): Promise<{
  priceUsd: number;
  source: "chainlink" | "binance" | "coingecko" | "fallback";
}> {
  const cleanSymbol = rawSymbol
    .trim()
    .toUpperCase()
    .replace(/^\$/, "")
    .replace(/-DEVNET$/, "")
    .replace(/-TESTNET$/, "");

  // Stablecoins are always fixed
  if (cleanSymbol === "USDC" || cleanSymbol === "USDT" || cleanSymbol === "DAI") {
    return { priceUsd: 1.0, source: "chainlink" };
  }
  if (cleanSymbol === "EURC") {
    return { priceUsd: 1.08, source: "chainlink" };
  }

  // Check in-memory cache first
  const cached = priceCache.get(cleanSymbol);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return { priceUsd: cached.priceUsd, source: cached.source };
  }

  // Check if identical symbol request is already in-flight (prevents concurrent duplicate RPC queries)
  if (inflightRequests.has(cleanSymbol)) {
    return inflightRequests.get(cleanSymbol)!;
  }

  const fetchPromise = fetchPriceInternal(cleanSymbol).finally(() => {
    inflightRequests.delete(cleanSymbol);
  });

  inflightRequests.set(cleanSymbol, fetchPromise);
  return fetchPromise;
}

async function fetchPriceInternal(cleanSymbol: string): Promise<{
  priceUsd: number;
  source: "chainlink" | "binance" | "coingecko" | "fallback";
}> {

  // ── Tier 1: Chainlink on-chain feed ──────────────────────────────────────
  const feed = CHAINLINK_FEEDS[cleanSymbol];
  if (feed) {
    try {
      const provider = new ethers.JsonRpcProvider(feed.rpcUrl, undefined, {
        staticNetwork: true,
      });
      const aggregator = new ethers.Contract(feed.address, CHAINLINK_ABI, provider);

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Chainlink RPC timeout")), 4500)
      );

      const [roundData, decimals] = await Promise.race([
        Promise.all([
          aggregator.latestRoundData() as Promise<[bigint, bigint, bigint, bigint, bigint]>,
          aggregator.decimals() as Promise<number>,
        ]),
        timeoutPromise as never,
      ]);

      const answer = roundData[1]; // int256 price
      const updatedAt = Number(roundData[3]); // unix timestamp

      if (answer <= 0n) {
        throw new Error("Chainlink returned non-positive price");
      }

      // Staleness guard: reject prices older than 2 hours
      const ageSeconds = Math.floor(Date.now() / 1000) - updatedAt;
      if (ageSeconds > 7200) {
        throw new Error(`Chainlink price stale (${ageSeconds}s old)`);
      }

      const priceUsd = Number(answer) / 10 ** Number(decimals);
      priceCache.set(cleanSymbol, { priceUsd, source: "chainlink", fetchedAt: Date.now() });
      return { priceUsd, source: "chainlink" };
    } catch (err: any) {
      // Chainlink error fallback
    }
  }

  // ── Tier 2: Binance real-time public ticker ──────────────────────────────
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const binanceRes = await fetch(
      `https://api.binance.com/api/v3/ticker/price?symbol=${cleanSymbol}USDT`,
      { signal: controller.signal }
    );
    clearTimeout(timeout);
    if (binanceRes.ok) {
      const binanceData = await binanceRes.json();
      const p = parseFloat(binanceData.price);
      if (p > 0) {
        priceCache.set(cleanSymbol, { priceUsd: p, source: "binance", fetchedAt: Date.now() });
        return { priceUsd: p, source: "binance" };
      }
    }
  } catch (err: any) {
    // Continue to Tier 3
  }

  // ── Tier 3: CoinGecko API fallback ───────────────────────────────────────
  const geckoId = COINGECKO_IDS[cleanSymbol];
  if (geckoId) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);

      const response = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${geckoId}&vs_currencies=usd`,
        {
          signal: controller.signal,
          headers: { Accept: "application/json" },
          cache: "no-store",
        }
      );
      clearTimeout(timeout);

      if (response.ok) {
        const data = await response.json();
        const priceUsd: number = data?.[geckoId]?.usd;

        if (priceUsd && priceUsd > 0) {
          priceCache.set(cleanSymbol, { priceUsd, source: "coingecko", fetchedAt: Date.now() });
          return { priceUsd, source: "coingecko" };
        }
      }
    } catch (err: any) {
      // Continue to Tier 4
    }
  }

  // ── Tier 4: Hardcoded last-resort fallback ────────────────────────────────
  const priceUsd = FALLBACK_PRICES[cleanSymbol] ?? 1.0;
  priceCache.set(cleanSymbol, { priceUsd, source: "fallback", fetchedAt: Date.now() });
  return { priceUsd, source: "fallback" };
}

/**
 * Force-invalidates the price cache for a symbol or all symbols.
 * Useful for tests or admin price refresh.
 */
export function invalidatePriceCache(symbol?: string): void {
  if (symbol) {
    priceCache.delete(symbol);
  } else {
    priceCache.clear();
  }
}
