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

    // 1. Authenticate user
    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized: Invalid session' }, { status: 401 });
    }

    const now = Date.now();

    // 2. Check if account already exists
    const { data: existingAccount } = await supabaseAdmin
      .from('arc_accounts')
      .select('user_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (existingAccount) {
      return NextResponse.json({ success: true, message: 'Account already exists' });
    }

    // 3. Create Arc Account
    const { error: accountErr } = await supabaseAdmin
      .from('arc_accounts')
      .insert({
        user_id: user.id,
        account_status: 'ACTIVE',
        created_at: now,
        updated_at: now
      });

    if (accountErr) {
      console.error('Failed to create arc_account:', accountErr);
      return NextResponse.json({ error: 'Failed to create account identity' }, { status: 500 });
    }

    // 4. Create default Security Policy
    const { error: policyErr } = await supabaseAdmin
      .from('user_security_policies')
      .insert({
        user_id: user.id,
        max_transaction_amount: 1000,
        daily_transfer_limit: 5000,
        passkey_mode: 'ALWAYS',
        updated_at: now
      });

    if (policyErr) {
      console.warn('Default security policy note:', policyErr.message);
    }

    return NextResponse.json({ success: true, message: 'Arc Account created successfully' });
  } catch (error: any) {
    console.error('Account creation failed:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
