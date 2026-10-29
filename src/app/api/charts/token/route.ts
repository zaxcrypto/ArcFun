import { NextRequest, NextResponse } from "next/server";

// Supported asset configurations (Server-side explicit whitelist)
const ASSET_CONFIG: Record<
  string,
  {
    quote: string;
    name: string;
    binanceSymbol: string;
    krakenPair: string;
    basePrice: number;
  }
> = {
  USDC: {
    quote: "USD",
    name: "USD Coin",
    binanceSymbol: "USDCUSDT",
    krakenPair: "USDCUSD",
    basePrice: 1.00015,
  },
  EURC: {
    quote: "USD",
    name: "Euro Coin",
    binanceSymbol: "EURUSDT",
    krakenPair: "EURUSD",
    basePrice: 1.1204,
  },
};

type RangeKey = "1H" | "1D" | "1W" | "1M" | "1Y" | "ALL";

interface RangeParams {
  secondsBack: number;
  limit: number;
}

const RANGE_MAP: Record<RangeKey, RangeParams> = {
  "1H": { secondsBack: 3600, limit: 60 },
  "1D": { secondsBack: 86400, limit: 288 },
  "1W": { secondsBack: 7 * 86400, limit: 168 },
  "1M": { secondsBack: 30 * 86400, limit: 180 },
  "1Y": { secondsBack: 365 * 86400, limit: 365 },
  ALL: { secondsBack: 365 * 86400, limit: 365 },
};

export interface ChartPoint {
  time: number; // Unix timestamp in seconds
  value: number; // Close price
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  volume?: number;
}

export interface TokenChartResponse {
  asset: string;
  name: string;
  quote: string;
  range: RangeKey;
  currentPrice: number;
  change24h: number;
  change24hPct: number;
  high24h: number;
  low24h: number;
  volume24h?: number;
  points: ChartPoint[];
  source: string;
  updatedAt: number;
}

// Global server-side fallback cache
const globalServerCache = new Map<string, TokenChartResponse>();

// Primary Provider: Binance Spot
async function fetchFromBinance(rangeKey: RangeKey, symbol: string = "USDCUSDT"): Promise<{ points: ChartPoint[]; source: string } | null> {
  try {
    const binanceIntervalMap: Record<RangeKey, { interval: string; limit: number }> = {
      "1H": { interval: "1m", limit: 60 },
      "1D": { interval: "5m", limit: 288 },
      "1W": { interval: "1h", limit: 168 },
      "1M": { interval: "4h", limit: 180 },
      "1Y": { interval: "1d", limit: 365 },
      ALL: { interval: "1d", limit: 365 },
    };
    const { interval, limit } = binanceIntervalMap[rangeKey] || { interval: "5m", limit: 288 };
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "ArcFun-Bridge/1.0", Accept: "application/json" },
      ...({ next: { revalidate: 30 } } as any),
    });
    clearTimeout(timeout);

    if (!res.ok) return null;
    const raw = await res.json();
    if (!Array.isArray(raw) || raw.length === 0) return null;

    const seenTimes = new Set<number>();
    const points: ChartPoint[] = [];

    for (const item of raw) {
      if (!Array.isArray(item) || item.length < 6) continue;
      const openTime = Math.floor(Number(item[0]) / 1000);
      const open = parseFloat(item[1]);
      const high = parseFloat(item[2]);
      const low = parseFloat(item[3]);
      const close = parseFloat(item[4]);
      const volume = parseFloat(item[5]);

      if (isNaN(openTime) || isNaN(close) || close <= 0) continue;
      if (seenTimes.has(openTime)) continue;
      seenTimes.add(openTime);

      points.push({
        time: openTime,
        value: close,
        open,
        high,
        low,
        close,
        volume: !isNaN(volume) ? volume : undefined,
      });
    }

    points.sort((a, b) => a.time - b.time);
    return points.length > 0 ? { points, source: "binance_spot" } : null;
  } catch {
    return null;
  }
}

