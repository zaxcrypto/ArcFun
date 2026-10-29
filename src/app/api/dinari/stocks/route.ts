import { NextResponse } from 'next/server';
import { fetchDinariStocks, getDinariApiBaseUrl } from '@/lib/dinari/dinari-client';
import { checkRateLimit } from '@/lib/rate-limit';

export async function GET(req: Request) {
  try {
    // 1. Basic IP rate limiting to prevent abuse
    const rateLimitError = await checkRateLimit(req, undefined, { maxRequests: 30, windowMs: 60000 });
    if (rateLimitError) return rateLimitError;

    // 2. Parse query filters if any
    const { searchParams } = new URL(req.url);
    const symbolParam = searchParams.get('symbol') || searchParams.get('symbols');
    const pageParam = searchParams.get('page');
    const pageSizeParam = searchParams.get('page_size');

    const symbols = symbolParam
      ? symbolParam.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean)
      : undefined;

    const page = pageParam ? parseInt(pageParam, 10) : undefined;
    const pageSize = pageSizeParam ? parseInt(pageSizeParam, 10) : 100;

    // 3. Fetch from Dinari Enterprise API (Sandbox / Production depending on env)
    const result = await fetchDinariStocks({
      symbols,
      page,
      pageSize,
    });

    const env = process.env.DINARI_ENV || 'sandbox';

    return NextResponse.json({
      success: true,
      environment: env,
      baseUrl: getDinariApiBaseUrl(env),
      totalCount: result.stocks.length,
      pagination: result.pagination,
      stocks: result.stocks,
      // Provide raw items strictly without credentials or internal headers for audit
      rawCount: result.raw.length,
    });
  } catch (error: any) {
    console.error('[Dinari Stocks API Error]:', error?.message || error);
    return NextResponse.json(
      {
        success: false,
        error: error?.message || 'Failed to fetch Dinari stock catalogue',
      },
      { status: 500 }
    );
  }
}
