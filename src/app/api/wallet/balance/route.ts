import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { circleClient } from '@/lib/circle/wallet-service';
import { checkRateLimit } from '@/lib/rate-limit';

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Missing or invalid authorization header" }, { status: 401 });
    }
    const token = authHeader.split(" ")[1];

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized: Invalid session' }, { status: 401 });
    }

    // Rate limit: 30 req/min
    const rateLimitError = await checkRateLimit(req, user.id, { maxRequests: 30, windowMs: 60000 });
    if (rateLimitError) return rateLimitError;

    const { searchParams } = new URL(req.url);
    const blockchain = searchParams.get('blockchain') || 'ARC-TESTNET';

    // Fetch user's wallet
    const { data: wallet, error: fetchErr } = await supabaseAdmin
      .from('arc_wallets')
      .select('circle_wallet_id, wallet_address')
      .eq('user_id', user.id)
      .eq('blockchain', blockchain)
      .maybeSingle();

    if (fetchErr || !wallet) {
      return NextResponse.json({ error: 'Wallet not found' }, { status: 404 });
    }

    // Get real balances from Circle
    let tokens: any[] = [];
    try {
      const balanceResponse = await circleClient.getWalletTokenBalance({
        id: wallet.circle_wallet_id
      });
      tokens = balanceResponse.data?.tokenBalances || [];
    } catch (e: any) {
      console.warn("Circle balance fetch warning:", e.message);
    }
    
    return NextResponse.json({ 
      success: true, 
      address: wallet.wallet_address,
      balances: tokens 
    });

  } catch (error: any) {
    console.error('Wallet balance fetch failed:', error);
    return NextResponse.json({ error: 'Failed to fetch wallet balances' }, { status: 500 });
  }
}
