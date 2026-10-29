import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: Request) {
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

    // 1. Verify User Identity via Supabase Auth
    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized: Invalid session' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { blockchain } = body;

    if (blockchain === 'ALL' || !blockchain) {
      const { data: allWallets, error: fetchAllErr } = await supabaseAdmin
        .from('arc_wallets')
        .select('*')
        .eq('user_id', user.id);

      if (fetchAllErr) {
        console.error('Fetch all wallets error:', fetchAllErr);
        return NextResponse.json({ error: 'Database lookup failed' }, { status: 500 });
      }

      return NextResponse.json({
        exists: (allWallets && allWallets.length > 0),
        wallets: allWallets || [],
        status: (allWallets && allWallets.length > 0) ? 'provisioned' : 'unprovisioned'
      });
    }

    // 2. Lookup wallet by user_id
    let { data: existingWallet, error: fetchErr } = await supabaseAdmin
      .from('arc_wallets')
      .select('*')
      .eq('user_id', user.id)
      .eq('blockchain', blockchain)
      .maybeSingle();

    if (fetchErr) {
      console.error('Fetch existing wallet error:', fetchErr);
      return NextResponse.json({ error: 'Database lookup failed' }, { status: 500 });
    }

    // 2.1 Fallback lookup by linked external address or users table (for EVM)
    if (!existingWallet && (blockchain === 'ARC-TESTNET' || blockchain === 'ARC')) {
      const { data: userRow } = await supabaseAdmin.from('users').select('address').eq('id', user.id).maybeSingle();
      const userExternalAddress = userRow?.address || (user.email?.includes('@') ? user.email.split('@')[0] : null);

      if (userExternalAddress && userExternalAddress.startsWith('0x')) {
        const { data: legacyWallet } = await supabaseAdmin
          .from('arc_wallets')
          .select('*')
          .or(`linked_external_address.ilike.${userExternalAddress},wallet_address.ilike.${userExternalAddress}`)
          .eq('blockchain', blockchain)
          .maybeSingle();

        if (legacyWallet) {
          // Re-link to user_id
          await supabaseAdmin.from('arc_wallets').update({ user_id: user.id }).eq('id', legacyWallet.id);
          existingWallet = { ...legacyWallet, user_id: user.id };
        }
      }
    }

    if (existingWallet) {
      return NextResponse.json({
        exists: true,
        wallet: existingWallet,
        status: existingWallet.status || 'provisioned'
      });
    } else {
      return NextResponse.json({
        exists: false,
        status: 'unprovisioned'
      });
    }
  } catch (error: any) {
    console.error('Wallet Lookup failed:', error);
    return NextResponse.json({ error: 'Failed to lookup wallet' }, { status: 500 });
  }
}
