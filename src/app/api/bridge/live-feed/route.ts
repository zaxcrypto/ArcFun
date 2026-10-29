import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "15", 10) || 15, 50);

    const { data: transactions, error } = await supabaseAdmin
      .from("bridge_transactions")
      .select("id, wallet_address, source_chain, destination_chain, token_symbol, amount, burn_tx_hash, mint_tx_hash, bridge_status, created_at, updated_at")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("[LiveFeed API] Supabase error:", error);
      return NextResponse.json({ error: "Failed to fetch live feed" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      transactions: transactions || []
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=3, stale-while-revalidate=5'
      }
    });
  } catch (err: any) {
    console.error("[LiveFeed API] Unexpected error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
