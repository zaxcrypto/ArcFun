import { NextResponse } from 'next/server';
import { getLiveAssetPriceUsd } from '@/lib/gateway/price-oracle';

// Common assets supported across networks
const SUPPORTED_SYMBOLS = ['SOL', 'ETH', 'BTC', 'AVAX', 'SUI', 'USDC', 'USDT', 'EURC', 'ARC'];

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const symbolsParam = url.searchParams.get('symbols');
    const symbolsToFetch = symbolsParam
      ? symbolsParam.split(',').map(s => s.trim().toUpperCase())
      : SUPPORTED_SYMBOLS;

    const prices: Record<string, number> = {};
    const sources: Record<string, string> = {};

    await Promise.all(
      symbolsToFetch.map(async (sym) => {
        try {
          const { priceUsd, source } = await getLiveAssetPriceUsd(sym);
          prices[sym] = priceUsd;
          sources[sym] = source;
        } catch (e) {
          // If individual symbol fails, ignore
        }
      })
    );

    return NextResponse.json({
      success: true,
      prices,
      sources,
      timestamp: Date.now()
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=30'
      }
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const symbols: string[] = Array.isArray(body.symbols) && body.symbols.length > 0
      ? body.symbols.map((s: string) => String(s).trim().toUpperCase())
      : SUPPORTED_SYMBOLS;

    const prices: Record<string, number> = {};
    const sources: Record<string, string> = {};

    await Promise.all(
      symbols.map(async (sym) => {
        try {
          const { priceUsd, source } = await getLiveAssetPriceUsd(sym);
          prices[sym] = priceUsd;
          sources[sym] = source;
        } catch (e) {}
      })
    );

    return NextResponse.json({
      success: true,
      prices,
      sources,
      timestamp: Date.now()
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
