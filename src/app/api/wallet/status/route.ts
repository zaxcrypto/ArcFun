import { NextResponse } from 'next/server';
import { circleClient } from '@/lib/circle/wallet-service';
import { createClient } from '@supabase/supabase-js';

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

    const { searchParams } = new URL(req.url);
    const txId = searchParams.get('id');

    if (!txId) {
      return NextResponse.json({ error: "Transaction ID is required" }, { status: 400 });
    }

    const response = await circleClient.getTransaction({ id: txId });
    
    if (!response.data || !response.data.transaction) {
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
    }

    const tx = response.data.transaction;

    return NextResponse.json({ 
      state: tx.state, // e.g. 'INITIATED', 'PENDING', 'COMPLETE', 'FAILED'
      txHash: tx.txHash,
      errorReason: tx.errorReason
    });

  } catch (error: any) {
    console.error('Wallet Status Check Error:', error.response?.data || error.message);
    return NextResponse.json(
      { error: error.response?.data?.message || error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