// Fallback Provider: Kraken Spot
async function fetchFromKraken(rangeKey: RangeKey, pair: string = "USDCUSD"): Promise<{ points: ChartPoint[]; source: string } | null> {
  try {
    const intervalMap: Record<RangeKey, number> = {
      "1H": 1,
      "1D": 5,
      "1W": 60,
      "1M": 240,
      "1Y": 1440,
      ALL: 1440,
    };
    const interval = intervalMap[rangeKey] || 5;
    const url = `https://api.kraken.com/0/public/OHLC?pair=${pair}&interval=${interval}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "ArcFun-Bridge/1.0", Accept: "application/json" },
      ...({ next: { revalidate: 30 } } as any),
    });
    clearTimeout(timeout);

    if (!res.ok) return null;
    const json = await res.json();
    if (!json?.result) return null;

    const raw = json.result[pair] || json.result.ZEURZUSD || json.result.USDCUSD || json.result[Object.keys(json.result)[0]];
    if (!Array.isArray(raw) || raw.length === 0) return null;

    const rangeLimits: Record<RangeKey, number> = {
      "1H": 60,
      "1D": 288,
      "1W": 168,
      "1M": 180,
      "1Y": 365,
      ALL: 720,
    };
    const maxPoints = rangeLimits[rangeKey] || 288;
    const sliced = raw.slice(-maxPoints);

    const points: ChartPoint[] = [];
    for (const item of sliced) {
      const time = Number(item[0]);
      const open = parseFloat(item[1]);
      const high = parseFloat(item[2]);
      const low = parseFloat(item[3]);
      const close = parseFloat(item[4]);
      const volume = parseFloat(item[6]);

      if (isNaN(time) || isNaN(close) || close <= 0) continue;
      points.push({
        time,
        value: close,
        open,
        high,
        low,
        close,
        volume: !isNaN(volume) ? volume : undefined,
      });
    }

    return points.length > 0 ? { points, source: "kraken_spot" } : null;
  } catch {
    return null;
  }
}

// Emergency Fallback Generator
function generateFallbackPoints(rangeKey: RangeKey, basePrice: number = 1.00015): ChartPoint[] {
  const rangeConfig = RANGE_MAP[rangeKey] || RANGE_MAP["1D"];
  const now = Math.floor(Date.now() / 1000);
  const start = now - rangeConfig.secondsBack;
  const step = Math.max(Math.floor(rangeConfig.secondsBack / rangeConfig.limit), 60);
  const points: ChartPoint[] = [];

  const varianceScale = basePrice > 1.05 ? 0.0008 : 0.00008;

  for (let i = 0; i <= rangeConfig.limit; i++) {
    const t = start + i * step;
    const sinOffset = Math.sin(t / 7200) * varianceScale;
    const cosOffset = Math.cos(t / 18000) * (varianceScale / 2);
    const price = parseFloat((basePrice + sinOffset + cosOffset).toFixed(5));
    const high = parseFloat((price + varianceScale / 2).toFixed(5));
    const low = parseFloat((price - varianceScale / 2).toFixed(5));

    points.push({
      time: t,
      value: price,
      open: price,
      high,
      low,
      close: price,
      volume: 120000 + (t % 40000),
    });
  }
  return points;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const assetParam = (searchParams.get("asset")?.toUpperCase() || "USDC");
  const rangeParam = (searchParams.get("range")?.toUpperCase() || "1D") as RangeKey;

  const config = ASSET_CONFIG[assetParam] || ASSET_CONFIG["USDC"];
  const cacheKey = `${assetParam}:${rangeParam}`;

  try {
    // 1. Fetch live Binance spot feed
    let marketData = await fetchFromBinance(rangeParam, config.binanceSymbol);
    
    // 2. Fallback to Kraken
    if (!marketData || marketData.points.length === 0) {
      marketData = await fetchFromKraken(rangeParam, config.krakenPair);
    }

    let points: ChartPoint[] = [];
    let source = "binance_spot";

    if (marketData && marketData.points.length > 0) {
      points = marketData.points;
      source = marketData.source;
    } else if (globalServerCache.has(cacheKey)) {
      const cached = globalServerCache.get(cacheKey)!;
      points = cached.points;
      source = `${cached.source}_cached`;
    } else {
      points = generateFallbackPoints(rangeParam, config.basePrice);
      source = "resilient_fallback";
    }

    const spotPrice = points[points.length - 1]?.value || config.basePrice;

    // Calculate stats
    let change24h = 0;
    let change24hPct = 0;
    let high24h = spotPrice;
    let low24h = spotPrice;

    if (points.length > 0) {
      const firstPoint = points[0].value;
      change24h = spotPrice - firstPoint;
      change24hPct = firstPoint > 0 ? ((spotPrice - firstPoint) / firstPoint) * 100 : 0;

      high24h = Math.max(...points.map((p) => p.high ?? p.value));
      low24h = Math.min(...points.map((p) => p.low ?? p.value));
    }

    const now = Math.floor(Date.now() / 1000);

    const responsePayload: TokenChartResponse = {
      asset: assetParam,
      name: config.name,
      quote: config.quote,
      range: rangeParam,
      currentPrice: spotPrice,
      change24h: parseFloat(change24h.toFixed(6)),
      change24hPct: parseFloat(change24hPct.toFixed(4)),
      high24h: parseFloat(high24h.toFixed(6)),
      low24h: parseFloat(low24h.toFixed(6)),
      points,
      source,
      updatedAt: now,
    };

    // Save to memory cache
    globalServerCache.set(cacheKey, responsePayload);

    return NextResponse.json(responsePayload, {
      status: 200,
      headers: {
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
      },
    });
  } catch (error: any) {
    console.error("[Chart API Error]", error);
    const points = generateFallbackPoints(rangeParam, config.basePrice);
    const spotPrice = points[points.length - 1]?.value || config.basePrice;
    const responsePayload: TokenChartResponse = {
      asset: assetParam,
      name: config.name,
      quote: config.quote,
      range: rangeParam,
      currentPrice: spotPrice,
      change24h: 0.00014,
      change24hPct: 0.01,
      high24h: spotPrice + 0.0002,
      low24h: spotPrice - 0.0002,
      points,
      source: "resilient_fallback",
      updatedAt: Math.floor(Date.now() / 1000),
    };

    return NextResponse.json(responsePayload, { status: 200 });
  }
}
